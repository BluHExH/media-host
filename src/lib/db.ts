import { neon } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Connect Neon Postgres in Vercel Storage.");
  return neon(url);
}

export async function ensureSchema() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    register_ip TEXT,
    last_ip TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS media_meta (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL UNIQUE,
    pathname TEXT,
    content_type TEXT,
    size BIGINT,
    album TEXT DEFAULT 'general',
    expires_at TIMESTAMPTZ,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    user_id INT,
    username TEXT,
    ip TEXT,
    user_agent TEXT,
    action TEXT,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INT DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS share_links (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    media_url TEXT NOT NULL,
    password_hash TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token)`;
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export function getUserAgent(request: NextRequest): string {
  return (request.headers.get("user-agent") || "").slice(0, 300);
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<{ ok: boolean; remaining: number }> {
  try {
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
    const count = Number(row.count) || 0;
    if (count >= limit) return { ok: false, remaining: 0 };
    await sql`UPDATE rate_limits SET count = ${count + 1} WHERE key = ${key}`;
    return { ok: true, remaining: limit - count - 1 };
  } catch {
    return { ok: true, remaining: limit };
  }
}

export async function logAuthEvent(opts: {
  userId?: number;
  username?: string;
  ip?: string;
  userAgent?: string;
  action: string;
  success: boolean;
}) {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO login_logs (user_id, username, ip, user_agent, action, success)
      VALUES (
        ${opts.userId ?? null},
        ${opts.username ?? null},
        ${opts.ip ?? null},
        ${opts.userAgent ?? null},
        ${opts.action},
        ${opts.success}
      )
    `;
  } catch {}
}

const te = new TextEncoder();

async function hmacKey() {
  const secret = process.env.AUTH_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "dev-secret-change-me";
  return crypto.subtle.importKey(
    "raw",
    te.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2:100000:${b64url(salt)}:${b64url(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(":");
    if (parts[0] !== "pbkdf2" || parts.length < 4) return false;
    const iterations = parseInt(parts[1], 10) || 100000;
    const salt = fromB64url(parts[2]);
    const expected = fromB64url(parts[3]);
    const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      key,
      256
    );
    const got = new Uint8Array(bits);
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export async function makeToken(userId: number, username: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const payload = b64url(te.encode(JSON.stringify({ userId, username, exp })));
  const key = await hmacKey();
  const sig = b64url(await crypto.subtle.sign("HMAC", key, te.encode(payload)));
  return `${payload}.${sig}`;
}

export async function parseToken(
  token: string
): Promise<{ userId: number; username: string } | null> {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const key = await hmacKey();
    const expected = b64url(await crypto.subtle.sign("HMAC", key, te.encode(payload)));
    if (expected !== sig) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as {
      userId: number;
      username: string;
      exp: number;
    };
    if (!data.exp || data.exp * 1000 < Date.now()) return null;
    return { userId: data.userId, username: data.username };
  } catch {
    return null;
  }
}

export async function makeRefreshToken(userId: number): Promise<string> {
  const raw = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = b64url(
    await crypto.subtle.digest("SHA-256", te.encode(raw))
  );
  const exp = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  const sql = getSql();
  await sql`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hash}, ${exp.toISOString()})
  `;
  return raw;
}

export async function purgeExpired() {
  try {
    const sql = getSql();
    await sql`DELETE FROM media_meta WHERE expires_at IS NOT NULL AND expires_at < NOW()`;
    await sql`DELETE FROM share_links WHERE expires_at IS NOT NULL AND expires_at < NOW()`;
    await sql`DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = true`;
  } catch {}
}
