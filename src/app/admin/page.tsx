"use client";
import { useState, useCallback } from "react";
import Link from "next/link";

const SK = "mh_admin_secret";

function fmtBytes(n: number) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

export default function AdminPage() {
  const [secret, setSecret] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(SK) || "" : ""
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  const headers = useCallback(() => {
    const h: Record<string, string> = { "x-admin-secret": secret };
    return h;
  }, [secret]);

  const load = async (sec: string) => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/users", {
      headers: { "x-admin-secret": sec },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Access denied");
      setStats(null);
      setUsers([]);
      return;
    }
    sessionStorage.setItem(SK, sec);
    setSecret(sec);
    setStats(data.stats);
    setUsers(data.users || []);
  };

  const unlock = (e: React.FormEvent) => {
    e.preventDefault();
    load(input.trim());
  };

  const delUser = async (id: number, username: string) => {
    if (!confirm(`Delete user @${username} and all their files?`)) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    await load(secret);
  };

  const clearPublic = async () => {
    if (!confirm("Unpublish all public gallery items?")) return;
    const res = await fetch("/api/admin/clear-public", {
      method: "POST",
      headers: headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    alert(`Cleared ${data.cleared || 0} public items`);
    await load(secret);
  };

  if (!stats) {
    return (
      <div className="mh-mesh flex min-h-screen flex-col">
        <header className="mh-nav-glass sticky top-0 z-20">
          <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Admin</span>
            <Link href="/" className="text-sm" style={{ color: "#3BACB6" }}>Home</Link>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
          <form onSubmit={unlock} className="mh-glass-strong space-y-4 p-8">
            <h1 className="text-xl font-bold" style={{ color: "#1A2B3C" }}>Admin panel</h1>
            <p className="text-sm" style={{ color: "#5a6f82" }}>
              Enter <code className="text-xs">ADMIN_SECRET</code> from Vercel env.
            </p>
            <input
              type="password"
              className="mh-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ADMIN_SECRET"
              autoComplete="off"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="mh-btn mh-btn-primary h-11 w-full">
              {loading ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Admin</span>
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={() => load(secret)} style={{ color: "#0F4C81" }}>Refresh</button>
            <Link href="/library" style={{ color: "#5a6f82" }}>Library</Link>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(SK);
                setSecret("");
                setStats(null);
                setUsers([]);
              }}
              style={{ color: "#b91c1c" }}
            >
              Lock
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { l: "Users", v: stats.users },
            { l: "Files", v: stats.files },
            { l: "Storage", v: fmtBytes(stats.totalBytes) },
            { l: "Public", v: stats.publicFiles },
          ].map((c) => (
            <div key={c.l} className="mh-glass p-4">
              <p className="text-xs font-semibold" style={{ color: "#5a6f82" }}>{c.l}</p>
              <p className="mt-1 text-xl font-bold" style={{ color: "#1A2B3C" }}>{c.v}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className="mh-btn mh-btn-outline px-4 py-2 text-sm" onClick={clearPublic}>
            Clear public gallery
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mh-glass-strong mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/50 text-xs" style={{ color: "#5a6f82" }}>
                <th className="p-3">User</th>
                <th className="p-3">Email</th>
                <th className="p-3">Files</th>
                <th className="p-3">Size</th>
                <th className="p-3">Last login</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/30">
                  <td className="p-3 font-medium">@{u.username}</td>
                  <td className="p-3 text-xs" style={{ color: "#5a6f82" }}>{u.email || "—"}</td>
                  <td className="p-3">{u.fileCount}</td>
                  <td className="p-3">{fmtBytes(u.totalBytes)}</td>
                  <td className="p-3 text-xs" style={{ color: "#5a6f82" }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    <button type="button" className="text-xs text-red-600 underline" onClick={() => delUser(u.id, u.username)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
