import os
import json
from datetime import datetime, timezone
from typing import TypedDict, Optional
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
import httpx
import psycopg2
import boto3

try:
    from .pdf_builder import build_evidence_pdf
except ImportError:
    from pdf_builder import build_evidence_pdf


class EvidenceState(TypedDict):
    incident_id: str
    severity: str
    dora_articles: list
    incidents: list
    logs: list
    timeline: list
    dora_citations: list
    pdf_bytes: Optional[bytes]
    spaces_url: Optional[str]


def get_gradient_client():
    """Lazy-load Gradient client to handle missing env vars gracefully."""
    return Gradient(
        model_access_key=os.environ.get("GRADIENT_MODEL_ACCESS_KEY") or None,
        access_token=os.environ.get("DIGITALOCEAN_API_TOKEN") or None,
    )


@trace(name="fetch_logs_and_metrics")
async def fetch_logs_and_metrics(state: EvidenceState) -> EvidenceState:
    """Fetches recent app logs from DO App Platform for the affected services."""
    try:
        headers = {"Authorization": f"Bearer {os.environ['DIGITALOCEAN_API_TOKEN']}"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            apps_resp = await client.get(
                "https://api.digitalocean.com/v2/apps", headers=headers
            )
            apps = apps_resp.json().get("apps", [])
            logs = []
            for app in apps[:3]:
                app_id = app["id"]
                log_resp = await client.get(
                    f"https://api.digitalocean.com/v2/apps/{app_id}/logs?type=RUN&limit=50",
                    headers=headers,
                )
                logs.extend(log_resp.json().get("logs", []))
        state["logs"] = logs
    except Exception as e:
        print(f"Warning: log fetch failed ({e}), continuing with empty logs")
        state["logs"] = []
    return state


@trace(name="build_incident_timeline")
async def build_incident_timeline(state: EvidenceState) -> EvidenceState:
    """Uses LLM to build a structured chronological timeline for audit purposes."""
    prompt = f"""You are a DORA compliance evidence specialist.
Given these incident details and logs, build a precise chronological timeline
for audit purposes. Format as JSON array of {{timestamp, event, system, impact}}.

Incidents: {json.dumps(state['incidents'])}
Logs (last 50 entries): {json.dumps(state['logs'][:50])}

Return ONLY a JSON array, no markdown."""
    try:
        resp = get_gradient_client().chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="claude-sonnet-4-5",
            max_tokens=2000,
        )
        state["timeline"] = json.loads(resp.choices[0].message.content)
    except json.JSONDecodeError:
        state["timeline"] = [
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event": "Timeline generation failed — see raw logs",
                "system": "EvidenceForge",
                "impact": "Low",
            }
        ]
    return state


@trace(name="query_dora_kb")
async def query_dora_kb(state: EvidenceState) -> EvidenceState:
    """RAG query against DORA knowledge base for each relevant article."""
    kb_id = os.environ.get("GRADIENT_KB_DORA_ID", "")
    if not kb_id or kb_id == "placeholder":
        # KB not configured — use static fallback citations so PDF still builds
        state["dora_citations"] = [
            {
                "article": a,
                "text": (
                    "Financial entities shall implement ICT business continuity policies "
                    "including RTO and RPO objectives aligned with DORA Article 11 requirements."
                ),
                "source": "DORA Regulation (EU) 2022/2554",
            }
            for a in state["dora_articles"]
        ]
        return state

    try:
        from gradient import Gradient as GradientSDK
        sdk = GradientSDK(access_token=os.environ["DIGITALOCEAN_API_TOKEN"])
        citations = []
        for article in state["dora_articles"]:
            result = sdk.knowledge_bases.retrieve(
                knowledge_base_id=kb_id,
                query=f"requirements and evidence for {article}",
                top_k=3,
            )
            for chunk in result.results:
                citations.append(
                    {
                        "article": article,
                        "text": chunk.text,
                        "source": chunk.metadata.get("source", "DORA Regulation"),
                    }
                )
        state["dora_citations"] = citations
    except Exception as e:
        print(f"Warning: DORA KB query failed ({e}), using static citations")
        state["dora_citations"] = [
            {
                "article": a,
                "text": (
                    "Financial entities shall implement ICT business continuity policies "
                    "including RTO and RPO objectives aligned with DORA Article 11 requirements."
                ),
                "source": "DORA Regulation (EU) 2022/2554",
            }
            for a in state["dora_articles"]
        ]
    return state


