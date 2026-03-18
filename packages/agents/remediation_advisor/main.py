import os
import json
from typing import TypedDict, Optional
from gradient_adk import entrypoint, RequestContext, trace
from langgraph.graph import StateGraph, END
from gradient import Gradient
import httpx
import psycopg2


class RemediationState(TypedDict):
    incident_id: str
    severity: str
    dora_articles: list
    incidents: list
    root_cause: Optional[str]
    kb_context: Optional[str]
    remediation_plan: Optional[dict]
    estimated_rto_minutes: Optional[int]


gradient_client = Gradient(
    model_access_key=os.environ.get("GRADIENT_MODEL_ACCESS_KEY", "")
)


@trace(name="analyze_root_cause")
async def analyze_root_cause(state: RemediationState) -> RemediationState:
    """Uses LLM to perform structured root cause analysis of the incident."""
    prompt = f"""You are a senior incident response engineer with DORA compliance expertise.
Analyze the following incident and provide a structured root cause analysis.

Incidents: {json.dumps(state['incidents'])}
DORA Articles Triggered: {', '.join(state['dora_articles'])}

Return JSON with:
- primary_cause: string (the root technical cause)
- contributing_factors: list[string]
- dora_impact: string (how this violates specific DORA requirements)
- immediate_actions: list[string] (first 15 minutes)

Return ONLY JSON."""
    resp = gradient_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="claude-sonnet-4-6",
        max_tokens=1500,
    )
    try:
        rca = json.loads(resp.choices[0].message.content)
        state["root_cause"] = json.dumps(rca)
    except (json.JSONDecodeError, KeyError):
        state["root_cause"] = json.dumps(
            {
                "primary_cause": "Unable to determine — manual review required",
                "contributing_factors": [],
                "dora_impact": "Unknown",
                "immediate_actions": [],
            }
        )
    return state


@trace(name="query_remediation_kb")
async def query_remediation_kb(state: RemediationState) -> RemediationState:
    """Queries DORA KB and incident runbooks KB for relevant remediation guidance."""
    from gradient import Gradient as GradientSDK

    sdk = GradientSDK(access_token=os.environ["DIGITALOCEAN_API_TOKEN"])
    contexts = []
    kb_ids = [
        os.environ.get("GRADIENT_KB_DORA_ID"),
        os.environ.get("GRADIENT_KB_INCIDENTS_ID", ""),
    ]
    for kb_id in [k for k in kb_ids if k]:
        result = sdk.knowledge_bases.retrieve(
            knowledge_base_id=kb_id,
            query=f"remediation steps for {state.get('root_cause', 'ICT incident')}",
            top_k=3,
        )
        for chunk in result.results:
            contexts.append(chunk.text)
    state["kb_context"] = "\n\n---\n\n".join(contexts)
    return state


@trace(name="generate_remediation_plan")
async def generate_remediation_plan(state: RemediationState) -> RemediationState:
    """Generates a DORA-compliant remediation plan with step-by-step actions."""
    prompt = f"""You are a DORA compliance remediation specialist.
Based on the root cause analysis and DORA guidance, create a detailed remediation plan.

Root Cause: {state['root_cause']}
DORA Context: {state.get('kb_context', '')[:2000]}
Severity: {state['severity']}

Return JSON with:
- title: string
- priority: "immediate" | "short_term" | "long_term"
- steps: list of {{step_number, action, owner, estimated_minutes, dora_article}}
- success_criteria: list[string]
- post_incident_review: string (DORA Article 17(6) requirement)

Return ONLY JSON."""
    resp = gradient_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="claude-sonnet-4-6",
        max_tokens=2000,
    )
    try:
        state["remediation_plan"] = json.loads(resp.choices[0].message.content)
    except (json.JSONDecodeError, KeyError):
        state["remediation_plan"] = {
            "title": "Manual remediation required",
            "steps": [],
            "priority": "immediate",
        }
    return state


@trace(name="estimate_recovery_time")
async def estimate_recovery_time(state: RemediationState) -> RemediationState:
    """Computes estimated RTO from the sum of step durations."""
    steps = state.get("remediation_plan", {}).get("steps", [])
    total_minutes = sum(s.get("estimated_minutes", 30) for s in steps)
    state["estimated_rto_minutes"] = max(total_minutes, 15)
    return state


@trace(name="update_incident_with_remediation")
async def update_incident(state: RemediationState) -> RemediationState:
    """Persists the remediation plan to PostgreSQL."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE incidents SET
            root_cause=%s, remediation_plan=%s,
            estimated_rto_minutes=%s, remediation_generated_at=NOW()
        WHERE id=%s
        """,
        (
            state.get("root_cause"),
            json.dumps(state.get("remediation_plan", {})),
            state.get("estimated_rto_minutes"),
            state["incident_id"],
        ),
    )
    conn.commit()
    cur.close()
    conn.close()
    return state


@trace(name="notify_slack")
async def notify_slack(state: RemediationState) -> RemediationState:
    """Sends a Slack notification if SLACK_WEBHOOK_URL is configured."""
    webhook = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook:
        return state
    plan = state.get("remediation_plan", {})
    try:
        primary_cause = json.loads(state.get("root_cause", "{}")).get(
            "primary_cause", "Unknown"
        )
    except (json.JSONDecodeError, TypeError):
        primary_cause = "Unknown"
    msg = {
        "text": f":rotating_light: *GradientGuard Alert* — {state['severity']} Incident",
        "attachments": [
            {
                "color": "#ff4444" if state["severity"] == "P1" else "#ff8800",
                "fields": [
                    {
                        "title": "Incident ID",
                        "value": state["incident_id"],
                        "short": True,
                    },
                    {
                        "title": "Severity",
                        "value": state["severity"],
                        "short": True,
                    },
                    {"title": "Root Cause", "value": primary_cause},
                    {
                        "title": "Estimated RTO",
                        "value": f"{state.get('estimated_rto_minutes', 60)} minutes",
                    },
                ],
            }
        ],
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(webhook, json=msg)
    return state


def build_graph():
    g = StateGraph(RemediationState)
    g.add_node("rca", analyze_root_cause)
    g.add_node("kb", query_remediation_kb)
    g.add_node("plan", generate_remediation_plan)
    g.add_node("rto", estimate_recovery_time)
    g.add_node("update", update_incident)
    g.add_node("slack", notify_slack)

    g.set_entry_point("rca")
    g.add_edge("rca", "kb")
    g.add_edge("kb", "plan")
    g.add_edge("plan", "rto")
    g.add_edge("rto", "update")
    g.add_edge("update", "slack")
    g.add_edge("slack", END)
    return g.compile()


compiled_graph = build_graph()


@entrypoint
async def run(context: RequestContext) -> dict:
    payload = json.loads(context.messages[-1]["content"])
    result = await compiled_graph.ainvoke(
        {
            **payload,
            "root_cause": None,
            "kb_context": None,
            "remediation_plan": None,
            "estimated_rto_minutes": None,
        }
    )
    return {
        "status": "remediation_ready",
        "incident_id": result["incident_id"],
        "remediation_plan": result.get("remediation_plan"),
        "estimated_rto_minutes": result.get("estimated_rto_minutes"),
    }
