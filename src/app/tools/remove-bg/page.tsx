// @ts-nocheck
"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

/** Official model host for @imgly/background-removal@1.6.0 */
const PUBLIC_PATH =
  "https://staticimgly.com/@imgly/background-removal-data/1.6.0/dist/";

async function loadRemoveBg() {
  const url = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm";
  const mod = await import(/* webpackIgnore: true */ url);
  const fn = mod.removeBackground || mod.default?.removeBackground || mod.default;
  if (typeof fn !== "function") throw new Error("Library failed to load");
  return fn;
}

export default function RemoveBgPage() {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [original, setOriginal] = useState(null);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("image-nobg.png");
  const [progress, setProgress] = useState("");

  const process = useCallback(async (file) => {
    setError("");
    setResult(null);
    setBusy(true);
    setProgress("");
    setStatus("Loading AI model (first time may take 20–40s)…");
    setFileName(file.name.replace(/\.[^.]+$/, "") + "-nobg.png");
    setOriginal(URL.createObjectURL(file));

    try {
      const removeBackground = await loadRemoveBg();
      setStatus("Downloading model / removing background…");
      const blob = await removeBackground(file, {
        publicPath: PUBLIC_PATH,
        model: "isnet_fp16",
        output: { format: "image/png", quality: 1 },
        progress: (key, current, total) => {
          if (total > 0) {
            const pct = Math.round((current / total) * 100);
            setProgress(`${key}: ${pct}%`);
          }
        },
      });
      setResult(URL.createObjectURL(blob));
      setStatus("Done — download PNG");
      setProgress("");
    } catch (e) {
      console.error(e);
      // Retry with default model name
      try {
        setStatus("Retrying with default model…");
        const removeBackground = await loadRemoveBg();
        const blob = await removeBackground(file, {
          publicPath: PUBLIC_PATH,
          progress: (key, current, total) => {
            if (total > 0) {
              setProgress(`${key}: ${Math.round((current / total) * 100)}%`);
            }
          },
        });
        setResult(URL.createObjectURL(blob));
        setStatus("Done — download PNG");
        setError("");
        setProgress("");
      } catch (e2) {
        setError(
          e2 instanceof Error
            ? e2.message
            : "Failed. Use Chrome/Edge, clear photo, wait for model download."
        );
        setStatus("");
        setProgress("");
      }
    } finally {
      setBusy(false);
    }
  }, []);

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

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = fileName;
    a.click();
  };

  return (
    <div className="mh-mesh min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white"
            >
              MH
            </Link>
            <span className="text-sm font-semibold">Remove BG</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/library" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">
              Library
            </Link>
            <Link href="/gallery" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">
              Gallery
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Remove background</h1>
          <p className="mt-1 text-sm text-slate-500">
            High quality · runs in your browser · PNG transparency · image stays on your device
          </p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files);
          }}
          className="relative rounded-2xl border-2 border-dashed border-slate-200 bg-white py-14 text-center transition hover:border-blue-300"
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={busy}
            onChange={(e) => onFile(e.target.files)}
          />
          <p className="text-sm font-semibold text-slate-800">
            {busy ? status || "Working…" : "Drop image or click to choose"}
          </p>
          <p className="mt-1 text-xs text-slate-400">JPG / PNG / WebP · max 20 MB</p>
          {progress && <p className="mt-2 text-xs text-blue-600">{progress}</p>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {status && !error && <p className="text-sm text-blue-600">{status}</p>}

        {(original || result) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {original && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-medium text-slate-500">Original</p>
                <img src={original} alt="Original" className="mx-auto max-h-80 object-contain" />
              </div>
            )}
            {result && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-3">
                <p className="mb-2 text-xs font-medium text-slate-500">No background</p>
                <img src={result} alt="Result" className="mx-auto max-h-80 object-contain" />
                <button
                  type="button"
                  onClick={download}
                  className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
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
