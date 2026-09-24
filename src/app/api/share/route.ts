import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  parseToken,
  ensureSchema,
  hashPassword,
  verifyPassword,
  checkRateLimit,
  getClientIp,
} from "@/lib/db";

export const runtime = "edge";

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-auth-token") || "";
    const parsed = token ? await parseToken(token) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`share:${parsed.userId}:${ip}`, 30, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many share requests" }, { status: 429 });
    }

    await ensureSchema();
    const body = await request.json();
    const mediaUrl = String(body.url || "").trim();
    const password = body.password != null ? String(body.password) : "";
    const days = body.days != null ? parseInt(String(body.days), 10) : 0;

    if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
      return NextResponse.json({ error: "Valid media URL required" }, { status: 400 });
    }

    const sql = getSql();
    const own = await sql`
      SELECT id FROM media_meta
      WHERE user_id = ${parsed.userId} AND url = ${mediaUrl}
      LIMIT 1
    `;
    if (!own.length) {
      return NextResponse.json({ error: "File not found in your library" }, { status: 404 });
    }

    let expiresAt: string | null = null;
    if (Number.isFinite(days) && days > 0) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + days);
      expiresAt = d.toISOString();
    }

    const shareToken = randomToken();
    const passwordHash = password ? await hashPassword(password) : null;

    await sql`
      INSERT INTO share_links (user_id, token, media_url, password_hash, expires_at)
      VALUES (${parsed.userId}, ${shareToken}, ${mediaUrl}, ${passwordHash}, ${expiresAt})
    `;

    const origin = request.nextUrl.origin;
    return NextResponse.json({
      ok: true,
      token: shareToken,
      shareUrl: `${origin}/s/${shareToken}`,
      hasPassword: !!passwordHash,
      expiresAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Share failed" },
      { status: 500 }
    );
  }
}

/** Unlock a shared link (password optional). */
export async function PUT(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json();
    const shareToken = String(body.token || "").trim();
    const password = String(body.password || "");

    if (!shareToken) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`share-open:${ip}`, 40, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT media_url, password_hash, expires_at
      FROM share_links WHERE token = ${shareToken} LIMIT 1
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    const row = rows[0] as {
      media_url: string;
      password_hash: string | null;
      expires_at: string | null;
    };

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This share link has expired" }, { status: 410 });
    }

    if (row.password_hash) {
      const ok = await verifyPassword(password, row.password_hash);
      if (!ok) {
        return NextResponse.json({ error: "Wrong password" }, { status: 401 });
      }
    }

    return NextResponse.json({ ok: true, url: row.media_url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
