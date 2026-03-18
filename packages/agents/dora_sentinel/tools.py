import httpx


# ── Tool implementations referenced from main.py ──────────────────────────────

async def get_droplet_info(droplet_id: str, token: str) -> dict:
    """Fetch detailed info for a specific droplet."""
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.digitalocean.com/v2/droplets/{droplet_id}",
            headers=headers,
        )
        return resp.json().get("droplet", {})


async def get_app_logs(app_id: str, token: str, limit: int = 50) -> list:
    """Fetch recent log entries for a DO App Platform app."""
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.digitalocean.com/v2/apps/{app_id}/logs?type=RUN&limit={limit}",
            headers=headers,
        )
        return resp.json().get("logs", [])


def compute_compliance_score(incidents: list) -> int:
    """
    Compute a 0-100 DORA compliance score based on open incidents.
    P1 = -20, P2 = -10, P3 = -5
    """
    score = 100
    for inc in incidents:
        severity = inc.get("severity", "P3")
        deductions = {"P1": 20, "P2": 10, "P3": 5}
        score -= deductions.get(severity, 5)
    return max(0, score)
