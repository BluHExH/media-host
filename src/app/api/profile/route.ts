import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema, makeToken } from "@/lib/db";

export const runtime = "edge";

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) return NextResponse.json({ error: "Login required" }, { status: 401 });
    await ensureSchema();
    const sql = getSql();
    const users = await sql`
      SELECT id, username, display_name, email, created_at, last_login_at, avatar_url
      FROM users WHERE id = ${parsed.userId} LIMIT 1
    `;
    if (!users.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const u = users[0] as any;

    const fileCount = await sql`SELECT COUNT(*)::int AS c FROM media_meta WHERE user_id = ${parsed.userId}`;
    const totalSize = await sql`SELECT COALESCE(SUM(size), 0)::bigint AS s FROM media_meta WHERE user_id = ${parsed.userId}`;

    const uploads = await sql`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS c
      FROM media_meta
      WHERE user_id = ${parsed.userId}
        AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY 1 ORDER BY 1 ASC`;
    const logins = await sql`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS c
      FROM login_logs
      WHERE user_id = ${parsed.userId}
        AND success = true
        AND created_at > NOW() - INTERVAL '14 days'
      GROUP BY 1 ORDER BY 1 ASC`;

    const days: string[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      days.push(dayKey(d));
    }
    const upMap: Record<string, number> = {};
    const logMap: Record<string, number> = {};
    for (const r of uploads as any[]) {
      const k = String(r.day || "").slice(0, 10);
      if (k) upMap[k] = Number(r.c) || 0;
    }
    for (const r of logins as any[]) {
      const k = String(r.day || "").slice(0, 10);
      if (k) logMap[k] = Number(r.c) || 0;
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
        avatarUrl: u.avatar_url || null,
      },
      stats: {
        files: (fileCount[0] as any)?.c || 0,
        totalBytes: Number((totalSize[0] as any)?.s || 0),
      },
      activity,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) return NextResponse.json({ error: "Login required" }, { status: 401 });
    await ensureSchema();
    const body = await request.json();
    const sql = getSql();

    let displayName = body.displayName != null ? String(body.displayName).trim().slice(0, 64) : null;
    let username = body.username != null
      ? String(body.username).trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32)
      : null;

    if (username !== null) {
      if (username.length < 3) {
        return NextResponse.json({ error: "Username min 3 characters" }, { status: 400 });
      }
      const taken = await sql`
        SELECT id FROM users WHERE username = ${username} AND id != ${parsed.userId} LIMIT 1
      `;
      if (taken.length) {
        return NextResponse.json({ error: "Username taken" }, { status: 409 });
      }
      await sql`UPDATE users SET username = ${username} WHERE id = ${parsed.userId}`;
    }
    if (displayName !== null) {
      if (!displayName) displayName = username || "User";
      await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${parsed.userId}`;
    }

    const rows = await sql`
      SELECT id, username, display_name, email, created_at, avatar_url
      FROM users WHERE id = ${parsed.userId} LIMIT 1
    `;
    const u = rows[0] as any;
    const newToken = await makeToken(u.id, u.username);

    return NextResponse.json({
      user: {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        email: u.email,
        createdAt: u.created_at,
        avatarUrl: u.avatar_url || null,
      },
      token: newToken,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) return NextResponse.json({ error: "Login required" }, { status: 401 });
    await ensureSchema();
    const sql = getSql();
    const body = await request.json().catch(() => ({}));
    if (String(body.confirm || "") !== "DELETE") {
      return NextResponse.json({ error: 'Type confirm: "DELETE" to delete account' }, { status: 400 });
    }

    const media = await sql`SELECT url FROM media_meta WHERE user_id = ${parsed.userId}`;
    const urls = (media as any[]).map((m) => m.url).filter(Boolean);

    await sql`DELETE FROM refresh_tokens WHERE user_id = ${parsed.userId}`;
    await sql`DELETE FROM login_logs WHERE user_id = ${parsed.userId}`;
    await sql`DELETE FROM media_meta WHERE user_id = ${parsed.userId}`;
    await sql`DELETE FROM users WHERE id = ${parsed.userId}`;

    if (urls.length) {
      try {
        const { del } = await import("@vercel/blob");
        await del(urls);
      } catch {}
    }

    return NextResponse.json({ ok: true, message: "Account deleted" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}
