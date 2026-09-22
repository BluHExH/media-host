import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  ensureSchema,
  checkRateLimit,
  getClientIp,
} from "@/lib/db";
import { makeResetToken } from "@/lib/reset-token";

export const runtime = "edge";

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
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 32);
    const email = String(body.email || "")
      .trim()
      .toLowerCase()
      .slice(0, 120);

    if (!username || !email) {
      return NextResponse.json(
        { error: "Username and recovery email required" },
        { status: 400 }
      );
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, username, email FROM users WHERE username = ${username} LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json(
        { error: "No account found with that username and email" },
        { status: 404 }
      );
    }

    const user = rows[0] as { id: number; username: string; email: string | null };
    if (!user.email) {
      return NextResponse.json(
        {
          error:
            "This account has no recovery email. Register again with an email, or ask admin.",
        },
        { status: 400 }
      );
    }
    if (user.email !== email) {
      return NextResponse.json(
        { error: "No account found with that username and email" },
        { status: 404 }
      );
    }

    const resetToken = await makeResetToken(user.id, user.username);

    return NextResponse.json({
      ok: true,
      message: "Verified. Set a new password on the next screen.",
      resetToken,
      username: user.username,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 500 }
    );
  }
}