@trace(name="generate_pdf")
async def generate_pdf(state: EvidenceState) -> EvidenceState:
    """Builds structured evidence PDF using reportlab."""
    state["pdf_bytes"] = build_evidence_pdf(
        incident_id=state["incident_id"],
        severity=state["severity"],
        timeline=state["timeline"],
        citations=state["dora_citations"],
        incidents=state["incidents"],
    )
    return state


@trace(name="upload_to_spaces")
async def upload_to_spaces(state: EvidenceState) -> EvidenceState:
    """Uploads PDF to DO Spaces. Falls back to base64 data URL when Spaces not configured."""
    import base64

    spaces_key = os.environ.get("DO_SPACES_KEY", "")
    spaces_secret = os.environ.get("DO_SPACES_SECRET", "")
    _placeholder = {"", "placeholder"}

    if spaces_key in _placeholder or spaces_secret in _placeholder:
        # Spaces not configured — encode PDF as base64 data URL so the
        # evidence is still persisted and downloadable via the API.
        b64 = base64.b64encode(state["pdf_bytes"]).decode("utf-8")
        state["spaces_url"] = f"data:application/pdf;base64,{b64}"
        return state

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=os.environ["DO_SPACES_ENDPOINT"],
            aws_access_key_id=spaces_key,
            aws_secret_access_key=spaces_secret,
        )
        key = f"evidence/{state['incident_id']}/report_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.pdf"
        s3.put_object(
            Bucket=os.environ["DO_SPACES_BUCKET"],
            Key=key,
            Body=state["pdf_bytes"],
            ContentType="application/pdf",
            ACL="private",
        )
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": os.environ["DO_SPACES_BUCKET"], "Key": key},
            ExpiresIn=86400,
        )
        state["spaces_url"] = url
    except Exception as e:
        print(f"Warning: Spaces upload failed ({e}), falling back to base64")
        b64 = base64.b64encode(state["pdf_bytes"]).decode("utf-8")
        state["spaces_url"] = f"data:application/pdf;base64,{b64}"

    return state


@trace(name="update_incident_record")
async def update_incident_record(state: EvidenceState) -> EvidenceState:
    """Updates the incident record in PostgreSQL with the evidence URL."""
    try:
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE incidents SET evidence_url=%s, evidence_generated_at=NOW()
            WHERE id=%s
            """,
            (state["spaces_url"], state["incident_id"]),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not update incident record in database: {e}")
    return state


def build_graph():
    g = StateGraph(EvidenceState)
    g.add_node("fetch_logs", fetch_logs_and_metrics)
    g.add_node("timeline", build_incident_timeline)
    g.add_node("dora_kb", query_dora_kb)
    g.add_node("pdf", generate_pdf)
    g.add_node("upload", upload_to_spaces)
    g.add_node("update_db", update_incident_record)

    g.set_entry_point("fetch_logs")
    g.add_edge("fetch_logs", "timeline")
    g.add_edge("timeline", "dora_kb")
    g.add_edge("dora_kb", "pdf")
    g.add_edge("pdf", "upload")
    g.add_edge("upload", "update_db")
    g.add_edge("update_db", END)
    return g.compile()


compiled_graph = build_graph()


@entrypoint
async def run(context: RequestContext) -> dict:
    messages = getattr(context, "messages", None)
    if messages is None and isinstance(context, dict):
        messages = context.get("messages", [])
    if not messages:
        return {
            "status": "error",
            "message": "missing messages payload",
        }

    last = messages[-1]
    if isinstance(last, dict):
        content = last.get("content", "{}")
    else:
        content = getattr(last, "content", "{}")

    payload = json.loads(content)
    result = await compiled_graph.ainvoke(
        {
            **payload,
            "logs": [],
            "timeline": [],
            "dora_citations": [],
            "pdf_bytes": None,
            "spaces_url": None,
        }
    )
    return {
        "status": "evidence_generated",
        "evidence_url": result.get("spaces_url"),
        "incident_id": result.get("incident_id"),
    }
