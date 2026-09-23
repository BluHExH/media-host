"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  url: string;
  pathname?: string;
  contentType?: string;
  size?: number;
  album?: string;
};

function isImg(t?: string) {
  return !!t && t.startsWith("image/");
}

export default function GalleryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/list?public=1", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Failed to load gallery");
        } else {
          setItems(data.files || data.items || []);
        }
      } catch {
        setError("Failed to load gallery");
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>
            Media Host
          </Link>
          <nav className="mh-nav-links text-sm">
            <Link href="/library" style={{ color: "#5a6f82" }}>
              Library
            </Link>
            <Link href="/login" style={{ color: "#0F4C81" }}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mh-page mx-auto max-w-5xl px-4 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1A2B3C" }}>
          Public gallery
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: "#5a6f82" }}>
          Only files marked public by their owners appear here. Your private library stays private.
        </p>

        {loading && (
          <p className="mt-10 text-center text-sm" style={{ color: "#5a6f82" }}>
            Loading…
          </p>
        )}
        {error && <p className="mh-alert mt-6 text-sm text-red-600">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <p className="mt-12 text-center text-sm" style={{ color: "#5a6f82" }}>
            No public items yet.
          </p>
        )}

        <div className="mh-grid-media mt-10">
          {items.map((f) => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="mh-media-card block overflow-hidden"
            >
              <div className="aspect-video bg-white/40">
                {isImg(f.contentType) ? (
                  <img src={f.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs" style={{ color: "#5a6f82" }}>
                    File
                  </div>
                )}
              </div>
              <div className="mh-card-body p-3.5">
                <p className="truncate text-sm font-medium leading-snug">
                  {decodeURIComponent((f.pathname || f.url).split("/").pop() || "file")}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#5a6f82" }}>
                  {f.album || "general"}
                </p>
              </div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
