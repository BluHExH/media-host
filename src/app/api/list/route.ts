import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "edge";

function guessType(pathname: string): string {
  const ext = pathname.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska", m4v: "video/mp4",
    html: "text/html", htm: "text/html",
  };
  return map[ext] || "application/octet-stream";
}

function albumOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[0] : "general";
}

export async function GET() {
  try {
    const { blobs } = await list({ limit: 500 });
    const sorted = blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    const files = sorted.map((b) => ({
      url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt,
      contentType: guessType(b.pathname), album: albumOf(b.pathname),
    }));
    const albums = Array.from(new Set(files.map((f) => f.album))).sort();
    return NextResponse.json({ files, albums });
  } catch (error) {
    console.error("List error:", error);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}
