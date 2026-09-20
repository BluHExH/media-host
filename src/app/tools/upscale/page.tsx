// @ts-nocheck
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authFetch, hasSession, ensureSession } from "@/lib/client-auth";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function toPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png", 1);
  });
}

/** High-quality multi-step upscale (better than single stretch). */
function canvasUpscale(img, scale) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const targetW = Math.round(srcW * scale);
  const targetH = Math.round(srcH * scale);

  // Progressive 2× steps for sharper result
  let cur = document.createElement("canvas");
  cur.width = srcW;
  cur.height = srcH;
  let ctx = cur.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0);

  let w = srcW;
  let h = srcH;
  while (w * 2 <= targetW + 1 && h * 2 <= targetH + 1 && (w < targetW || h < targetH)) {
    const nextW = Math.min(targetW, w * 2);
    const nextH = Math.min(targetH, h * 2);
    const next = document.createElement("canvas");
    next.width = nextW;
    next.height = nextH;
    const nctx = next.getContext("2d");
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(cur, 0, 0, nextW, nextH);
    cur = next;
    w = nextW;
    h = nextH;
  }

  if (w !== targetW || h !== targetH) {
    const final = document.createElement("canvas");
    final.width = targetW;
    final.height = targetH;
    const fctx = final.getContext("2d");
    fctx.imageSmoothingEnabled = true;
    fctx.imageSmoothingQuality = "high";
    fctx.drawImage(cur, 0, 0, targetW, targetH);
    return final;
  }
  return cur;
}

async function upscaleSmart(fileOrBlob, scale, onStatus) {
  const src =
    typeof fileOrBlob === "string" ? fileOrBlob : URL.createObjectURL(fileOrBlob);
  const img = await loadImage(src);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  // Try free AI model first (UpscalerJS)
  try {
    onStatus?.("Loading AI model (browser)…");
    const upscalerMod = await import(
      /* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/upscaler@1.0.0-beta.19/+esm"
    );
    const Upscaler = upscalerMod.default || upscalerMod.Upscaler || upscalerMod;
    const upscaler = new Upscaler();
    onStatus?.(`AI upscaling ${scale}× (${srcW}×${srcH})…`);
    const out = await upscaler.upscale(src, { output: "canvas", scale });
    if (out instanceof HTMLCanvasElement && out.width >= srcW * scale * 0.9) {
      const blob = await toPngBlob(out);
      return {
        blob,
        width: out.width,
        height: out.height,
        srcW,
        srcH,
        method: "ai",
      };
    }
  } catch {
    /* fall through to canvas */
  }

  onStatus?.(`High-quality ${scale}× upscale (${srcW}×${srcH} → ${srcW * scale}×${srcH * scale})…`);
  const canvas = canvasUpscale(img, scale);
  const blob = await toPngBlob(canvas);
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    srcW,
    srcH,
    method: "hq",
  };
}

