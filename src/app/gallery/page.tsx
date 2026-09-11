"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface MediaFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  contentType: string;
  album: string;
}

export default function GalleryPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [album, setAlbum] = useState("all");
  const [preview, setPreview] = useState<MediaFile | null>(null);

  useEffect(() => {
    fetch("/api/list")
      .then((r) => r.json())
      .then((d) => setFiles(d.files || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const albums = useMemo(() => {
    const s = new Set(files.map((f) => f.album || "general"));
    return Array.from(s).sort();
  }, [files]);

  const filtered = useMemo(() => {
    return files.filter((f) => {
      if (album !== "all" && f.album !== album) return false;
      return (
        f.contentType.startsWith("image/") ||
        f.contentType.startsWith("video/") ||
        f.contentType === "text/html"
      );
    });
  }, [files, album]);

  const nameOf = (f: MediaFile) => f.pathname.split("/").pop() || f.pathname;
  const isImage = (t: string) => t.startsWith("image/");
  const isVideo = (t: string) => t.startsWith("video/");
  const isHtml = (t: string) => t === "text/html" || t.includes("html");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 sticky top-0 bg-zinc-950/90 backdrop-blur-xl z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Public Gallery</h1>
            <p className="text-[11px] text-zinc-500">Browse shared media</p>
          </div>
          <Link href="/" className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800">
            ← Library
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setAlbum("all")}
            className={`px-3 py-1.5 rounded-lg text-xs ${album === "all" ? "bg-violet-600" : "bg-zinc-900 text-zinc-400"}`}
          >
            All
          </button>
          {albums.map((a) => (
            <button
              key={a}
              onClick={() => setAlbum(a)}
              className={`px-3 py-1.5 rounded-lg text-xs ${album === a ? "bg-violet-600" : "bg-zinc-900 text-zinc-400"}`}
            >
              {a}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-zinc-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">No public media yet</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((file) => (
              <button
                key={file.url}
                onClick={() => setPreview(file)}
                className="aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-600 relative group text-left"
              >
                {isImage(file.contentType) ? (
                  <img src={file.url} alt={nameOf(file)} className="w-full h-full object-cover" loading="lazy" />
                ) : isVideo(file.contentType) ? (
                  <video src={file.url} className="w-full h-full object-cover" muted preload="metadata" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">📄</div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
                  <p className="text-[11px] truncate">{nameOf(file)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {isImage(preview.contentType) && (
              <img src={preview.url} alt={nameOf(preview)} className="max-w-full max-h-[80vh] mx-auto rounded-lg object-contain" />
            )}
            {isVideo(preview.contentType) && (
              <video src={preview.url} controls autoPlay className="max-w-full max-h-[80vh] mx-auto rounded-lg" />
            )}
            {isHtml(preview.contentType) && (
              <iframe src={preview.url} className="w-full h-[70vh] rounded-lg bg-white" title={nameOf(preview)} />
            )}
            <div className="text-center mt-4">
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-sm text-violet-400 hover:underline">
                Open original
              </a>
              <button onClick={() => setPreview(null)} className="ml-4 text-sm text-zinc-400">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
