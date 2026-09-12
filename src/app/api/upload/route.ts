import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema } from "@/lib/db";
export const runtime = "edge";
function guessMime(name: string, type: string): string {
  if (type && (type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/") || type === "text/html")) return type;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4", html: "text/html", htm: "text/html" };
  return map[ext] || type || "application/octet-stream";
}
function safeAlbum(raw: string | null): string {
  if (!raw) return "general";
  return raw.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 40) || "general";
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
    const password = request.headers.get("x-password");
    const expected = process.env.MEDIA_PASSWORD;
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? parseToken(token) : null;
    if (expected && password !== expected && !parsed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    const album = safeAlbum(formData.get("album") as string | null);
    const expiresAt = computeExpiry(formData.get("expiry") as string | null);
    const isPublic = formData.get("public") === "1" || formData.get("public") === "true";
    const mime = guessMime(file.name, file.type);
    if (!(mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/") || mime === "text/html")) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    if (file.size > 100 * 1024 * 1024) return NextResponse.json({ error: "Max 100 MB" }, { status: 400 });
    const blob = await put(`${album}/${file.name}`, file, { access: "public", addRandomSuffix: true, contentType: mime });
    if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
      try {
        await ensureSchema();
        const sql = getSql();
        await sql`INSERT INTO media_meta (user_id, url, pathname, content_type, size, album, expires_at, is_public) VALUES (${parsed?.userId ?? null}, ${blob.url}, ${blob.pathname}, ${mime}, ${file.size}, ${album}, ${expiresAt ? expiresAt.toISOString() : null}, ${isPublic}) ON CONFLICT (url) DO NOTHING`;
      } catch {}
    }
    return NextResponse.json({ url: blob.url, pathname: blob.pathname, contentType: mime, size: file.size, uploadedAt: new Date().toISOString(), album, expiresAt: expiresAt ? expiresAt.toISOString() : null, isPublic, previewUrl: blob.url });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "fail" }, { status: 500 }); }
}
