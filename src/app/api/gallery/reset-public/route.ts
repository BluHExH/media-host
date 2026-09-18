import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema } from "@/lib/db";
import { del } from "@vercel/blob";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    let mode = "unpublish";
    try {
      const body = await request.json();
      if (body?.mode === "delete") mode = "delete";
    } catch {
      /* default */
    }

    await ensureSchema();
    const sql = getSql();

    if (mode === "delete") {
      const rows = await sql`
        SELECT url FROM media_meta
        WHERE user_id = ${parsed.userId} AND is_public = true
      `;
      const urls = rows.map((r) => String((r as { url?: string }).url || "")).filter(Boolean);
      if (urls.length) {
        await sql`
          DELETE FROM media_meta
          WHERE user_id = ${parsed.userId} AND is_public = true
        `;
        try {
          await del(urls);
        } catch {
          /* ignore */
        }
      }
      return NextResponse.json({ ok: true, mode: "delete", removed: urls.length });
    }

    const updated = await sql`
      UPDATE media_meta
      SET is_public = false
      WHERE user_id = ${parsed.userId} AND is_public = true
      RETURNING id
    `;
    return NextResponse.json({ ok: true, mode: "unpublish", count: updated.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
