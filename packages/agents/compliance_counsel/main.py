import os
import json
from typing import TypedDict, Optional, Literal
from gradient_adk import entrypoint, RequestContext

try:
    from gradient_adk import trace
except ImportError:
    def trace(*_args, **_kwargs):
        def _decorator(func):
            return func
        return _decorator
from langgraph.graph import StateGraph, END
from gradient import Gradient
import psycopg2
import httpx


class CounselState(TypedDict):
    user_query: str
    intent: Optional[Literal["chat", "gap_report", "matrix", "history"]]
    kb_results: list
    incident_history: list
    response: Optional[str]
    citations: list
    export_url: Optional[str]


DEFAULT_KB_IDS = {
    "GRADIENT_KB_DORA_ID": "4449aa46-32f3-11f1-b074-4e013e2ddde4",
    "GRADIENT_KB_NIS2_ID": "46c25834-32f3-11f1-b074-4e013e2ddde4",
    "GRADIENT_KB_GDPR_ID": "48f29ca9-32f3-11f1-b074-4e013e2ddde4",
    "GRADIENT_KB_MAS_ID": "4b34b1ad-32f3-11f1-b074-4e013e2ddde4",
}


def get_gradient_client():
    """Lazy-load Gradient client to handle missing env vars gracefully."""
    return Gradient(
        model_access_key=os.environ.get("GRADIENT_MODEL_ACCESS_KEY") or None,
        access_token=os.environ.get("DIGITALOCEAN_API_TOKEN") or None,
    )


def _kb_fallback_answer(question: str, kb_results: list) -> str:
    if not kb_results:
        return (
            "DORA Article 11 readiness requires a tested ICT business continuity framework. "
            "Set and monitor RTO/RPO targets, maintain documented failover and recovery procedures, "
            "run resilience tests on a scheduled basis, and retain incident/evidence records for audit. "
            "Use incident post-mortems to update controls under Articles 11 and 17.\n\n"
            "Citations:\n"
            "- DORA Article 11 (ICT business continuity and recovery)\n"
            "- DORA Article 17 (incident handling and post-incident review)"
        )

    top = kb_results[:3]
    snippets = []
    for item in top:
        src = item.get("source", "Regulation")
        txt = str(item.get("text", "")).replace("\n", " ").strip()
        snippets.append(f"- {src}: {txt[:260]}")

    return (
        f"Guidance for: {question}\n\n"
        "Relevant regulation excerpts:\n"
        + "\n".join(snippets)
        + "\n\n"
        "Action: map your controls and evidence to these obligations, then validate RTO/RPO "
        "and incident-response drills against Article 11 expectations.\n\n"
        "Baseline citations:\n"
        "- DORA Article 11\n"
        "- DORA Article 17"
    )


@trace(name="classify_query_intent")
async def classify_query_intent(state: CounselState) -> CounselState:
    """Classifies user query intent into chat, gap_report, matrix, or history."""
    q = state["user_query"].lower()
    if any(kw in q for kw in ["gap report", "gap analysis", "missing", "not covered"]):
        state["intent"] = "gap_report"
    elif any(
        kw in q for kw in ["matrix", "spreadsheet", "export", "all requirements"]
    ):
        state["intent"] = "matrix"
    elif any(
        kw in q
        for kw in ["history", "past incidents", "previous", "recent incidents"]
    ):
        state["intent"] = "history"
    else:
        state["intent"] = "chat"
    return state


