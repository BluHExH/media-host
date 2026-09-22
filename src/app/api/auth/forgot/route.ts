import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  ensureSchema,
  checkRateLimit,
  getClientIp,
  logAuthEvent,
  getUserAgent,
} from "@/lib/db";

export const runtime = "edge";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`forgot:${ip}`, 8, 3600);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    await ensureSchema();
    const body = await request.json();
    const username = String(body.username || "")
      .trim()
      .toLowerCase();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    if (!username || !email) {
      return NextResponse.json(
        { error: "Username and email required" },
        { status: 400 }
      );
    }

    const sql = getSql();
    // Ensure reset columns exist
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ`;

    const rows = await sql`
      SELECT id, username, email FROM users
      WHERE username = ${username} AND email IS NOT NULL AND lower(email) = ${email}
      LIMIT 1
    `;

    // Always same shape to avoid user enumeration when possible,
    // but we need to return a token for this app (no email SMTP).
    if (!rows.length) {
      await logAuthEvent({
        username,
        ip,
        userAgent: getUserAgent(request),
        action: "forgot_fail",
        success: false,
      });
      return NextResponse.json(
        {
          error:
            "No account found with that username and email. Use the email you registered with.",
        },
        { status: 404 }
      );
    }

    const user = rows[0] as { id: number; username: string };
    const token = randomToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await sql`
      UPDATE users
      SET reset_token = ${token}, reset_expires = ${expires.toISOString()}
      WHERE id = ${user.id}
    `;

    await logAuthEvent({
      userId: user.id,
      username: user.username,
      ip,
      userAgent: getUserAgent(request),
      action: "forgot",
      success: true,
    });

    // No email service — return one-time link (username+email already verified)
    return NextResponse.json({
      ok: true,
      message: "Identity verified. Use the link below within 1 hour.",
      resetPath: `/reset-password?token=${token}`,
      expiresAt: expires.toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forgot failed" },
      { status: 500 }
    );
  }
}
