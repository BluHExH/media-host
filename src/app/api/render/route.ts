import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/** Serve HTML from Vercel Blob with Content-Disposition: inline so browsers render instead of download */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams.get("u");
    if (!u) {
      return NextResponse.json({ error: "Missing u" }, { status: 400 });
    }

    let target: URL;
    try {
      target = new URL(u);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const host = target.hostname;
    if (
      !host.endsWith(".public.blob.vercel-storage.com") &&
      !host.endsWith(".blob.vercel-storage.com")
    ) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }

    const upstream = await fetch(target.toString(), {
      headers: { Accept: "text/html,*/*" },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 }
      );
    }

    const body = await upstream.arrayBuffer();
    const name = target.pathname.split("/").pop() || "page.html";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Render failed" },
      { status: 500 }
    );
  }
}
