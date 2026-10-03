import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema, checkRateLimit, getClientIp } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`admin-logs:${ip}`, 40, 60);
    if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, user_id, username, ip, user_agent, action, success, created_at
      FROM login_logs
      ORDER BY created_at DESC
      LIMIT 150
    `;

    return NextResponse.json({
      logs: (rows as any[]).map((r) => ({
        id: r.id,
        userId: r.user_id,
        username: r.username,
        ip: r.ip,
        userAgent: r.user_agent,
        action: r.action,
        success: !!r.success,
        createdAt: r.created_at,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
