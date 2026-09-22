import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  ensureSchema,
  checkRateLimit,
  getClientIp,
  parseResetToken,
  hashPassword,
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
    const resetToken = String(body.resetToken || "");
    const password = String(body.password || "");

    if (!resetToken) {
      return NextResponse.json({ error: "Reset token required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const parsed = await parseResetToken(resetToken);
    if (!parsed) {
      return NextResponse.json(
        { error: "Reset link expired or invalid. Request a new one." },
        { status: 400 }
      );
    }

    const password_hash = await hashPassword(password);
    const sql = getSql();
    await sql`UPDATE users SET password_hash = ${password_hash} WHERE id = ${parsed.userId}`;

    // Invalidate all refresh sessions for security
    try {
      await sql`DELETE FROM refresh_tokens WHERE user_id = ${parsed.userId}`;
    } catch {
      /* ignore */
    }

    await logAuthEvent({
      userId: parsed.userId,
      username: parsed.username,
      ip,
      userAgent: getUserAgent(request),
      action: "login",
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
