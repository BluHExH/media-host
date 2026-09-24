import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  ensureSchema,
  checkRateLimit,
  getClientIp,
} from "@/lib/db";
import { makeResetToken } from "@/lib/reset-token";

export const runtime = "edge";

async function sendResetEmail(to: string, username: string, resetUrl: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM || "Media Host <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Media Host password",
      html: `<p>Hi @${username},</p><p>Reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires soon. If you did not request it, ignore this email.</p>`,
    }),
  });
  return res.ok;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`forgot:${ip}`, 10, 300);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many attempts. Try later." }, { status: 429 });
    }

    await ensureSchema();
    const body = await request.json();
    const username = String(body.username || "").trim().toLowerCase();
    const email = String(body.email || "").trim().toLowerCase();

    if (!username || !email) {
      return NextResponse.json({ error: "Username and recovery email required" }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, username, email FROM users
      WHERE username = ${username} LIMIT 1
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
            "This account has no recovery email. Sign in if you know the password, then add email in Profile — or register a new account with email.",
        },
        { status: 400 }
      );
    }
    if (user.email.toLowerCase() !== email) {
      return NextResponse.json(
        { error: "No account found with that username and email" },
        { status: 404 }
      );
    }

    const resetToken = await makeResetToken(user.id, user.username);
    const origin = request.nextUrl.origin;
    const resetUrl = `${origin}/reset?token=${encodeURIComponent(resetToken)}`;

    const emailed = await sendResetEmail(user.email, user.username, resetUrl);

    // Always return token for in-app flow when email provider not configured;
    // when email sent, still allow same-session continue for UX.
    return NextResponse.json({
      ok: true,
      message: emailed
        ? "Check your email for a reset link. You can also continue here."
        : "Verified. Set a new password on the next screen. (Set RESEND_API_KEY on Vercel to email links.)",
      resetToken,
      username: user.username,
      emailed,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 500 }
    );
  }
}
