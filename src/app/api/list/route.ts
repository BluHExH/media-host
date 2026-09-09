import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const password = request.headers.get("x-password");
    const expected = process.env.MEDIA_PASSWORD;

    if (expected && password !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { blobs } = await list({
      limit: 200,
    });

    const sorted = blobs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    return NextResponse.json({
      files: sorted.map((b) => ({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
        contentType: (b as any).contentType || guessType(b.pathname),
      })),
    });
  } catch (error) {
    console.error("List error:", error);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

function guessType(pathname: string): string {
  const ext = pathname.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext))
    return "image/" + (ext === "jpg" ? "jpeg" : ext);
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext))
    return "audio/" + ext;
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video/" + ext;
  return "application/octet-stream";
}
