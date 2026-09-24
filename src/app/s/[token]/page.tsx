"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function SharePage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");

  const open = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/share", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not open link");
      return;
    }
    setUrl(data.url);
    if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mh-mesh flex min-h-screen flex-col">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>
            Media Host
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-14">
        <div className="mh-glass-strong p-8">
          <h1 className="text-xl font-bold" style={{ color: "#1A2B3C" }}>
            Shared file
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "#5a6f82" }}>
            Enter the password if the owner set one, then open the file.
          </p>
          <form onSubmit={open} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-xs font-semibold" style={{ color: "#5a6f82" }}>
                Password (if required)
              </label>
              <input
                type="password"
                className="mh-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty if none"
                autoComplete="off"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {url && (
              <p className="break-all text-xs" style={{ color: "#5a6f82" }}>
                <a href={url} target="_blank" rel="noreferrer" className="underline" style={{ color: "#0F4C81" }}>
                  Open file
                </a>
              </p>
            )}
            <button type="submit" disabled={loading} className="mh-btn mh-btn-primary h-12 w-full">
              {loading ? "Checking…" : "Open shared file"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
