/** Password-reset tokens (HMAC, 20 min TTL) */

async function hmacSign(payload: string): Promise<string> {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.MEDIA_PASSWORD ||
    process.env.DATABASE_URL ||
    "media-host-fallback";
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

export async function makeResetToken(userId: number, username: string): Promise<string> {
  const exp = Date.now() + 20 * 60 * 1000;
  const payload = `reset:${userId}:${username}:${exp}`;
  return `${btoa(payload)}.${await hmacSign(payload)}`;
}

export async function parseResetToken(
  token: string
): Promise<{ userId: number; username: string } | null> {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = atob(payloadB64);
    const expected = await hmacSign(payload);
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const parts = payload.split(":");
    if (parts[0] !== "reset") return null;
    const userId = parseInt(parts[1], 10);
    const username = parts[2];
    const exp = parseInt(parts[3], 10);
    if (!userId || !username || !exp || Date.now() > exp) return null;
    return { userId, username };
  } catch {
    return null;
  }
}
