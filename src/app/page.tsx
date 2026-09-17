"use client";
import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

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
      window.location.href = "/login?tab=register&next=/library";
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
        window.location.href = "/login?tab=register&next=/library";
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed: " + file.name);
        continue;
      }
      const d = await res.json();
      next.push({ url: d.url, name: file.name, contentType: d.contentType || file.type, size: d.size || file.size });
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
  const fmt = (b: number) => b < 1024 ? b + " B" : b < 1e6 ? (b / 1024).toFixed(1) + " KB" : (b / 1e6).toFixed(1) + " MB";
  const isImg = (t: string) => t.startsWith("image/");
  const isVid = (t: string) => t.startsWith("video/");

  return (
    <div className="mh-mesh min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-md shadow-blue-600/25">MH</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Media Host</p>
              <p className="hidden text-[11px] text-slate-400 sm:block">CDN media hosting</p>
            </div>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/gallery" className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 sm:inline">Gallery</Link>
            <Link href="/library" className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Library</Link>
            <ThemeToggle />
            <Link href="/login" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Sign in</Link>
            <Link href="/login?tab=register" className="mh-btn mh-btn-primary px-4 py-2">Get started</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-14 sm:px-6 sm:pt-20">
        <div className="mh-fade-up text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700">Free · Secure · Fast CDN</span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Host images &amp; video
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">in seconds</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-slate-500 sm:text-lg">Private library, folders, expiry links, and instant public URLs.</p>
        </div>
        <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
          className={`mh-fade-up relative mt-12 overflow-hidden rounded-3xl border-2 border-dashed transition-all ${dragOver ? "border-blue-500 bg-blue-50/80" : "border-slate-200 bg-white shadow-[var(--mh-shadow-lg)]"}`}>
          <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple onChange={(e) => upload(e.target.files)} className="absolute inset-0 z-10 cursor-pointer opacity-0" disabled={uploading} />
          <div className="pointer-events-none px-6 py-16 text-center">
            <p className="text-lg font-semibold text-slate-900">{uploading ? `Uploading ${progress.done + 1}/${progress.total}…` : "Drop files here"}</p>
            <p className="mt-2 text-sm text-slate-500">or click · max 100 MB · account required</p>
          </div>
        </div>
        {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {items.length > 0 && (
          <div className="mt-10 space-y-3">
            {items.map((item) => (
              <div key={item.url} className="mh-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="h-16 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-20">
                  {isImg(item.contentType) ? <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : isVid(item.contentType) ? <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">FILE</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate font-mono text-xs text-slate-400">{item.url}</p>
                </div>
                <button type="button" onClick={() => copy(item.url)} className="mh-btn mh-btn-primary px-4 py-2 text-xs">{copied === item.url ? "Copied!" : "Copy URL"}</button>
              </div>
            ))}
          </div>
        )}
        <div className="mh-stagger mt-20 grid gap-5 sm:grid-cols-3">
          {["Create account", "Upload & organize", "Share the link"].map((t, i) => (
            <div key={t} className="mh-card p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{i + 1}</div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{t}</h3>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t border-slate-200/80 py-10 text-center text-xs text-slate-400">Media Host</footer>
    </div>
  );
}
