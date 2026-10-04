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
  // never allow empty or the public word "admin"
  if (!raw || raw.toLowerCase() === "admin") return "ops-mh-9k2xq";
  return raw;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const slug = adminSlug();

  // Public /admin → fake 404 (do not reveal panel exists)
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse("This page doesn’t exist.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Secret path → rewrite to internal /admin app route
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    const url = request.nextUrl.clone();
    const rest = pathname.slice(slug.length + 1); // leading "/"
    url.pathname = rest ? `/admin${rest}` : "/admin";
    const res = NextResponse.rewrite(url);
    applySecurityHeaders(res, pathname);
    return res;
  }

  const res = NextResponse.next();
  applySecurityHeaders(res, pathname);
  return res;
}

function applySecurityHeaders(res: NextResponse, pathname: string) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-XSS-Protection", "0");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  if (!pathname.startsWith("/api/render")) {
    res.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com",
        "media-src 'self' blob: https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com",
        "connect-src 'self' https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com https://vercel.com https://*.vercel.com https://cdn.jsdelivr.net",
        "font-src 'self' data:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
