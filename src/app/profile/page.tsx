"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch, clearAuth, hasSession, ensureSession, TK } from "@/lib/client-auth";

type Activity = { day: string; uploads: number; logins: number };

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ files: 0, totalBytes: 0 });
  const [activity, setActivity] = useState<Activity[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const res = await authFetch("/api/profile", { cache: "no-store" });
    if (res.status === 401) {
      clearAuth();
      router.replace("/login?next=/profile");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to load profile");
      setLoading(false);
      return;
    }
    setUser(data.user);
    setDisplayName(data.user?.displayName || data.user?.username || "");
    setUsername(data.user?.username || "");
    setStats(data.stats || { files: 0, totalBytes: 0 });
    setActivity(data.activity || []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 0));
      if (!hasSession()) {
        router.replace("/login?next=/profile");
        return;
      }
      const okSession = await ensureSession();
      if (cancelled) return;
      if (!okSession && !localStorage.getItem(TK)) {
        router.replace("/login?next=/profile");
        return;
      }
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOk("");
    setSaving(true);
    const res = await authFetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, username }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    if (data.token) localStorage.setItem(TK, data.token);
    setUser(data.user);
    setOk("Profile saved");
  };

  const onAvatar = async (list: FileList | null) => {
    if (!list?.length) return;
    setAvatarBusy(true);
    setError("");
    setOk("");
    const fd = new FormData();
    fd.append("file", list[0]);
    const res = await authFetch("/api/profile/avatar", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setAvatarBusy(false);
    if (!res.ok) {
      setError(data.error || "Avatar failed");
      return;
    }
    setUser((u: any) => ({ ...u, avatarUrl: data.avatarUrl }));
    setOk("Profile photo updated");
  };

  const deleteAccount = async () => {
    if (!confirm("Delete your account and all files permanently?")) return;
    if (!confirm("This cannot be undone.")) return;
    setDeleting(true);
    const res = await authFetch("/api/profile", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    setDeleting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Delete failed");
      return;
    }
    clearAuth();
    router.replace("/login");
  };

  const fmt = (b: number) =>
    b < 1024 ? b + " B" : b < 1e6 ? (b / 1024).toFixed(1) + " KB" : (b / 1e6).toFixed(1) + " MB";
  const maxY = Math.max(1, ...activity.map((a) => a.uploads + a.logins));

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading profile…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">MH</Link>
            <span className="text-sm font-semibold">Profile</span>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/library" className="text-slate-600 hover:text-slate-900">Library</Link>
            <Link href="/" className="text-slate-600 hover:text-slate-900">Home</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {ok && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>}
        {user && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <button type="button" onClick={() => avatarRef.current?.click()} className="relative group" disabled={avatarBusy}>
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-2xl font-bold text-blue-700 ring-2 ring-white shadow">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (user.displayName || user.username || "?").slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100">
                    {avatarBusy ? "…" : "Change"}
                  </span>
                </button>
                <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatar(e.target.files)} />
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{user.displayName || user.username}</h1>
                  <p className="text-sm text-slate-500">@{user.username}</p>
                </div>
              </div>
              <form onSubmit={saveProfile} className="mt-6 space-y-4 border-t border-slate-100 pt-6">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Display name</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Username</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                </div>
                <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Save profile"}
                </button>
              </form>
              <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-400">Account created</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-400">Last login</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-400">Files</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{stats.files}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-400">Storage used</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{fmt(stats.totalBytes)}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Activity (last 14 days)</h2>
              <div className="mt-6 flex h-40 items-end gap-1.5">
                {activity.map((a) => {
                  const upH = Math.round((a.uploads / maxY) * 100);
                  const logH = Math.round((a.logins / maxY) * 100);
                  return (
                    <div key={a.day} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-32 w-full flex-col justify-end gap-0.5">
                        <div className="w-full rounded-t bg-blue-500/90" style={{ height: `${upH}%`, minHeight: a.uploads ? 4 : 0 }} />
                        <div className="w-full rounded-b bg-slate-300" style={{ height: `${logH}%`, minHeight: a.logins ? 3 : 0 }} />
                      </div>
                      <span className="text-[9px] text-slate-400">{a.day.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-6">
              <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>
              <button type="button" onClick={deleteAccount} disabled={deleting} className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700">
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
