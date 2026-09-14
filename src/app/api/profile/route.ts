import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema } from "@/lib/db";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }
    await ensureSchema();
    const sql = getSql();
    const users = await sql`
      SELECT id, username, display_name, email, created_at, last_login_at, register_ip, last_ip
      FROM users WHERE id = ${parsed.userId} LIMIT 1
    `;
    if (!users.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const u = users[0] as any;

    const fileCount = await sql`
      SELECT COUNT(*)::int AS c FROM media_meta WHERE user_id = ${parsed.userId}
    `;
    const totalSize = await sql`
      SELECT COALESCE(SUM(size), 0)::bigint AS s FROM media_meta WHERE user_id = ${parsed.userId}
    `;

    const uploads = await sql`
      SELECT DATE(created_at) AS day, COUNT(*)::int AS c
      FROM media_meta
      WHERE user_id = ${parsed.userId} AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `;
    const logins = await sql`
      SELECT DATE(created_at) AS day, COUNT(*)::int AS c
      FROM login_logs
      WHERE user_id = ${parsed.userId} AND success = true AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `;

    const days: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const upMap: Record<string, number> = {};
    const logMap: Record<string, number> = {};
    for (const r of uploads as any[]) {
      const k = String(r.day).slice(0, 10);
      upMap[k] = r.c;
    }
    for (const r of logins as any[]) {
      const k = String(r.day).slice(0, 10);
      logMap[k] = r.c;
    }
    const activity = days.map((day) => ({
      day,
      uploads: upMap[day] || 0,
      logins: logMap[day] || 0,
    }));

    return NextResponse.json({
      user: {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        email: u.email,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      },
      stats: {
        files: (fileCount[0] as any)?.c || 0,
        totalBytes: Number((totalSize[0] as any)?.s || 0),
      },
      activity,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
