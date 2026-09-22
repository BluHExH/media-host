import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { parseToken, checkRateLimit, getClientIp } from "@/lib/db";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  sanitizeAlbum,
} from "@/lib/media-mime";

export const runtime = "edge";

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

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let album = "general";
        try {
          if (clientPayload) {
            const p = JSON.parse(clientPayload);
            album = sanitizeAlbum(p.album);
          }
        } catch {
          /* ignore */
        }
        // pathname already includes album/name from client
        void pathname;
        void album;
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: parsed.userId,
            username: parsed.username,
          }),
        };
      },
      // Metadata is saved client-side via /api/upload/complete (more reliable)
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload token failed" },
      { status: 400 }
    );
  }
}
