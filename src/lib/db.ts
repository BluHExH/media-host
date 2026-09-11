import { neon } from "@neondatabase/serverless";

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
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS media_meta (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    url TEXT NOT NULL UNIQUE,
    pathname TEXT,
    content_type TEXT,
    size BIGINT,
    album TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
  const hash = new Uint8Array(bits);
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...hash));
  return `pbkdf2:${saltB64}:${hashB64}`;
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
    let ok = 0;
    for (let i = 0; i < actual.length; i++) ok |= actual[i] ^ expected[i];
    return ok === 0;
  } catch { return false; }
}

export function makeToken(userId: number, username: string): string {
  const payload = `${userId}:${username}:${Date.now()}`;
  const secret = process.env.AUTH_SECRET || process.env.MEDIA_PASSWORD || "media-host-secret";
  return btoa(payload) + "." + btoa(secret.slice(0, 16) + payload.length);
}

export function parseToken(token: string): { userId: number; username: string } | null {
  try {
    const [payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const payload = atob(payloadB64);
    const [idStr, username] = payload.split(":");
    const userId = parseInt(idStr, 10);
    if (!userId || !username) return null;
    return { userId, username };
  } catch { return null; }
}
