"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface MediaFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  contentType: string;
}

export default function Home() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [isAuth, setIsAuth] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const headers = useCallback(() => {
    const h: Record<string, string> = {};
    if (password) h["x-password"] = password;
    return h;
  }, [password]);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/list", { headers: headers() });
      if (res.status === 401) {
        setIsAuth(false);
        setError("Password required or incorrect");
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setFiles(data.files || []);
      setIsAuth(true);
    } catch (e) {
      setError("Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleLogin = () => {
    fetchFiles();
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setError("");

    for (const file of Array.from(fileList)) {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: headers(),
          body: formData,
        });

        if (res.status === 401) {
          setError("Password incorrect");
          setIsAuth(false);
          break;
        }

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Upload failed");
          continue;
        }

        await fetchFiles();
      } catch (e) {
        setError("Upload failed");
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (url: string) => {
    if (!confirm("Delete this file?")) return;

    try {
      const res = await fetch("/api/delete", {
        method: "DELETE",
        headers: {
          ...headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        setError("Delete failed");
        return;
      }

      setFiles((prev) => prev.filter((f) => f.url !== url));
    } catch (e) {
      setError("Delete failed");
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const isImage = (type: string) => type.startsWith("image/");
  const isVideo = (type: string) => type.startsWith("video/");
  const isAudio = (type: string) => type.startsWith("audio/");

  if (!isAuth && error.includes("Password")) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-white mb-2">Media Host</h1>
          <p className="text-zinc-400 text-sm mb-6">Enter password to continue</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Password"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
          />
          <button
            onClick={handleLogin}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium py-3 rounded-lg transition"
          >
            Unlock
          </button>
          {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Media Host</h1>
            <p className="text-xs text-zinc-500">Personal image · audio · video hosting</p>
          </div>
          <div className="text-sm text-zinc-400">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleUpload(e.dataTransfer.files);
          }}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all mb-10 ${
            dragOver
              ? "border-violet-500 bg-violet-500/10"
              : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="pointer-events-none">
            <div className="text-4xl mb-3">☁️</div>
            <p className="text-lg font-medium mb-1">
              {uploading ? "Uploading..." : "Drop files here or click to upload"}
            </p>
            <p className="text-sm text-zinc-500">
              Images, Audio & Video · Max 50MB each
            </p>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-zinc-900/80 rounded-2xl flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-zinc-500">Loading...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            No files yet. Upload something!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {files.map((file) => (
              <div
                key={file.url}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group"
              >
                <div className="aspect-video bg-zinc-800 relative flex items-center justify-center overflow-hidden">
                  {isImage(file.contentType) ? (
                    <img
                      src={file.url}
                      alt={file.pathname}
                      className="w-full h-full object-cover"
                    />
                  ) : isVideo(file.contentType) ? (
                    <video
                      src={file.url}
                      className="w-full h-full object-cover"
                      controls
                      preload="metadata"
                    />
                  ) : isAudio(file.contentType) ? (
                    <div className="flex flex-col items-center gap-3 p-4 w-full">
                      <div className="text-4xl">🎵</div>
                      <audio src={file.url} controls className="w-full" />
                    </div>
                  ) : (
                    <div className="text-4xl">📄</div>
                  )}
                </div>

                <div className="p-4">
                  <p
                    className="text-sm font-medium truncate mb-1"
                    title={file.pathname}
                  >
                    {file.pathname.split("/").pop()}
                  </p>
                  <p className="text-xs text-zinc-500 mb-3">
                    {formatSize(file.size)} ·{" "}
                    {new Date(file.uploadedAt).toLocaleDateString()}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => copyUrl(file.url)}
                      className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg transition"
                    >
                      {copied === file.url ? "Copied!" : "Copy URL"}
                    </button>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg transition text-center"
                    >
                      Open
                    </a>
                    <button
                      onClick={() => handleDelete(file.url)}
                      className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-lg transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-zinc-600 py-8">
        Personal Media Host · Powered by Vercel Blob
      </footer>
    </div>
  );
}
