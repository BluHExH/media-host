import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  rotateRefreshToken,
  getClientIp,
  getUserAgent,
  logAuthEvent,
  checkRateLimit,
} from "@/lib/db";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`refresh:${ip}`, 30, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const refreshToken = String(body.refreshToken || request.headers.get("x-refresh-token") || "");
    if (!refreshToken) {
      return NextResponse.json({ error: "refreshToken required" }, { status: 400 });
    }
    const rotated = await rotateRefreshToken(refreshToken);
    if (!rotated) {
      await logAuthEvent({
        ip,
        userAgent: getUserAgent(request),
        action: "login_fail",
        success: false,
      });
      return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }
    await logAuthEvent({
      userId: rotated.userId,
      ip,
      userAgent: getUserAgent(request),
      action: "refresh",
      success: true,
    });
    return NextResponse.json({
      token: rotated.accessToken,
      refreshToken: rotated.refreshToken,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
