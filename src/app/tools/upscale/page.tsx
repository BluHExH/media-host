// @ts-nocheck
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TK = "media_host_token";

function UpscaleInner() {
  const searchParams = useSearchParams();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [original, setOriginal] = useState(null);
  const [result, setResult] = useState(null);
  const [scale, setScale] = useState(2);
  const [setupHint, setSetupHint] = useState(false);
  const autoStarted = useRef(false);

  const run = useCallback(async ({ file, url }) => {
    setError("");
    setResult(null);
    setSetupHint(false);
    setBusy(true);
    setStatus("Upscaling (Real-ESRGAN)… 15–60s");

    const token = typeof window !== "undefined" ? localStorage.getItem(TK) || "" : "";
    if (!token) {
      window.location.href = "/login?next=/tools/upscale";
      return;
    }

    if (file) setOriginal(URL.createObjectURL(file));
    else if (url) setOriginal(url);

    try {
      const fd = new FormData();
      fd.append("scale", String(scale));
      if (file) fd.append("file", file);
      if (url) fd.append("url", url);

      const res = await fetch("/api/upscale", {
        method: "POST",
        headers: { "x-auth-token": token },
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem(TK);
        window.location.href = "/login?next=/tools/upscale";
        return;
      }
      if (res.status === 503 && d.setup) {
        setSetupHint(true);
        setError(d.error || "API token missing");
        setStatus("");
        return;
      }
      if (!res.ok) {
        setError(d.error || "Upscale failed");
        setStatus("");
        return;
      }
      setResult(d.url);
      setStatus("Saved to library folder upscaled");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [scale]);

  useEffect(() => {
    if (autoStarted.current) return;
    const u = searchParams.get("url");
    if (!u) return;
    autoStarted.current = true;
    run({ url: u });
  }, [searchParams, run]);

  const onFile = (list) => {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Only images");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError("Max 15 MB");
      return;
    }
    run({ file: f });
  };

  const clear = () => {
    setResult(null);
    setOriginal(null);
    setError("");
    setStatus("");
    setSetupHint(false);
    autoStarted.current = false;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
              MH
            </Link>
            <span className="text-sm font-semibold">AI Upscale</span>
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
          Real-ESRGAN via Replicate — result auto-saves to folder{" "}
          <code className="rounded bg-slate-200 px-1 text-xs">upscaled</code>.
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
              {busy ? status || "Working…" : "Drop image or click · max 15 MB"}
            </p>
            {busy && status && <p className="mt-2 text-xs text-slate-400">{status}</p>}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            {setupHint && (
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-red-800">
                <li>
                  Open{" "}
                  <a className="underline" href="https://replicate.com/account/api-tokens" target="_blank" rel="noreferrer">
                    replicate.com/account/api-tokens
                  </a>{" "}
                  → Create token
                </li>
                <li>Vercel → media-host → Settings → Environment Variables</li>
                <li>
                  Key: <code className="rounded bg-white px-1">REPLICATE_API_TOKEN</code> · Value: your token · Production + Preview
                </li>
                <li>Redeploy the project</li>
              </ol>
            )}
          </div>
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
            <a
              href={result}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open result
            </a>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(result);
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium"
            >
              Copy URL
            </button>
            <Link href="/library" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium">
              Library → upscaled
            </Link>
            <button type="button" onClick={clear} className="rounded-lg border border-red-100 px-4 py-2.5 text-sm text-red-600">
              Clear
            </button>
          </div>
        )}

        {result && status && <p className="text-sm text-emerald-700">{status}</p>}
      </main>
    </div>
  );
}

export default function UpscalePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading…</div>}>
      <UpscaleInner />
    </Suspense>
  );
}
