import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, checkRateLimit, getClientIp } from "@/lib/db";
import {
  computeExpiry,
  guessMime,
  isAllowedMime,
  sanitizeAlbum,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
} from "@/lib/media-mime";

export const runtime = "edge";

/** Legacy server upload — still works for smaller files / tools (nobg, upscale). Prefer client upload for video. */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`upload:${ip}`, 100, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Upload rate limit. Slow down." }, { status: 429 });
    }

    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json(
        { error: "Login required. Please sign in or register first." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const album = sanitizeAlbum(formData.get("album") as string);
    const expiresAt = computeExpiry(formData.get("expiry") as string | null);
    const isPublic = formData.get("public") === "1" || formData.get("public") === "true";
    const mime = guessMime(file.name, file.type);

    if (!isAllowedMime(mime)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Max ${MAX_UPLOAD_LABEL}. Use the library uploader for large video.` },
        { status: 400 }
      );
    }

    // Server path still limited by platform body size — OK for images/tools
    const blob = await put(`${album}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: mime.startsWith("text/html") ? "text/html; charset=utf-8" : mime,
    });

    const sql = getSql();
    try {
      await sql`
        INSERT INTO media_meta (user_id, url, pathname, content_type, size, album, expires_at, is_public)
        VALUES (
          ${parsed.userId},
          ${blob.url},
          ${blob.pathname},
          ${mime.startsWith("text/html") ? "text/html; charset=utf-8" : mime},
          ${file.size},
          ${album},
          ${expiresAt ? expiresAt.toISOString() : null},
          ${isPublic}
        )
        ON CONFLICT (url) DO NOTHING
      `;
    } catch (dbErr) {
      console.error("media_meta insert failed", dbErr);
    }

    const previewUrl = mime.startsWith("text/html")
      ? `/api/render?u=${encodeURIComponent(blob.url)}`
      : blob.url;

    return NextResponse.json({
      url: blob.url,
      previewUrl,
      pathname: blob.pathname,
      contentType: mime.startsWith("text/html") ? "text/html; charset=utf-8" : mime,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      album,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      isPublic,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fail" },
      { status: 500 }
    );
  }
}
