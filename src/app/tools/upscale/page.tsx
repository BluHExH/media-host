// @ts-nocheck
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TK = "media_host_token";
const FOLDER = "upscaled";

/** Free canvas upscale + mild sharpen (no API key) */
async function upscaleCanvas(source, scale) {
  const img = await createImageBitmap(source);
  const w = img.width;
  const h = img.height;
  const tw = Math.min(w * scale, 4096);
  const th = Math.min(h * scale, 4096);
  const s = Math.min(tw / w, th / h);
  const outW = Math.round(w * s);
  const outH = Math.round(h * s);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, outW, outH);

  try {
    const id = ctx.getImageData(0, 0, outW, outH);
    const d = id.data;
    const copy = new Uint8ClampedArray(d);
    const amount = 0.35;
    const radius = 1;
    for (let y = radius; y < outH - radius; y++) {
      for (let x = radius; x < outW - radius; x++) {
        const i = (y * outW + x) * 4;
        for (let c = 0; c < 3; c++) {
          let blur = 0;
          let n = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              blur += copy[((y + dy) * outW + (x + dx)) * 4 + c];
              n++;
            }
          }
          blur /= n;
          const v = copy[i + c] + amount * (copy[i + c] - blur);
          d[i + c] = Math.max(0, Math.min(255, v));
        }
      }
    }
    ctx.putImageData(id, 0, 0);
  } catch (_) {}

  img.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export failed"))),
      "image/png",
      1
    );
  });
}

