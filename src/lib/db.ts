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
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_ip TEXT,
    last_login_at TIMESTAMPTZ,
    register_ip TEXT
  )`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS register_ip TEXT`;
  await sql`CREATE TABLE IF NOT EXISTS media_meta (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL UNIQUE,
    pathname TEXT,
    content_type TEXT,
    size BIGINT,
    album TEXT DEFAULT 'general',
    expires_at TIMESTAMPTZ,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`ALTER TABLE media_meta ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
  await sql`ALTER TABLE media_meta ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_user ON media_meta(user_id)`;
  await sql`CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    username TEXT,
    ip TEXT,
    user_agent TEXT,
    action TEXT NOT NULL,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  return { ok: true };
}

export async function logAuthEvent(opts: {
  userId?: number | null;
  username?: string | null;
  ip: string;
  userAgent: string;
  action: "register" | "login" | "login_fail";
  success?: boolean;
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
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
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
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      256
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let ok = 0;
    for (let i = 0; i < actual.length; i++) ok |= actual[i] ^ expected[i];
    return ok === 0;
  } catch {
    return false;
  }
}

async function hmacSign(payload: string): Promise<string> {
  const secret = process.env.AUTH_SECRET || process.env.MEDIA_PASSWORD || process.env.DATABASE_URL || "media-host-fallback";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret.slice(0, 64)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function makeToken(userId: number, username: string): Promise<string> {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${userId}:${username}:${exp}`;
  const sig = await hmacSign(payload);
  return `${btoa(payload)}.${sig}`;
}

export async function parseToken(token: string): Promise<{ userId: number; username: string } | null> {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = atob(payloadB64);
    const expected = await hmacSign(payload);
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const [idStr, username, expStr] = payload.split(":");
    const userId = parseInt(idStr, 10);
    const exp = parseInt(expStr, 10);
    if (!userId || !username || !exp || Date.now() > exp) return null;
    return { userId, username };
  } catch {
    return null;
  }
}

export async function purgeExpired() {
  try {
    const sql = getSql();
    await sql`DELETE FROM media_meta WHERE expires_at IS NOT NULL AND expires_at < NOW()`;
  } catch {}
}
