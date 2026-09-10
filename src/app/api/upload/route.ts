import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

function guessMime(name: string, type: string): string {
  if (type && (type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/"))) {
    return type;
  }
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
    aac: "audio/aac", flac: "audio/flac", opus: "audio/opus",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    avi: "video/x-msvideo", mkv: "video/x-matroska", m4v: "video/mp4",
  };
  return map[ext] || type || "application/octet-stream";
}

export async function POST(request: NextRequest) {
  try {
    const password = request.headers.get("x-password");
    const expected = process.env.MEDIA_PASSWORD;
    if (expected && password !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    const mime = guessMime(file.name, file.type);
    const allowed = mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/");
    if (!allowed) {
      return NextResponse.json({ error: "Only image, audio and video files are allowed" }, { status: 400 });
    }
    const maxSize = mime.startsWith("image/") ? 50 * 1024 * 1024 : 100 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: `File too large (max ${mime.startsWith("image/") ? "50" : "100"}MB)` }, { status: 400 });
    }
    const blob = await put(file.name, file, { access: "public", addRandomSuffix: true, contentType: mime });
    return NextResponse.json({
      url: blob.url, pathname: blob.pathname, contentType: mime,
      size: file.size, uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
}
