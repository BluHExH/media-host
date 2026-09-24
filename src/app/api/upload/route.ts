import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, checkRateLimit, getClientIp, ensureSchema } from "@/lib/db";
import {
  computeExpiry,
  guessMime,
  isAllowedMime,
  mediaDisabledMessage,
  sanitizeAlbum,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
} from "@/lib/media-mime";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`upload:${ip}`, 100, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Upload rate limit. Slow down and try again." }, { status: 429 });
    }

    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json(
        { error: "Login required. Please sign in or register first." },
        { status: 401 }
      );
    }

    await ensureSchema();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file selected" }, { status: 400 });

    const album = sanitizeAlbum(formData.get("album") as string);
    const expiresAt = computeExpiry(formData.get("expiry") as string | null);
    const isPublic = formData.get("public") === "1" || formData.get("public") === "true";
    const mime = guessMime(file.name, file.type);

    const disabled = mediaDisabledMessage(mime);
    if (disabled) {
      return NextResponse.json({ error: disabled }, { status: 403 });
    }
    if (!isAllowedMime(mime)) {
      return NextResponse.json(
        { error: "Unsupported type. Use image, video, audio, or HTML." },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_UPLOAD_LABEL}). Your file: ${(file.size / (1024 * 1024)).toFixed(1)} MB` },
        { status: 400 }
      );
    }

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
      `;
    } catch (dbErr) {
      console.error("media_meta insert", dbErr);
    }

    const isHtml = mime.startsWith("text/html");
    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: mime,
      size: file.size,
      album,
      previewUrl: isHtml ? `/api/render?u=${encodeURIComponent(blob.url)}` : blob.url,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
