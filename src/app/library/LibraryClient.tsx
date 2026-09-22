"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch, clearAuth, ensureSession } from "@/lib/client-auth";
import { uploadMediaFile } from "@/lib/client-upload";

type F = {
  url: string; pathname: string; size: number; uploadedAt: string; contentType: string;
  album?: string; expiresAt?: string | null; previewUrl?: string;
};

function isHtmlFile(f: any) {
  return /html/i.test(f.contentType || "") || /\.html?$/i.test(f.pathname || "") || /\.html?$/i.test(f.url || "");
}
function shareLink(f: F) {
  if (!isHtmlFile(f)) return f.url;
  return "/api/render?u=" + encodeURIComponent(f.url);
}
function fmt(n: number) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}
function nm(f: F) {
  const p = f.pathname || f.url;
  return decodeURIComponent(p.split("/").pop() || "file");
}

export default function LibraryClient() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<F[]>([]);
  const [albums, setAlbums] = useState<string[]>(["general", "nobg", "upscaled", "trash"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<File[] | null>(null);
  const [modalAlbum, setModalAlbum] = useState("general");
  const [modalExpiry, setModalExpiry] = useState("never");
  const [modalPublic, setModalPublic] = useState(false);
  const [folderFilter, setFolderFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<F | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    await ensureSession();
    const res = await authFetch("/api/list");
    if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
    const d = await res.json().catch(() => ({ files: [] }));
    setFiles(d.files || []);
    const set = new Set<string>(["general", "nobg", "upscaled", "trash"]);
    (d.files || []).forEach((f: F) => { if (f.album) set.add(f.album); });
    (d.albums || []).forEach((a: string) => set.add(a));
    setAlbums(Array.from(set).sort());
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const openUploadModal = (list: FileList | File[] | null) => {
    if (!list || (list as any).length === 0) return;
    setPending(Array.isArray(list) ? list : Array.from(list as FileList));
    setModalAlbum(folderFilter !== "all" ? folderFilter : "general");
    setModalExpiry("never"); setModalPublic(false); setShowNewFolder(false); setNewFolder(""); setError("");
  };

  const confirmUpload = async () => {
    if (!pending?.length) return;
    setUploading(true); setError("");
    const list = [...pending];
    let ok = 0, failed = 0, aborted = false, index = 0;
    let lastErr = "";
    const worker = async () => {
      while (index < list.length && !aborted) {
        const file = list[index++];
        try {
          await uploadMediaFile(file, { album: modalAlbum || "general", expiry: modalExpiry, isPublic: modalPublic });
          ok++;
        } catch (e: any) {
          const msg = e?.message || ("Failed: " + file.name);
          if (/login required/i.test(msg)) { aborted = true; clearAuth(); router.replace("/login"); return; }
          failed++;
          lastErr = msg;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, list.length) }, () => worker()));
    setUploading(false); setPending(null); if (ref.current) ref.current.value = "";
    if (ok) await load();
    if (failed) setError(lastErr || ("Uploaded " + ok + "/" + list.length + ", failed " + failed));
  };

  const del = async (urls: string[]) => {
    if (!urls.length || !confirm(urls.length === 1 ? "Delete this file?" : "Delete " + urls.length + " files?")) return;
    const res = await authFetch("/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls }) });
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => !urls.includes(f.url)));
      setSelected((prev) => { const n = new Set(prev); urls.forEach((u) => n.delete(u)); return n; });
    }
  };

  const isImg = (t: string) => t.startsWith("image/");
  const isVid = (t: string) => t.startsWith("video/");
  const isAud = (t: string) => t.startsWith("audio/");

  const filtered = useMemo(() => files.filter((f) => {
    if (folderFilter !== "all" && (f.album || "general") !== folderFilter) return false;
    if (typeFilter === "image" && !isImg(f.contentType)) return false;
    if (typeFilter === "video" && !isVid(f.contentType)) return false;
    if (typeFilter === "audio" && !isAud(f.contentType)) return false;
    if (typeFilter === "html" && !isHtmlFile(f)) return false;
    return true;
  }), [files, typeFilter, folderFilter]);

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }}>MH</div>
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Library</span>
          </Link>
          <nav className="flex flex-wrap gap-2 text-sm">
            <Link href="/tools/remove-bg" style={{ color: "#0F4C81" }}>Remove BG</Link>
            <Link href="/tools/upscale" style={{ color: "#5b4bb4" }}>Upscale</Link>
            <Link href="/profile" style={{ color: "#5a6f82" }}>Profile</Link>
            <Link href="/gallery" style={{ color: "#5a6f82" }}>Gallery</Link>
            <button type="button" onClick={() => { clearAuth(); router.replace("/login"); }} style={{ color: "#b91c1c" }}>Sign out</button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mh-dropzone-glass relative py-12 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); openUploadModal(e.dataTransfer.files); }}>
          <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple className="absolute inset-0 cursor-pointer opacity-0" disabled={uploading || !!pending} onChange={(e) => openUploadModal(e.target.files)} />
          <p className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>{uploading ? "Uploading…" : "Drop files or click — up to 500 MB (direct CDN)"}</p>
        </div>
        {error && <p className="mt-3 text-sm text-red-600 break-words">{error}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} className="mh-input max-w-[10rem]">
            <option value="all">All folders</option>
            {albums.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="mh-input max-w-[10rem]">
            <option value="all">All types</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="html">HTML</option>
          </select>
          {selected.size > 0 && (
            <button type="button" className="mh-btn mh-btn-outline px-3 py-1 text-xs" onClick={() => del(Array.from(selected))}>Delete {selected.size}</button>
          )}
        </div>
        {loading ? (
          <p className="py-12 text-center text-sm" style={{ color: "#5a6f82" }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: "#5a6f82" }}>No files</p>
        ) : (
          <div className="mh-grid-media mt-6">
            {filtered.map((file) => (
              <div key={file.url} className={"mh-media-card overflow-hidden " + (selected.has(file.url) ? "is-selected" : "")}>
                <div className="relative">
                  <input type="checkbox" className="absolute left-2 top-2 z-10 h-4 w-4" checked={selected.has(file.url)} onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(file.url)) n.delete(file.url); else n.add(file.url); return n; })} />
                  <button type="button" onClick={() => setPreview(file)} className="block aspect-video w-full bg-white/40">
                    {isImg(file.contentType) ? <img src={file.url} alt="" className="h-full w-full object-cover" loading="lazy" /> : isVid(file.contentType) ? <video src={file.url} className="h-full w-full object-cover" muted preload="metadata" /> : isAud(file.contentType) ? <div className="flex h-full items-center justify-center text-2xl">🎵</div> : <div className="flex h-full items-center justify-center text-xs" style={{ color: "#5a6f82" }}>{isHtmlFile(file) ? "HTML" : "File"}</div>}
                  </button>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{nm(file)}</p>
                  <p className="text-[11px]" style={{ color: "#5a6f82" }}>{"📁 " + (file.album || "general") + " · " + fmt(file.size)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button type="button" className="rounded-full border bg-white/60 px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(shareLink(file))}>Copy</button>
                    <button type="button" className="rounded-full border border-red-100 bg-white/60 px-2 py-1 text-xs text-red-500" onClick={() => del([file.url])}>Del</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="mh-glass-strong w-full max-w-md p-6">
            <h2 className="text-lg font-semibold" style={{ color: "#1A2B3C" }}>{"Upload " + pending.length + " file(s)"}</h2>
            <p className="mt-1 text-xs" style={{ color: "#5a6f82" }}>Max 500 MB each · direct to CDN</p>
            <label className="mt-4 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Folder</label>
            <select value={modalAlbum} onChange={(e) => setModalAlbum(e.target.value)} className="mh-input mt-1">
              {albums.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {showNewFolder ? (
              <div className="mt-2 flex gap-2">
                <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} className="mh-input" placeholder="new-folder" />
                <button type="button" className="mh-btn mh-btn-primary px-3 text-xs" onClick={() => {
                  const name = newFolder.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 40);
                  if (!name) return;
                  if (!albums.includes(name)) setAlbums((a) => [...a, name].sort());
                  setModalAlbum(name); setShowNewFolder(false); setNewFolder("");
                }}>Add</button>
              </div>
            ) : (
              <button type="button" className="mt-2 text-xs underline" style={{ color: "#0F4C81" }} onClick={() => setShowNewFolder(true)}>+ New folder</button>
            )}
            <label className="mt-3 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Expiry</label>
            <select value={modalExpiry} onChange={(e) => setModalExpiry(e.target.value)} className="mh-input mt-1">
              <option value="never">Never</option>
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={modalPublic} onChange={(e) => setModalPublic(e.target.checked)} /> Public gallery
            </label>
            <div className="mt-5 flex gap-2">
              <button type="button" disabled={uploading} className="mh-btn mh-btn-primary flex-1 py-2.5" onClick={confirmUpload}>{uploading ? "Uploading…" : "Upload"}</button>
              <button type="button" disabled={uploading} className="mh-btn mh-btn-outline px-4" onClick={() => { setPending(null); if (ref.current) ref.current.value = ""; }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreview(null)}>
          <div className="mh-glass-strong max-h-[90vh] w-full max-w-3xl overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-between">
              <p className="truncate text-sm font-medium">{nm(preview)}</p>
              <button type="button" onClick={() => setPreview(null)} className="text-sm">Close</button>
            </div>
            {isImg(preview.contentType) && <img src={preview.url} alt="" className="mx-auto max-h-[60vh]" />}
            {isVid(preview.contentType) && <video src={preview.url} controls autoPlay className="mx-auto max-h-[60vh] w-full" />}
            {isAud(preview.contentType) && <audio src={preview.url} controls autoPlay className="w-full" />}
            {isHtmlFile(preview) && <iframe src={shareLink(preview)} className="h-[60vh] w-full rounded-xl bg-white" title="html" />}
            <p className="mt-3 break-all font-mono text-xs" style={{ color: "#5a6f82" }}>{shareLink(preview)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
