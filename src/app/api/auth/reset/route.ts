import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  ensureSchema,
  hashPassword,
  checkRateLimit,
  getClientIp,
  logAuthEvent,
  getUserAgent,
} from "@/lib/db";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`reset:${ip}`, 10, 3600);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    await ensureSchema();
    const body = await request.json();
    const token = String(body.token || "").trim();
    const password = String(body.password || "");

    if (!token || token.length < 20) {
      return NextResponse.json({ error: "Invalid or missing token" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const sql = getSql();
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ`;

    const rows = await sql`
      SELECT id, username, reset_expires FROM users
      WHERE reset_token = ${token}
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const user = rows[0] as {
      id: number;
      username: string;
      reset_expires: string | null;
    };

    if (!user.reset_expires || new Date(user.reset_expires).getTime() < Date.now()) {
      await sql`UPDATE users SET reset_token = NULL, reset_expires = NULL WHERE id = ${user.id}`;
      return NextResponse.json(
        { error: "Reset link expired. Request a new one." },
        { status: 400 }
      );
    }

    const password_hash = await hashPassword(password);
    await sql`
      UPDATE users
      SET password_hash = ${password_hash},
          reset_token = NULL,
          reset_expires = NULL
      WHERE id = ${user.id}
    `;

    // Revoke refresh tokens for safety
    try {
      await sql`UPDATE refresh_tokens SET revoked = true WHERE user_id = ${user.id}`;
    } catch {
      /* table may differ */
    }

    await logAuthEvent({
      userId: user.id,
      username: user.username,
      ip,
      userAgent: getUserAgent(request),
      action: "password_reset",
      success: true,
    });

    return NextResponse.json({
      ok: true,
      message: "Password updated. You can sign in now.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Reset failed" },
      { status: 500 }
    );
  }
}
