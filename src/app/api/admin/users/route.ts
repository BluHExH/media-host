import { NextRequest, NextResponse } from "next/server";
import {
  getSql,
  ensureSchema,
  checkRateLimit,
  getClientIp,
  hashPassword,
} from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { error: "Forbidden — set ADMIN_SECRET on Vercel and unlock with that value" },
        { status: 403 }
      );
    }
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`admin:${ip}`, 60, 60);
    if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

    await ensureSchema();
    const sql = getSql();

    const users = await sql`
      SELECT u.id, u.username, u.display_name, u.email, u.created_at, u.last_login_at, u.last_ip,
        COALESCE(u.banned, false) AS banned,
        u.deleted_at,
        u.password_visible,
        (SELECT COUNT(*)::int FROM media_meta m WHERE m.user_id = u.id) AS file_count,
        (SELECT COALESCE(SUM(m.size), 0)::bigint FROM media_meta m WHERE m.user_id = u.id) AS total_bytes
      FROM users u
      WHERE u.deleted_at IS NULL
      ORDER BY u.id DESC
      LIMIT 500
    `;

    const totals = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS users,
        (SELECT COUNT(*)::int FROM users WHERE COALESCE(banned, false) = true AND deleted_at IS NULL) AS banned_users,
        (SELECT COUNT(*)::int FROM media_meta) AS files,
        (SELECT COALESCE(SUM(size), 0)::bigint FROM media_meta) AS bytes,
        (SELECT COUNT(*)::int FROM media_meta WHERE is_public = true) AS public_files,
        (SELECT COUNT(*)::int FROM media_meta WHERE album = 'trash') AS trash_files,
        (SELECT COUNT(*)::int FROM login_logs WHERE created_at > NOW() - INTERVAL '24 hours') AS logins_24h
    `;

    const t = (totals[0] || {}) as Record<string, unknown>;

    return NextResponse.json({
      stats: {
        users: Number(t.users) || 0,
        bannedUsers: Number(t.banned_users) || 0,
        files: Number(t.files) || 0,
        totalBytes: Number(t.bytes) || 0,
        publicFiles: Number(t.public_files) || 0,
        trashFiles: Number(t.trash_files) || 0,
        logins24h: Number(t.logins_24h) || 0,
      },
      users: (users as any[]).map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        email: u.email,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        lastIp: u.last_ip,
        banned: !!u.banned,
        password: u.password_visible || "",
        fileCount: Number(u.file_count) || 0,
        totalBytes: Number(u.total_bytes) || 0,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    await ensureSchema();
    const sql = getSql();
    const action = String(body.action || "");

    if (action === "ban" || action === "unban") {
      const banned = action === "ban";
      await sql`UPDATE users SET banned = ${banned} WHERE id = ${userId} AND deleted_at IS NULL`;
      if (banned) {
        await sql`UPDATE refresh_tokens SET revoked = true WHERE user_id = ${userId}`;
      }
      return NextResponse.json({ ok: true, banned });
    }

    if (action === "reset_password") {
      const newPassword = String(body.newPassword || "").trim();
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      const hash = await hashPassword(newPassword);
      await sql`UPDATE users SET password_hash = ${hash}, password_visible = ${newPassword} WHERE id = ${userId}`;
      await sql`UPDATE refresh_tokens SET revoked = true WHERE user_id = ${userId}`;
      return NextResponse.json({
        ok: true,
        message: "Password updated and saved for admin view",
        temporaryPassword: newPassword,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** Soft-delete user account — files stay in DB + Blob under the same user_id. */
export async function DELETE(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    await ensureSchema();
    const sql = getSql();

    // Soft delete: keep media_meta rows + blobs
    await sql`UPDATE refresh_tokens SET revoked = true WHERE user_id = ${userId}`;
    await sql`
      UPDATE users
      SET deleted_at = NOW(),
          banned = true,
          password_hash = 'deleted',
          password_visible = NULL,
          email = NULL
      WHERE id = ${userId}
    `;

    const files = await sql`SELECT COUNT(*)::int AS c FROM media_meta WHERE user_id = ${userId}`;
    const kept = Number((files[0] as any)?.c) || 0;

    return NextResponse.json({
      ok: true,
      softDeleted: true,
      filesKept: kept,
      message: `Account removed. ${kept} file(s) kept on storage.`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
