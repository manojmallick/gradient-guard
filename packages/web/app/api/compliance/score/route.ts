import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../lib/api-base";

const API_BASE = getApiBaseUrl();

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/compliance/score`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Upstream API unavailable" },
      { status: 502 }
    );
  }
}
