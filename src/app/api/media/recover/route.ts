import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  parseToken,
  ensureSchema,
  checkRateLimit,
  getClientIp,
} from "@/lib/db";

export const runtime = "edge";

function guessType(pathname: string): string {
  const ext = (pathname.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
  };
  return map[ext] || "application/octet-stream";
}

function albumFromPathname(pathname: string): string {
  const parts = pathname.replace(/^\/+/, "").split("/");
  if (parts.length >= 2 && parts[0]) {
    return parts[0].toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 40) || "general";
  }
  return "general";
}

/**
 * Re-link orphaned Vercel Blob objects into the logged-in user's media_meta.
 * Does NOT delete anything. Does NOT steal files already owned by another user.
 *
 * Query: ?prefix=shahana  (optional; defaults to scanning common prefixes)
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`recover:${parsed.userId}:${ip}`, 5, 300);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many recover attempts. Wait a few minutes." }, { status: 429 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 500 });
    }

    await ensureSchema();
    const sql = getSql();

    const body = await request.json().catch(() => ({}));
    const qPrefix = request.nextUrl.searchParams.get("prefix");
    const prefixRaw = String(body.prefix || qPrefix || "shahana").trim().toLowerCase();
    const prefix = prefixRaw.replace(/[^a-z0-9-_\/]/g, "").replace(/\/+$/, "");
    const listPrefix = prefix ? `${prefix}/` : "";

    const found: { url: string; pathname: string; size: number; uploadedAt?: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix: listPrefix || undefined,
        limit: 1000,
        cursor,
      });
      for (const b of page.blobs) {
        found.push({
          url: b.url,
          pathname: b.pathname,
          size: b.size,
          uploadedAt: b.uploadedAt?.toISOString?.() || String(b.uploadedAt || ""),
        });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    let restored = 0;
    let skippedOwned = 0;
    let alreadyYours = 0;
    const restoredUrls: string[] = [];

    for (const b of found) {
      const rows = await sql`SELECT user_id FROM media_meta WHERE url = ${b.url} LIMIT 1`;
      if (rows.length) {
        const uid = Number((rows[0] as { user_id: number }).user_id);
        if (uid === parsed.userId) alreadyYours++;
        else skippedOwned++;
        continue;
      }

      const album = albumFromPathname(b.pathname) || prefix || "general";
      const contentType = guessType(b.pathname);

      try {
        await sql`
          INSERT INTO media_meta (user_id, url, pathname, content_type, size, album, expires_at, is_public)
          VALUES (
            ${parsed.userId},
            ${b.url},
            ${b.pathname},
            ${contentType},
            ${b.size || 0},
            ${album},
            ${null},
            ${false}
          )
        `;
        restored++;
        restoredUrls.push(b.url);
      } catch {
        // unique race — ignore
      }
    }

    return NextResponse.json({
      ok: true,
      prefix: listPrefix || "(all)",
      blobCount: found.length,
      restored,
      alreadyYours,
      skippedOwned,
      message:
        restored > 0
          ? `Recovered ${restored} file(s) into your library (folder from path, e.g. shahana).`
          : found.length === 0
            ? `No blobs found under prefix "${listPrefix || "*"}". They may have been deleted from Blob storage.`
            : `Nothing new to restore (${alreadyYours} already yours, ${skippedOwned} owned by others).`,
      sample: restoredUrls.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Recover failed" },
      { status: 500 }
    );
  }
}