/** Try AI model from CDN; fall back to canvas */
async function upscaleSmart(fileOrBlob, scale, onStatus) {
  try {
    onStatus?.("Loading free AI model…");
    const upscalerMod = await import(
      /* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/upscaler@0.12.1/+esm"
    );
    const Upscaler = upscalerMod.default || upscalerMod.Upscaler || upscalerMod;
    const modelMod = await import(
      /* webpackIgnore: true */
      scale >= 4
        ? "https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@0.12.0/models/x4/esm/index.js"
        : "https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@0.12.0/models/x2/esm/index.js"
    );
    const model = modelMod.default || modelMod;
    onStatus?.("AI upscaling in browser…");
    const upscaler = new Upscaler({ model });
    const url = URL.createObjectURL(fileOrBlob);
    try {
      const out = await upscaler.upscale(url, { output: "blob", patchSize: 64, padding: 2 });
      URL.revokeObjectURL(url);
      if (out instanceof Blob) return out;
      if (out && typeof out.toBlob === "function") {
        return await new Promise((res) => out.toBlob(res, "image/png"));
      }
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  } catch (e) {
    console.warn("AI model fallback to HQ canvas", e);
    onStatus?.("HQ canvas upscale (free)…");
    return upscaleCanvas(fileOrBlob, scale);
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
  const [savedUrl, setSavedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const autoStarted = useRef(false);

  const saveBlob = async (blob, name) => {
    const token = localStorage.getItem(TK) || "";
    if (!token) {
      setStatus("Done — sign in to auto-save");
      return null;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], name, { type: "image/png" }));
      fd.append("album", FOLDER);
      fd.append("expiry", "never");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-auth-token": token },
        body: fd,
      });
      if (res.status === 401) {
        localStorage.removeItem(TK);
        setStatus("Done — sign in to save");
        return null;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Save failed");
      }
      const d = await res.json();
      setSavedUrl(d.url);
      setStatus(`Auto-saved in folder “${FOLDER}”`);
      return d.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const process = useCallback(
    async (file) => {
      setError("");
      setResult(null);
      setResultBlob(null);
      setSavedUrl("");
      setBusy(true);
      setStatus("Starting…");
      setOriginal(URL.createObjectURL(file));

      const token = localStorage.getItem(TK) || "";
      if (!token) {
        window.location.href = "/login?next=/tools/upscale";
        return;
      }

      try {
        const blob = await upscaleSmart(file, scale, setStatus);
        setResultBlob(blob);
        setResult(URL.createObjectURL(blob));
        const name = file.name.replace(/\.[^.]+$/, "") + `-x${scale}.png`;
        setStatus("Saving to library…");
        await saveBlob(blob, name);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Upscale failed");
        setStatus("");
      } finally {
        setBusy(false);
      }
    },
    [scale]
  );

  const processFromUrl = useCallback(
    async (imageUrl) => {
      setBusy(true);
      setStatus("Loading image…");
      setError("");
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error("Could not load image");
        const blob = await res.blob();
        let name =
          decodeURIComponent(imageUrl.split("/").pop()?.split("?")[0] || "image.jpg") ||
          "image.jpg";
        name = name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const file = new File([blob], name, { type: blob.type || "image/jpeg" });
        await process(file);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
        setStatus("");
        setBusy(false);
      }
    },
    [process]
  );

  useEffect(() => {
    if (autoStarted.current) return;
    const u = searchParams.get("url");
    if (!u) return;
    autoStarted.current = true;
    processFromUrl(u);
  }, [searchParams, processFromUrl]);

  const onFile = (list) => {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Only images");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("Max 20 MB");
      return;
    }
    process(f);
  };

  const clear = () => {
    setResult(null);
    setResultBlob(null);
    setOriginal(null);
    setSavedUrl("");
    setStatus("");
    setError("");
    autoStarted.current = false;
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `upscaled-x${scale}.png`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white"
            >
              MH
            </Link>
            <span className="text-sm font-semibold">Free AI Upscale</span>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/tools/remove-bg" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">
              Remove BG
            </Link>
            <Link href="/library" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">
              Library
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <p className="text-sm text-slate-500">
          <strong>100% free</strong> — runs in your browser, no API key. Result auto-saves to folder{" "}
          <code className="rounded bg-slate-200 px-1 text-xs">{FOLDER}</code>.
        </p>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-600">Scale</span>
          {[2, 4].map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => setScale(s)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                scale === s ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-700"
              }`}
            >
              {s}×
            </button>
          ))}
          <span className="text-[11px] text-slate-400">Larger scale = slower on phone</span>
        </div>

        {!result && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files);
            }}
            className="relative rounded-2xl border-2 border-dashed border-slate-200 bg-white py-14 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="absolute inset-0 cursor-pointer opacity-0"
              disabled={busy}
              onChange={(e) => onFile(e.target.files)}
            />
            <p className="text-sm font-semibold text-slate-800">
              {busy ? status || "Working…" : "Drop image or click · free · max 20 MB"}
            </p>
            {busy && status && <p className="mt-2 text-xs text-slate-400">{status}</p>}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {(original || result) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {original && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-medium text-slate-500">Original</p>
                <img src={original} alt="Original" className="mx-auto max-h-64 rounded-lg object-contain" />
              </div>
            )}
            {result && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-medium text-slate-500">Upscaled {scale}×</p>
                <img src={result} alt="Upscaled" className="mx-auto max-h-64 rounded-lg object-contain" />
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={download}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              Download PNG
            </button>
            {savedUrl && (
              <a
                href={savedUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Open saved
              </a>
            )}
            <Link href="/library" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium">
              Library → {FOLDER}
            </Link>
            <button type="button" onClick={clear} className="rounded-lg border border-red-100 px-4 py-2.5 text-sm text-red-600">
              Clear
            </button>
          </div>
        )}

        {(savedUrl || saving) && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {saving && !savedUrl ? (
              <p className="font-medium">Saving to {FOLDER}…</p>
            ) : (
              <>
                <p className="font-medium">Saved in folder: {FOLDER}</p>
                {savedUrl && <p className="mt-1 break-all font-mono text-xs">{savedUrl}</p>}
              </>
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
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading…</div>
      }
    >
      <UpscaleInner />
    </Suspense>
  );
}
