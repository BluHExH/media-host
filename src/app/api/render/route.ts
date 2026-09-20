import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Proxy HTML from Vercel Blob so browsers render inline instead of download.
 *  CRITICAL: sandboxed unique-origin so scripts cannot read site localStorage tokens. */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams.get("u");
    if (!u) {
      return new NextResponse(
        "<!DOCTYPE html><html><body style='font-family:system-ui;padding:2rem'><h1>Missing file URL</h1></body></html>",
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    let target: URL;
    try {
      target = new URL(u);
    } catch {
      return new NextResponse(
        "<!DOCTYPE html><html><body style='font-family:system-ui;padding:2rem'><h1>Invalid URL</h1></body></html>",
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // Only allow http(s) and our blob hosts — block file:, javascript:, etc.
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return new NextResponse(
        "<!DOCTYPE html><html><body style='font-family:system-ui;padding:2rem'><h1>Protocol not allowed</h1></body></html>",
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const host = target.hostname;
    if (
      !host.endsWith(".public.blob.vercel-storage.com") &&
      !host.endsWith(".blob.vercel-storage.com")
    ) {
      return new NextResponse(
        "<!DOCTYPE html><html><body style='font-family:system-ui;padding:2rem'><h1>Host not allowed</h1></body></html>",
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const upstream = await fetch(target.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
      cache: "no-store",
    });

    if (!upstream.ok) {
      return new NextResponse(
        `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem;max-width:40rem;margin:auto">
          <h1>File not found</h1>
          <p>This HTML file is missing from storage (deleted or expired).</p>
          <p style="color:#64748b;font-size:14px">Status: ${upstream.status}</p>
          <p><a href="/library">Back to Library</a></p>
        </body></html>`,
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const body = await upstream.arrayBuffer();
    // Cap size ~5MB to avoid abuse
    if (body.byteLength > 5 * 1024 * 1024) {
      return new NextResponse(
        "<!DOCTYPE html><html><body style='font-family:system-ui;padding:2rem'><h1>File too large to preview</h1></body></html>",
        { status: 413, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const name = (target.pathname.split("/").pop() || "page.html").replace(/["<>]/g, "");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
        // Sandbox WITHOUT allow-same-origin → unique origin, cannot steal tokens
        "Content-Security-Policy":
          "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https: data: blob:; style-src 'unsafe-inline' https: data:; img-src * data: blob:; media-src * data: blob:; font-src * data:; connect-src *; frame-ancestors 'none'",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    const msg = escapeHtml(e instanceof Error ? e.message : "Render failed");
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem"><h1>Error</h1><p>${msg}</p></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
