"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch, clearAuth, hasSession, ensureSession } from "@/lib/client-auth";

type F = {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  contentType: string;
  album: string;
  expiresAt?: string | null;
  previewUrl?: string;
};

function isHtmlFile(f: { contentType?: string; pathname?: string; url?: string }) {
  return (
    /html/i.test(f.contentType || "") ||
    /\.html?$/i.test(f.pathname || "") ||
    /\.html?$/i.test(f.url || "")
  );
}

/** Always use our domain proxy for HTML so browser renders, not downloads */
function shareLink(f: F) {
  if (!isHtmlFile(f)) return f.url;
  if (f.previewUrl?.startsWith("http")) return f.previewUrl;
  const path = f.previewUrl || `/api/render?u=${encodeURIComponent(f.url)}`;
  if (typeof window === "undefined") return path;
  return path.startsWith("http") ? path : `${window.location.origin}${path}`;
}

export default function LibraryPage() {
  const router = useRouter();
  const [files, setFiles] = useState<F[]>([]);
  const [albums, setAlbums] = useState<string[]>(["general"]);
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
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    (async () => {
      await ensureSession();
      try {
        const r = await authFetch("/api/auth/me");
        const d = r.ok ? await r.json() : null;
        if (d?.user) setUser(d.user);
        else {
          clearAuth();
          router.replace("/login");
        }
      } catch {
        clearAuth();
        router.replace("/login");
      } finally {
        setReady(true);
      }
    })();
  }, [router]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch("/api/list", { cache: "no-store" });
      if (res.status === 401) {
        clearAuth();
        router.replace("/login");
        return;
      }
      const d = await res.json();
      setFiles(d.files || []);
      const set = new Set<string>(["general", ...(d.albums || [])]);
      (d.files || []).forEach((f: F) => {
        if (f.album) set.add(f.album);
      });
      setAlbums(Array.from(set).sort());
    } catch {
      setError("Load failed");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const openUploadModal = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const arr = Array.isArray(list) ? list : Array.from(list);
    setPending(arr);
    setModalAlbum(folderFilter !== "all" ? folderFilter : "general");
    setModalExpiry("never");
    setModalPublic(false);
    setShowNewFolder(false);
    setNewFolder("");
    setError("");
  };

  const cancelModal = () => {
    setPending(null);
    if (ref.current) ref.current.value = "";
  };

  const createFolderAndSelect = () => {
    const name = newFolder
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40);
    if (!name) return;
    if (!albums.includes(name)) setAlbums((a) => [...a, name].sort());
    setModalAlbum(name);
    setShowNewFolder(false);
    setNewFolder("");
  };

  const confirmUpload = async () => {
    if (!pending?.length) return;
    setUploading(true);
    setError("");
    let ok = 0;
    for (const file of pending) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("album", modalAlbum || "general");
      fd.append("expiry", modalExpiry);
      if (modalPublic) fd.append("public", "1");
      const res = await authFetch("/api/upload", { method: "POST", body: fd });
      if (res.status === 401) {
        clearAuth();
        router.replace("/login");
        break;
      }
      if (res.ok) ok++;
      else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed: " + file.name);
      }
    }
    setUploading(false);
    setPending(null);
    if (ref.current) ref.current.value = "";
    if (ok) await load();
  };

  const del = async (url: string) => {
    if (!confirm("Delete?")) return;
    const res = await authFetch("/api/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [url] }),
    });
    if (res.ok) setFiles((prev) => prev.filter((f) => f.url !== url));
  };

  const copy = (u: string) => {
    navigator.clipboard.writeText(u);
    setCopied(u);
    setTimeout(() => setCopied(null), 2000);
  };

  const fmt = (b: number) =>
    b < 1024 ? b + " B" : b < 1e6 ? (b / 1024).toFixed(1) + " KB" : (b / 1e6).toFixed(1) + " MB";
  const isImg = (t: string) => t.startsWith("image/");
  const isVid = (t: string) => t.startsWith("video/");
  const isAud = (t: string) => t.startsWith("audio/");
  const nm = (f: F) => f.pathname.split("/").pop() || f.pathname;

  const filtered = useMemo(
    () =>
      files.filter((f) => {
        if (folderFilter !== "all" && (f.album || "general") !== folderFilter) return false;
        if (typeFilter === "image" && !isImg(f.contentType)) return false;
        if (typeFilter === "video" && !isVid(f.contentType)) return false;
        if (typeFilter === "audio" && !isAud(f.contentType)) return false;
        if (typeFilter === "html" && !isHtmlFile(f)) return false;
        return true;
      }),
    [files, typeFilter, folderFilter]
  );

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading…</div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">MH</Link>
            <span className="text-sm font-semibold">Library</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user?.username || "User"}</span>
            <Link href="/profile" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">Profile</Link>
            <Link href="/gallery" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">Gallery</Link>
            <button type="button" onClick={() => { clearAuth(); router.push("/login"); }} className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Folder:</span>
          <button type="button" onClick={() => setFolderFilter("all")} className={`rounded-lg px-3 py-1 text-xs font-medium ${folderFilter === "all" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>All</button>
          {albums.map((a) => (
            <button key={a} type="button" onClick={() => setFolderFilter(a)} className={`rounded-lg px-3 py-1 text-xs font-medium ${folderFilter === a ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>📁 {a}</button>
          ))}
        </div>

        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); openUploadModal(e.dataTransfer.files); }} className="relative rounded-2xl border-2 border-dashed border-slate-200 bg-white py-12 text-center">
          <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple onChange={(e) => openUploadModal(e.target.files)} className="absolute inset-0 cursor-pointer opacity-0" disabled={uploading || !!pending} />
          <p className="text-sm font-semibold text-slate-800">Drop files or click to upload</p>
          <p className="mt-1 text-xs text-slate-500">Then choose folder &amp; how long to keep</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {(["all", "image", "video", "audio", "html"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setTypeFilter(f)} className={`rounded-lg px-3 py-1 text-xs font-medium capitalize ${typeFilter === f ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{f}</button>
          ))}
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No files in this folder</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((file) => {
              const link = shareLink(file);
              return (
                <div key={file.url} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <button type="button" onClick={() => setPreview(file)} className="block aspect-video w-full bg-slate-100">
                    {isImg(file.contentType) ? (
                      <img src={file.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : isVid(file.contentType) ? (
                      <video src={file.url} className="h-full w-full object-cover" muted preload="metadata" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">{isHtmlFile(file) ? "HTML page" : "File"}</div>
                    )}
                  </button>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-sm font-medium text-slate-800">{nm(file)}</p>
                    <p className="text-[11px] text-slate-400">📁 {file.album || "general"} · {fmt(file.size)}{file.expiresAt ? ` · exp ${new Date(file.expiresAt).toLocaleDateString()}` : ""}</p>
                    {isHtmlFile(file) && <p className="text-[10px] text-emerald-600">Opens as page (not download)</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => copy(link)} className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white">{copied === link ? "Copied" : "Copy URL"}</button>
                      {isHtmlFile(file) && (
                        <a href={link} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 px-2 py-1.5 text-xs font-medium text-blue-600">Open</a>
                      )}
                      <button type="button" onClick={() => del(file.url)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-red-500">Del</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Upload settings</h2>
            <p className="mt-1 text-sm text-slate-500">{pending.length} file{pending.length > 1 ? "s" : ""} selected</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">How long to keep?</label>
                <select value={modalExpiry} onChange={(e) => setModalExpiry(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                  <option value="never">Never expire</option>
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Folder</label>
                <select value={modalAlbum} onChange={(e) => setModalAlbum(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                  {albums.map((a) => (<option key={a} value={a}>{a}</option>))}
                </select>
                {!showNewFolder ? (
                  <button type="button" onClick={() => setShowNewFolder(true)} className="mt-2 text-xs font-medium text-blue-600 hover:underline">+ Create new folder</button>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="folder-name" className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
                    <button type="button" onClick={createFolderAndSelect} className="rounded-lg bg-slate-900 px-3 text-xs font-medium text-white">Add</button>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={modalPublic} onChange={(e) => setModalPublic(e.target.checked)} />
                Also show in public gallery
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={cancelModal} disabled={uploading} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
              <button type="button" onClick={confirmUpload} disabled={uploading} className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{uploading ? "Uploading…" : "Upload"}</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between border-b px-4 py-3">
              <p className="truncate text-sm font-medium">{nm(preview)}</p>
              <button type="button" onClick={() => setPreview(null)}>Close</button>
            </div>
            <div className="bg-slate-100 p-4">
              {isImg(preview.contentType) && <img src={preview.url} alt="" className="mx-auto max-h-[60vh]" />}
              {isVid(preview.contentType) && <video src={preview.url} controls autoPlay className="mx-auto max-h-[60vh] w-full" />}
              {isAud(preview.contentType) && <audio src={preview.url} controls autoPlay className="w-full" />}
              {isHtmlFile(preview) && (
                <iframe src={shareLink(preview)} className="h-[60vh] w-full bg-white" title="html" sandbox="allow-scripts allow-same-origin allow-forms" />
              )}
            </div>
            <div className="flex gap-2 p-3">
              <button type="button" onClick={() => copy(shareLink(preview))} className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white">{copied === shareLink(preview) ? "Copied" : "Copy URL"}</button>
              {isHtmlFile(preview) && (
                <a href={shareLink(preview)} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-600">Open</a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
