import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";

export const runtime = "edge";

function authorized(request: NextRequest): boolean {
  const secret = request.headers.get("x-admin-secret") || "";
  const expected = process.env.ADMIN_SECRET || "";
  // In production require ADMIN_SECRET; in dev allow if no secret set
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return !!expected && secret === expected;
  }
  if (expected) return secret === expected;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await ensureSchema();
    return NextResponse.json({ ok: true, message: "Database tables ready" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Setup failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
