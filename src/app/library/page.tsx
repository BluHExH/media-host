"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
type F = { url: string; pathname: string; size: number; uploadedAt: string; contentType: string; album: string; expiresAt?: string | null };
const TK = "media_host_token";
const PK = "media_host_pass";
export default function LibraryPage() {
  const router = useRouter();
  const [files, setFiles] = useState<F[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [album, setAlbum] = useState("general");
  const [expiry, setExpiry] = useState("never");
  const [makePublic, setMakePublic] = useState(true);
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [preview, setPreview] = useState<F | null>(null);
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = localStorage.getItem(TK) || "";
    const p = localStorage.getItem(PK) || "";
    if (p) setPassword(p);
    if (t) {
      fetch("/api/auth/me", { headers: { "x-auth-token": t } }).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d?.user) setUser(d.user); else if (!p) router.replace("/login");
      }).catch(() => { if (!p) router.replace("/login"); }).finally(() => setReady(true));
    } else if (p) setReady(true); else router.replace("/login");
  }, [router]);
  const headers = useCallback(() => {
    const h: Record<string, string> = {};
    if (password) h["x-password"] = password;
    const t = localStorage.getItem(TK) || "";
    if (t) h["x-auth-token"] = t;
    return h;
  }, [password]);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await (await fetch("/api/list", { headers: headers(), cache: "no-store" })).json();
      setFiles(d.files || []);
    } catch { setError("Load failed"); } finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { if (ready) load(); }, [ready, load]);
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true); setError("");
    let ok = 0;
    for (const file of Array.from(list)) {
      const fd = new FormData();
      fd.append("file", file); fd.append("album", album); fd.append("expiry", expiry);
      if (makePublic) fd.append("public", "1");
      const res = await fetch("/api/upload", { method: "POST", headers: headers(), body: fd });
      if (res.status === 401) { setError("Session expired"); break; }
      if (res.ok) ok++; else { const d = await res.json().catch(() => ({})); setError(d.error || "Failed"); }
    }
    setUploading(false); if (ref.current) ref.current.value = ""; if (ok) await load();
  };
  const del = async (url: string) => {
    if (!confirm("Delete?")) return;
    const res = await fetch("/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify({ urls: [url] }) });
    if (res.ok) setFiles((p) => p.filter((f) => f.url !== url));
  };
  const copy = (u: string) => { navigator.clipboard.writeText(u); setCopied(u); setTimeout(() => setCopied(null), 1800); };
  const fmt = (b: number) => b < 1024 ? b + " B" : b < 1e6 ? (b / 1024).toFixed(1) + " KB" : (b / 1e6).toFixed(1) + " MB";
  const isImg = (t: string) => t.startsWith("image/");
  const isVid = (t: string) => t.startsWith("video/");
  const isAud = (t: string) => t.startsWith("audio/");
  const isHtml = (t: string) => t.includes("html");
  const nm = (f: F) => f.pathname.split("/").pop() || f.pathname;
  const filtered = useMemo(() => files.filter((f) => {
    if (typeFilter === "image" && !isImg(f.contentType)) return false;
    if (typeFilter === "video" && !isVid(f.contentType)) return false;
    if (typeFilter === "audio" && !isAud(f.contentType)) return false;
    if (typeFilter === "html" && !isHtml(f.contentType)) return false;
    return true;
  }), [files, typeFilter]);
  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading…</div>;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">MH</Link>
            <span className="text-sm font-semibold">Library</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user?.username || "Admin"}</span>
            <Link href="/gallery" className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">Gallery</Link>
            <button onClick={() => { localStorage.removeItem(TK); localStorage.removeItem(PK); router.push("/login"); }} className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <label className="flex items-center gap-1">Expires
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1">
              <option value="never">Never</option><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="365">1 year</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={makePublic} onChange={(e) => setMakePublic(e.target.checked)} /> Public gallery</label>
        </div>
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }} className="relative rounded-2xl border-2 border-dashed border-slate-200 bg-white py-12 text-center">
          <input ref={ref} type="file" accept="image/*,video/*,audio/*,.html,.htm" multiple onChange={(e) => upload(e.target.files)} className="absolute inset-0 cursor-pointer opacity-0" disabled={uploading} />
          <p className="text-sm font-semibold text-slate-800">{uploading ? "Uploading…" : "Drop files or click to upload"}</p>
          <p className="mt-1 text-xs text-slate-500">Image · Video · Audio · HTML</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {(["all", "image", "video", "audio", "html"] as const).map((f) => (
            <button key={f} onClick={() => setTypeFilter(f)} className={`rounded-lg px-3 py-1 text-xs font-medium capitalize ${typeFilter === f ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{f}</button>
          ))}
        </div>
        {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
        : filtered.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">No files yet</p>
        : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((file) => (
              <div key={file.url} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <button type="button" onClick={() => setPreview(file)} className="block aspect-video w-full bg-slate-100">
                  {isImg(file.contentType) ? <img src={file.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : isVid(file.contentType) ? <video src={file.url} className="h-full w-full object-cover" muted preload="metadata" />
                  : <div className="flex h-full items-center justify-center text-xs text-slate-400">{isHtml(file.contentType) ? "HTML page" : "File"}</div>}
                </button>
                <div className="space-y-2 p-3">
                  <p className="truncate text-sm font-medium text-slate-800">{nm(file)}</p>
                  <p className="text-[11px] text-slate-400">{fmt(file.size)}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => copy(file.url)} className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white">{copied === file.url ? "Copied" : "Copy URL"}</button>
                    {isHtml(file.contentType) && <a href={file.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">Open</a>}
                    <button type="button" onClick={() => del(file.url)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-red-500">Del</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between border-b px-4 py-3"><p className="truncate text-sm font-medium">{nm(preview)}</p><button type="button" onClick={() => setPreview(null)}>Close</button></div>
            <div className="bg-slate-100 p-4">
              {isImg(preview.contentType) && <img src={preview.url} alt="" className="mx-auto max-h-[60vh]" />}
              {isVid(preview.contentType) && <video src={preview.url} controls autoPlay className="mx-auto max-h-[60vh] w-full" />}
              {isAud(preview.contentType) && <audio src={preview.url} controls autoPlay className="w-full" />}
              {isHtml(preview.contentType) && <iframe src={preview.url} className="h-[60vh] w-full bg-white" title="html" sandbox="allow-scripts allow-same-origin allow-forms" />}
            </div>
            <div className="p-3"><button type="button" onClick={() => copy(preview.url)} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white">{copied === preview.url ? "Copied" : "Copy URL"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
