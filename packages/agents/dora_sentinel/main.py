import os
import asyncio
from datetime import datetime, timezone
from typing import TypedDict, Optional, Literal
from gradient_adk import entrypoint, RequestContext, trace
from langgraph.graph import StateGraph, END
import httpx
import psycopg2
import json


# ── State Definition ──────────────────────────────────────────────────────────
class SentinelState(TypedDict):
    infra_state: dict
    incidents: list
    severity: Optional[Literal["P1", "P2", "P3"]]
    dora_articles: list
    incident_id: Optional[str]
    context: Optional[str]


# ── Tool Functions ────────────────────────────────────────────────────────────
@trace(name="fetch_infrastructure_state")
async def fetch_infrastructure_state(state: SentinelState) -> SentinelState:
    """Calls DO API v2 to get current state of all monitored resources."""
    headers = {"Authorization": f"Bearer {os.environ['DIGITALOCEAN_API_TOKEN']}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        droplets = (
            await client.get(
                "https://api.digitalocean.com/v2/droplets", headers=headers
            )
        ).json()
        apps = (
            await client.get(
                "https://api.digitalocean.com/v2/apps", headers=headers
            )
        ).json()
        dbs = (
            await client.get(
                "https://api.digitalocean.com/v2/databases", headers=headers
            )
        ).json()
    state["infra_state"] = {
        "droplets": droplets.get("droplets", []),
        "apps": apps.get("apps", []),
        "databases": dbs.get("databases", []),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return state


@trace(name="check_thresholds")
async def check_thresholds(state: SentinelState) -> SentinelState:
    """Checks DORA Article 11 thresholds. Returns list of breach events."""
    breaches = []
    infra = state["infra_state"]

    # Check Droplet health
    for d in infra.get("droplets", []):
        if d.get("status") != "active":
            breaches.append(
                {
                    "type": "droplet_down",
                    "resource_id": d["id"],
                    "resource_name": d["name"],
                    "dora_article": "Article 11(3) - ICT continuity",
                    "rto_breach": True,
                    "details": f"Droplet {d['name']} is {d.get('status')}",
                }
            )

    # Check App Platform deployments
    for app in infra.get("apps", []):
        phase = app.get("in_progress_deployment", {}).get("phase", "")
        if phase in ["ERROR", "FAILED"]:
            breaches.append(
                {
                    "type": "app_deployment_failure",
                    "resource_id": app["id"],
                    "resource_name": app["spec"]["name"],
                    "dora_article": "Article 11(5) - Recovery testing",
                    "rto_breach": True,
                    "details": f"App {app['spec']['name']} deployment failed",
                }
            )

    # Check DB cluster health
    for db in infra.get("databases", []):
        if db.get("status") != "online":
            breaches.append(
                {
                    "type": "database_unavailable",
                    "resource_id": db["id"],
                    "resource_name": db["name"],
                    "dora_article": "Article 11(2) - Data backup and recovery",
                    "rpo_breach": True,
                    "details": f"Database {db['name']} is {db.get('status')}",
                }
            )

    state["incidents"] = breaches
    return state


@trace(name="classify_incident")
async def classify_incident(state: SentinelState) -> SentinelState:
    """Uses heuristic to classify severity and map to DORA articles."""
    if not state["incidents"]:
        return state
    has_rto = any(i.get("rto_breach") for i in state["incidents"])
    has_rpo = any(i.get("rpo_breach") for i in state["incidents"])
    state["severity"] = (
        "P1" if (has_rto and has_rpo) else "P2" if (has_rto or has_rpo) else "P3"
    )
    state["dora_articles"] = list(
        {i["dora_article"] for i in state["incidents"]}
    )
    return state


@trace(name="persist_incident")
async def persist_incident(state: SentinelState) -> SentinelState:
    """Writes incident to PostgreSQL and returns incident_id."""
    if not state["incidents"]:
        return state
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO incidents (severity, dora_articles, details, detected_at, status)
        VALUES (%s, %s, %s, NOW(), 'open')
        RETURNING id
        """,
        (
            state["severity"],
            json.dumps(state["dora_articles"]),
            json.dumps(state["incidents"]),
        ),
    )
    incident_id = str(cur.fetchone()[0])
    conn.commit()
    cur.close()
    conn.close()
    state["incident_id"] = incident_id
    return state


@trace(name="dispatch_downstream_agents")
async def dispatch_downstream_agents(state: SentinelState) -> SentinelState:
    """Calls A2 (EvidenceForge) and A3 (RemediationAdvisor) in parallel via A2A."""
    if not state.get("incident_id"):
        return state
    payload = {
        "incident_id": state["incident_id"],
        "severity": state["severity"],
        "dora_articles": state["dora_articles"],
        "incidents": state["incidents"],
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        await asyncio.gather(
            client.post(
                f"{os.environ['GRADIENT_AGENT_URL_EVIDENCE']}/run",
                headers={
                    "Authorization": f"Bearer {os.environ['GRADIENT_AGENT_KEY_EVIDENCE']}"
                },
                json={"messages": [{"role": "user", "content": json.dumps(payload)}]},
            ),
            client.post(
                f"{os.environ['GRADIENT_AGENT_URL_REMEDIATION']}/run",
                headers={
                    "Authorization": f"Bearer {os.environ['GRADIENT_AGENT_KEY_REMEDIATION']}"
                },
                json={"messages": [{"role": "user", "content": json.dumps(payload)}]},
            ),
        )
    return state


# ── Graph Definition ──────────────────────────────────────────────────────────
def build_graph():
    graph = StateGraph(SentinelState)
    graph.add_node("fetch_infra", fetch_infrastructure_state)
    graph.add_node("check_thresh", check_thresholds)
    graph.add_node("classify", classify_incident)
    graph.add_node("persist", persist_incident)
    graph.add_node("dispatch", dispatch_downstream_agents)

    graph.set_entry_point("fetch_infra")
    graph.add_edge("fetch_infra", "check_thresh")
    graph.add_conditional_edges(
        "check_thresh", lambda s: "classify" if s["incidents"] else END
    )
    graph.add_edge("classify", "persist")
    graph.add_edge("persist", "dispatch")
    graph.add_edge("dispatch", END)
    return graph.compile()


compiled_graph = build_graph()


@entrypoint
async def run(context: RequestContext) -> dict:
    """ADK entrypoint — called every 60s by cron worker."""
    result = await compiled_graph.ainvoke(
        {
            "infra_state": {},
            "incidents": [],
            "severity": None,
            "dora_articles": [],
            "incident_id": None,
            "context": None,
        }
    )
    if result.get("incident_id"):
        return {
            "status": "incident_detected",
            "incident_id": result["incident_id"],
            "severity": result["severity"],
            "dora_articles": result["dora_articles"],
        }
    return {"status": "ok", "message": "No DORA threshold breaches detected"}
