// @ts-nocheck
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TK = "media_host_token";

function EditInner() {
  const searchParams = useSearchParams();
  const [src, setSrc] = useState(null);
  const [out, setOut] = useState(null);
  const [outBlob, setOutBlob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [maxW, setMaxW] = useState(1280);
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(0.85);
  const fileRef = useRef(null);
  const imgRef = useRef(null);

  const loadFile = async (file) => {
    if (!file?.type.startsWith("image/")) {
      setError("Only images");
      return;
    }
    setError("");
    setOut(null);
    setOutBlob(null);
    setSavedUrl("");
    setSrc(URL.createObjectURL(file));
    imgRef.current = file;
  };

  useEffect(() => {
    const u = searchParams.get("url");
    if (!u) return;
    (async () => {
      try {
        const res = await fetch(u);
        const blob = await res.blob();
        const name = u.split("/").pop()?.split("?")[0] || "image.jpg";
        await loadFile(new File([blob], name, { type: blob.type || "image/jpeg" }));
      } catch {
        setError("Could not load image");
      }
    })();
  }, [searchParams]);

  const process = async () => {
    if (!imgRef.current && !src) return;
    setBusy(true);
    setStatus("Processing…");
    setError("");
    try {
      const file = imgRef.current;
      const bmp = await createImageBitmap(file || (await (await fetch(src)).blob()));
      let w = bmp.width;
      let h = bmp.height;
      if (w > maxW) {
        const s = maxW / w;
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      const blob = await new Promise((res) => canvas.toBlob((b) => res(b), format, quality));
      if (!blob) throw new Error("Export failed");
      setOutBlob(blob);
      setOut(URL.createObjectURL(blob));
      setStatus("Done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!outBlob) return;
    const token = localStorage.getItem(TK) || "";
    if (!token) {
      window.location.href = "/login?next=/tools/edit";
      return;
    }
    setBusy(true);
    try {
      const ext = format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg";
      const fd = new FormData();
      fd.append("file", new File([outBlob], `edited.${ext}`, { type: format }));
      fd.append("album", "edited");
      fd.append("expiry", "never");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-auth-token": token },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Save failed");
      }
      const d = await res.json();
      setSavedUrl(d.url);
      setStatus("Saved to folder edited");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">MH</Link>
            <span className="text-sm font-semibold">Resize / Convert</span>
          </div>
          <Link href="/library" className="text-sm text-slate-600">Library</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <p className="text-sm text-slate-500">Free browser resize + JPEG / PNG / WebP. Saves to folder <code className="rounded bg-slate-200 px-1 text-xs">edited</code>.</p>
        <div className="relative rounded-2xl border-2 border-dashed border-slate-200 bg-white py-12 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]); }}>
          <input ref={fileRef} type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => loadFile(e.target.files?.[0])} />
          <p className="text-sm font-semibold">{src ? "Image loaded — adjust below" : "Drop image or click"}</p>
        </div>
        {src && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs text-slate-500">Original</p>
              <img src={src} alt="" className="mx-auto max-h-48 object-contain" />
            </div>
            {out && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs text-slate-500">Result</p>
                <img src={out} alt="" className="mx-auto max-h-48 object-contain" />
              </div>
            )}
          </div>
        )}
        {src && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <label className="block text-xs font-medium text-slate-600">Max width: {maxW}px
              <input type="range" min={320} max={2560} step={80} value={maxW} onChange={(e) => setMaxW(+e.target.value)} className="mt-1 w-full" />
            </label>
            <label className="block text-xs font-medium text-slate-600">Format
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm">
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
            {format !== "image/png" && (
              <label className="block text-xs font-medium text-slate-600">Quality: {Math.round(quality * 100)}%
                <input type="range" min={0.5} max={1} step={0.05} value={quality} onChange={(e) => setQuality(+e.target.value)} className="mt-1 w-full" />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={process} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : "Process"}</button>
              {outBlob && (
                <button type="button" disabled={busy} onClick={save} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium">Save to library</button>
              )}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {status && <p className="text-sm text-emerald-700">{status}</p>}
        {savedUrl && <p className="break-all font-mono text-xs text-slate-500">{savedUrl}</p>}
      </main>
    </div>
  );
}

export default function EditPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>}>
      <EditInner />
    </Suspense>
  );
}
