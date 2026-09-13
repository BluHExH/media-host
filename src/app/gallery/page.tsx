"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
interface F { url: string; pathname: string; contentType: string; album: string; }
export default function GalleryPage() {
  const [files, setFiles] = useState<F[]>([]);
  const [preview, setPreview] = useState<F | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/list?scope=public").then((r) => r.json()).then((d) => setFiles(d.files || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2"><Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">MH</Link><span className="text-sm font-semibold">Gallery</span></div>
          <Link href="/login" className="text-sm text-slate-600">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="mb-6 text-sm text-slate-500">Public files only</p>
        {loading ? <p className="text-center text-slate-500">Loading…</p>
        : files.length === 0 ? <p className="text-center text-slate-500">Nothing public yet</p>
        : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((f) => (
              <button key={f.url} type="button" onClick={() => setPreview(f)} className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white">
                {f.contentType.startsWith("image/") ? <img src={f.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                : f.contentType.startsWith("video/") ? <video src={f.url} className="h-full w-full object-cover" muted />
                : <div className="flex h-full items-center justify-center text-xs text-slate-400">HTML</div>}
              </button>
            ))}
          </div>
        )}
      </main>
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          {preview.contentType.startsWith("image/") && <img src={preview.url} alt="" className="max-h-[85vh] rounded-lg" />}
          {preview.contentType.startsWith("video/") && <video src={preview.url} controls autoPlay className="max-h-[85vh] rounded-lg" />}
          {preview.contentType.includes("html") && <iframe src={preview.url} className="h-[80vh] w-full max-w-3xl rounded-lg bg-white" title="p" />}
        </div>
      )}
    </div>
  );
}