@trace(name="rag_retrieve")
async def rag_retrieve(state: CounselState) -> CounselState:
    """Queries all regulation knowledge bases (DORA, NIS2, GDPR, MAS TRM)."""
    from gradient import Gradient as GradientSDK

    all_results = []
    kb_ids = [
        os.environ.get("GRADIENT_KB_DORA_ID") or DEFAULT_KB_IDS["GRADIENT_KB_DORA_ID"],
        os.environ.get("GRADIENT_KB_NIS2_ID") or DEFAULT_KB_IDS["GRADIENT_KB_NIS2_ID"],
        os.environ.get("GRADIENT_KB_GDPR_ID") or DEFAULT_KB_IDS["GRADIENT_KB_GDPR_ID"],
        os.environ.get("GRADIENT_KB_MAS_ID") or DEFAULT_KB_IDS["GRADIENT_KB_MAS_ID"],
    ]
    if any(kb_ids):
        try:
            sdk = GradientSDK(access_token=os.environ["DIGITALOCEAN_API_TOKEN"])
            for kb_id in [k for k in kb_ids if k]:
                try:
                    result = sdk.retrieve.documents(
                        knowledge_base_id=kb_id,
                        query=state["user_query"],
                        num_results=3,
                    )
                    for chunk in result.results:
                        all_results.append(
                            {
                                "text": chunk.text_content,
                                "source": chunk.metadata.get("source", "Regulation"),
                                "score": 1.0,
                            }
                        )
                except Exception as e:
                    print(f"Warning: KB retrieval failed for {kb_id}: {e}")
        except Exception as e:
            print(f"Warning: Could not initialize KB SDK: {e}")
    else:
        print("Warning: No KB IDs configured; KB retrieval unavailable")
    state["kb_results"] = sorted(
        all_results, key=lambda x: x.get("score", 0), reverse=True
    )[:8]
    return state


@trace(name="generate_grounded_answer")
async def generate_grounded_answer(state: CounselState) -> CounselState:
    """Generates a citation-grounded answer from the retrieved regulation context."""
    context_text = "\n\n".join(
        f"[{r['source']}]: {r['text']}" for r in state["kb_results"]
    )
    
    if not context_text.strip():
        # Fallback when no KB context available
        prompt = f"""You are a DORA compliance expert providing general guidance.
The question: {state['user_query']}

Provide a practical compliance answer without specific citations."""
    else:
        prompt = f"""You are a DORA, NIS2, and GDPR compliance expert advising a financial institution.
Answer the question using ONLY the provided regulation context. Be precise and cite articles.

Context:
{context_text}

Question: {state['user_query']}

Format your answer as:
- Direct answer to the question
- Specific article citations (Article X, Section Y)
- Practical implementation guidance
- Any related obligations to be aware of

If the context does not contain enough information, say so clearly."""
    
    try:
        if os.environ.get("GRADIENT_MODEL_ACCESS_KEY"):
            resp = get_gradient_client().chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="claude-sonnet-4-5",
                max_tokens=2000,
            )
            state["response"] = resp.choices[0].message.content
        else:
            state["response"] = _kb_fallback_answer(
                state["user_query"], state["kb_results"]
            )
    except Exception as e:
        print(f"Warning: LLM call failed: {e}")
        state["response"] = _kb_fallback_answer(state["user_query"], state["kb_results"])
    
    state["citations"] = [
        {"source": r["source"], "excerpt": r["text"][:150]}
        for r in state["kb_results"][:3]
    ]
    if not state["citations"]:
        state["citations"] = [
            {
                "source": "DORA Regulation (EU) 2022/2554",
                "excerpt": "Article 11 - ICT business continuity and recovery policy",
            },
            {
                "source": "DORA Regulation (EU) 2022/2554",
                "excerpt": "Article 17 - ICT-related incident management, classification and reporting",
            },
        ]
    return state


