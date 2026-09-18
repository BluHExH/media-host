"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Hero3D from "@/components/Hero3D";

type Uploaded = { url: string; name: string; contentType: string; size: number };
const TK = "media_host_token";

const FEATURES = [
  { icon: "🔒", t: "Private by default", d: "Every upload is tied to your account. Others cannot browse your library." },
  { icon: "📁", t: "Folders & expiry", d: "Organize into albums and choose how long each file stays live on the CDN." },
  { icon: "⚡", t: "CDN-ready URLs", d: "One-click copy links for sites, Discord, embeds — parallel uploads keep quality." },
  { icon: "✂️", t: "Remove background", d: "Built-in high-quality BG removal in the browser. Image never leaves your device." },
  { icon: "🎬", t: "Images, video, audio", d: "Host media and HTML pages with correct MIME types and live HTML preview." },
  { icon: "🛡️", t: "Account security", d: "Login required for uploads. User isolation so one account never sees another’s files." },
];

export default function HomePage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [items, setItems] = useState<Uploaded[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem(TK));
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll(".mh-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-visible");
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const headers = useCallback(() => {
    const h: Record<string, string> = {};
    if (typeof window === "undefined") return h;
    const t = localStorage.getItem(TK) || "";
    if (t) h["x-auth-token"] = t;
    return h;
  }, []);

  const requireLogin = () => {
    window.location.href = "/login?tab=register&next=/library";
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const t = typeof window !== "undefined" ? localStorage.getItem(TK) || "" : "";
    if (!t) {
      requireLogin();
      return;
    }
    setError("");
    setUploading(true);
    const arr = Array.from(list);
    const next: Uploaded[] = [];
    let done = 0;
    const concurrency = Math.min(6, arr.length);
    let index = 0;
    let aborted = false;
    const worker = async () => {
      while (index < arr.length && !aborted) {
        const i = index++;
        const file = arr[i];
        const fd = new FormData();
        fd.append("file", file);
        fd.append("album", "general");
        fd.append("expiry", "never");
        try {
          const res = await fetch("/api/upload", { method: "POST", headers: headers(), body: fd });
          if (res.status === 401) {
            aborted = true;
            localStorage.removeItem(TK);
            requireLogin();
            return;
          }
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            setError(d.error || "Failed: " + file.name);
          } else {
            const d = await res.json();
            next.push({
              url: d.url,
              name: file.name,
              contentType: d.contentType || file.type,
              size: d.size || file.size,
            });
          }
        } catch {
          setError("Network error: " + file.name);
        }
        done++;
        setProgress({ done, total: arr.length });
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
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
      <div className="mh-orbs" aria-hidden>
        <div className="mh-orb mh-orb-1" />
        <div className="mh-orb mh-orb-2" />
        <div className="mh-orb mh-orb-3" />
      </div>

      <header className="mh-nav-glass sticky top-0 z-40">
        <div className="mh-container flex h-16 items-center justify-between">
          <Link href="/" className="relative z-10 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-xs font-bold text-white shadow-lg shadow-blue-500/30">MH</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-white">Media Host</p>
              <p className="hidden text-[11px] text-zinc-500 sm:block">Private CDN library</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link href="/tools/remove-bg" className="rounded-lg px-3 py-2 text-sm font-medium text-blue-400 hover:bg-white/5">Remove BG</Link>
            <Link href="/gallery" className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200">Gallery</Link>
            <Link href="/library" className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200">Library</Link>
            {loggedIn ? (
              <Link href="/library" className="mh-btn mh-btn-primary ml-1 px-4 py-2">Open library</Link>
            ) : (
              <>
                <Link href="/login" className="mh-btn mh-btn-secondary ml-1 px-3.5 py-2">Sign in</Link>
                <Link href="/login?tab=register" className="mh-btn mh-btn-primary px-4 py-2">Get started</Link>
              </>
            )}
          </nav>

          <button type="button" className="relative z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-300 md:hidden" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <span className="text-lg">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-black/90 px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              <Link href="/tools/remove-bg" className="rounded-lg px-3 py-2.5 text-sm text-blue-400" onClick={() => setMenuOpen(false)}>Remove BG</Link>
              <Link href="/gallery" className="rounded-lg px-3 py-2.5 text-sm text-zinc-300" onClick={() => setMenuOpen(false)}>Gallery</Link>
              <Link href="/library" className="rounded-lg px-3 py-2.5 text-sm text-zinc-300" onClick={() => setMenuOpen(false)}>Library</Link>
              {loggedIn ? (
                <Link href="/library" className="mh-btn mh-btn-primary mt-2 py-2.5" onClick={() => setMenuOpen(false)}>Open library</Link>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Link href="/login" className="mh-btn mh-btn-secondary flex-1 py-2.5" onClick={() => setMenuOpen(false)}>Sign in</Link>
                  <Link href="/login?tab=register" className="mh-btn mh-btn-primary flex-1 py-2.5" onClick={() => setMenuOpen(false)}>Register</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10">
        <section className="mh-section mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mh-fade-up text-center">
            <span className="mh-badge">Account required · Secure uploads</span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
              Your media,
              <span className="mh-gradient-text mt-1 block">floating on the edge</span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base text-zinc-400 sm:text-lg">
              Sign in, drop files, get instant CDN links. Folders, expiry, and a private library — no guest uploads.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {loggedIn ? (
                <Link href="/library" className="mh-btn mh-btn-primary px-6 py-3 text-sm">Go to library</Link>
              ) : (
                <Link href="/login?tab=register" className="mh-btn mh-btn-primary px-6 py-3 text-sm">Get started free</Link>
              )}
              <Link href="/tools/remove-bg" className="mh-btn mh-btn-secondary px-6 py-3 text-sm">Remove background</Link>
            </div>
          </div>

          <Hero3D />

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files); }}
            className={`mh-fade-up relative mt-8 overflow-hidden rounded-3xl border-2 border-dashed transition-all ${dragOver ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20" : "border-white/10 bg-white/[0.03]"}`}
          >
            {loggedIn ? (
              <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple onChange={(e) => onPick(e.target.files)} className="absolute inset-0 z-10 cursor-pointer opacity-0" disabled={uploading} />
            ) : (
              <button type="button" onClick={requireLogin} className="absolute inset-0 z-10 cursor-pointer" aria-label="Sign in to upload" />
            )}
            <div className="pointer-events-none px-6 py-14 text-center">
              {!loggedIn && (
                <div className="mb-3 flex justify-center">
                  <span className="mh-lock-badge">🔒 Sign in required to upload</span>
                </div>
              )}
              <p className="text-lg font-semibold text-white">
                {uploading ? `Uploading ${progress.done}/${progress.total}…` : loggedIn ? "Drop files here" : "Create an account to upload"}
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                {loggedIn ? "Image · Video · Audio · HTML · parallel · original quality" : "Free register · your files stay private"}
              </p>
            </div>
          </div>

          {error && <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

          {items.length > 0 && (
            <div className="mt-10 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-200">Your links</h2>
              {items.map((item) => (
                <div key={item.url} className="mh-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <div className="mh-img-blur h-16 w-full shrink-0 overflow-hidden rounded-xl sm:w-20">
                    {isImg(item.contentType) ? (
                      <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : isVid(item.contentType) ? (
                      <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-zinc-900 text-xs text-zinc-500">FILE</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{item.name}</p>
                    <p className="truncate font-mono text-xs text-zinc-500">{item.url}</p>
                  </div>
                  <button type="button" onClick={() => copy(item.url)} className="mh-btn mh-btn-primary px-4 py-2 text-xs">{copied === item.url ? "Copied!" : "Copy URL"}</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mh-section border-t border-white/5">
          <div className="mh-container">
            <div className="mh-reveal mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">
                Built for <span className="mh-gradient-text">creators & devs</span>
              </h2>
              <p className="mt-3 text-zinc-400">Everything you need to host and share media without a public free-for-all.</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((c) => (
                <div key={c.t} className="mh-card mh-reveal p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-lg">{c.icon}</div>
                  <h3 className="mt-4 text-sm font-semibold text-white">{c.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{c.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-black/40">
        <div className="mh-container py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-[10px] font-bold text-white">MH</div>
                <span className="text-sm font-semibold text-white">Media Host</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                Private CDN hosting for images, video, audio, and HTML — with tools that stay in your browser.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Product</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-400">
                <li><Link href="/library" className="hover:text-white">Library</Link></li>
                <li><Link href="/gallery" className="hover:text-white">Gallery</Link></li>
                <li><Link href="/tools/remove-bg" className="hover:text-white">Remove BG</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Account</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-400">
                <li><Link href="/login" className="hover:text-white">Sign in</Link></li>
                <li><Link href="/login?tab=register" className="hover:text-white">Register</Link></li>
                <li><Link href="/profile" className="hover:text-white">Profile</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Connect</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-400">
                <li><a href="https://github.com/BluHExH/media-host" target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a></li>
                <li><a href="https://vercel.com" target="_blank" rel="noreferrer" className="hover:text-white">Powered by Vercel</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-8 text-xs text-zinc-600 sm:flex-row">
            <p>© {new Date().getFullYear()} Media Host. Login required for all uploads.</p>
            <p className="text-zinc-600">Built for privacy-first media sharing</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
