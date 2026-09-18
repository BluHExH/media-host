"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";

type Uploaded = { url: string; name: string; contentType: string; size: number };
const TK = "media_host_token";

const FEATURES = [
  { icon: "🔒", t: "Private by default", d: "Every upload is tied to your account. Others cannot browse your library." },
  { icon: "📁", t: "Folders & expiry", d: "Organize into albums and choose how long each file stays live on the CDN." },
  { icon: "⚡", t: "CDN-ready URLs", d: "One-click copy for sites, Discord, embeds — parallel upload, original quality." },
  { icon: "✂️", t: "Remove background", d: "High-quality BG removal in the browser. Your image never leaves the device." },
  { icon: "🎬", t: "Images, video, audio", d: "Correct MIME types, live HTML preview, and multi-select bulk tools." },
  { icon: "🛡️", t: "Account isolation", d: "Login required for uploads. One user never sees another user’s files." },
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
    const concurrency = Math.min(6, arr.length);
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#0a0a0a] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div
        className="animate-pulse-glow pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full"
        style={{ background: "rgba(102,187,106,0.03)", filter: "blur(64px)" }}
      />
      <div
        className="animate-pulse-glow pointer-events-none absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full"
        style={{ background: "rgba(200,230,201,0.02)", filter: "blur(64px)", animationDelay: "1.5s" }}
      />

      <nav
        className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center px-6"
        style={{ background: "rgba(10,10,10,0.8)", borderBottom: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(12px)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-400 to-green-700 text-[10px] font-bold text-white">MH</div>
            <span className="text-sm font-medium tracking-tight">Media Host<span className="text-green-400">.app</span></span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="/tools/remove-bg" className="text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white">Remove BG</Link>
            <Link href="/gallery" className="text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white">Gallery</Link>
            <Link href="/library" className="text-xs uppercase tracking-widest text-neutral-400 transition-colors hover:text-white">Library</Link>
            {loggedIn ? (
              <Link href="/library" className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition-colors hover:bg-neutral-200">Open library</Link>
            ) : (
              <Link href="/login?tab=register" className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition-colors hover:bg-neutral-200">Get started</Link>
            )}
          </div>
          <button type="button" className="text-neutral-400 hover:text-white md:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">{menuOpen ? "✕" : "☰"}</button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]/95 md:hidden">
          <Link href="/tools/remove-bg" className="text-lg text-neutral-300" onClick={() => setMenuOpen(false)}>Remove BG</Link>
          <Link href="/gallery" className="text-lg text-neutral-300" onClick={() => setMenuOpen(false)}>Gallery</Link>
          <Link href="/library" className="text-lg text-neutral-300" onClick={() => setMenuOpen(false)}>Library</Link>
          <Link href={loggedIn ? "/library" : "/login?tab=register"} className="mt-4 rounded-full bg-white px-6 py-2 text-sm font-medium text-black" onClick={() => setMenuOpen(false)}>
            {loggedIn ? "Open library" : "Get started"}
          </Link>
          <button type="button" className="mt-4 text-neutral-500" onClick={() => setMenuOpen(false)}>Close</button>
        </div>
      )}

      <main className="relative z-10">
        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-16">
          <div className="mx-auto max-w-5xl text-center">
            <div className="fade-up mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(23,23,23,0.4)" }}>
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
              <span className="text-xs uppercase tracking-widest text-neutral-400">Account required · Secure uploads</span>
            </div>

            <h1 className="font-display fade-up text-5xl tracking-tight md:text-7xl lg:text-8xl">
              <span className="gradient-text">Your media,</span>
              <br />
              <span className="gradient-accent">on the edge</span>
            </h1>

            <p className="fade-up mx-auto mt-6 max-w-2xl text-base font-light leading-relaxed text-neutral-400 md:text-lg">
              Sign in, drop files, get instant CDN links. Folders, expiry, background removal — no guest uploads.
            </p>

            <div className="fade-up mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href={loggedIn ? "/library" : "/login?tab=register"} className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200">
                {loggedIn ? "Go to library" : "Get started free"}
              </Link>
              <Link href="/tools/remove-bg" className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-medium text-neutral-300 transition-colors hover:text-white" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                Remove background
              </Link>
            </div>

            <div className="mt-16 flex flex-wrap items-center justify-center gap-4">
              {["Images", "Video", "Audio", "HTML"].map((label, i) => (
                <div key={label} className="animate-float rounded-full px-4 py-2 text-xs font-medium text-neutral-400" style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(23,23,23,0.3)", animationDelay: `${i * 0.5}s` }}>
                  {label}
                </div>
              ))}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files); }}
              className="relative mx-auto mt-14 max-w-2xl overflow-hidden rounded-2xl transition-all"
              style={{
                border: dragOver ? "1px dashed rgba(102,187,106,0.5)" : "1px dashed rgba(255,255,255,0.1)",
                background: dragOver ? "rgba(102,187,106,0.05)" : "rgba(23,23,23,0.4)",
              }}
            >
              {loggedIn ? (
                <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple onChange={(e) => onPick(e.target.files)} className="absolute inset-0 z-10 cursor-pointer opacity-0" disabled={uploading} />
              ) : (
                <button type="button" onClick={requireLogin} className="absolute inset-0 z-10 cursor-pointer" aria-label="Sign in" />
              )}
              <div className="pointer-events-none px-6 py-14 text-center">
                {!loggedIn && (
                  <div className="mb-3 flex justify-center"><span className="mh-lock-badge">Sign in required to upload</span></div>
                )}
                <p className="text-base font-medium text-white">
                  {uploading ? `Uploading ${progress.done}/${progress.total}…` : loggedIn ? "Drop files here" : "Create an account to upload"}
                </p>
                <p className="mt-2 text-sm font-light text-neutral-500">
                  {loggedIn ? "Image · Video · Audio · HTML · original quality" : "Free register · private by default"}
                </p>
              </div>
            </div>

            {error && <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

            {items.length > 0 && (
              <div className="mx-auto mt-10 max-w-2xl space-y-3 text-left">
                <h2 className="text-sm font-medium text-neutral-300">Your links</h2>
                {items.map((item) => (
                  <div key={item.url} className="flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center" style={{ background: "rgba(23,23,23,0.4)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="h-14 w-full shrink-0 overflow-hidden rounded-lg bg-neutral-900 sm:w-16">
                      {isImg(item.contentType) ? (
                        <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : isVid(item.contentType) ? (
                        <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-neutral-600">FILE</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate font-mono text-xs text-neutral-600">{item.url}</p>
                    </div>
                    <button type="button" onClick={() => copy(item.url)} className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black">
                      {copied === item.url ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="border-y border-white/5 px-6 py-12">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 text-center md:grid-cols-4">
            {[
              { n: "CDN", l: "Instant links" },
              { n: "6×", l: "Parallel upload" },
              { n: "BG", l: "Remove tool" },
              { n: "100%", l: "Private files" },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-display text-3xl text-white md:text-4xl">{s.n}</div>
                <div className="mt-1 text-xs uppercase tracking-widest text-neutral-500">{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 py-24 md:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="mb-16 text-center">
              <span className="mb-4 block text-xs uppercase tracking-widest text-green-400">Features</span>
              <h2 className="font-display gradient-text text-3xl tracking-tight md:text-5xl">Built for creators</h2>
              <p className="mx-auto mt-4 max-w-xl font-light text-neutral-400">Everything you need to host and share media without a public free-for-all.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((c) => (
                <div key={c.t} className="card-hover cursor-default rounded-xl p-6 md:p-8">
                  <div className="mb-3 text-2xl">{c.icon}</div>
                  <div className="text-sm font-medium text-white">{c.t}</div>
                  <div className="mt-2 text-sm font-light leading-relaxed text-neutral-500">{c.d}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden px-6 py-24 md:py-32">
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(102,187,106,0.03), transparent)" }} />
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl tracking-tight md:text-5xl">Ready when you are</h2>
            <p className="mx-auto mt-4 max-w-lg font-light text-neutral-400">Create a free account and start uploading in seconds.</p>
            <Link href={loggedIn ? "/library" : "/login?tab=register"} className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-medium text-black transition-transform hover:scale-105">
              {loggedIn ? "Open library" : "Get started free"}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 grid gap-8 md:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-green-400 to-green-700 text-[8px] font-bold text-white">MH</div>
                <span className="text-sm font-medium">Media Host<span className="text-green-400">.app</span></span>
              </div>
              <p className="text-xs font-light leading-relaxed text-neutral-500">Private CDN for images, video, audio, and HTML.</p>
            </div>
            <div>
              <div className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-300">Product</div>
              <div className="space-y-2 text-xs text-neutral-500">
                <div><Link href="/library" className="hover:text-white">Library</Link></div>
                <div><Link href="/gallery" className="hover:text-white">Gallery</Link></div>
                <div><Link href="/tools/remove-bg" className="hover:text-white">Remove BG</Link></div>
              </div>
            </div>
            <div>
              <div className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-300">Account</div>
              <div className="space-y-2 text-xs text-neutral-500">
                <div><Link href="/login" className="hover:text-white">Sign in</Link></div>
                <div><Link href="/login?tab=register" className="hover:text-white">Register</Link></div>
                <div><Link href="/profile" className="hover:text-white">Profile</Link></div>
              </div>
            </div>
            <div>
              <div className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-300">Social</div>
              <div className="space-y-2 text-xs text-neutral-500">
                <div><a href="https://github.com/BluHExH/media-host" target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a></div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 pt-6">
            <span className="text-[10px] text-neutral-600">© {new Date().getFullYear()} Media Host — login required for uploads</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
