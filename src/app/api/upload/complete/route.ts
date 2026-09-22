import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, checkRateLimit, getClientIp } from "@/lib/db";
import {
  computeExpiry,
  guessMime,
  isAllowedMime,
  sanitizeAlbum,
  MAX_UPLOAD_BYTES,
} from "@/lib/media-mime";

export const runtime = "edge";

function isOurBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname.endsWith(".public.blob.vercel-storage.com") ||
        u.hostname.endsWith(".blob.vercel-storage.com"))
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`upload-complete:${ip}`, 100, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit" }, { status: 429 });
    }

    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const body = await request.json();
    const url = String(body.url || "");
    const pathname = String(body.pathname || "");
    if (!url || !isOurBlobUrl(url)) {
      return NextResponse.json({ error: "Invalid blob URL" }, { status: 400 });
    }

    const size = Number(body.size) || 0;
    if (size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }

    const album = sanitizeAlbum(body.album);
    const mime = guessMime(pathname || url, String(body.contentType || ""));
    if (!isAllowedMime(mime)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const expiresAt = computeExpiry(body.expiry);
    const isPublic = body.isPublic === true || body.isPublic === "1";

    const sql = getSql();
    try {
      await sql`
        INSERT INTO media_meta (user_id, url, pathname, content_type, size, album, expires_at, is_public)
        VALUES (
          ${parsed.userId},
          ${url},
          ${pathname || url},
          ${mime},
          ${size},
          ${album},
          ${expiresAt ? expiresAt.toISOString() : null},
          ${isPublic}
        )
        ON CONFLICT (url) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          pathname = EXCLUDED.pathname,
          content_type = EXCLUDED.content_type,
          size = EXCLUDED.size,
          album = EXCLUDED.album,
          expires_at = EXCLUDED.expires_at,
          is_public = EXCLUDED.is_public
      `;
    } catch (dbErr) {
      console.error("media_meta insert failed", dbErr);
      return NextResponse.json({ error: "Database save failed" }, { status: 500 });
    }

    const previewUrl = mime.startsWith("text/html")
      ? `/api/render?u=${encodeURIComponent(url)}`
      : url;

    return NextResponse.json({
      url,
      previewUrl,
      pathname: pathname || url,
      contentType: mime,
      size,
      album,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      isPublic,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Complete failed" },
      { status: 500 }
    );
  }
}
