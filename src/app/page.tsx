"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";

interface MediaFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  contentType: string;
  album: string;
}

type TypeFilter = "all" | "image" | "video" | "audio" | "html";
const PASS_KEY = "media_host_pass";

export default function Home() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [albums, setAlbums] = useState<string[]>(["general"]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, name: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [albumFilter, setAlbumFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [album, setAlbum] = useState("general");
  const [newAlbum, setNewAlbum] = useState("");
  const [password, setPassword] = useState("");
  const [passInput, setPassInput] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [preview, setPreview] = useState<MediaFile | null>(null);
  const [embedFile, setEmbedFile] = useState<MediaFile | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(PASS_KEY) || "" : "";
    if (saved) { setPassword(saved); setAuthed(true); }
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (password) h["x-password"] = password;
    return h;
  }, [password]);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res = await fetch("/api/list");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFiles(data.files || []);
      const albs: string[] = data.albums?.length ? data.albums : ["general"];
      if (!albs.includes("general")) albs.unshift("general");
      setAlbums(albs);
    } catch { setError("Failed to load files"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const tryLogin = async () => {
    const p = passInput.trim();
    if (!p) return;
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: { "x-password": p }, body: new FormData() });
      if (res.status === 401) { setError("Wrong password"); setAuthed(false); return; }
      localStorage.setItem(PASS_KEY, p);
      setPassword(p); setAuthed(true); setNeedsAuth(false);
      setSuccess("Logged in"); setTimeout(() => setSuccess(""), 2000);
    } catch { setError("Login failed"); }
  };

  const logout = () => { localStorage.removeItem(PASS_KEY); setPassword(""); setAuthed(false); setPassInput(""); };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true); setError(""); setSuccess("");
    const list = Array.from(fileList);
    let ok = 0;
    setProgress({ done: 0, total: list.length, name: "" });
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setProgress({ done: i, total: list.length, name: file.name });
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("album", album || "general");
        const res = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: formData });
        if (res.status === 401) { setNeedsAuth(true); setError("Password required or incorrect"); setAuthed(false); break; }
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || `Failed: ${file.name}`); continue; }
        ok++;
      } catch { setError(`Failed: ${file.name}`); }
    }
    setProgress({ done: list.length, total: list.length, name: "" });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (ok > 0) { setSuccess(`${ok} file(s) uploaded to "${album}"`); setTimeout(() => setSuccess(""), 3000); await fetchFiles(); }
  };

  const handleDelete = async (urls: string[]) => {
    if (!urls.length || !confirm(`Delete ${urls.length} file(s)?`)) return;
    try {
      const res = await fetch("/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ urls }) });
      if (res.status === 401) { setNeedsAuth(true); setError("Password required to delete"); return; }
      if (!res.ok) { setError("Delete failed"); return; }
      setFiles((prev) => prev.filter((f) => !urls.includes(f.url)));
      setSelected(new Set());
      if (preview && urls.includes(preview.url)) setPreview(null);
      setSuccess("Deleted"); setTimeout(() => setSuccess(""), 2000);
    } catch { setError("Delete failed"); }
  };

  const copyText = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); };
  const formatSize = (bytes: number) => { if (bytes < 1024) return bytes + " B"; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / (1024 * 1024)).toFixed(1) + " MB"; };
  const isImage = (t: string) => t.startsWith("image/");
  const isVideo = (t: string) => t.startsWith("video/");
  const isAudio = (t: string) => t.startsWith("audio/");
  const isHtml = (t: string) => t === "text/html" || t.includes("html");
  const nameOf = (f: MediaFile) => f.pathname.split("/").pop() || f.pathname;

  const filtered = useMemo(() => files.filter((f) => {
    if (typeFilter === "image" && !isImage(f.contentType)) return false;
    if (typeFilter === "video" && !isVideo(f.contentType)) return false;
    if (typeFilter === "audio" && !isAudio(f.contentType)) return false;
    if (typeFilter === "html" && !isHtml(f.contentType)) return false;
    if (albumFilter !== "all" && f.album !== albumFilter) return false;
    if (search) { const n = nameOf(f).toLowerCase(); if (!n.includes(search.toLowerCase())) return false; }
    return true;
  }), [files, typeFilter, albumFilter, search]);

  const counts = useMemo(() => ({
    all: files.length,
    image: files.filter((f) => isImage(f.contentType)).length,
    video: files.filter((f) => isVideo(f.contentType)).length,
    audio: files.filter((f) => isAudio(f.contentType)).length,
    html: files.filter((f) => isHtml(f.contentType)).length,
  }), [files]);

  const toggleSelect = (url: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(url)) n.delete(url); else n.add(url); return n; });
  };

  const createAlbum = () => {
    const a = newAlbum.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 40);
    if (!a) return;
    if (!albums.includes(a)) setAlbums((prev) => [...prev, a].sort());
    setAlbum(a); setAlbumFilter(a); setNewAlbum("");
    setSuccess(`Album "${a}" ready`); setTimeout(() => setSuccess(""), 2500);
  };

  const embedCodes = (f: MediaFile) => {
    const n = nameOf(f);
    return {
      url: f.url,
      markdown: isImage(f.contentType) ? `![${n}](${f.url})` : `[${n}](${f.url})`,
      html: isImage(f.contentType) ? `<img src="${f.url}" alt="${n}" />` : isVideo(f.contentType) ? `<video src="${f.url}" controls></video>` : isAudio(f.contentType) ? `<audio src="${f.url}" controls></audio>` : `<a href="${f.url}">${n}</a>`,
      iframe: `<iframe src="${f.url}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>`,
    };
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-lg">☁</div>
            <div><h1 className="text-lg font-semibold tracking-tight">Media Host</h1><p className="text-[11px] text-zinc-500">Library · Albums · Embed</p></div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link href="/gallery" className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300">Public Gallery</Link>
            {authed ? (
              <button onClick={logout} className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400">Logout</button>
            ) : (
              <button onClick={() => setNeedsAuth(true)} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500">Login</button>
            )}
            <span className="text-zinc-500 hidden sm:inline">{files.length} files</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {needsAuth && !authed && (
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <p className="text-sm text-zinc-400 flex-1">Admin password (set MEDIA_PASSWORD in Vercel)</p>
            <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryLogin()} placeholder="Password" className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
            <button onClick={tryLogin} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm">Unlock</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${dragOver ? "border-violet-500 bg-violet-500/10" : "border-zinc-800 hover:border-zinc-600 bg-zinc-900/40"}`}>
              <input ref={fileInputRef} type="file" accept="image/*,audio/*,video/*,text/html,.html,.htm,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.mov,.mkv" multiple onChange={(e) => handleUpload(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploading} />
              <div className="pointer-events-none space-y-2">
                <div className="text-4xl">{uploading ? "⏳" : "📤"}</div>
                <p className="text-base font-medium">{uploading ? `Uploading ${progress.done + 1}/${progress.total}: ${progress.name}` : "Drop files or click — bulk upload supported"}</p>
                <p className="text-sm text-zinc-500">Album: {album} · Images/HTML 50MB · Audio/Video 100MB</p>
              </div>
              {uploading && <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-800 rounded-b-2xl overflow-hidden"><div className="h-full bg-violet-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 10}%` }} /></div>}
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Album</p>
            <select value={album} onChange={(e) => setAlbum(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
              {albums.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={newAlbum} onChange={(e) => setNewAlbum(e.target.value)} placeholder="New album name" className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm" onKeyDown={(e) => e.key === "Enter" && createAlbum()} />
              <button onClick={createAlbum} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">Add</button>
            </div>
          </div>
        </div>

        {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex justify-between"><span>{error}</span><button onClick={() => setError("")}>✕</button></div>}
        {success && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">{success}</div>}

        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap items-center">
            {(["all", "image", "video", "audio", "html"] as TypeFilter[]).map((f) => (
              <button key={f} onClick={() => setTypeFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${typeFilter === f ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} <span className="opacity-60">{counts[f]}</span>
              </button>
            ))}
            <select value={albumFilter} onChange={(e) => setAlbumFilter(e.target.value)} className="ml-auto bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs">
              <option value="all">All albums</option>
              {albums.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="search" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs w-36 sm:w-48" />
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">{selected.size} selected</span>
              <button onClick={() => handleDelete(Array.from(selected))} className="px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg">Delete selected</button>
              <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 bg-zinc-800 rounded-lg">Clear</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-20 text-zinc-500"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-500"><div className="text-4xl mb-3 opacity-40">📭</div><p>{files.length === 0 ? "No files yet. Upload something!" : "No matches"}</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((file) => (
              <div key={file.url} className={`bg-zinc-900/80 border rounded-2xl overflow-hidden transition ${selected.has(file.url) ? "border-violet-500" : "border-zinc-800 hover:border-zinc-700"}`}>
                <div className="aspect-video bg-zinc-950 relative flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => setPreview(file)}>
                  {isImage(file.contentType) ? <img src={file.url} alt={nameOf(file)} className="w-full h-full object-cover" loading="lazy" />
                  : isVideo(file.contentType) ? <video src={file.url} className="w-full h-full object-cover" muted preload="metadata" />
                  : isAudio(file.contentType) ? <div className="flex flex-col items-center gap-2 p-4 w-full"><div className="text-2xl">🎵</div><audio src={file.url} controls className="w-full max-w-[200px]" onClick={(e) => e.stopPropagation()} /></div>
                  : isHtml(file.contentType) ? <div className="text-center p-4"><div className="text-2xl mb-1">📄</div><p className="text-xs text-zinc-400">HTML</p></div>
                  : <div className="text-3xl opacity-40">📄</div>}
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-zinc-300">{file.album}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isImage(file.contentType) ? "bg-sky-500/30 text-sky-200" : isVideo(file.contentType) ? "bg-amber-500/30 text-amber-200" : isAudio(file.contentType) ? "bg-pink-500/30 text-pink-200" : isHtml(file.contentType) ? "bg-emerald-500/30 text-emerald-200" : "bg-zinc-700"}`}>
                      {isImage(file.contentType) ? "IMG" : isVideo(file.contentType) ? "VID" : isAudio(file.contentType) ? "AUD" : isHtml(file.contentType) ? "HTML" : "FILE"}
                    </span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleSelect(file.url); }} className={`absolute top-2 right-2 w-6 h-6 rounded border text-xs ${selected.has(file.url) ? "bg-violet-600 border-violet-400" : "bg-black/40 border-zinc-600"}`}>{selected.has(file.url) ? "✓" : ""}</button>
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-sm font-medium truncate">{nameOf(file)}</p>
                  <p className="text-[11px] text-zinc-500">{formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleDateString()}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => copyText(file.url, file.url + "-u")} className="flex-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 py-1.5 rounded-lg">{copied === file.url + "-u" ? "✓ URL" : "Copy URL"}</button>
                    <button onClick={() => setEmbedFile(file)} className="text-[11px] bg-zinc-800 hover:bg-zinc-700 px-2 py-1.5 rounded-lg">Embed</button>
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-[11px] bg-zinc-800 hover:bg-zinc-700 px-2 py-1.5 rounded-lg">↗</a>
                    <button onClick={() => handleDelete([file.url])} className="text-[11px] bg-red-500/10 text-red-400 px-2 py-1.5 rounded-lg">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center"><p className="text-sm font-medium truncate pr-4">{nameOf(preview)}</p><button onClick={() => setPreview(null)} className="text-zinc-400 px-2">✕</button></div>
            <div className="p-4 bg-black min-h-[200px] flex items-center justify-center">
              {isImage(preview.contentType) && <img src={preview.url} alt="" className="max-w-full max-h-[70vh] object-contain rounded-lg" />}
              {isVideo(preview.contentType) && <video src={preview.url} controls autoPlay className="max-w-full max-h-[70vh] rounded-lg" />}
              {isAudio(preview.contentType) && <div className="py-10 w-full max-w-md"><audio src={preview.url} controls autoPlay className="w-full" /></div>}
              {isHtml(preview.contentType) && <iframe src={preview.url} title={nameOf(preview)} className="w-full h-[60vh] rounded-lg bg-white" sandbox="allow-scripts allow-same-origin allow-forms" />}
            </div>
            <div className="p-4 border-t border-zinc-800 flex gap-2">
              <button onClick={() => copyText(preview.url, "pv")} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm">{copied === "pv" ? "✓ Copied" : "Copy URL"}</button>
              <button onClick={() => { setEmbedFile(preview); setPreview(null); }} className="px-4 py-2.5 bg-zinc-800 rounded-lg text-sm">Embed</button>
            </div>
          </div>
        </div>
      )}

      {embedFile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEmbedFile(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center"><h2 className="font-semibold">Embed codes</h2><button onClick={() => setEmbedFile(null)} className="text-zinc-400">✕</button></div>
            {Object.entries(embedCodes(embedFile)).map(([key, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs text-zinc-400"><span className="uppercase">{key}</span><button onClick={() => copyText(val, "em-" + key)} className="text-violet-400">{copied === "em-" + key ? "Copied!" : "Copy"}</button></div>
                <pre className="text-[11px] bg-zinc-950 border border-zinc-800 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all text-zinc-300">{val}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="text-center text-[11px] text-zinc-600 py-8">Media Host · Albums · Public Gallery · Embed</footer>
    </div>
  );
}
