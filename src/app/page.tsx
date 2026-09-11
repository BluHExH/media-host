"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
type F = { url: string; pathname: string; size: number; uploadedAt: string; contentType: string; album: string };
const PK = "media_host_pass";
const TK = "media_host_token";
export default function Home() {
  const [files, setFiles] = useState<F[]>([]);
  const [albums, setAlbums] = useState(["general"]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [albumFilter, setAlbumFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [album, setAlbum] = useState("general");
  const [newAlbum, setNewAlbum] = useState("");
  const [password, setPassword] = useState("");
  const [passInput, setPassInput] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<{ id: number; username: string; displayName?: string } | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUser, setAuthUser] = useState("");
  const [preview, setPreview] = useState<F | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const s = localStorage.getItem(PK) || "";
    if (s) { setPassword(s); setAuthed(true); }
    const t = localStorage.getItem(TK) || "";
    if (t) fetch("/api/auth/me", { headers: { "x-auth-token": t } }).then(r => r.ok ? r.json() : null).then(d => { if (d?.user) { setUser(d.user); setAuthed(true); } }).catch(() => {});
  }, []);
  const headers = useCallback(() => {
    const h: Record<string, string> = {};
    if (password) h["x-password"] = password;
    const t = typeof window !== "undefined" ? localStorage.getItem(TK) || "" : "";
    if (t) h["x-auth-token"] = t;
    return h;
  }, [password]);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await (await fetch("/api/list")).json();
      setFiles(d.files || []);
      const a: string[] = d.albums?.length ? d.albums : ["general"];
      if (!a.includes("general")) a.unshift("general");
      setAlbums(a);
    } catch { setError("Load failed"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const tryAuth = async () => {
    if (!authUser.trim() && passInput.trim()) {
      const res = await fetch("/api/upload", { method: "POST", headers: { "x-password": passInput.trim() }, body: new FormData() });
      if (res.status === 401) { setError("Wrong admin password"); return; }
      localStorage.setItem(PK, passInput.trim()); setPassword(passInput.trim()); setAuthed(true); setNeedsAuth(false); setSuccess("Admin unlocked"); return;
    }
    if (!authUser.trim() || !passInput) { setError("Username & password required"); return; }
    const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: authUser.trim().toLowerCase(), password: passInput, displayName: authUser.trim() }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Auth failed"); return; }
    localStorage.setItem(TK, data.token); setUser(data.user); setAuthed(true); setNeedsAuth(false);
    setSuccess(authMode === "register" ? "Account created" : "Welcome");
  };
  const logout = () => { localStorage.removeItem(PK); localStorage.removeItem(TK); setPassword(""); setUser(null); setAuthed(false); };
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true); setError("");
    let ok = 0;
    for (const file of Array.from(list)) {
      const fd = new FormData(); fd.append("file", file); fd.append("album", album);
      const res = await fetch("/api/upload", { method: "POST", headers: headers(), body: fd });
      if (res.status === 401) { setNeedsAuth(true); setError("Login required"); break; }
      if (res.ok) ok++; else { const d = await res.json().catch(() => ({})); setError(d.error || "Failed"); }
    }
    setUploading(false); if (ref.current) ref.current.value = "";
    if (ok) { setSuccess(ok + " uploaded"); await load(); }
  };
  const del = async (urls: string[]) => {
    if (!urls.length || !confirm("Delete " + urls.length + "?")) return;
    const res = await fetch("/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify({ urls }) });
    if (res.status === 401) { setNeedsAuth(true); return; }
    if (res.ok) { setFiles(p => p.filter(f => !urls.includes(f.url))); setSelected(new Set()); setSuccess("Deleted"); }
  };
  const copy = (t: string, k: string) => { navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(null), 2000); };
  const fmt = (b: number) => b < 1024 ? b + " B" : b < 1e6 ? (b / 1024).toFixed(1) + " KB" : (b / 1e6).toFixed(1) + " MB";
  const isImg = (t: string) => t.startsWith("image/");
  const isVid = (t: string) => t.startsWith("video/");
  const isAud = (t: string) => t.startsWith("audio/");
  const isHtml = (t: string) => t.includes("html");
  const nm = (f: F) => f.pathname.split("/").pop() || f.pathname;
  const filtered = useMemo(() => files.filter(f => {
    if (typeFilter === "image" && !isImg(f.contentType)) return false;
    if (typeFilter === "video" && !isVid(f.contentType)) return false;
    if (typeFilter === "audio" && !isAud(f.contentType)) return false;
    if (typeFilter === "html" && !isHtml(f.contentType)) return false;
    if (albumFilter !== "all" && f.album !== albumFilter) return false;
    if (search && !nm(f).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [files, typeFilter, albumFilter, search]);
  const counts = useMemo(() => ({
    all: files.length,
    image: files.filter(f => isImg(f.contentType)).length,
    video: files.filter(f => isVid(f.contentType)).length,
    audio: files.filter(f => isAud(f.contentType)).length,
    html: files.filter(f => isHtml(f.contentType)).length,
  }), [files]);
  return (
    <div className="min-h-screen bg-[#07070a] text-zinc-100">
      <header className="relative z-20 border-b border-white/5 bg-[#07070a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 font-bold">M</div>
            <div><h1 className="font-semibold">Media Host</h1><p className="text-[10px] uppercase tracking-widest text-zinc-500">Personal CDN</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/gallery" className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">Gallery</Link>
            {authed ? (
              <><span className="hidden text-xs text-zinc-400 sm:inline">{user?.username || "Admin"}</span>
              <button onClick={logout} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">Logout</button></>
            ) : (
              <button onClick={() => setNeedsAuth(true)} className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs">Login</button>
            )}
          </div>
        </div>
      </header>
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 space-y-4">
        {needsAuth && !authed && (
          <div className="space-y-3 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
            <div className="flex gap-2">
              <button onClick={() => setAuthMode("login")} className={`rounded-lg px-3 py-1.5 text-xs ${authMode === "login" ? "bg-violet-600" : "bg-white/5 text-zinc-400"}`}>Login</button>
              <button onClick={() => setAuthMode("register")} className={`rounded-lg px-3 py-1.5 text-xs ${authMode === "register" ? "bg-violet-600" : "bg-white/5 text-zinc-400"}`}>Register</button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={authUser} onChange={e => setAuthUser(e.target.value)} placeholder="Username" className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm" />
              <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} onKeyDown={e => e.key === "Enter" && tryAuth()} placeholder="Password" className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm" />
              <button onClick={tryAuth} className="rounded-xl bg-violet-600 px-4 py-2 text-sm">{authMode === "register" ? "Sign up" : "Sign in"}</button>
            </div>
          </div>
        )}
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
          className={`relative rounded-3xl border ${dragOver ? "border-violet-400 bg-violet-500/15" : "border-white/10 bg-white/[0.03]"}`}>
          <input ref={ref} type="file" accept="image/*,audio/*,video/*,text/html,.html" multiple onChange={e => upload(e.target.files)} className="absolute inset-0 z-10 cursor-pointer opacity-0" disabled={uploading} />
          <div className="pointer-events-none px-6 py-14 text-center">
            <p className="text-lg font-semibold">{uploading ? "Uploading..." : "Drop files here"}</p>
            <p className="mt-1 text-sm text-zinc-400">image · video · audio · HTML · album: {album}</p>
          </div>
        </div>
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</div>}
        {success && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{success}</div>}
        <div className="flex flex-wrap gap-2">
          {(["all", "image", "video", "audio", "html"] as const).map(f => (
            <button key={f} onClick={() => setTypeFilter(f)} className={`rounded-full px-3 py-1 text-xs ${typeFilter === f ? "bg-violet-600" : "bg-white/5 text-zinc-400"}`}>{f} {counts[f]}</button>
          ))}
          <select value={album} onChange={e => setAlbum(e.target.value)} className="ml-auto rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-xs">{albums.map(a => <option key={a} value={a}>{a}</option>)}</select>
          <input type="search" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} className="w-28 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-xs" />
        </div>
        {loading ? <p className="py-16 text-center text-zinc-500">Loading...</p>
        : filtered.length === 0 ? <p className="py-16 text-center text-zinc-500">Empty</p>
        : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(file => (
              <div key={file.url} className={`overflow-hidden rounded-2xl border bg-white/[0.03] ${selected.has(file.url) ? "border-violet-500" : "border-white/5"}`}>
                <div className="relative aspect-video cursor-pointer bg-black/40" onClick={() => setPreview(file)}>
                  {isImg(file.contentType) ? <img src={file.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : isVid(file.contentType) ? <video src={file.url} className="h-full w-full object-cover" muted preload="metadata" />
                  : isAud(file.contentType) ? <div className="flex h-full items-center justify-center"><audio src={file.url} controls onClick={e => e.stopPropagation()} /></div>
                  : <div className="flex h-full items-center justify-center opacity-50">HTML</div>}
                  <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 text-[10px]">{file.album}</span>
                </div>
                <div className="space-y-2 p-3">
                  <p className="truncate text-sm font-medium">{nm(file)}</p>
                  <p className="text-[11px] text-zinc-500">{fmt(file.size)}</p>
                  <div className="flex gap-1">
                    <button onClick={() => copy(file.url, file.url)} className="flex-1 rounded-lg bg-white/5 py-1.5 text-[11px]">{copied === file.url ? "Copied" : "Copy"}</button>
                    <button onClick={() => del([file.url])} className="rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-red-400">Del</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-white/10 bg-[#0c0c12]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between border-b border-white/5 px-4 py-3"><p className="truncate text-sm">{nm(preview)}</p><button onClick={() => setPreview(null)}>✕</button></div>
            <div className="flex min-h-[200px] items-center justify-center bg-black p-4">
              {isImg(preview.contentType) && <img src={preview.url} alt="" className="max-h-[70vh] object-contain" />}
              {isVid(preview.contentType) && <video src={preview.url} controls autoPlay className="max-h-[70vh]" />}
              {isAud(preview.contentType) && <audio src={preview.url} controls autoPlay />}
              {isHtml(preview.contentType) && <iframe src={preview.url} className="h-[60vh] w-full bg-white" />}
            </div>
            <div className="p-4"><button onClick={() => copy(preview.url, "pv")} className="w-full rounded-xl bg-violet-600 py-2.5 text-sm">{copied === "pv" ? "Copied!" : "Copy link"}</button></div>
          </div>
        </div>
      )}
      <footer className="py-8 text-center text-[11px] text-zinc-600">Media Host · Postgres + Blob</footer>
    </div>
  );
}
