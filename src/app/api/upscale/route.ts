import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { parseToken, checkRateLimit, getClientIp, getSql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "nightmareai/real-esrgan";

async function runReplicate(imageUrl: string, scale: number, token: string) {
  const create = await fetch(
    `https://api.replicate.com/v1/models/${MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=55",
      },
      body: JSON.stringify({
        input: {
          image: imageUrl,
          scale: Math.min(4, Math.max(2, scale)),
          face_enhance: true,
        },
      }),
    }
  );

  const data = await create.json();
  if (!create.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : data?.error || JSON.stringify(data?.detail || data) || "Replicate failed"
    );
  }

  if (data.status === "succeeded" && data.output) {
    return typeof data.output === "string" ? data.output : data.output[0];
  }

  let pred = data;
  for (let i = 0; i < 40; i++) {
    if (pred.status === "succeeded") {
      const out = pred.output;
      return typeof out === "string" ? out : out?.[0];
    }
    if (pred.status === "failed" || pred.status === "canceled") {
      throw new Error(pred.error || "Upscale failed");
    }
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Token ${token}` },
    });
    pred = await r.json();
  }
  throw new Error("Upscale timed out");
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`upscale:${ip}`, 10, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Upscale rate limit (10/min)." }, { status: 429 });
    }

    const auth = request.headers.get("x-auth-token") || "";
    const parsed = auth ? await parseToken(auth) : null;
    if (!parsed) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      return NextResponse.json(
        {
          error:
            "REPLICATE_API_TOKEN not set. Vercel → Project Settings → Environment Variables. Free token: https://replicate.com/account/api-tokens",
          setup: true,
        },
        { status: 503 }
      );
    }

    const form = await request.formData();
    const scale = parseInt(String(form.get("scale") || "2"), 10) || 2;
    const sourceUrl = String(form.get("url") || "").trim();
    const file = form.get("file") as File | null;

    let publicUrl = sourceUrl;

    if (file && file.size > 0) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Only images" }, { status: 400 });
      }
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "Max 15 MB for upscale" }, { status: 400 });
      }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const tmp = await put(`upscale-src/${parsed.userId}/${Date.now()}-${safe}`, file, {
        access: "public",
        contentType: file.type,
      });
      publicUrl = tmp.url;
    }

    if (!publicUrl || !publicUrl.startsWith("http")) {
      return NextResponse.json({ error: "Provide image file or url" }, { status: 400 });
    }

    const outUrl = await runReplicate(publicUrl, scale, replicateToken);
    if (!outUrl) {
      return NextResponse.json({ error: "No output from model" }, { status: 502 });
    }

    const imgRes = await fetch(outUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Could not download upscaled image" }, { status: 502 });
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const base =
      (sourceUrl || file?.name || "image")
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "")
        ?.replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 60) || "image";
    const outName = `${base}-x${scale}.png`;
    const pathname = `${parsed.username}/upscaled/${Date.now()}-${outName}`;

    const stored = await put(pathname, buf, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: true,
    });

    try {
      const sql = getSql();
      await sql`
        INSERT INTO media_meta (user_id, url, pathname, content_type, size, album, expires_at, is_public)
        VALUES (
          ${parsed.userId},
          ${stored.url},
          ${stored.pathname},
          ${"image/png"},
          ${buf.length},
          ${"upscaled"},
          ${null},
          ${false}
        )
        ON CONFLICT (url) DO NOTHING
      `;
    } catch (dbErr) {
      console.error("media_meta insert failed", dbErr);
    }

    return NextResponse.json({
      url: stored.url,
      pathname: stored.pathname,
      scale,
      album: "upscaled",
      size: buf.length,
      contentType: "image/png",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upscale failed" },
      { status: 500 }
    );
  }
}
