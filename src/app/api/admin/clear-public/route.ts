import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const runtime = "edge";

function isAdmin(request: NextRequest): boolean {
  const secret = request.headers.get("x-admin-secret") || "";
  const expected = process.env.ADMIN_SECRET || "";
  return !!expected && secret === expected;
}

/** Unpublish all public gallery items (does not delete blobs). */
export async function POST(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await ensureSchema();
    const sql = getSql();
    const result = await sql`
      UPDATE media_meta SET is_public = false WHERE is_public = true
      RETURNING id
    `;
    return NextResponse.json({ ok: true, cleared: (result as any[]).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
