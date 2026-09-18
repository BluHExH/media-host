"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Hero3D from "@/components/Hero3D";

type Uploaded = { url: string; name: string; contentType: string; size: number };
const TK = "media_host_token";

const FEATURES = [
  { t: "Private by default", d: "Every upload is tied to your account. Others cannot browse your library." },
  { t: "Folders & expiry", d: "Organize into albums and choose how long each file stays live on the CDN." },
  { t: "CDN-ready URLs", d: "One-click copy for sites, Discord, and embeds — parallel upload, original quality." },
  { t: "Remove background", d: "High-quality BG removal in the browser. Your image never leaves the device." },
  { t: "Images, video, audio", d: "Correct MIME types, live HTML preview, and multi-select bulk tools." },
  { t: "Account isolation", d: "Login required for uploads. One user never sees another user’s files." },
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
    const els = document.querySelectorAll(".pro-reveal");
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#0a0a0a]">
      <div className="pro-orbs" aria-hidden>
        <div className="pro-orb pro-orb-1" />
        <div className="pro-orb pro-orb-2" />
      </div>

      <header className="pro-nav">
        <div className="pro-container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] font-semibold tracking-wider text-white">MH</div>
            <span className="text-sm font-medium text-white">Media Host</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link href="/tools/remove-bg" className="rounded-lg px-3 py-2 text-sm text-neutral-400 transition hover:text-white">Remove BG</Link>
            <Link href="/gallery" className="rounded-lg px-3 py-2 text-sm text-neutral-400 transition hover:text-white">Gallery</Link>
            <Link href="/library" className="rounded-lg px-3 py-2 text-sm text-neutral-400 transition hover:text-white">Library</Link>
            {loggedIn ? (
              <Link href="/library" className="pro-btn pro-btn-primary ml-2 px-5 py-2">Open library</Link>
            ) : (
              <>
                <Link href="/login" className="pro-btn pro-btn-secondary ml-2 px-4 py-2">Sign in</Link>
                <Link href="/login?tab=register" className="pro-btn pro-btn-primary px-5 py-2">Get started</Link>
              </>
            )}
          </nav>

          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 text-neutral-300 md:hidden" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/5 bg-[#0a0a0a]/95 px-6 py-4 backdrop-blur-md md:hidden">
            <div className="flex flex-col gap-1">
              <Link href="/tools/remove-bg" className="py-2.5 text-sm text-neutral-300" onClick={() => setMenuOpen(false)}>Remove BG</Link>
              <Link href="/gallery" className="py-2.5 text-sm text-neutral-300" onClick={() => setMenuOpen(false)}>Gallery</Link>
              <Link href="/library" className="py-2.5 text-sm text-neutral-300" onClick={() => setMenuOpen(false)}>Library</Link>
              <div className="mt-3 flex gap-2">
                {loggedIn ? (
                  <Link href="/library" className="pro-btn pro-btn-primary flex-1 py-2.5" onClick={() => setMenuOpen(false)}>Open library</Link>
                ) : (
                  <>
                    <Link href="/login" className="pro-btn pro-btn-secondary flex-1 py-2.5" onClick={() => setMenuOpen(false)}>Sign in</Link>
                    <Link href="/login?tab=register" className="pro-btn pro-btn-primary flex-1 py-2.5" onClick={() => setMenuOpen(false)}>Register</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10 pt-16">
        <section className="pro-section">
          <div className="pro-container max-w-3xl text-center">
            <div className="pro-fade-up">
              <span className="pro-badge">Account required · Secure uploads</span>
              <h1 className="pro-display mt-8 text-5xl text-white md:text-7xl lg:text-[5.5rem]">
                Your media, <span className="pro-gradient-text">on the edge</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base font-light leading-relaxed text-neutral-400 md:text-lg">
                Sign in, drop files, get instant CDN links. Folders, expiry, background removal — no guest uploads.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                {loggedIn ? (
                  <Link href="/library" className="pro-btn pro-btn-primary px-7 py-3">Go to library</Link>
                ) : (
                  <Link href="/login?tab=register" className="pro-btn pro-btn-primary px-7 py-3">Get started free</Link>
                )}
                <Link href="/tools/remove-bg" className="pro-btn pro-btn-secondary px-7 py-3">Remove background</Link>
              </div>
            </div>

            <Hero3D />

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files); }}
              className={`pro-fade-up relative mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-dashed transition-all ${dragOver ? "border-white/40 bg-white/5" : "border-white/10 bg-white/[0.02]"}`}
            >
              {loggedIn ? (
                <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple onChange={(e) => onPick(e.target.files)} className="absolute inset-0 z-10 cursor-pointer opacity-0" disabled={uploading} />
              ) : (
                <button type="button" onClick={requireLogin} className="absolute inset-0 z-10 cursor-pointer" aria-label="Sign in to upload" />
              )}
              <div className="pointer-events-none px-6 py-14 text-center">
                {!loggedIn && (
                  <div className="mb-3 flex justify-center">
                    <span className="mh-lock-badge">Sign in required to upload</span>
                  </div>
                )}
                <p className="text-base font-medium text-white">
                  {uploading ? `Uploading ${progress.done}/${progress.total}…` : loggedIn ? "Drop files here" : "Create an account to upload"}
                </p>
                <p className="mt-2 text-sm font-light text-neutral-500">
                  {loggedIn ? "Image · Video · Audio · HTML · parallel · original quality" : "Free register · private by default"}
                </p>
              </div>
            </div>

            {error && (
              <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
            )}

            {items.length > 0 && (
              <div className="mx-auto mt-10 max-w-2xl space-y-3 text-left">
                <h2 className="text-sm font-medium text-neutral-300">Your links</h2>
                {items.map((item) => (
                  <div key={item.url} className="pro-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="h-14 w-full shrink-0 overflow-hidden rounded-lg bg-neutral-900 sm:w-16">
                      {isImg(item.contentType) ? (
                        <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : isVid(item.contentType) ? (
                        <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wider text-neutral-600">File</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-100">{item.name}</p>
                      <p className="truncate font-mono text-xs text-neutral-600">{item.url}</p>
                    </div>
                    <button type="button" onClick={() => copy(item.url)} className="pro-btn pro-btn-primary px-4 py-2 text-xs">
                      {copied === item.url ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="pro-section border-t border-white/5">
          <div className="pro-container">
            <div className="pro-reveal mx-auto max-w-2xl text-center">
              <h2 className="pro-display text-3xl text-white md:text-5xl">
                Built for <span className="pro-gradient-text">creators</span>
              </h2>
              <p className="mt-4 font-light leading-relaxed text-neutral-400">
                Everything you need to host and share media without a public free-for-all.
              </p>
            </div>
            <div className="mt-16 grid gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
              {FEATURES.map((c, i) => (
                <div key={c.t} className="pro-card pro-reveal p-6 md:p-8">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-xs font-medium text-neutral-400">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3 className="mt-5 text-sm font-medium text-white">{c.t}</h3>
                  <p className="mt-2 text-sm font-light leading-relaxed text-neutral-400">{c.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pro-section border-t border-white/5">
          <div className="pro-container max-w-3xl text-center">
            <div className="pro-reveal">
              <h2 className="pro-display text-3xl text-white md:text-4xl">Ready when you are</h2>
              <p className="mt-4 font-light text-neutral-400">Create a free account and start uploading in seconds.</p>
              <Link href={loggedIn ? "/library" : "/login?tab=register"} className="pro-btn pro-btn-primary mt-8 px-8 py-3">
                {loggedIn ? "Open library" : "Get started free"}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5">
        <div className="pro-container py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-[9px] font-semibold text-white">MH</div>
                <span className="text-sm font-medium text-white">Media Host</span>
              </div>
              <p className="mt-4 text-sm font-light leading-relaxed text-neutral-500">
                Private CDN hosting for images, video, audio, and HTML.
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">Product</p>
              <ul className="mt-4 space-y-2 text-xs text-neutral-500">
                <li><Link href="/library" className="hover:text-white">Library</Link></li>
                <li><Link href="/gallery" className="hover:text-white">Gallery</Link></li>
                <li><Link href="/tools/remove-bg" className="hover:text-white">Remove BG</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">Account</p>
              <ul className="mt-4 space-y-2 text-xs text-neutral-500">
                <li><Link href="/login" className="hover:text-white">Sign in</Link></li>
                <li><Link href="/login?tab=register" className="hover:text-white">Register</Link></li>
                <li><Link href="/profile" className="hover:text-white">Profile</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">Social</p>
              <ul className="mt-4 space-y-2 text-xs text-neutral-500">
                <li><a href="https://github.com/BluHExH/media-host" target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a></li>
                <li><a href="https://vercel.com" target="_blank" rel="noreferrer" className="hover:text-white">Vercel</a></li>
              </ul>
            </div>
          </div>
          <p className="mt-12 border-t border-white/5 pt-8 text-[10px] text-neutral-600">
            © {new Date().getFullYear()} Media Host. Login required for all uploads.
          </p>
        </div>
      </footer>
    </div>
  );
}
