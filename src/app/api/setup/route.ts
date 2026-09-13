import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
export const runtime = "edge";
export async function POST() {
  try {
    await ensureSchema();
    return NextResponse.json({ ok: true, message: "Database tables ready" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Setup failed" }, { status: 500 });
  }
}
export async function GET() {
  return POST();
}
