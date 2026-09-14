import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  hashPassword,
  makeToken,
  ensureSchema,
  getClientIp,
  getUserAgent,
  logAuthEvent,
} from "@/lib/db";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json();
    const username = String(body.username || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 32);
    const password = String(body.password || "");
    const displayName = String(body.displayName || username).trim().slice(0, 64) || username;
    const email = body.email ? String(body.email).trim().toLowerCase().slice(0, 120) : null;
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    if (username.length < 3) {
      return NextResponse.json({ error: "Username min 3 characters" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password min 6 characters" }, { status: 400 });
    }

    const sql = getSql();
    const existing = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`;
    if (existing.length) {
      return NextResponse.json({ error: "Username taken" }, { status: 409 });
    }

    const password_hash = await hashPassword(password);

    const rows = await sql`
      INSERT INTO users (username, email, password_hash, display_name, register_ip, last_ip, last_login_at)
      VALUES (${username}, ${email}, ${password_hash}, ${displayName}, ${ip}, ${ip}, NOW())
      RETURNING id, username, display_name, email, created_at, register_ip
    `;

    const user = rows[0] as {
      id: number;
      username: string;
      display_name: string;
      email: string | null;
      created_at: string;
      register_ip: string;
    };

    await logAuthEvent({
      userId: user.id,
      username: user.username,
      ip,
      userAgent: ua,
      action: "register",
      success: true,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        createdAt: user.created_at,
      },
      token: await makeToken(user.id, user.username),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Register failed" },
      { status: 500 }
    );
  }
}
