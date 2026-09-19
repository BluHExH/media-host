// @ts-nocheck
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authFetch, hasSession } from "@/lib/client-auth";

async function removeBackground(file, onProgress) {
  const mod = await import("@imgly/background-removal");
  const removeBg = mod.removeBackground || mod.default;
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
    const origUrl = URL.createObjectURL(file);
    setOriginal(origUrl);
    setResult(null);
    setResultBlob(null);
    try {
      const blob = await removeBackground(file, setProgress);
      const url = URL.createObjectURL(blob);
      setResult(url);
      setResultBlob(blob);
      setStatus("Done — saving to library…");
      if (hasSession()) {
        const fd = new FormData();
        fd.append("file", new File([blob], fileName, { type: "image/png" }));
        fd.append("album", "nobg");
        fd.append("expiry", "never");
        const res = await authFetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) {
          const d = await res.json();
          setSavedUrl(d.url || "");
          setStatus("Saved to folder: nobg");
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

  return (
    <div className="min-h-screen mh-mesh">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }}>
              MH
            </Link>
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Remove background</span>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/library" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#5a6f82" }}>Library</Link>
            <Link href="/tools/upscale" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#5b4bb4" }}>Upscale</Link>
            <Link href="/" className="rounded-full px-2.5 py-1 hover:bg-white/50" style={{ color: "#5a6f82" }}>Home</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <p className="text-sm" style={{ color: "#5a6f82" }}>
          After remove, PNG is <strong>auto-saved</strong> into library folder{" "}
          <code className="rounded bg-white/60 px-1 text-xs">nobg</code>. Delete anytime from Library.
        </p>

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
            {busy ? `Working… ${progress}%` : "Drop image or click to choose"}
          </p>
          <p className="mt-1 text-xs" style={{ color: "#5a6f82" }}>Runs in your browser · free</p>
        </div>

        {status && <p className="text-sm" style={{ color: "#0F4C81" }}>{status}</p>}
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
                <p className="mb-2 text-xs font-medium" style={{ color: "#5a6f82" }}>No background</p>
                <img src={result} alt="" className="w-full rounded-xl" style={{ background: "repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 50% / 16px 16px" }} />
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

export default function RemoveBgPage() {
  return (
    <Suspense fallback={<div className="mh-mesh flex min-h-screen items-center justify-center text-[#5a6f82]">Loading…</div>}>
      <RemoveBgInner />
    </Suspense>
  );
}
