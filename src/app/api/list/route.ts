import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema, purgeExpired } from "@/lib/db";

export const runtime = "edge";

function guessType(pathname: string): string {
  const ext = pathname.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm", html: "text/html", htm: "text/html",
  };
  return map[ext] || "application/octet-stream";
}

function mapRows(rows: any[]) {
  return rows.map((r: any) => {
    const contentType = r.content_type || guessType(r.pathname || "");
    const pathname = r.pathname || "";
    const isHtml = /html/i.test(contentType) || /\.html?$/i.test(pathname);
    return {
      url: r.url,
      pathname,
      size: Number(r.size) || 0,
      uploadedAt: r.created_at,
      contentType,
      album: r.album || "general",
      expiresAt: r.expires_at,
      previewUrl: isHtml ? `/api/render?u=${encodeURIComponent(r.url)}` : r.url,
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    const scope = request.nextUrl.searchParams.get("scope");

    await ensureSchema();
    await purgeExpired();
    const sql = getSql();

    if (scope === "public") {
      const rows = await sql`
        SELECT url, pathname, content_type, size, album, expires_at, created_at
        FROM media_meta
        WHERE is_public = true AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC LIMIT 200
      `;
      const files = mapRows(rows);
      return NextResponse.json({ files, albums: [] });
    }

    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const rows = await sql`
      SELECT url, pathname, content_type, size, album, expires_at, created_at
      FROM media_meta
      WHERE user_id = ${parsed.userId} AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC LIMIT 500
    `;
    const files = mapRows(rows);
    const albums = Array.from(new Set(files.map((f: any) => f.album || "general"))).sort();
    return NextResponse.json({ files, albums });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "List failed" },
      { status: 500 }
    );
  }
}
