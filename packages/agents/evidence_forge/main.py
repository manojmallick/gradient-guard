import os
import json
from datetime import datetime, timezone
from typing import TypedDict, Optional
from gradient_adk import entrypoint, RequestContext, trace
from langgraph.graph import StateGraph, END
from gradient import Gradient
import httpx
import psycopg2
import boto3
from .pdf_builder import build_evidence_pdf


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


gradient_client = Gradient(
    model_access_key=os.environ.get("GRADIENT_MODEL_ACCESS_KEY", "")
)


@trace(name="fetch_logs_and_metrics")
async def fetch_logs_and_metrics(state: EvidenceState) -> EvidenceState:
    """Fetches recent app logs from DO App Platform for the affected services."""
    headers = {"Authorization": f"Bearer {os.environ['DIGITALOCEAN_API_TOKEN']}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
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
    resp = gradient_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="claude-sonnet-4-5",
        max_tokens=2000,
    )
    try:
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
    from gradient import Gradient as GradientSDK

    sdk = GradientSDK(access_token=os.environ["DIGITALOCEAN_API_TOKEN"])
    citations = []
    for article in state["dora_articles"]:
        result = sdk.knowledge_bases.retrieve(
            knowledge_base_id=os.environ["GRADIENT_KB_DORA_ID"],
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
    """Uploads PDF to DO Spaces and returns presigned URL (24h expiry)."""
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["DO_SPACES_ENDPOINT"],
        aws_access_key_id=os.environ["DO_SPACES_KEY"],
        aws_secret_access_key=os.environ["DO_SPACES_SECRET"],
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
        ExpiresIn=86400,  # 24 hours
    )
    state["spaces_url"] = url
    return state


@trace(name="update_incident_record")
async def update_incident_record(state: EvidenceState) -> EvidenceState:
    """Updates the incident record in PostgreSQL with the evidence URL."""
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
    payload = json.loads(context.messages[-1]["content"])
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
