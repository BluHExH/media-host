// @ts-nocheck
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PUBLIC_PATH =
  "https://staticimgly.com/@imgly/background-removal-data/1.6.0/dist/";
const TK = "media_host_token";

async function loadRemoveBg() {
  const url = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm";
  const mod = await import(/* webpackIgnore: true */ url);
  const fn = mod.removeBackground || mod.default?.removeBackground || mod.default;
  if (typeof fn !== "function") throw new Error("Library failed to load");
  return fn;
}

function RemoveBgInner() {
  const searchParams = useSearchParams();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [original, setOriginal] = useState(null);
  const [result, setResult] = useState(null);
  const [resultBlob, setResultBlob] = useState(null);
  const [fileName, setFileName] = useState("image-nobg.png");
  const [progress, setProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState("");
  const autoStarted = useRef(false);

  const process = useCallback(async (file) => {
    setError("");
    setResult(null);
    setResultBlob(null);
    setSavedUrl("");
    setBusy(true);
    setProgress("");
    setStatus("Loading AI model (first time may take 20–40s)…");
    setFileName(file.name.replace(/\.[^.]+$/, "") + "-nobg.png");
    setOriginal(URL.createObjectURL(file));

    try {
      const removeBackground = await loadRemoveBg();
      setStatus("Removing background…");
      const blob = await removeBackground(file, {
        publicPath: PUBLIC_PATH,
        model: "isnet_fp16",
        output: { format: "image/png", quality: 1 },
        progress: (key, current, total) => {
          if (total > 0) setProgress(`${key}: ${Math.round((current / total) * 100)}%`);
        },
      });
      setResultBlob(blob);
      setResult(URL.createObjectURL(blob));
      setStatus("Done — download or save to library");
      setProgress("");
    } catch (e) {
      console.error(e);
      try {
        setStatus("Retrying…");
        const removeBackground = await loadRemoveBg();
        const blob = await removeBackground(file, {
          publicPath: PUBLIC_PATH,
          progress: (key, current, total) => {
            if (total > 0) setProgress(`${key}: ${Math.round((current / total) * 100)}%`);
          },
        });
        setResultBlob(blob);
        setResult(URL.createObjectURL(blob));
        setStatus("Done — download or save to library");
        setError("");
        setProgress("");
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : "Failed. Use Chrome/Edge.");
        setStatus("");
        setProgress("");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const processFromUrl = useCallback(
    async (imageUrl) => {
      setError("");
      setBusy(true);
      setStatus("Loading your image from library…");
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error("Could not load image");
        const blob = await res.blob();
        let name = decodeURIComponent(imageUrl.split("/").pop()?.split("?")[0] || "image.jpg");
        name = name.replace(/[^a-zA-Z0-9._-]/g, "_") || "image.jpg";
        const file = new File([blob], name, { type: blob.type || "image/jpeg" });
        await process(file);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load image");
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
      setError("Only images (JPG, PNG, WebP)");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("Max 20 MB");
      return;
    }
    process(f);
  };

  const saveToLibrary = async () => {
    if (!resultBlob) return;
    const token = typeof window !== "undefined" ? localStorage.getItem(TK) || "" : "";
    if (!token) {
      window.location.href = "/login?next=/tools/remove-bg";
      return;
    }
    setSaving(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", new File([resultBlob], fileName, { type: "image/png" }));
      fd.append("album", "nobg");
      fd.append("expiry", "never");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-auth-token": token },
        body: fd,
      });
      if (res.status === 401) {
        localStorage.removeItem(TK);
        window.location.href = "/login?next=/tools/remove-bg";
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Save failed");
      }
      const d = await res.json();
      setSavedUrl(d.url);
      setStatus("Saved to library (folder: nobg)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const clearResult = () => {
    setResult(null);
    setResultBlob(null);
    setOriginal(null);
    setSavedUrl("");
    setStatus("");
    setError("");
    setFileName("image-nobg.png");
    autoStarted.current = false;
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = fileName;
    a.click();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
              MH
            </Link>
            <span className="text-sm font-semibold">Remove background</span>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/library" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">
              Library
            </Link>
            <Link href="/" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <p className="text-sm text-slate-500">
          From library: opens your image automatically. After remove, save stays in folder <strong>nobg</strong> — delete anytime from library.
        </p>

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
              {busy ? status || "Working…" : "Drop image or click to choose"}
            </p>
            {progress && <p className="mt-2 text-xs text-blue-600">{progress}</p>}
            {busy && !progress && status && <p className="mt-2 text-xs text-slate-400">{status}</p>}
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
                <p className="mb-2 text-xs font-medium text-slate-500">No background</p>
                <div className="rounded-lg bg-slate-100 p-2">
                  <img src={result} alt="No BG" className="mx-auto max-h-64 object-contain" />
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={download} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Download PNG
            </button>
            <button
              type="button"
              onClick={saveToLibrary}
              disabled={saving || !!savedUrl}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savedUrl ? "Saved ✓" : saving ? "Saving…" : "Save to library"}
            </button>
            <button type="button" onClick={clearResult} className="rounded-lg border border-red-100 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
              Clear
            </button>
          </div>
        )}

        {savedUrl && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">Saved in folder nobg — open library to delete later</p>
            <p className="mt-1 break-all font-mono text-xs">{savedUrl}</p>
            <Link href="/library" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
              Open library →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

export default function RemoveBgPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading…</div>}>
      <RemoveBgInner />
    </Suspense>
  );
}
