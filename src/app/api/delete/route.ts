import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function DELETE(request: NextRequest) {
  try {
    const password = request.headers.get("x-password");
    const expected = process.env.MEDIA_PASSWORD;
    if (expected && password !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const urls: string[] = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];
    if (!urls.length) return NextResponse.json({ error: "URL required" }, { status: 400 });
    await del(urls);
    return NextResponse.json({ success: true, deleted: urls.length });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
