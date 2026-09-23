import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema, checkRateLimit, getClientIp } from "@/lib/db";

export const runtime = "edge";

function isAdmin(request: NextRequest): boolean {
  const secret = request.headers.get("x-admin-secret") || "";
  const expected = process.env.ADMIN_SECRET || "";
  return !!expected && secret === expected;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Forbidden — set ADMIN_SECRET and send x-admin-secret" }, { status: 403 });
    }
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`admin:${ip}`, 60, 60);
    if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

    await ensureSchema();
    const sql = getSql();

    const users = await sql`
      SELECT u.id, u.username, u.display_name, u.email, u.created_at, u.last_login_at, u.last_ip,
        (SELECT COUNT(*)::int FROM media_meta m WHERE m.user_id = u.id) AS file_count,
        (SELECT COALESCE(SUM(m.size), 0)::bigint FROM media_meta m WHERE m.user_id = u.id) AS total_bytes
      FROM users u
      ORDER BY u.id DESC
      LIMIT 500
    `;

    const totals = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM media_meta) AS files,
        (SELECT COALESCE(SUM(size), 0)::bigint FROM media_meta) AS bytes,
        (SELECT COUNT(*)::int FROM media_meta WHERE is_public = true) AS public_files
    `;

    const t = (totals[0] || {}) as any;

    return NextResponse.json({
      stats: {
        users: Number(t.users) || 0,
        files: Number(t.files) || 0,
        totalBytes: Number(t.bytes) || 0,
        publicFiles: Number(t.public_files) || 0,
      },
      users: (users as any[]).map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        email: u.email,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        lastIp: u.last_ip,
        fileCount: Number(u.file_count) || 0,
        totalBytes: Number(u.total_bytes) || 0,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    await ensureSchema();
    const sql = getSql();
    const media = await sql`SELECT url FROM media_meta WHERE user_id = ${userId}`;
    const urls = (media as any[]).map((m) => m.url).filter(Boolean);

    await sql`DELETE FROM refresh_tokens WHERE user_id = ${userId}`;
    await sql`DELETE FROM login_logs WHERE user_id = ${userId}`;
    await sql`DELETE FROM media_meta WHERE user_id = ${userId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;

    if (urls.length) {
      try {
        const { del } = await import("@vercel/blob");
        await del(urls);
      } catch {}
    }

    return NextResponse.json({ ok: true, deletedFiles: urls.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}
