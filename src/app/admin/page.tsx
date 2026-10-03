"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";

const SK = "mh_admin_secret";

function fmtBytes(n: number) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return "—";
  }
}

function fileName(pathname?: string, url?: string) {
  const p = pathname || url || "";
  try {
    return decodeURIComponent(p.split("/").pop() || "file");
  } catch {
    return p.split("/").pop() || "file";
  }
}

type Tab = "users" | "media" | "logs";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("users");
  const [q, setQ] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [resetFor, setResetFor] = useState<{ id: number; username: string } | null>(null);
  const [newPass, setNewPass] = useState("");
  const [resetResult, setResetResult] = useState("");

  useEffect(() => {
    const s = sessionStorage.getItem(SK) || "";
    if (s) {
      setSecret(s);
      loadAll(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headers = useCallback(
    (sec?: string) => ({ "x-admin-secret": sec || secret }),
    [secret]
  );

  const loadAll = async (sec: string) => {
    setLoading(true);
    setError("");
    try {
      const [uRes, mRes, lRes] = await Promise.all([
        fetch("/api/admin/users", { headers: headers(sec), cache: "no-store" }),
        fetch("/api/admin/media", { headers: headers(sec), cache: "no-store" }),
        fetch("/api/admin/logs", { headers: headers(sec), cache: "no-store" }),
      ]);
      const uData = await uRes.json().catch(() => ({}));
      if (!uRes.ok) {
        setError(uData.error || "Access denied");
        setStats(null);
        setUsers([]);
        sessionStorage.removeItem(SK);
        setSecret("");
        return;
      }
      sessionStorage.setItem(SK, sec);
      setSecret(sec);
      setStats(uData.stats);
      setUsers(uData.users || []);

      if (mRes.ok) {
        const mData = await mRes.json().catch(() => ({}));
        setFiles(mData.files || []);
      }
      if (lRes.ok) {
        const lData = await lRes.json().catch(() => ({}));
        setLogs(lData.logs || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const unlock = (e: React.FormEvent) => {
    e.preventDefault();
    loadAll(input.trim());
  };

  const delUser = async (id: number, username: string) => {
    if (!confirm(`Delete user @${username} and ALL their files permanently?`)) return;
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
    await loadAll(secret);
  };

  const toggleBan = async (id: number, username: string, currentlyBanned: boolean) => {
    const action = currentlyBanned ? "unban" : "ban";
    if (
      !confirm(
        currentlyBanned
          ? `Unban @${username}? They will be able to sign in again.`
          : `Ban @${username}? They cannot sign in until unbanned.`
      )
    )
      return;
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Ban update failed");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, banned: !currentlyBanned } : u)));
    if (stats) {
      setStats({
        ...stats,
        bannedUsers: Math.max(0, (stats.bannedUsers || 0) + (currentlyBanned ? -1 : 1)),
      });
    }
  };

  const submitResetPassword = async () => {
    if (!resetFor) return;
    if (newPass.trim().length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: resetFor.id,
        action: "reset_password",
        newPassword: newPass.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Reset failed");
      return;
    }
    setResetResult(data.temporaryPassword || newPass.trim());
    setError("");
  };

  const delFile = async (url: string) => {
    if (!confirm("Permanently delete this file?")) return;
    const res = await fetch("/api/admin/media", {
      method: "DELETE",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    setFiles((prev) => prev.filter((f) => f.url !== url));
    await loadAll(secret);
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
    await loadAll(secret);
  };

  const purgeTrash = async () => {
    if (!confirm("Permanently delete ALL files in trash (every user)?")) return;
    const res = await fetch("/api/admin/purge-trash", {
      method: "POST",
      headers: headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    alert(`Purged ${data.purged || 0} trash files`);
    await loadAll(secret);
  };

  const loadMedia = async (filter: string) => {
    setMediaFilter(filter);
    const qs =
      filter === "trash"
        ? "?album=trash"
        : filter === "public"
          ? "?album=public"
          : "";
    const res = await fetch("/api/admin/media" + qs, {
      headers: headers(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setFiles(data.files || []);
  };

  const filteredUsers = users.filter((u) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
      String(u.username || "").toLowerCase().includes(s) ||
      String(u.email || "").toLowerCase().includes(s) ||
      String(u.displayName || "").toLowerCase().includes(s)
    );
  });

  if (!stats) {
    return (
      <div className="mh-mesh flex min-h-screen flex-col">
        <header className="mh-nav-glass sticky top-0 z-20">
          <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>
              Media Host
            </Link>
            <span className="text-xs font-semibold" style={{ color: "#5a6f82" }}>
              Admin
            </span>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-14">
          <div className="mh-glass-strong p-8">
            <h1 className="text-xl font-bold" style={{ color: "#1A2B3C" }}>
              Admin unlock
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "#5a6f82" }}>
              Enter the <code className="text-xs">ADMIN_SECRET</code> from Vercel → Project →
              Settings → Environment Variables.
            </p>
            <form onSubmit={unlock} className="mt-8 space-y-5">
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
                {loading ? "Checking…" : "Unlock panel"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>
              Media Host
            </Link>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0F4C81" }}>
              Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="mh-btn mh-btn-outline px-3 py-1.5 text-xs"
              disabled={loading}
              onClick={() => loadAll(secret)}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              className="text-xs text-red-600 underline"
              onClick={() => {
                sessionStorage.removeItem(SK);
                setSecret("");
                setStats(null);
              }}
            >
              Lock
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {[
            { l: "Users", v: stats.users },
            { l: "Banned", v: stats.bannedUsers || 0 },
            { l: "Files", v: stats.files },
            { l: "Storage", v: fmtBytes(stats.totalBytes) },
            { l: "Public", v: stats.publicFiles },
            { l: "Trash", v: stats.trashFiles },
            { l: "Logins 24h", v: stats.logins24h },
          ].map((c) => (
            <div key={c.l} className="mh-glass p-4">
              <p className="text-xs font-semibold" style={{ color: "#5a6f82" }}>
                {c.l}
              </p>
              <p className="mt-1 text-xl font-bold" style={{ color: "#1A2B3C" }}>
                {c.v}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className="mh-btn mh-btn-outline px-4 py-2 text-sm" onClick={clearPublic}>
            Clear public gallery
          </button>
          <button type="button" className="mh-btn mh-btn-outline px-4 py-2 text-sm text-red-700" onClick={purgeTrash}>
            Purge all trash
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed" style={{ color: "#5a6f82" }}>
          Passwords are one-way hashed (PBKDF2) — they cannot be shown. Use <strong>Set password</strong> to
          assign a new one the user can sign in with.
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-8 flex flex-wrap gap-2 border-b border-white/40 pb-2">
          {(
            [
              ["users", "Users"],
              ["media", "Media"],
              ["logs", "Login logs"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={
                "rounded-full px-4 py-1.5 text-sm font-semibold transition " +
                (tab === k ? "text-white" : "")
              }
              style={
                tab === k
                  ? { background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }
                  : { color: "#5a6f82", background: "rgba(255,255,255,0.5)" }
              }
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <div className="mt-5">
            <input
              className="mh-input mb-4 max-w-sm"
              placeholder="Search username / email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="mh-glass-strong overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/50 text-xs" style={{ color: "#5a6f82" }}>
                    <th className="p-3">User</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Files</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">IP</th>
                    <th className="p-3">Last login</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-white/30">
                      <td className="p-3 font-medium">
                        @{u.username}
                        {u.displayName ? (
                          <span className="ml-1 text-xs font-normal" style={{ color: "#5a6f82" }}>
                            ({u.displayName})
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-xs" style={{ color: "#5a6f82" }}>
                        {u.email || "—"}
                      </td>
                      <td className="p-3">
                        {u.banned ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Banned
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-3">{u.fileCount}</td>
                      <td className="p-3">{fmtBytes(u.totalBytes)}</td>
                      <td className="p-3 font-mono text-xs" style={{ color: "#5a6f82" }}>
                        {u.lastIp || "—"}
                      </td>
                      <td className="p-3 text-xs" style={{ color: "#5a6f82" }}>
                        {fmtDate(u.lastLoginAt)}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-xs font-semibold underline"
                            style={{ color: u.banned ? "#059669" : "#b45309" }}
                            onClick={() => toggleBan(u.id, u.username, !!u.banned)}
                          >
                            {u.banned ? "Unban" : "Ban"}
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold underline"
                            style={{ color: "#0F4C81" }}
                            onClick={() => {
                              setResetFor({ id: u.id, username: u.username });
                              setNewPass("");
                              setResetResult("");
                            }}
                          >
                            Set password
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-600 underline"
                            onClick={() => delUser(u.id, u.username)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-sm" style={{ color: "#5a6f82" }}>
                        No users match
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "media" && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                ["all", "Recent"],
                ["public", "Public"],
                ["trash", "Trash"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    background: mediaFilter === k ? "#0F4C81" : "rgba(255,255,255,0.6)",
                    color: mediaFilter === k ? "#fff" : "#5a6f82",
                  }}
                  onClick={() => loadMedia(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mh-glass-strong overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/50 text-xs" style={{ color: "#5a6f82" }}>
                    <th className="p-3">File</th>
                    <th className="p-3">Owner</th>
                    <th className="p-3">Folder</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Public</th>
                    <th className="p-3">Uploaded</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.url} className="border-b border-white/30">
                      <td className="max-w-[200px] truncate p-3 text-xs font-medium">
                        <a href={f.url} target="_blank" rel="noreferrer" className="underline" style={{ color: "#0F4C81" }}>
                          {fileName(f.pathname, f.url)}
                        </a>
                      </td>
                      <td className="p-3 text-xs">@{f.username}</td>
                      <td className="p-3 text-xs">{f.album}</td>
                      <td className="p-3 text-xs">{fmtBytes(f.size)}</td>
                      <td className="p-3 text-xs">{f.isPublic ? "Yes" : "No"}</td>
                      <td className="p-3 text-xs" style={{ color: "#5a6f82" }}>
                        {fmtDate(f.createdAt)}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          className="text-xs text-red-600 underline"
                          onClick={() => delFile(f.url)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {files.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-sm" style={{ color: "#5a6f82" }}>
                        No files
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "logs" && (
          <div className="mh-glass-strong mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/50 text-xs" style={{ color: "#5a6f82" }}>
                  <th className="p-3">Time</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">OK</th>
                  <th className="p-3">IP</th>
                  <th className="p-3">Agent</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-white/30">
                    <td className="p-3 text-xs" style={{ color: "#5a6f82" }}>
                      {fmtDate(l.createdAt)}
                    </td>
                    <td className="p-3 text-xs">{l.username ? `@${l.username}` : "—"}</td>
                    <td className="p-3 text-xs font-medium">{l.action}</td>
                    <td className="p-3 text-xs">
                      <span className={l.success ? "text-emerald-700" : "text-red-600"}>
                        {l.success ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs" style={{ color: "#5a6f82" }}>
                      {l.ip || "—"}
                    </td>
                    <td className="max-w-[180px] truncate p-3 text-xs" style={{ color: "#5a6f82" }}>
                      {l.userAgent || "—"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-sm" style={{ color: "#5a6f82" }}>
                      No logs yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {resetFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!resetResult) setResetFor(null);
          }}
        >
          <div
            className="mh-glass-strong w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold" style={{ color: "#1A2B3C" }}>
              Set password for @{resetFor.username}
            </h2>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "#5a6f82" }}>
              Old password cannot be recovered (hashed). Enter a new password the user will use to
              sign in.
            </p>
            {!resetResult ? (
              <>
                <input
                  type="text"
                  className="mh-input mt-4"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  autoComplete="off"
                />
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    className="mh-btn mh-btn-primary flex-1 py-2.5"
                    onClick={submitResetPassword}
                  >
                    Save password
                  </button>
                  <button
                    type="button"
                    className="mh-btn mh-btn-outline px-4"
                    onClick={() => setResetFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm font-medium" style={{ color: "#059669" }}>
                  Password updated. Copy and share securely:
                </p>
                <p className="mt-2 break-all rounded-xl bg-white/70 p-3 font-mono text-sm">
                  {resetResult}
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="mh-btn mh-btn-primary flex-1 py-2.5"
                    onClick={() => navigator.clipboard.writeText(resetResult)}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="mh-btn mh-btn-outline px-4"
                    onClick={() => {
                      setResetFor(null);
                      setResetResult("");
                      setNewPass("");
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
