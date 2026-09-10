"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface MediaFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  contentType: string;
}

type Filter = "all" | "image" | "video" | "audio";

export default function Home() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<MediaFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/list");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setError("Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError("");
    setSuccess("");
    const list = Array.from(fileList);
    let ok = 0;

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setUploadProgress(`Uploading ${i + 1}/${list.length}: ${file.name}`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Failed: ${file.name}`);
          continue;
        }
        ok++;
      } catch {
        setError(`Failed: ${file.name}`);
      }
    }

    setUploading(false);
    setUploadProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (ok > 0) {
      setSuccess(`${ok} file${ok > 1 ? "s" : ""} uploaded`);
      setTimeout(() => setSuccess(""), 3000);
      await fetchFiles();
    }
  };

  const handleDelete = async (url: string) => {
    if (!confirm("Delete this file permanently?")) return;
    try {
      const res = await fetch("/api/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        setError("Delete failed");
        return;
      }
      setFiles((prev) => prev.filter((f) => f.url !== url));
      if (preview?.url === url) setPreview(null);
      setSuccess("Deleted");
      setTimeout(() => setSuccess(""), 2000);
    } catch {
      setError("Delete failed");
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const isImage = (t: string) => t.startsWith("image/");
  const isVideo = (t: string) => t.startsWith("video/");
  const isAudio = (t: string) => t.startsWith("audio/");

  const filtered = useMemo(() => {
    return files.filter((f) => {
      if (filter === "image" && !isImage(f.contentType)) return false;
      if (filter === "video" && !isVideo(f.contentType)) return false;
      if (filter === "audio" && !isAudio(f.contentType)) return false;
      if (search) {
        const name = (f.pathname.split("/").pop() || "").toLowerCase();
        if (!name.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [files, filter, search]);

  const counts = useMemo(() => ({
    all: files.length,
    image: files.filter((f) => isImage(f.contentType)).length,
    video: files.filter((f) => isVideo(f.contentType)).length,
    audio: files.filter((f) => isAudio(f.contentType)).length,
  }), [files]);

  const nameOf = (f: MediaFile) => f.pathname.split("/").pop() || f.pathname;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-lg">☁</div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Media Host</h1>
              <p className="text-[11px] text-zinc-500">Images · Audio · Video</p>
            </div>
          </div>
          <div className="text-xs text-zinc-500 hidden sm:block">{files.length} file{files.length !== 1 ? "s" : ""}</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
          className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all ${
            dragOver ? "border-violet-500 bg-violet-500/10 scale-[1.01]" : "border-zinc-800 hover:border-zinc-600 bg-zinc-900/40"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.mov,.mkv"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={uploading}
          />
          <div className="pointer-events-none space-y-2">
            <div className="text-4xl">{uploading ? "⏳" : "📤"}</div>
            <p className="text-base font-medium">{uploading ? uploadProgress || "Uploading..." : "Drop files here or click to upload"}</p>
            <p className="text-sm text-zinc-500">Images (50MB) · Audio & Video (100MB)</p>
          </div>
          {uploading && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800 rounded-b-2xl overflow-hidden">
              <div className="h-full bg-violet-500 animate-pulse w-2/3" />
            </div>
          )}
        </div>

        {error && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-200 px-2">✕</button>
          </div>
        )}
        {success && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">{success}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "image", "video", "audio"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filter === f ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                <span className="ml-1.5 opacity-60">{counts[f]}</span>
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-violet-500/50 placeholder:text-zinc-600"
          />
        </div>

        {loading ? (
          <div className="text-center py-24 text-zinc-500">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-zinc-500">
            <div className="text-4xl mb-3 opacity-40">📭</div>
            <p>{files.length === 0 ? "No files yet. Upload something!" : "No matches found"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((file) => (
              <div key={file.url} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden group hover:border-zinc-700 transition">
                <div className="aspect-video bg-zinc-950 relative flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => setPreview(file)}>
                  {isImage(file.contentType) ? (
                    <img src={file.url} alt={nameOf(file)} className="w-full h-full object-cover" loading="lazy" />
                  ) : isVideo(file.contentType) ? (
                    <video src={file.url} className="w-full h-full object-cover" muted preload="metadata" />
                  ) : isAudio(file.contentType) ? (
                    <div className="flex flex-col items-center gap-3 p-4 w-full">
                      <div className="w-14 h-14 rounded-full bg-violet-500/20 flex items-center justify-center text-2xl">🎵</div>
                      <audio src={file.url} controls className="w-full max-w-[220px]" onClick={(e) => e.stopPropagation()} />
                    </div>
                  ) : (
                    <div className="text-3xl opacity-40">📄</div>
                  )}
                  <div className="absolute top-2 left-2">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                      isImage(file.contentType) ? "bg-sky-500/20 text-sky-300" :
                      isVideo(file.contentType) ? "bg-amber-500/20 text-amber-300" :
                      isAudio(file.contentType) ? "bg-pink-500/20 text-pink-300" : "bg-zinc-700 text-zinc-300"
                    }`}>
                      {isImage(file.contentType) ? "IMAGE" : isVideo(file.contentType) ? "VIDEO" : isAudio(file.contentType) ? "AUDIO" : "FILE"}
                    </span>
                  </div>
                </div>
                <div className="p-3.5 space-y-2.5">
                  <div>
                    <p className="text-sm font-medium truncate" title={nameOf(file)}>{nameOf(file)}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => copyText(file.url, file.url + "-url")} className="flex-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg transition">
                      {copied === file.url + "-url" ? "✓ Copied" : "Copy URL"}
                    </button>
                    <button onClick={() => copyText(`![${nameOf(file)}](${file.url})`, file.url + "-md")} className="text-[11px] bg-zinc-800 hover:bg-zinc-700 px-2.5 py-2 rounded-lg transition" title="Copy Markdown">
                      {copied === file.url + "-md" ? "✓" : "MD"}
                    </button>
                    <button onClick={() => copyText(`<img src=\"${file.url}\" alt=\"${nameOf(file)}\" />`, file.url + "-html")} className="text-[11px] bg-zinc-800 hover:bg-zinc-700 px-2.5 py-2 rounded-lg transition" title="Copy HTML">
                      {copied === file.url + "-html" ? "✓" : "HTML"}
                    </button>
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-[11px] bg-zinc-800 hover:bg-zinc-700 px-2.5 py-2 rounded-lg transition">↗</a>
                    <button onClick={() => handleDelete(file.url)} className="text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2.5 py-2 rounded-lg transition">✕</button>
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
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-medium truncate pr-4">{nameOf(preview)}</p>
              <button onClick={() => setPreview(null)} className="text-zinc-400 hover:text-white text-lg px-2">✕</button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black min-h-[200px]">
              {isImage(preview.contentType) && <img src={preview.url} alt={nameOf(preview)} className="max-w-full max-h-[70vh] object-contain rounded-lg" />}
              {isVideo(preview.contentType) && <video src={preview.url} controls autoPlay className="max-w-full max-h-[70vh] rounded-lg" />}
              {isAudio(preview.contentType) && (
                <div className="py-12 flex flex-col items-center gap-4 w-full">
                  <div className="text-5xl">🎵</div>
                  <audio src={preview.url} controls autoPlay className="w-full max-w-md" />
                </div>
              )}
            </div>
            <div className="p-4 border-t border-zinc-800 flex gap-2">
              <button onClick={() => copyText(preview.url, "modal-url")} className="flex-1 text-sm bg-violet-600 hover:bg-violet-500 py-2.5 rounded-lg transition">
                {copied === "modal-url" ? "✓ Copied!" : "Copy URL"}
              </button>
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-sm bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 rounded-lg transition">Open</a>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center text-[11px] text-zinc-600 py-10">Personal Media Host</footer>
    </div>
  );
}
