import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema, purgeExpired } from "@/lib/db";
export const runtime = "edge";
function guessType(pathname: string): string {
  const ext = pathname.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", html: "text/html", htm: "text/html" };
  return map[ext] || "application/octet-stream";
}
function albumOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[0] : "general";
}
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const password = request.headers.get("x-password");
    const expected = process.env.MEDIA_PASSWORD;
    const parsed = token ? parseToken(token) : null;
    const isAdmin = !!(expected && password === expected);
    const scope = request.nextUrl.searchParams.get("scope");
    if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
      try {
        await ensureSchema();
        await purgeExpired();
        const sql = getSql();
        if (scope === "public") {
          const rows = await sql`SELECT url, pathname, content_type, size, album, expires_at, created_at FROM media_meta WHERE is_public = true AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 200`;
          const files = rows.map((r: any) => ({ url: r.url, pathname: r.pathname || "", size: Number(r.size) || 0, uploadedAt: r.created_at, contentType: r.content_type || guessType(r.pathname || ""), album: r.album || "general", expiresAt: r.expires_at }));
          return NextResponse.json({ files, albums: Array.from(new Set(files.map((f: any) => f.album))).sort() });
        }
        if (parsed) {
          const rows = await sql`SELECT url, pathname, content_type, size, album, expires_at, created_at, is_public FROM media_meta WHERE user_id = ${parsed.userId} AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 300`;
          const files = rows.map((r: any) => ({ url: r.url, pathname: r.pathname || "", size: Number(r.size) || 0, uploadedAt: r.created_at, contentType: r.content_type || guessType(r.pathname || ""), album: r.album || "general", expiresAt: r.expires_at, isPublic: !!r.is_public }));
          return NextResponse.json({ files, albums: Array.from(new Set(files.map((f: any) => f.album))).sort() });
        }
        if (isAdmin) {
          const rows = await sql`SELECT url, pathname, content_type, size, album, expires_at, created_at FROM media_meta WHERE (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 500`;
          const files = rows.map((r: any) => ({ url: r.url, pathname: r.pathname || "", size: Number(r.size) || 0, uploadedAt: r.created_at, contentType: r.content_type || guessType(r.pathname || ""), album: r.album || "general", expiresAt: r.expires_at }));
          return NextResponse.json({ files, albums: Array.from(new Set(files.map((f: any) => f.album))).sort() });
        }
      } catch (e) { console.error(e); }
    }
    const { blobs } = await list({ limit: 100 });
    const files = blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()).slice(0, 100).map(b => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt, contentType: guessType(b.pathname), album: albumOf(b.pathname), expiresAt: null }));
    return NextResponse.json({ files, albums: Array.from(new Set(files.map(f => f.album))).sort() });
  } catch { return NextResponse.json({ error: "Failed", files: [] }, { status: 500 }); }
}
