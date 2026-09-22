"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Hero3D from "@/components/Hero3D";
import { uploadMediaFile } from "@/lib/client-upload";

type Uploaded = { url: string; name: string; contentType: string; size: number };
const TK = "media_host_token";

export default function HomePage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [items, setItems] = useState<Uploaded[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem(TK));
  }, []);

  const requireLogin = () => {
    window.location.href = "/login?tab=register&next=/library";
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    if (!localStorage.getItem(TK)) {
      requireLogin();
      return;
    }
    setError("");
    setUploading(true);
    const arr = Array.from(list);
    const next: Uploaded[] = [];
    let done = 0;
    let index = 0;
    let aborted = false;
    const worker = async () => {
      while (index < arr.length && !aborted) {
        const file = arr[index++];
        try {
          const d = await uploadMediaFile(file, { album: "general", expiry: "never" });
          next.push({
            url: d.url,
            name: file.name,
            contentType: d.contentType || file.type,
            size: d.size || file.size,
          });
        } catch (e: any) {
          const msg = e?.message || ("Failed: " + file.name);
          if (/login required/i.test(msg)) {
            aborted = true;
            localStorage.removeItem(TK);
            requireLogin();
            return;
          }
          setError(msg);
        }
        done++;
        setProgress({ done, total: arr.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, arr.length) }, () => worker()));
    setItems((p) => [...next, ...p]);
    setUploading(false);
    setProgress({ done: 0, total: 0 });
    if (ref.current) ref.current.value = "";
  };

  const onPick = (list: FileList | null) => {
    if (!loggedIn) {
      requireLogin();
      return;
    }
    upload(list);
  };

  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };
  const isImg = (t: string) => t.startsWith("image/");
  const isVid = (t: string) => t.startsWith("video/");

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #0F4C81, #3BACB6)", boxShadow: "0 8px 20px rgba(15,76,129,0.4)" }}>MH</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight" style={{ color: "#1A2B3C" }}>Media Host</p>
              <p className="hidden text-[11px] sm:block" style={{ color: "#5a6f82" }}>Private CDN library</p>
            </div>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/tools/remove-bg" className="rounded-full px-3 py-2 text-sm font-medium transition hover:bg-white/50" style={{ color: "#0F4C81" }}>Remove BG</Link>
            <Link href="/tools/upscale" className="rounded-full px-3 py-2 text-sm font-medium transition hover:bg-white/50" style={{ color: "#5b4bb4" }}>Upscale</Link>
            <Link href="/library" className="rounded-full px-3 py-2 text-sm transition hover:bg-white/50" style={{ color: "#5a6f82" }}>Library</Link>
            {loggedIn ? (
              <Link href="/library" className="mh-btn mh-btn-primary px-5 py-2.5">Open library</Link>
            ) : (
              <>
                <Link href="/login" className="mh-btn mh-btn-outline px-4 py-2 text-sm">Sign in</Link>
                <Link href="/login?tab=register" className="mh-btn mh-btn-primary px-5 py-2.5">Get started</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        <div className="mh-fade-up text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ border: "1px solid rgba(130,219,216,0.6)", background: "rgba(255,255,255,0.55)", backdropFilter: "blur(10px)", color: "#0F4C81" }}>
            Account required · Images &amp; HTML
          </span>
          <h1 className="mh-hero-title mt-5 text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: "#1A2B3C" }}>
            Your media,
            <span className="mh-gradient-text block">floating on the edge</span>
          </h1>
          <p className="mh-hero-sub mx-auto mt-4 max-w-lg text-base sm:text-lg" style={{ color: "#5a6f82" }}>
            Images and HTML. Video &amp; audio hosting under development.
          </p>
        </div>

        <Hero3D />

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files); }}
          className={"mh-fade-up mh-dropzone-glass relative mt-6 overflow-hidden " + (dragOver ? "is-active" : "")}
        >
          {loggedIn ? (
            <input ref={ref} type="file" accept="image/*,.html,.htm" multiple onChange={(e) => onPick(e.target.files)} className="absolute inset-0 z-10 cursor-pointer opacity-0" disabled={uploading} />
          ) : (
            <button type="button" onClick={requireLogin} className="absolute inset-0 z-10 cursor-pointer" aria-label="Sign in to upload" />
          )}
          <div className="pointer-events-none px-6 py-16 text-center">
            {!loggedIn && (
              <div className="mb-3 flex justify-center">
                <span className="mh-lock-badge">🔒 Sign in required to upload</span>
              </div>
            )}
            <p className="text-lg font-semibold" style={{ color: "#1A2B3C" }}>
              {uploading ? ("Uploading " + progress.done + "/" + progress.total + "…") : loggedIn ? "Drop files here" : "Create an account to upload"}
            </p>
            <p className="mt-2 text-sm" style={{ color: "#5a6f82" }}>
              {loggedIn ? "Images & HTML · video/audio under development" : "Free register · your files stay private"}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-sm text-red-700 backdrop-blur-md">{error}</div>
        )}

        {items.length > 0 && (
          <div className="mt-10 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Your links</h2>
            {items.map((item) => (
              <div key={item.url} className="mh-glass-strong flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="h-16 w-full shrink-0 overflow-hidden rounded-xl bg-white/50 sm:w-20">
                  {isImg(item.contentType) ? (
                    <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : isVid(item.contentType) ? (
                    <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">FILE</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate font-mono text-xs" style={{ color: "#5a6f82" }}>{item.url}</p>
                </div>
                <button type="button" onClick={() => copy(item.url)} className="mh-btn mh-btn-primary px-4 py-2 text-xs">
                  {copied === item.url ? "Copied!" : "Copy URL"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mh-grid-features mt-16">
          {[
            { t: "Private by default", d: "Every upload is tied to your account. Others cannot see your library." },
            { t: "Folders & expiry", d: "Organize into folders and choose how long each file stays live." },
            { t: "CDN-ready URLs", d: "One click copy — paste into sites, Discord, or embeds." },
          ].map((c, i) => (
            <div key={c.t} className="mh-card p-6">
              <div className="mh-num flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold">{i + 1}</div>
              <h3 className="mt-4 text-sm font-semibold" style={{ color: "#1A2B3C" }}>{c.t}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#5a6f82" }}>{c.d}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/40 py-10 text-center text-xs" style={{ color: "#5a6f82", background: "rgba(255,255,255,0.35)", backdropFilter: "blur(12px)" }}>
        Media Host · Login required · Video/audio under development
      </footer>
    </div>
  );
}
