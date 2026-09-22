import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { parseToken, checkRateLimit, getClientIp } from "@/lib/db";
import { MAX_UPLOAD_BYTES, sanitizeAlbum } from "@/lib/media-mime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`upload-token:${ip}`, 60, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit. Slow down." }, { status: 429 });
    }

    const auth = request.headers.get("x-auth-token") || "";
    const parsed = auth ? await parseToken(auth) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const rw = process.env.BLOB_READ_WRITE_TOKEN;
    if (!rw) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN is not set in Vercel env" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const album = sanitizeAlbum(body.album);
    const rawName = String(body.filename || "file")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 120) || "file";
    const pathname = `${album}/${rawName}`;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: rw,
      pathname,
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      addRandomSuffix: true,
      allowOverwrite: false,
    });

    return NextResponse.json({
      clientToken,
      pathname,
      maxBytes: MAX_UPLOAD_BYTES,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token failed";
    console.error("upload token error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
