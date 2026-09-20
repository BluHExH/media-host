import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") || "";
    const expected = process.env.ADMIN_SECRET || "";
    // Never fall back to blob token — require explicit ADMIN_SECRET
    if (!expected || secret !== expected) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      UPDATE media_meta SET is_public = false WHERE is_public = true
      RETURNING id
    `;
    return NextResponse.json({ ok: true, unpublished: rows.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
