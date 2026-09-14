import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSql, parseToken, ensureSchema } from "@/lib/db";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) return NextResponse.json({ error: "Login required" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Image only" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Max 5 MB" }, { status: 400 });
    }

    const blob = await put(`avatars/${parsed.userId}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });

    await ensureSchema();
    const sql = getSql();
    await sql`UPDATE users SET avatar_url = ${blob.url} WHERE id = ${parsed.userId}`;

    return NextResponse.json({ avatarUrl: blob.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
}
