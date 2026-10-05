import { NextRequest, NextResponse } from "next/server";

/**
 * Admin is NOT at /admin (that returns 404).
 * Open only via secret path:
 *   default: /ops-mh-9k2xq
 *   or set Vercel env ADMIN_PATH=your-secret-slug (no leading slash)
 * Still requires ADMIN_SECRET to unlock the panel.
 */
function adminSlug(): string {
  const raw = (process.env.ADMIN_PATH || "ops-mh-9k2xq").trim().replace(/^\/+|\/+$/g, "");
  if (!raw || raw.toLowerCase() === "admin") return "ops-mh-9k2xq";
  return raw;
}

function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.jsdelivr.net 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com",
    "media-src 'self' blob: https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com",
    "connect-src 'self' https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com https://vercel.com https://*.vercel.com https://cdn.jsdelivr.net",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=(self)",
  "camera=()",
  "display-capture=()",
  "encrypted-media=(self)",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=(self)",
  "publickey-credentials-get=(self)",
  "screen-wake-lock=()",
  "sync-xhr=()",
  "usb=()",
  "web-share=(self)",
  "xr-spatial-tracking=()",
  "interest-cohort=()",
  "browsing-topics=()",
].join(", ");

function applySecurityHeaders(res: NextResponse, pathname: string, nonce: string) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-XSS-Protection", "0");
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  res.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  if (!pathname.startsWith("/api/render")) {
    res.headers.set("Content-Security-Policy", buildCsp(nonce));
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  const te = (request.headers.get("transfer-encoding") || "").toLowerCase();
  if (te.includes("chunked") && request.headers.has("content-length")) {
    if (method === "DELETE" || method === "OPTIONS" || method === "PUT" || method === "POST") {
      return new NextResponse("Bad Request", { status: 400 });
    }
  }

  const slug = adminSlug();
  const nonce = makeNonce();

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const res = new NextResponse("This page doesn’t exist.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
    applySecurityHeaders(res, pathname, nonce);
    return res;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    const url = request.nextUrl.clone();
    const rest = pathname.slice(slug.length + 1);
    url.pathname = rest ? `/admin${rest}` : "/admin";
    const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    applySecurityHeaders(res, pathname, nonce);
    return res;
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(res, pathname, nonce);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
