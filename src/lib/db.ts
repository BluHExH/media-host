import { neon } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export function getClientIp(request: NextRequest): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getUserAgent(request: NextRequest): string {
  return (request.headers.get("user-agent") || "").slice(0, 500);
}

export async function ensureSchema() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE,
    password_hash TEXT NOT NULL, display_name TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
    last_ip TEXT, last_login_at TIMESTAMPTZ, register_ip TEXT)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS register_ip TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`;
  await sql`CREATE TABLE IF NOT EXISTS media_meta (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL UNIQUE, pathname TEXT, content_type TEXT, size BIGINT,
    album TEXT DEFAULT 'general', expires_at TIMESTAMPTZ, is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`ALTER TABLE media_meta ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
  await sql`ALTER TABLE media_meta ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_user ON media_meta(user_id)`;
  await sql`CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    username TEXT, ip TEXT, user_agent TEXT, action TEXT NOT NULL, success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), revoked BOOLEAN DEFAULT false)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id)`;
  await sql`CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, window_start TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  // Force wipe public gallery for everyone (v2)
  const mig = await sql`SELECT value FROM app_meta WHERE key = 'privacy_wipe_v2' LIMIT 1`;
  if (!mig.length) {
    await sql`DELETE FROM media_meta WHERE is_public = true`;
    await sql`UPDATE media_meta SET is_public = false WHERE is_public = true`;
    await sql`INSERT INTO app_meta (key, value) VALUES ('privacy_wipe_v2', 'done')
      ON CONFLICT (key) DO UPDATE SET value = 'done', updated_at = NOW()`;
  }
  return { ok: true };
}

export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number }> {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT count, window_start FROM rate_limits WHERE key = ${key} LIMIT 1`;
    const now = Date.now();
    if (!rows.length) {
      await sql`INSERT INTO rate_limits (key, count, window_start) VALUES (${key}, 1, NOW())
        ON CONFLICT (key) DO UPDATE SET count = 1, window_start = NOW()`;
      return { ok: true, remaining: limit - 1 };
    }
    const row = rows[0] as { count: number; window_start: string };
    const start = new Date(row.window_start).getTime();
    if (now - start > windowSec * 1000) {
      await sql`UPDATE rate_limits SET count = 1, window_start = NOW() WHERE key = ${key}`;
      return { ok: true, remaining: limit - 1 };
    }
    if (row.count >= limit) return { ok: false, remaining: 0 };
    await sql`UPDATE rate_limits SET count = count + 1 WHERE key = ${key}`;
    return { ok: true, remaining: limit - row.count - 1 };
  } catch {
    return { ok: true, remaining: limit };
  }
}

export async function logAuthEvent(opts: {
  userId?: number | null; username?: string | null; ip: string; userAgent: string;
  action: "register" | "login" | "login_fail" | "refresh"; success?: boolean;
}) {
  try {
    const sql = getSql();
    await sql`INSERT INTO login_logs (user_id, username, ip, user_agent, action, success)
      VALUES (${opts.userId ?? null}, ${opts.username ?? null}, ${opts.ip}, ${opts.userAgent}, ${opts.action}, ${opts.success !== false})`;
  } catch {}
}

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
  const hash = new Uint8Array(bits);
  return `pbkdf2:${btoa(String.fromCharCode(...salt))}:${btoa(String.fromCharCode(...hash))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algo, saltB64, hashB64] = stored.split(":");
    if (algo !== "pbkdf2") return false;
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const expected = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0));
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let ok = 0; for (let i = 0; i < actual.length; i++) ok |= actual[i] ^ expected[i];
    return ok === 0;
  } catch { return false; }
}

async function hmacSign(payload: string): Promise<string> {
  const secret = process.env.AUTH_SECRET || process.env.MEDIA_PASSWORD || process.env.DATABASE_URL || "media-host-fallback";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret.slice(0, 64)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeToken(userId: number, username: string): Promise<string> {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${userId}:${username}:${exp}`;
  return `${btoa(payload)}.${await hmacSign(payload)}`;
}

export async function parseToken(token: string): Promise<{ userId: number; username: string } | null> {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = atob(payloadB64);
    const expected = await hmacSign(payload);
    if (sig.length !== expected.length) return null;
    let diff = 0; for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const [idStr, username, expStr] = payload.split(":");
    const userId = parseInt(idStr, 10);
    const exp = parseInt(expStr, 10);
    if (!userId || !username || !exp || Date.now() > exp) return null;
    return { userId, username };
  } catch { return null; }
}

export async function makeRefreshToken(userId: number): Promise<string> {
  const raw = `${userId}.${Date.now()}.${crypto.randomUUID()}`;
  const token = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token_hash = await sha256Hex(token);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const sql = getSql();
  await sql`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (${userId}, ${token_hash}, ${expires.toISOString()})`;
  return token;
}

export async function rotateRefreshToken(oldToken: string): Promise<{ userId: number; accessToken: string; refreshToken: string } | null> {
  const token_hash = await sha256Hex(oldToken);
  const sql = getSql();
  const rows = await sql`SELECT id, user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ${token_hash} LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0] as { id: number; user_id: number; expires_at: string; revoked: boolean };
  if (row.revoked || new Date(row.expires_at).getTime() < Date.now()) return null;
  await sql`UPDATE refresh_tokens SET revoked = true WHERE id = ${row.id}`;
  const users = await sql`SELECT username FROM users WHERE id = ${row.user_id} LIMIT 1`;
  if (!users.length) return null;
  const username = (users[0] as { username: string }).username;
  return {
    userId: row.user_id,
    accessToken: await makeToken(row.user_id, username),
    refreshToken: await makeRefreshToken(row.user_id),
  };
}

export async function purgeExpired() {
  try {
    const sql = getSql();
    await sql`DELETE FROM media_meta WHERE expires_at IS NOT NULL AND expires_at < NOW()`;
    await sql`DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = true`;
  } catch {}
}