function sanitizeName(name) {
  return String(name || "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "image";
}

function UpscaleInner() {
  const searchParams = useSearchParams();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [original, setOriginal] = useState(null);
  const [result, setResult] = useState(null);
  const [resultBlob, setResultBlob] = useState(null);
  const [scale, setScale] = useState(2);
  const [fileName, setFileName] = useState("image-2x.png");
  const [savedUrl, setSavedUrl] = useState("");
  const [dims, setDims] = useState(null);
  const loadedUrlRef = useRef("");

  const processFile = useCallback(
    async (file) => {
      if (!file) return;
      setError("");
      setBusy(true);
      setSavedUrl("");
      setResult(null);
      setResultBlob(null);
      setDims(null);

      const outName = `${sanitizeName(file.name)}-${scale}x.png`;
      setFileName(outName);

      const origUrl = URL.createObjectURL(file);
      setOriginal(origUrl);

      try {
        const { blob, width, height, srcW, srcH, method } = await upscaleSmart(
          file,
          scale,
          setStatus
        );
        const url = URL.createObjectURL(blob);
        setResult(url);
        setResultBlob(blob);
        setDims({ srcW, srcH, width, height, method });

        // Auto-save to library
        setStatus("Saving to library…");
        await ensureSession();
        if (!hasSession()) {
          setStatus(`Upscale done (${srcW}×${srcH} → ${width}×${height}). Sign in to save.`);
          return;
        }

        const fd = new FormData();
        fd.append("file", new File([blob], outName, { type: "image/png" }));
        fd.append("album", "upscaled");
        fd.append("expiry", "never");

        const res = await authFetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.url) {
          setSavedUrl(data.url);
          setStatus(
            `Saved to folder “upscaled” · ${srcW}×${srcH} → ${width}×${height} (${method === "ai" ? "AI" : "HQ"})`
          );
        } else {
          const why = data.error || `HTTP ${res.status}`;
          setError(`Upscale OK but save failed: ${why}`);
          setStatus(`Ready to download (${width}×${height}). Save failed — try again after refresh.`);
        }
      } catch (e) {
        setError(e?.message || "Upscale failed");
        setStatus("");
      } finally {
        setBusy(false);
      }
    },
    [scale]
  );

  useEffect(() => {
    const u = searchParams.get("url");
    if (!u || loadedUrlRef.current === u) return;
    loadedUrlRef.current = u;
    (async () => {
      try {
        setStatus("Loading image…");
        setBusy(true);
        const res = await fetch(u);
        if (!res.ok) throw new Error("Fetch failed");
        const blob = await res.blob();
        const name = decodeURIComponent(u.split("/").pop() || "image.png");
        const file = new File([blob], name, { type: blob.type || "image/png" });
        await processFile(file);
      } catch {
        setError("Could not load image from URL");
        setBusy(false);
      }
    })();
  }, [searchParams, processFile]);

  const onPick = (list) => {
    if (list?.[0]) processFile(list[0]);
  };

  const download = () => {
    if (!resultBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(resultBlob);
    a.download = fileName;
    a.click();
  };

  const retrySave = async () => {
    if (!resultBlob) return;
    setError("");
    setStatus("Saving…");
    await ensureSession();
    if (!hasSession()) {
      setError("Sign in required to save");
      return;
    }
    const fd = new FormData();
    fd.append("file", new File([resultBlob], fileName, { type: "image/png" }));
    fd.append("album", "upscaled");
    fd.append("expiry", "never");
    const res = await authFetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      setSavedUrl(data.url);
      setStatus("Saved to folder: upscaled");
      setError("");
    } else {
      setError(`Save failed: ${data.error || res.status}`);
    }
  };

  return (
    <div className="min-h-screen mh-mesh">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }}
            >
              MH
            </Link>
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Upscale</span>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/library" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#5a6f82" }}>
              Library
            </Link>
            <Link href="/tools/remove-bg" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#0F4C81" }}>
              Remove BG
            </Link>
            <Link href="/" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#5a6f82" }}>
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <p className="text-sm" style={{ color: "#5a6f82" }}>
          Free browser upscale. Result auto-saves to folder{" "}
          <code className="rounded bg-white/60 px-1 text-xs">upscaled</code>.
          Compare pixel sizes below — both previews fit the same card width, so look at the numbers.
        </p>

        <div className="mh-glass-strong flex flex-wrap items-center gap-3 p-4">
          <span className="text-xs font-semibold" style={{ color: "#5a6f82" }}>Scale</span>
          {[2, 4].map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => setScale(s)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={
                scale === s
                  ? { background: "linear-gradient(135deg,#0F4C81,#3BACB6)", color: "#fff" }
                  : {
                      background: "rgba(255,255,255,0.6)",
                      color: "#1A2B3C",
                      border: "1px solid rgba(15,76,129,0.15)",
                    }
              }
            >
              {s}×
            </button>
          ))}
        </div>

        <div
          className="mh-dropzone-glass relative py-14 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onPick(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={busy}
            onChange={(e) => onPick(e.target.files)}
          />
          <p className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>
            {busy ? status || "Working…" : "Drop image or click to choose"}
          </p>
          <p className="mt-1 text-xs" style={{ color: "#5a6f82" }}>Runs in your browser · free</p>
        </div>

        {status && !busy && (
          <p className="text-sm" style={{ color: "#0F4C81" }}>
            {status}
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {error && resultBlob && (
          <button type="button" onClick={retrySave} className="mh-btn mh-btn-outline px-4 py-2 text-xs">
            Retry save to library
          </button>
        )}
        {savedUrl && (
          <p className="text-sm" style={{ color: "#0F4C81" }}>
            Saved:{" "}
            <a href={savedUrl} className="underline break-all" target="_blank" rel="noreferrer">
              {savedUrl}
            </a>
            {" · "}
            <Link href="/library" className="underline">
              Open library
            </Link>
          </p>
        )}

        {(original || result) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {original && (
              <div className="mh-glass-strong p-3">
                <p className="mb-2 text-xs font-medium" style={{ color: "#5a6f82" }}>
                  Original{dims ? ` · ${dims.srcW}×${dims.srcH}px` : ""}
                </p>
                <img src={original} alt="" className="w-full rounded-xl" />
              </div>
            )}
            {result && (
              <div className="mh-glass-strong p-3">
                <p className="mb-2 text-xs font-medium" style={{ color: "#5a6f82" }}>
                  Upscaled {scale}×
                  {dims ? ` · ${dims.width}×${dims.height}px` : ""}
                  {dims?.method === "ai" ? " · AI" : dims ? " · HQ" : ""}
                </p>
                {/* Scrollable so you can see actual pixel density difference */}
                <div className="max-h-80 overflow-auto rounded-xl bg-white/40">
                  <img
                    src={result}
                    alt=""
                    style={{
                      maxWidth: "none",
                      width: dims ? `${Math.min(dims.width, 1200)}px` : "100%",
                      height: "auto",
                      imageRendering: "auto",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={download}
                  className="mh-btn mh-btn-primary mt-3 w-full py-2.5 text-sm"
                >
                  Download PNG ({dims ? `${dims.width}×${dims.height}` : scale + "×"})
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function UpscalePage() {
  return (
    <Suspense
      fallback={
        <div className="mh-mesh flex min-h-screen items-center justify-center text-[#5a6f82]">Loading…</div>
      }
    >
      <UpscaleInner />
    </Suspense>
  );
}
