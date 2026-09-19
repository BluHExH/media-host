"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch, clearAuth, hasSession, ensureSession } from "@/lib/client-auth";

type F = {
  url: string; pathname: string; size: number; uploadedAt: string; contentType: string;
  album: string; expiresAt?: string | null; previewUrl?: string;
};

function isHtmlFile(f: { contentType?: string; pathname?: string; url?: string }) {
  return /html/i.test(f.contentType || "") || /\.html?$/i.test(f.pathname || "") || /\.html?$/i.test(f.url || "");
}
function shareLink(f: F) {
  if (!isHtmlFile(f)) return f.url;
  if (f.previewUrl?.startsWith("http")) return f.previewUrl;
  const path = f.previewUrl || `/api/render?u=${encodeURIComponent(f.url)}`;
  if (typeof window === "undefined") return path;
  return path.startsWith("http") ? path : `${window.location.origin}${path}`;
}

export default function LibraryClient() {
  const router = useRouter();
  const [files, setFiles] = useState<F[]>([]);
  const [albums, setAlbums] = useState<string[]>(["general", "nobg", "upscaled"]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [preview, setPreview] = useState<F | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<File[] | null>(null);
  const [modalAlbum, setModalAlbum] = useState("general");
  const [modalExpiry, setModalExpiry] = useState("never");
  const [modalPublic, setModalPublic] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasSession()) { router.replace("/login"); return; }
    (async () => {
      await ensureSession();
      try {
        const r = await authFetch("/api/auth/me");
        const d = r.ok ? await r.json() : null;
        if (d?.user) setUser(d.user);
        else { clearAuth(); router.replace("/login"); }
      } catch { clearAuth(); router.replace("/login"); }
      finally { setReady(true); }
    })();
  }, [router]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch("/api/list", { cache: "no-store" });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      const d = await res.json();
      setFiles(d.files || []);
      const set = new Set<string>(["general", "nobg", "upscaled", ...(d.albums || [])]);
      (d.files || []).forEach((f: F) => { if (f.album) set.add(f.album); });
      setAlbums(Array.from(set).sort());
    } catch { setError("Load failed"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const openUploadModal = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    setPending(Array.isArray(list) ? list : Array.from(list));
    setModalAlbum(folderFilter !== "all" ? folderFilter : "general");
    setModalExpiry("never"); setModalPublic(false); setShowNewFolder(false); setNewFolder(""); setError("");
  };
  const cancelModal = () => { setPending(null); if (ref.current) ref.current.value = ""; };
  const createFolderAndSelect = () => {
    const name = newFolder.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").slice(0, 40);
    if (!name) return;
    if (!albums.includes(name)) setAlbums((a) => [...a, name].sort());
    setModalAlbum(name); setShowNewFolder(false); setNewFolder("");
  };

  const confirmUpload = async () => {
    if (!pending?.length) return;
    setUploading(true); setError("");
    const list = [...pending]; let ok = 0, failed = 0, aborted = false, index = 0;
    const worker = async () => {
      while (index < list.length && !aborted) {
        const file = list[index++];
        const fd = new FormData();
        fd.append("file", file);
        fd.append("album", modalAlbum || "general");
        fd.append("expiry", modalExpiry);
        if (modalPublic) fd.append("public", "1");
        try {
          const res = await authFetch("/api/upload", { method: "POST", body: fd });
          if (res.status === 401) { aborted = true; clearAuth(); router.replace("/login"); return; }
          if (res.ok) ok++; else { failed++; const d = await res.json().catch(() => ({})); setError(d.error || "Failed: " + file.name); }
        } catch { failed++; setError("Network: " + file.name); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, list.length) }, () => worker()));
    setUploading(false); setPending(null); if (ref.current) ref.current.value = "";
    if (ok) await load();
    if (failed) setError(`Uploaded ${ok}/${list.length}, failed ${failed}`);
  };

  const toggleSelect = (url: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(url)) n.delete(url); else n.add(url); return n; });
  const clearSelection = () => setSelected(new Set());

  const del = async (urls: string[]) => {
    if (!urls.length) return;
    if (!confirm(urls.length === 1 ? "Delete this file?" : `Delete ${urls.length} files?`)) return;
    const res = await authFetch("/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls }) });
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => !urls.includes(f.url)));
      setSelected((prev) => { const n = new Set(prev); urls.forEach((u) => n.delete(u)); return n; });
    }
  };

  const moveSelected = async (album: string) => {
    const urls = Array.from(selected);
    if (!urls.length || !album) return;
    const res = await authFetch("/api/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls, album }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Move failed"); return; }
    setFiles((prev) => prev.map((f) => (selected.has(f.url) ? { ...f, album } : f)));
    if (!albums.includes(album)) setAlbums((a) => [...a, album].sort());
    setSelected(new Set());
  };

  const copy = (u: string) => { navigator.clipboard.writeText(u); setCopied(u); setTimeout(() => setCopied(null), 2000); };
  const fmt = (b: number) => b < 1024 ? b + " B" : b < 1e6 ? (b / 1024).toFixed(1) + " KB" : (b / 1e6).toFixed(1) + " MB";
  const isImg = (t: string) => t.startsWith("image/");
  const isVid = (t: string) => t.startsWith("video/");
  const isAud = (t: string) => t.startsWith("audio/");
  const nm = (f: F) => f.pathname.split("/").pop() || f.pathname;

  const filtered = useMemo(() => files.filter((f) => {
    if (folderFilter !== "all" && (f.album || "general") !== folderFilter) return false;
    if (typeFilter === "image" && !isImg(f.contentType)) return false;
    if (typeFilter === "video" && !isVid(f.contentType)) return false;
    if (typeFilter === "audio" && !isAud(f.contentType)) return false;
    if (typeFilter === "html" && !isHtmlFile(f)) return false;
    return true;
  }), [files, typeFilter, folderFilter]);

  if (!ready) return <div className="mh-mesh flex min-h-screen items-center justify-center text-[#5a6f82]">Loading…</div>;

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }}>MH</Link>
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Library</span>
          </div>
          <span className="text-xs" style={{ color: "#5a6f82" }}>{user?.username || "User"}</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 px-0 md:px-4">
        <aside className="hidden md:block py-8">
          <div className="mh-glass-strong sticky top-20 space-y-1 p-3">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#5a6f82" }}>Menu</p>
            <Link href="/tools/remove-bg" className="flex rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/60" style={{ color: "#0F4C81" }}>Remove BG</Link>
            <Link href="/tools/upscale" className="flex rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/60" style={{ color: "#5b4bb4" }}>Upscale</Link>
            <Link href="/profile" className="flex rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/60" style={{ color: "#1A2B3C" }}>Profile</Link>
            <Link href="/gallery" className="flex rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/60" style={{ color: "#1A2B3C" }}>Gallery</Link>
            <hr className="my-2 border-white/40" />
            <button type="button" onClick={() => { clearAuth(); router.push("/login"); }} className="flex w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50/80">Sign out</button>
          </div>
        </aside>

        <div className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-white/50 bg-white/70 backdrop-blur-xl md:hidden">
          <Link href="/tools/remove-bg" className="flex-1 py-2.5 text-center text-[10px] font-semibold" style={{ color: "#0F4C81" }}>BG</Link>
          <Link href="/tools/upscale" className="flex-1 py-2.5 text-center text-[10px] font-semibold" style={{ color: "#5b4bb4" }}>Upscale</Link>
          <Link href="/profile" className="flex-1 py-2.5 text-center text-[10px] font-semibold" style={{ color: "#5a6f82" }}>Profile</Link>
          <Link href="/gallery" className="flex-1 py-2.5 text-center text-[10px] font-semibold" style={{ color: "#5a6f82" }}>Gallery</Link>
          <button type="button" onClick={() => { clearAuth(); router.push("/login"); }} className="flex-1 py-2.5 text-center text-[10px] font-semibold text-red-600">Out</button>
        </div>

        <main className="min-w-0 space-y-5 px-4 py-8 pb-20 md:pb-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "#5a6f82" }}>Folder:</span>
            <button type="button" onClick={() => setFolderFilter("all")} className={`mh-chip px-3 py-1 text-xs font-medium ${folderFilter === "all" ? "text-white" : "border border-white/60 bg-white/50 text-slate-600"}`} style={folderFilter === "all" ? { background: "linear-gradient(135deg,#0F4C81,#3BACB6)" } : undefined}>All</button>
            {albums.map((a) => (
              <button key={a} type="button" onClick={() => setFolderFilter(a)} className={`mh-chip px-3 py-1 text-xs font-medium ${folderFilter === a ? "text-white" : "border border-white/60 bg-white/50 text-slate-600"}`} style={folderFilter === a ? { background: "linear-gradient(135deg,#0F4C81,#3BACB6)" } : undefined}>📁 {a}</button>
            ))}
          </div>

          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); openUploadModal(e.dataTransfer.files); }} className="mh-dropzone-glass relative py-12 text-center">
            <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple onChange={(e) => openUploadModal(e.target.files)} className="absolute inset-0 cursor-pointer opacity-0" disabled={uploading || !!pending} />
            <p className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Drop files or click to upload</p>
            <p className="mt-1 text-xs" style={{ color: "#5a6f82" }}>Image · Video · Audio · HTML</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {(["all", "image", "video", "audio", "html"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setTypeFilter(f)} className={`mh-chip px-3 py-1 text-xs font-medium capitalize ${typeFilter === f ? "text-white" : "border border-white/60 bg-white/50 text-slate-600"}`} style={typeFilter === f ? { background: "linear-gradient(135deg,#0F4C81,#3BACB6)" } : undefined}>{f}</button>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="mh-bulk-bar sticky top-16 z-10 flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="text-sm font-medium" style={{ color: "#0F4C81" }}>{selected.size} selected</span>
              <button type="button" onClick={() => setSelected(new Set(filtered.map((f) => f.url)))} className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium">Select all</button>
              <button type="button" onClick={clearSelection} className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs">Clear</button>
              <select className="h-8 rounded-full border border-white/60 bg-white/80 px-2 text-xs" defaultValue="" onChange={(e) => { if (e.target.value) { moveSelected(e.target.value); e.target.value = ""; } }}>
                <option value="" disabled>Move to…</option>
                {albums.map((a) => <option key={a} value={a}>📁 {a}</option>)}
              </select>
              <button type="button" onClick={() => del(Array.from(selected))} className="ml-auto rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Delete</button>
            </div>
          )}

          {loading ? <p className="py-12 text-center text-sm" style={{ color: "#5a6f82" }}>Loading…</p> : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "#5a6f82" }}>No files in this folder</p>
          ) : (
            <div className="mh-grid-media">
              {filtered.map((file) => {
                const link = shareLink(file);
                return (
                  <div key={file.url} className={`mh-media-card overflow-hidden ${selected.has(file.url) ? "is-selected" : ""}`}>
                    <div className="relative">
                      <input type="checkbox" className="absolute left-2 top-2 z-10 h-4 w-4" checked={selected.has(file.url)} onChange={() => toggleSelect(file.url)} />
                      <button type="button" onClick={() => setPreview(file)} className="block aspect-video w-full bg-white/40">
                        {isImg(file.contentType) ? <img src={file.url} alt="" className="h-full w-full object-cover" loading="lazy" /> : isVid(file.contentType) ? <video src={file.url} className="h-full w-full object-cover" muted preload="metadata" /> : <div className="flex h-full items-center justify-center text-xs" style={{ color: "#5a6f82" }}>{isHtmlFile(file) ? "HTML" : "File"}</div>}
                      </button>
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="truncate text-sm font-medium">{nm(file)}</p>
                      <p className="text-[11px]" style={{ color: "#5a6f82" }}>📁 {file.album || "general"} · {fmt(file.size)}{file.expiresAt ? ` · exp ${new Date(file.expiresAt).toLocaleDateString()}` : ""}</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => copy(link)} className="mh-btn mh-btn-primary flex-1 py-1.5 text-xs">{copied === link ? "Copied" : "Copy URL"}</button>
                        {isImg(file.contentType) && (
                          <>
                            <Link href={`/tools/remove-bg?url=${encodeURIComponent(file.url)}`} className="rounded-full border border-violet-200/80 bg-white/60 px-2 py-1.5 text-xs text-violet-700">BG</Link>
                            <Link href={`/tools/upscale?url=${encodeURIComponent(file.url)}`} className="rounded-full border border-indigo-200/80 bg-white/60 px-2 py-1.5 text-xs text-indigo-700">2×</Link>
                          </>
                        )}
                        <button type="button" onClick={() => del([file.url])} className="rounded-full border border-red-100 bg-white/60 px-2 py-1.5 text-xs text-red-500">Del</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F4C81]/25 p-4 backdrop-blur-sm">
          <div className="mh-glass-strong w-full max-w-md p-6">
            <h2 className="text-base font-semibold" style={{ color: "#1A2B3C" }}>Upload settings</h2>
            <p className="mt-1 text-sm" style={{ color: "#5a6f82" }}>{pending.length} file(s)</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "#5a6f82" }}>How long to keep?</label>
                <select value={modalExpiry} onChange={(e) => setModalExpiry(e.target.value)} className="mh-input">
                  <option value="never">Never expire</option>
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "#5a6f82" }}>Folder</label>
                <select value={modalAlbum} onChange={(e) => setModalAlbum(e.target.value)} className="mh-input">
                  {albums.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                {!showNewFolder ? (
                  <button type="button" onClick={() => setShowNewFolder(true)} className="mt-2 text-xs font-medium" style={{ color: "#0F4C81" }}>+ Create folder</button>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="folder-name" className="mh-input flex-1" />
                    <button type="button" onClick={createFolderAndSelect} className="mh-btn mh-btn-primary px-3 text-xs">Add</button>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: "#5a6f82" }}>
                <input type="checkbox" checked={modalPublic} onChange={(e) => setModalPublic(e.target.checked)} /> Also show on my public gallery
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={cancelModal} disabled={uploading} className="flex-1 rounded-full border border-white/60 bg-white/70 py-2.5 text-sm">Cancel</button>
              <button type="button" onClick={confirmUpload} disabled={uploading} className="mh-btn mh-btn-primary flex-1 py-2.5 text-sm disabled:opacity-50">{uploading ? "Uploading…" : "Upload"}</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F4C81]/30 p-4 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="mh-glass-strong max-h-[90vh] w-full max-w-2xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between border-b border-white/40 px-4 py-3">
              <p className="truncate text-sm font-medium">{nm(preview)}</p>
              <button type="button" onClick={() => setPreview(null)} className="text-sm" style={{ color: "#5a6f82" }}>Close</button>
            </div>
            <div className="bg-white/30 p-4">
              {isImg(preview.contentType) && <img src={preview.url} alt="" className="mx-auto max-h-[60vh]" />}
              {isVid(preview.contentType) && <video src={preview.url} controls autoPlay className="mx-auto max-h-[60vh] w-full" />}
              {isAud(preview.contentType) && <audio src={preview.url} controls autoPlay className="w-full" />}
            </div>
            <div className="p-3">
              <button type="button" onClick={() => copy(shareLink(preview))} className="mh-btn mh-btn-primary w-full py-2.5 text-sm">Copy URL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
