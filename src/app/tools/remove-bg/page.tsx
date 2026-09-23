// @ts-nocheck
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authFetch, hasSession } from "@/lib/client-auth";

async function removeBackground(file, onProgress) {
  // CDN load — avoids Next build depending on @imgly/background-removal
  const mod = await import(
    /* webpackIgnore: true */
    "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm"
  );
  const removeBg = mod.removeBackground || mod.default;
  if (!removeBg) throw new Error("Background remover failed to load");
  const blob = await removeBg(file, {
    progress: (key, current, total) => {
      if (total) onProgress?.(Math.round((current / total) * 100));
    },
  });
  return blob;
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
  const [progress, setProgress] = useState(0);
  const [savedUrl, setSavedUrl] = useState("");

  const processFile = useCallback(async (file) => {
    if (!file) return;
    setError("");
    setStatus("Processing…");
    setBusy(true);
    setProgress(0);
    setSavedUrl("");
    setFileName((file.name || "image").replace(/\.[^.]+$/, "") + "-nobg.png");
    try {
      setOriginal(URL.createObjectURL(file));
      const blob = await removeBackground(file, setProgress);
      setResultBlob(blob);
      setResult(URL.createObjectURL(blob));
      setStatus("Done");

      if (hasSession()) {
        const fd = new FormData();
        fd.append("file", new File([blob], fileName || "nobg.png", { type: "image/png" }));
        fd.append("album", "nobg");
        fd.append("expiry", "never");
        const res = await authFetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) {
          setSavedUrl(data.url);
          setStatus("Saved to library folder: nobg");
        } else {
          setStatus("Processed — save failed (still can download)");
        }
      } else {
        setStatus("Processed — sign in to auto-save");
      }
    } catch (e) {
      setError(e?.message || "Remove BG failed");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [fileName]);

  useEffect(() => {
    const u = searchParams.get("url");
    if (!u) return;
    (async () => {
      try {
        const res = await fetch(u);
        const blob = await res.blob();
        const name = decodeURIComponent(u.split("/").pop() || "image.png");
        const file = new File([blob], name, { type: blob.type || "image/png" });
        await processFile(file);
      } catch (e) {
        setError("Could not load image from URL");
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
    a.download = fileName || "nobg.png";
    a.click();
  };

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>
            Media Host
          </Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/library" style={{ color: "#5a6f82" }}>
              Library
            </Link>
            <Link href="/tools/upscale" style={{ color: "#5b4bb4" }}>
              Upscale
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold" style={{ color: "#1A2B3C" }}>
          Remove background
        </h1>
        <p className="mt-2 text-sm" style={{ color: "#5a6f82" }}>
          Runs in your browser. After remove, PNG is auto-saved into folder <strong>nobg</strong> when signed in.
        </p>

        <div className="mh-dropzone-glass relative mt-6 py-12 text-center">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={busy}
            onChange={(e) => onPick(e.target.files)}
          />
          <p className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>
            {busy ? `Working… ${progress}%` : "Drop an image or click"}
          </p>
        </div>

        {status && <p className="mt-3 text-sm" style={{ color: "#0F4C81" }}>{status}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {savedUrl && (
          <p className="mt-2 break-all text-xs" style={{ color: "#5a6f82" }}>
            Saved:{" "}
            <a href={savedUrl} className="underline" target="_blank" rel="noreferrer">
              {savedUrl}
            </a>
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {original && (
            <div className="mh-glass p-3">
              <p className="mb-2 text-xs font-semibold">Original</p>
              <img src={original} alt="" className="max-h-64 w-full object-contain" />
            </div>
          )}
          {result && (
            <div className="mh-glass p-3">
              <p className="mb-2 text-xs font-semibold">No background</p>
              <img src={result} alt="" className="max-h-64 w-full object-contain" style={{ background: "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px" }} />
              <button type="button" onClick={download} className="mh-btn mh-btn-primary mt-3 px-4 py-2 text-xs">
                Download PNG
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function RemoveBgPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">Loading…</div>}>
      <RemoveBgInner />
    </Suspense>
  );
}
