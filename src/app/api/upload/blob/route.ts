import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { parseToken, checkRateLimit, getClientIp } from "@/lib/db";
import { MAX_UPLOAD_BYTES } from "@/lib/media-mime";

// handleUpload needs Node (not edge) for reliable token generation
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`upload:${ip}`, 80, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Upload rate limit. Slow down." }, { status: 429 });
    }

    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN missing on server" },
        { status: 500 }
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (_pathname, _clientPayload) => {
        return {
          // Do not tightly restrict MIME — browsers often send empty/octet-stream
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({
            userId: parsed.userId,
            username: parsed.username,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Metadata saved via /api/upload/complete from client
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload token failed";
    console.error("blob handleUpload error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
