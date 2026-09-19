// @ts-nocheck
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authFetch, hasSession } from "@/lib/client-auth";

function canvasFromImage(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0);
  return c;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function toPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png", 1);
  });
}

async function upscaleSmart(fileOrBlob, scale, onStatus) {
  try {
    onStatus?.("Loading free AI model…");
    const upscalerMod = await import(
      /* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/upscaler@0.12.1/+esm"
    );
    const Upscaler = upscalerMod.default || upscalerMod.Upscaler || upscalerMod;
    const upscaler = new Upscaler();
    onStatus?.(`Upscaling ${scale}×…");
    const src = typeof fileOrBlob === "string" ? fileOrBlob : URL.createObjectURL(fileOrBlob);
    const tensorOrCanvas = await upscaler.upscale(src, { output: "canvas", scale });
    const canvas = tensorOrCanvas instanceof HTMLCanvasElement
      ? tensorOrCanvas
      : (() => {
          const c = document.createElement("canvas");
          // fallback if image bitmap
          return tensorOrCanvas;
        })();
    if (canvas instanceof HTMLCanvasElement) {
      return await toPngBlob(canvas);
    }
    // If returned as image URL / img
    if (typeof canvas === "string") {
      const img = await loadImage(canvas);
      return await toPngBlob(canvasFromImage(img));
    }
    throw new Error("Unexpected upscaler output");
  } catch (e) {
    onStatus?.("AI model unavailable — using high-quality canvas upscale…");
    const src = typeof fileOrBlob === "string" ? fileOrBlob : URL.createObjectURL(fileOrBlob);
    const img = await loadImage(src);
    const c = document.createElement("canvas");
    c.width = (img.naturalWidth || img.width) * scale;
    c.height = (img.naturalHeight || img.height) * scale;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await toPngBlob(c);
  }
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

  const processFile = useCallback(async (file) => {
    if (!file) return;
    setError("");
    setBusy(true);
    setSavedUrl("");
    setResult(null);
    setResultBlob(null);
    const origUrl = URL.createObjectURL(file);
    setOriginal(origUrl);
    setFileName((file.name || "image").replace(/\.[^.]+$/, "") + `-${scale}x.png`);
    try {
      const blob = await upscaleSmart(file, scale, setStatus);
      const url = URL.createObjectURL(blob);
      setResult(url);
      setResultBlob(blob);
      setStatus("Done — saving to library…");
      if (hasSession()) {
        const fd = new FormData();
        fd.append("file", new File([blob], fileName, { type: "image/png" }));
        fd.append("album", "upscaled");
        fd.append("expiry", "never");
        const res = await authFetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) {
          const d = await res.json();
          setSavedUrl(d.url || "");
          setStatus("Saved to folder: upscaled");
        } else {
          setStatus("Processed — save failed (still can download)");
        }
      } else {
        setStatus("Processed — sign in to auto-save");
      }
    } catch (e) {
      setError(e?.message || "Upscale failed");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [scale, fileName]);

  useEffect(() => {
    const u = searchParams.get("url");
    if (!u) return;
    (async () => {
      try {
        setStatus("Loading image…");
        const res = await fetch(u);
        const blob = await res.blob();
        const name = u.split("/").pop() || "image.png";
        const file = new File([blob], name, { type: blob.type || "image/png" });
        await processFile(file);
      } catch {
        setError("Could not load image from URL");
      }
    })();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="min-h-screen mh-mesh">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }}>
              MH
            </Link>
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Upscale</span>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/library" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#5a6f82" }}>Library</Link>
            <Link href="/tools/remove-bg" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#0F4C81" }}>Remove BG</Link>
            <Link href="/" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#5a6f82" }}>Home</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <p className="text-sm" style={{ color: "#5a6f82" }}>
          Free browser upscale. Result auto-saves to folder{" "}
          <code className="rounded bg-white/60 px-1 text-xs">upscaled</code>.
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
              style={scale === s
                ? { background: "linear-gradient(135deg,#0F4C81,#3BACB6)", color: "#fff" }
                : { background: "rgba(255,255,255,0.6)", color: "#1A2B3C", border: "1px solid rgba(15,76,129,0.15)" }}
            >
              {s}×
            </button>
          ))}
        </div>

        <div
          className="mh-dropzone-glass relative py-14 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
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

        {status && !busy && <p className="text-sm" style={{ color: "#0F4C81" }}>{status}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {savedUrl && (
          <p className="text-sm" style={{ color: "#0F4C81" }}>
            Saved: <a href={savedUrl} className="underline break-all" target="_blank" rel="noreferrer">{savedUrl}</a>
          </p>
        )}

        {(original || result) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {original && (
              <div className="mh-glass-strong p-3">
                <p className="mb-2 text-xs font-medium" style={{ color: "#5a6f82" }}>Original</p>
                <img src={original} alt="" className="w-full rounded-xl" />
              </div>
            )}
            {result && (
              <div className="mh-glass-strong p-3">
                <p className="mb-2 text-xs font-medium" style={{ color: "#5a6f82" }}>Upscaled {scale}×</p>
                <img src={result} alt="" className="w-full rounded-xl" />
                <button type="button" onClick={download} className="mh-btn mh-btn-primary mt-3 w-full py-2.5 text-sm">
                  Download PNG
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
    <Suspense fallback={<div className="mh-mesh flex min-h-screen items-center justify-center text-[#5a6f82]">Loading…</div>}>
      <UpscaleInner />
    </Suspense>
  );
}
