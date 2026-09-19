"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch, clearAuth, hasSession, ensureSession } from "@/lib/client-auth";

type F = {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
  album?: string;
};

export default function GalleryPage() {
  const router = useRouter();
  const [files, setFiles] = useState<F[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

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
        setError("Failed to load gallery");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const copy = (u: string) => {
    navigator.clipboard.writeText(u);
    setCopied(u);
    setTimeout(() => setCopied(null), 2000);
  };

  const del = async (url: string) => {
    if (!confirm("Remove from public gallery?")) return;
    const res = await authFetch("/api/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [url] }),
    });
    if (res.ok) setFiles((p) => p.filter((f) => f.url !== url));
  };

  const isImg = (t: string) => t.startsWith("image/");
  const nm = (f: F) => f.pathname.split("/").pop() || f.pathname;

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }}
            >
              MH
            </Link>
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>My public gallery</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/library" style={{ color: "#0F4C81" }}>Library</Link>
            <Link href="/profile" style={{ color: "#5a6f82" }}>Profile</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="mb-6 text-sm" style={{ color: "#5a6f82" }}>
          Only files you marked public appear here. Other users cannot see this page.
        </p>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="py-16 text-center text-sm" style={{ color: "#5a6f82" }}>Loading…</p>
        ) : files.length === 0 ? (
          <div className="mh-glass-strong py-16 text-center">
            <p className="text-sm" style={{ color: "#5a6f82" }}>No public files yet</p>
            <Link href="/library" className="mh-btn mh-btn-primary mt-4 inline-flex px-5 py-2.5">Upload from Library</Link>
          </div>
        ) : (
          <div className="mh-grid-media">
            {files.map((file) => (
              <div key={file.url} className="mh-media-card overflow-hidden">
                <div className="aspect-video bg-white/40">
                  {isImg(file.contentType) ? (
                    <img src={file.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs" style={{ color: "#5a6f82" }}>File</div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <p className="truncate text-sm font-medium">{nm(file)}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => copy(file.url)} className="mh-btn mh-btn-primary flex-1 py-1.5 text-xs">
                      {copied === file.url ? "Copied" : "Copy URL"}
                    </button>
                    <button type="button" onClick={() => del(file.url)} className="rounded-full border border-red-200 bg-white/70 px-3 py-1.5 text-xs text-red-600">
                      Del
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
