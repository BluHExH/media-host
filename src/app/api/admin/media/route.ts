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
    const rl = await checkRateLimit(`admin-media:${ip}`, 40, 60);
    if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

    await ensureSchema();
    const sql = getSql();
    const album = request.nextUrl.searchParams.get("album") || "";

    let rows: any[];
    if (album === "trash") {
      rows = await sql`
        SELECT m.id, m.url, m.pathname, m.content_type, m.size, m.album, m.is_public, m.created_at,
               u.username
        FROM media_meta m
        LEFT JOIN users u ON u.id = m.user_id
        WHERE m.album = 'trash'
        ORDER BY m.created_at DESC
        LIMIT 100
      `;
    } else if (album === "public") {
      rows = await sql`
        SELECT m.id, m.url, m.pathname, m.content_type, m.size, m.album, m.is_public, m.created_at,
               u.username
        FROM media_meta m
        LEFT JOIN users u ON u.id = m.user_id
        WHERE m.is_public = true
        ORDER BY m.created_at DESC
        LIMIT 100
      `;
    } else {
      rows = await sql`
        SELECT m.id, m.url, m.pathname, m.content_type, m.size, m.album, m.is_public, m.created_at,
               u.username
        FROM media_meta m
        LEFT JOIN users u ON u.id = m.user_id
        ORDER BY m.created_at DESC
        LIMIT 80
      `;
    }

    return NextResponse.json({
      files: (rows as any[]).map((r) => ({
        id: r.id,
        url: r.url,
        pathname: r.pathname,
        contentType: r.content_type,
        size: Number(r.size) || 0,
        album: r.album || "general",
        isPublic: !!r.is_public,
        createdAt: r.created_at,
        username: r.username || "?",
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Permanently delete a media row + blob (admin). */
export async function DELETE(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const url = String(body.url || "").trim();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM media_meta WHERE url = ${url}`;
    try {
      const { del } = await import("@vercel/blob");
      await del(url);
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
