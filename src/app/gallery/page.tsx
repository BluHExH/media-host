"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch, hasSession, ensureSession, clearAuth } from "@/lib/client-auth";

interface F {
  url: string;
  pathname: string;
  contentType: string;
  album: string;
}

export default function GalleryPage() {
  const router = useRouter();
  const [files, setFiles] = useState<F[]>([]);
  const [preview, setPreview] = useState<F | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login?next=/gallery");
      return;
    }
    (async () => {
      await ensureSession();
      try {
        const r = await authFetch("/api/list?scope=public");
        if (r.status === 401) {
          clearAuth();
          router.replace("/login?next=/gallery");
          return;
        }
        const d = await r.json();
        setFiles(d.files || []);
      } catch {
        setError("Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const clearMyPublic = async (mode: "unpublish" | "delete") => {
    const msg =
      mode === "delete"
        ? "Delete ALL your public gallery files from storage forever?"
        : "Remove all items from your public gallery? (files stay in Library)";
    if (!confirm(msg)) return;
    setClearing(true);
    try {
      const r = await authFetch("/api/gallery/reset-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (r.ok) setFiles([]);
      else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mh-mesh min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white"
            >
              MH
            </Link>
            <span className="text-sm font-semibold">My public gallery</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/library" className="text-slate-600 hover:underline">
              Library
            </Link>
            <Link href="/profile" className="text-slate-600 hover:underline">
              Profile
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">
              Only <strong>your</strong> files marked public. Other users never see these here.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Privacy: each account has its own public gallery — no shared global feed.
            </p>
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={clearing}
                onClick={() => clearMyPublic("unpublish")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Unpublish all
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={() => clearMyPublic("delete")}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Delete all public files
              </button>
            </div>
          )}
        </div>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-center text-slate-500">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-center text-slate-500">
            Nothing in your public gallery. Mark files public from Library when uploading.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((f) => (
              <button
                key={f.url}
                type="button"
                onClick={() => setPreview(f)}
                className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                {f.contentType?.startsWith("image/") ? (
                  <img src={f.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : f.contentType?.startsWith("video/") ? (
                  <video src={f.url} className="h-full w-full object-cover" muted />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">File</div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          {preview.contentType?.startsWith("image/") && (
            <img src={preview.url} alt="" className="max-h-[85vh] rounded-lg" />
          )}
          {preview.contentType?.startsWith("video/") && (
            <video src={preview.url} controls autoPlay className="max-h-[85vh] rounded-lg" />
          )}
        </div>
      )}
    </div>
  );
}
