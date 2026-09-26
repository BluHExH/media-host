import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema } from "@/lib/db";

export const runtime = "edge";

function isAllowedBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return (
      u.hostname.endsWith(".public.blob.vercel-storage.com") ||
      u.hostname.endsWith(".blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

/**
 * Soft delete by default → album = "trash" (file stays in Blob + DB).
 * permanent: true → remove DB row + Blob object.
 * Soft-deleting something already in trash also permanent-deletes it.
 */
export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    await ensureSchema();
    const body = await request.json();
    const permanentFlag = body.permanent === true || body.permanent === "1";
    const raw: string[] = Array.isArray(body.urls)
      ? body.urls.slice(0, 200)
      : body.url
        ? [body.url]
        : [];
    const urls = raw.filter((u) => typeof u === "string" && isAllowedBlobUrl(u));
    if (!urls.length) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    const sql = getSql();
    const owned: { url: string; album: string }[] = [];
    for (const url of urls) {
      const rows = await sql`
        SELECT url, album FROM media_meta
        WHERE url = ${url} AND user_id = ${parsed.userId}
        LIMIT 1
      `;
      if (!rows.length) {
        return NextResponse.json({ error: "Not your file" }, { status: 403 });
      }
      const row = rows[0] as { url: string; album: string | null };
      owned.push({ url: row.url, album: (row.album || "general").toLowerCase() });
    }

    const toTrash: string[] = [];
    const toPurge: string[] = [];

    for (const f of owned) {
      if (permanentFlag || f.album === "trash") {
        toPurge.push(f.url);
      } else {
        toTrash.push(f.url);
      }
    }

    let moved = 0;
    let deleted = 0;

    for (const url of toTrash) {
      await sql`
        UPDATE media_meta
        SET album = 'trash'
        WHERE url = ${url} AND user_id = ${parsed.userId}
      `;
      moved++;
    }

    if (toPurge.length) {
      for (const url of toPurge) {
        await sql`DELETE FROM media_meta WHERE url = ${url} AND user_id = ${parsed.userId}`;
      }
      try {
        await del(toPurge);
      } catch {
        /* blob already gone */
      }
      deleted = toPurge.length;
    }

    return NextResponse.json({
      success: true,
      movedToTrash: moved,
      permanentlyDeleted: deleted,
      message:
        deleted && !moved
          ? `Permanently deleted ${deleted} file(s)`
          : moved && !deleted
            ? `Moved ${moved} file(s) to trash`
            : `Moved ${moved} to trash, permanently deleted ${deleted}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
