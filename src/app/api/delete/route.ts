import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema } from "@/lib/db";
export const runtime = "edge";
export async function DELETE(request: NextRequest) {
  try {
    const password = request.headers.get("x-password");
    const expected = process.env.MEDIA_PASSWORD;
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? parseToken(token) : null;
    const isAdmin = !!(expected && password === expected);
    if (!isAdmin && !parsed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const urls: string[] = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];
    if (!urls.length) return NextResponse.json({ error: "URL required" }, { status: 400 });
    if (parsed && !isAdmin && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) {
      try {
        await ensureSchema();
        const sql = getSql();
        for (const url of urls) {
          const rows = await sql`SELECT id FROM media_meta WHERE url = ${url} AND user_id = ${parsed.userId} LIMIT 1`;
          if (!rows.length) return NextResponse.json({ error: "Not your file" }, { status: 403 });
        }
        for (const url of urls) await sql`DELETE FROM media_meta WHERE url = ${url} AND user_id = ${parsed.userId}`;
      } catch {}
    } else if (isAdmin && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) {
      try {
        await ensureSchema();
        const sql = getSql();
        for (const url of urls) await sql`DELETE FROM media_meta WHERE url = ${url}`;
      } catch {}
    }
    await del(urls);
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Delete failed" }, { status: 500 }); }
}
