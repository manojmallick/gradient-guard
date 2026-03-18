import { NextResponse } from "next/server";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function POST() {
  const res = await fetch(`${API_URL}/api/simulate`, { method: "POST" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
