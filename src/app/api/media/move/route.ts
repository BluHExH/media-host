import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema, checkRateLimit, getClientIp } from "@/lib/db";
import { sanitizeAlbum } from "@/lib/media-mime";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`move:${parsed.userId}:${ip}`, 60, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit" }, { status: 429 });
    }

    await ensureSchema();
    const body = await request.json();
    const urls: string[] = Array.isArray(body.urls) ? body.urls.map(String) : [];
    const album = sanitizeAlbum(body.album);

    if (!urls.length) {
      return NextResponse.json({ error: "No files selected" }, { status: 400 });
    }

    const sql = getSql();
    let moved = 0;
    for (const url of urls.slice(0, 100)) {
      const r = await sql`
        UPDATE media_meta
        SET album = ${album}
        WHERE user_id = ${parsed.userId} AND url = ${url}
        RETURNING id
      `;
      if ((r as any[]).length) moved++;
    }

    return NextResponse.json({ ok: true, moved, album });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Move failed" },
      { status: 500 }
    );
  }
}
