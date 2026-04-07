import { getApiBaseUrl } from "../../../../lib/api-base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = getApiBaseUrl();

export async function GET() {
  try {
    const upstream = await fetch(`${API_BASE}/api/incidents/stream`, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(
        JSON.stringify({ error: "Upstream incident stream unavailable" }),
        {
          status: upstream.status || 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Upstream incident stream unavailable" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
