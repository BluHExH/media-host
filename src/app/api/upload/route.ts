import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema, checkRateLimit, getClientIp } from "@/lib/db";

export const runtime = "edge";

function guessMime(name: string, type: string): string {
  if (type && type.startsWith("image/")) return type;
  if (type && type.startsWith("audio/")) return type;
  if (type && type.startsWith("video/")) return type;
  if (type && (type === "text/html" || type.startsWith("text/html"))) return "text/html; charset=utf-8";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  };
  return map[ext] || type || "application/octet-stream";
}

function computeExpiry(daysRaw: string | null): Date | null {
  if (!daysRaw || daysRaw === "never" || daysRaw === "0") return null;
  const days = parseInt(daysRaw, 10);
  if (!days || days < 1) return null;
  const d = new Date();
  d.setDate(d.getDate() + Math.min(days, 3650));
  return d;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`upload:${ip}`, 40, 60);
    if (!rl.ok) return NextResponse.json({ error: "Upload rate limit. Slow down." }, { status: 429 });
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json(
        { error: "Login required. Please sign in or register first." },
        { status: 401 }
      );
    }

    try {
      await ensureSchema();
      const sql = getSql();
      const users = await sql`SELECT id FROM users WHERE id = ${parsed.userId} LIMIT 1`;
      if (!users.length) {
        return NextResponse.json({ error: "Account not found. Please register again." }, { status: 401 });
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Database error" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const album = String(formData.get("album") || "general")
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .slice(0, 40) || "general";
    const expiresAt = computeExpiry(formData.get("expiry") as string | null);
    const isPublic = formData.get("public") === "1" || formData.get("public") === "true";
    const mime = guessMime(file.name, file.type);

    if (
      !(
        mime.startsWith("image/") ||
        mime.startsWith("audio/") ||
        mime.startsWith("video/") ||
        mime.startsWith("text/html")
      )
    ) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "Max 100 MB" }, { status: 400 });
    }

    const blob = await put(`${album}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: mime.startsWith("text/html") ? "text/html; charset=utf-8" : mime,
    });

    const sql = getSql();
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
