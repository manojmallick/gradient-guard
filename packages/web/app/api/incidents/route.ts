import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../lib/api-base";

const API_BASE = getApiBaseUrl();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const url = `${API_BASE}/api/incidents${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Upstream API unavailable" },
      { status: 502 }
    );
  }
}
