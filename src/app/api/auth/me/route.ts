import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema } from "@/lib/db";
export const runtime = "edge";
export async function GET(request: NextRequest) {
  try {
    const token = (request.headers.get("authorization") || "").replace("Bearer ", "") || request.headers.get("x-auth-token") || "";
    const parsed = parseToken(token);
    if (!parsed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT id, username, display_name, created_at FROM users WHERE id = ${parsed.userId} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const u = rows[0] as { id: number; username: string; display_name: string; created_at: string };
    return NextResponse.json({ user: { id: u.id, username: u.username, displayName: u.display_name, createdAt: u.created_at } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}
