import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken } from "@/lib/db";

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

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const body = await request.json();
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
    const checks = await Promise.all(
      urls.map((url) =>
        sql`SELECT url FROM media_meta WHERE url = ${url} AND user_id = ${parsed.userId} LIMIT 1`
      )
    );
    if (checks.some((rows) => !rows.length)) {
      return NextResponse.json({ error: "Not your file" }, { status: 403 });
    }

    await Promise.all(
      urls.map((url) =>
        sql`DELETE FROM media_meta WHERE url = ${url} AND user_id = ${parsed.userId}`
      )
    );

    try {
      await del(urls);
    } catch {
      /* blob already gone */
    }
    return NextResponse.json({ success: true, deleted: urls.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
