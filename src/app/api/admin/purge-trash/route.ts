import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "edge";

/** Permanently delete all files in trash album across all users. */
export async function POST(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT url FROM media_meta WHERE album = 'trash'`;
    const urls = (rows as any[]).map((r) => r.url).filter(Boolean);

    await sql`DELETE FROM media_meta WHERE album = 'trash'`;

    if (urls.length) {
      try {
        const { del } = await import("@vercel/blob");
        // batch in chunks of 100
        for (let i = 0; i < urls.length; i += 100) {
          await del(urls.slice(i, i + 100));
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, purged: urls.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
