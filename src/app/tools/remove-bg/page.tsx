"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

/** High-quality BG removal in browser — image stays local, PNG output */
export default function RemoveBgPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [fileName, setFileName] = useState("image-no-bg.png");

  const process = useCallback(async (file: File) => {
    setError("");
    setResult(null);
    setBusy(true);
    setStatus("Loading AI model (first time may take ~20s)…");
    setFileName(file.name.replace(/\.[^.]+$/, "") + "-nobg.png");

    const url = URL.createObjectURL(file);
    setOriginal(url);

    try {
      const { removeBackground } = await import("@imgly/background-removal");
      setStatus("Removing background (high quality)…");
      const blob = await removeBackground(file, {
        model: "isnet",
        output: {
          format: "image/png",
          quality: 1,
          type: "foreground",
        },
      });
      const out = URL.createObjectURL(blob);
      setResult(out);
      setStatus("Done — download PNG (transparent background)");
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Background removal failed. Try a clearer photo (JPG/PNG)."
      );
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, []);

  const onFile = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Only images (JPG, PNG, WebP)");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError("Max 25 MB");
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
            <span className="text-sm font-semibold">Remove background</span>
          </div>
          <Link href="/library" className="text-sm text-slate-600 hover:underline">
            Library
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">High-quality background removal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Runs in your browser — image is not uploaded to our server. Output is PNG with transparency.
            Subject stays sharp (no heavy compression).
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
          <p className="mt-1 text-xs text-slate-400">JPG / PNG / WebP · up to 25 MB</p>
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
                <p className="mb-2 text-xs font-medium text-slate-500">No background (PNG)</p>
                <img src={result} alt="No background" className="mx-auto max-h-80 object-contain" />
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
