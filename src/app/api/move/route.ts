import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken } from "@/lib/db";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const body = await request.json();
    const urls: string[] = Array.isArray(body.urls) ? body.urls.slice(0, 500) : [];
    let album = String(body.album || "general")
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40);
    if (!album) album = "general";
    if (!urls.length) {
      return NextResponse.json({ error: "No files selected" }, { status: 400 });
    }

    const sql = getSql();
    const results = await Promise.all(
      urls.map((url) =>
        sql`
          UPDATE media_meta
          SET album = ${album}
          WHERE user_id = ${parsed.userId} AND url = ${url}
          RETURNING url
        `
      )
    );
    const moved = results.reduce((n, rows) => n + (rows?.length || 0), 0);

    return NextResponse.json({ success: true, moved, album });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Move failed" },
      { status: 500 }
    );
  }
}
