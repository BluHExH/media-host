import { NextRequest, NextResponse } from "next/server";
import { getSql, verifyPassword, makeToken, ensureSchema, getClientIp, getUserAgent, logAuthEvent } from "@/lib/db";
export const runtime = "edge";
export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const ip = getClientIp(request);
    const ua = getUserAgent(request);
    if (!username || !password) return NextResponse.json({ error: "Required" }, { status: 400 });
    const sql = getSql();
    const rows = await sql`SELECT id, username, display_name, password_hash, created_at FROM users WHERE username = ${username} LIMIT 1`;
    if (!rows.length) { await logAuthEvent({ username, ip, userAgent: ua, action: "login_fail", success: false }); return NextResponse.json({ error: "Invalid credentials" }, { status: 401 }); }
    const row = rows[0] as { id: number; username: string; display_name: string; password_hash: string; created_at: string };
    if (!(await verifyPassword(password, row.password_hash))) { await logAuthEvent({ userId: row.id, username: row.username, ip, userAgent: ua, action: "login_fail", success: false }); return NextResponse.json({ error: "Invalid credentials" }, { status: 401 }); }
    await sql`UPDATE users SET last_ip = ${ip}, last_login_at = NOW() WHERE id = ${row.id}`;
    await logAuthEvent({ userId: row.id, username: row.username, ip, userAgent: ua, action: "login", success: true });
    return NextResponse.json({ user: { id: row.id, username: row.username, displayName: row.display_name, createdAt: row.created_at }, token: makeToken(row.id, row.username) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Login failed" }, { status: 500 }); }
}
