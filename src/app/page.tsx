"use client";
import { useState, useRef, useCallback } from "react";
import Link from "next/link";

type Uploaded = { url: string; name: string; contentType: string; size: number };
const TK = "media_host_token";

export default function HomePage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [items, setItems] = useState<Uploaded[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const headers = useCallback(() => {
    const h: Record<string, string> = {};
    if (typeof window === "undefined") return h;
    const t = localStorage.getItem(TK) || "";
    if (t) h["x-auth-token"] = t;
    return h;
  }, []);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const t = typeof window !== "undefined" ? localStorage.getItem(TK) || "" : "";
    if (!t) {
      setError("Sign in required to upload. Create a free account first.");
      return;
    }
    setError("");
    setUploading(true);
    const arr = Array.from(list);
    const next: Uploaded[] = [];
    for (let i = 0; i < arr.length; i++) {
      setProgress({ done: i, total: arr.length });
      const file = arr[i];
      const fd = new FormData();
      fd.append("file", file);
      fd.append("album", "general");
      fd.append("expiry", "never");
      fd.append("public", "1");
      const res = await fetch("/api/upload", { method: "POST", headers: headers(), body: fd });
      if (res.status === 401) {
        setError("Sign in required to upload. Create a free account first.");
        setUploading(false);
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed: " + file.name);
        continue;
      }
      const d = await res.json();
      next.push({
        url: d.url,
        name: file.name,
        contentType: d.contentType || file.type,
        size: d.size || file.size,
      });
    }
    setItems((p) => [...next, ...p]);
    setUploading(false);
    setProgress({ done: 0, total: 0 });
    if (ref.current) ref.current.value = "";
  };

  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  const fmt = (b: number) =>
    b < 1024 ? b + " B" : b < 1e6 ? (b / 1024).toFixed(1) + " KB" : (b / 1e6).toFixed(1) + " MB";
  const isImg = (t: string) => t.startsWith("image/");
  const isVid = (t: string) => t.startsWith("video/");
  const isHtml = (t: string) => t.includes("html");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">MH</div>
            <span className="text-sm font-semibold">Media Host</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/gallery" className="text-sm text-slate-600">Gallery</Link>
            <Link href="/library" className="text-sm text-slate-600">Library</Link>
            <Link href="/login" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">Sign in</Link>
            <Link href="/login?tab=register" className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white">Create free account</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-12">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Free media hosting</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Host images &amp; video online</h1>
          <p className="mx-auto mt-3 max-w-lg text-slate-500">Create a free account to upload. Get a public link instantly.</p>
          <ul className="mt-5 flex flex-wrap justify-center gap-x-5 text-sm text-slate-600">
            <li>✓ Login required</li>
            <li>✓ Direct CDN links</li>
            <li>✓ Image · Video · Audio · HTML</li>
          </ul>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
          className={`relative mt-10 rounded-2xl border-2 border-dashed bg-white ${dragOver ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}
        >
          <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple onChange={(e) => upload(e.target.files)} className="absolute inset-0 z-10 cursor-pointer opacity-0" disabled={uploading} />
          <div className="pointer-events-none px-6 py-14 text-center">
            <p className="text-base font-semibold">{uploading ? `Uploading ${progress.done + 1}/${progress.total}…` : "Drop files here to upload"}</p>
            <p className="mt-1.5 text-sm text-slate-500">Sign in required · max 100 MB</p>
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}{" "}
            <Link href="/login?tab=register" className="font-medium underline">Create account</Link>
            {" · "}
            <Link href="/login" className="font-medium underline">Sign in</Link>
          </div>
        )}
        {items.length > 0 && (
          <div className="mt-8 space-y-3">
            <h2 className="text-sm font-semibold">Your links</h2>
            {items.map((item) => (
              <div key={item.url} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
                <div className="h-16 w-full shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:w-20">
                  {isImg(item.contentType) ? (
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  ) : isVid(item.contentType) ? (
                    <video src={item.url} className="h-full w-full object-cover" muted />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">{isHtml(item.contentType) ? "HTML" : "FILE"}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate font-mono text-xs text-slate-400">{item.url}</p>
                  <p className="text-[11px] text-slate-400">{fmt(item.size)}</p>
                </div>
                <button type="button" onClick={() => copy(item.url)} className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white">
                  {copied === item.url ? "Copied!" : "Copy URL"}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">1</div>
            <h3 className="mt-4 text-sm font-semibold">Register &amp; upload</h3>
            <p className="mt-2 text-sm text-slate-500">Create an account, then drop images, video, audio or HTML.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">2</div>
            <h3 className="mt-4 text-sm font-semibold">Copy the public URL</h3>
            <p className="mt-2 text-sm text-slate-500">Share or embed anywhere. Only you see your private library.</p>
          </div>
        </div>
      </main>
      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400">Media Host · Free media hosting</footer>
    </div>
  );
}