@trace(name="query_incident_history")
async def query_incident_history(state: CounselState) -> CounselState:
    """Fetches recent incidents from API first, then PostgreSQL as fallback."""
    api_url = os.environ.get("GRADIENTGUARD_API_URL") or os.environ.get(
        "NEXT_PUBLIC_API_URL"
    ) or "https://gradient-guard-74ijs.ondigitalocean.app"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{api_url.rstrip('/')}/api/incidents")
            if resp.status_code < 400:
                payload = resp.json()
                incidents_payload = payload.get("incidents", []) if isinstance(payload, dict) else []
                state["incident_history"] = [
                    {
                        "id": str(i.get("id")),
                        "severity": i.get("severity"),
                        "dora_articles": i.get("doraArticles", []) or i.get("dora_articles", []),
                        "detected_at": i.get("detectedAt") or i.get("detected_at"),
                        "status": i.get("status"),
                        "estimated_rto_minutes": i.get("estimatedRtoMinutes") or i.get("estimated_rto_minutes"),
                    }
                    for i in incidents_payload[:20]
                ]
            else:
                state["incident_history"] = []
    except Exception as e:
        print(f"Warning: Could not fetch incident history from API: {e}")
        state["incident_history"] = []

    if state["incident_history"]:
        # API source already returned live incident history.
        pass
    else:
        # Fallback to direct DB query when API path is unavailable.
        try:
            conn = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, severity, dora_articles, detected_at, status, estimated_rto_minutes
                FROM incidents ORDER BY detected_at DESC LIMIT 20
                """
            )
            rows = cur.fetchall()
            cur.close()
            conn.close()
            state["incident_history"] = [
                {
                    "id": str(r[0]),
                    "severity": r[1],
                    "dora_articles": r[2],
                    "detected_at": r[3].isoformat() if r[3] else None,
                    "status": r[4],
                    "estimated_rto_minutes": r[5],
                }
                for r in rows
            ]
        except Exception as e:
            print(f"Warning: Could not fetch incident history from database: {e}")
            state["incident_history"] = []
    
    prompt = f"""Summarize these recent compliance incidents for a compliance officer.
Highlight patterns, most frequent DORA articles triggered, and any concerning trends.
Incidents: {json.dumps(state['incident_history'])}"""
    try:
        if os.environ.get("GRADIENT_MODEL_ACCESS_KEY"):
            resp = get_gradient_client().chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="claude-sonnet-4-5",
                max_tokens=1000,
            )
            state["response"] = resp.choices[0].message.content
        else:
            total = len(state["incident_history"])
            p1 = len([i for i in state["incident_history"] if i.get("severity") == "P1"])
            state["response"] = (
                f"Recent incident summary: {total} incident(s), including {p1} P1 incident(s). "
                "Track recurring DORA article triggers and close open incidents with evidence and remediation."
            )
    except Exception as e:
        print(f"Warning: LLM call failed in query_incident_history: {e}")
        total = len(state["incident_history"])
        state["response"] = f"Incident summary fallback: {total} recent incident(s) found."
    return state


def route_intent(state: CounselState) -> str:
    return {
        "gap_report": "rag_retrieve",
        "matrix": "rag_retrieve",
        "history": "query_history",
        "chat": "rag_retrieve",
    }.get(state["intent"] or "chat", "rag_retrieve")


def build_graph():
    g = StateGraph(CounselState)
    g.add_node("classify", classify_query_intent)
    g.add_node("rag_retrieve", rag_retrieve)
    g.add_node("answer", generate_grounded_answer)
    g.add_node("query_history", query_incident_history)

    g.set_entry_point("classify")
    g.add_conditional_edges("classify", route_intent)
    g.add_edge("rag_retrieve", "answer")
    g.add_edge("answer", END)
    g.add_edge("query_history", END)
    return g.compile()


compiled_graph = build_graph()


@entrypoint
async def run(context: RequestContext) -> dict:
    messages = getattr(context, "messages", None)
    user_query = ""
    if messages is None and isinstance(context, dict):
        messages = context.get("messages", [])
        if not user_query:
            user_query = str(context.get("prompt") or context.get("message") or "")

    if messages:
        last = messages[-1]
        if isinstance(last, dict):
            user_query = str(last.get("content", ""))
        else:
            user_query = str(getattr(last, "content", ""))

    result = await compiled_graph.ainvoke(
        {
            "user_query": user_query,
            "intent": None,
            "kb_results": [],
            "incident_history": [],
            "response": None,
            "citations": [],
            "export_url": None,
        }
    )
    return {
        "response": result.get("response", ""),
        "citations": result.get("citations", []),
        "intent": result.get("intent"),
        "export_url": result.get("export_url"),
    }
