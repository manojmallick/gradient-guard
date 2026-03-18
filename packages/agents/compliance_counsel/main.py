import os
import json
from typing import TypedDict, Optional, Literal
from gradient_adk import entrypoint, RequestContext, trace
from langgraph.graph import StateGraph, END
from gradient import Gradient
import psycopg2


class CounselState(TypedDict):
    user_query: str
    intent: Optional[Literal["chat", "gap_report", "matrix", "history"]]
    kb_results: list
    incident_history: list
    response: Optional[str]
    citations: list
    export_url: Optional[str]


gradient_client = Gradient(
    model_access_key=os.environ.get("GRADIENT_MODEL_ACCESS_KEY", "")
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

    sdk = GradientSDK(access_token=os.environ["DIGITALOCEAN_API_TOKEN"])
    all_results = []
    kb_ids = [
        os.environ.get("GRADIENT_KB_DORA_ID"),
        os.environ.get("GRADIENT_KB_NIS2_ID"),
        os.environ.get("GRADIENT_KB_GDPR_ID"),
        os.environ.get("GRADIENT_KB_MAS_ID"),
    ]
    for kb_id in [k for k in kb_ids if k]:
        try:
            result = sdk.knowledge_bases.retrieve(
                knowledge_base_id=kb_id,
                query=state["user_query"],
                top_k=3,
            )
            for chunk in result.results:
                all_results.append(
                    {
                        "text": chunk.text,
                        "source": chunk.metadata.get("source", "Regulation"),
                        "score": chunk.score,
                    }
                )
        except Exception:
            pass
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
    resp = gradient_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="claude-sonnet-4-5",
        max_tokens=2000,
    )
    state["response"] = resp.choices[0].message.content
    state["citations"] = [
        {"source": r["source"], "excerpt": r["text"][:150]}
        for r in state["kb_results"][:3]
    ]
    return state


@trace(name="query_incident_history")
async def query_incident_history(state: CounselState) -> CounselState:
    """Fetches recent incidents from PostgreSQL and summarizes trends."""
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
    prompt = f"""Summarize these recent compliance incidents for a compliance officer.
Highlight patterns, most frequent DORA articles triggered, and any concerning trends.
Incidents: {json.dumps(state['incident_history'])}"""
    resp = gradient_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="claude-sonnet-4-5",
        max_tokens=1000,
    )
    state["response"] = resp.choices[0].message.content
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
    user_query = context.messages[-1]["content"]
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
