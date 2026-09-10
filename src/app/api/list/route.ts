import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

function guessType(pathname: string): string {
  const ext = pathname.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
    aac: "audio/aac", flac: "audio/flac", opus: "audio/opus",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    avi: "video/x-msvideo", mkv: "video/x-matroska", m4v: "video/mp4",
  };
  return map[ext] || "application/octet-stream";
}

export async function GET(request: NextRequest) {
  try {
    const password = request.headers.get("x-password");
    const expected = process.env.MEDIA_PASSWORD;
    if (expected && password !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { blobs } = await list({ limit: 500 });
    const sorted = blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return NextResponse.json({
      files: sorted.map((b) => ({
        url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt,
        contentType: guessType(b.pathname),
      })),
    });
  } catch (error) {
    console.error("List error:", error);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}
