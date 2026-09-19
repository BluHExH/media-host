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
    return <div className="mh-mesh flex min-h-screen items-center justify-center text-[#5a6f82]">Loading profile…</div>;
  }

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }}>MH</Link>
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Profile</span>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/library" style={{ color: "#0F4C81" }}>Library</Link>
            <Link href="/" style={{ color: "#5a6f82" }}>Home</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        {error && <p className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-700">{error}</p>}
        {ok && <p className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-800">{ok}</p>}
        {user && (
          <>
            <div className="mh-glass-strong p-6">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <button type="button" onClick={() => avatarRef.current?.click()} className="relative group" disabled={avatarBusy}>
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-2xl font-bold text-white ring-2 ring-white shadow-lg" style={{ background: "linear-gradient(135deg,#0F4C81,#3BACB6)" }}>
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
                  <h1 className="text-xl font-bold" style={{ color: "#1A2B3C" }}>{user.displayName || user.username}</h1>
                  <p className="text-sm" style={{ color: "#5a6f82" }}>@{user.username}</p>
                </div>
              </div>
              <form onSubmit={saveProfile} className="mt-6 space-y-4 border-t border-white/40 pt-6">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "#5a6f82" }}>Display name</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mh-input" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "#5a6f82" }}>Username</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} className="mh-input" />
                </div>
                <button type="submit" disabled={saving} className="mh-btn mh-btn-primary px-5 py-2.5 disabled:opacity-50">
                  {saving ? "Saving…" : "Save profile"}
                </button>
              </form>
              <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                {["Account created", "Last login", "Files", "Storage used"].map((label, i) => {
                  const vals = [
                    user.createdAt ? new Date(user.createdAt).toLocaleString() : "—",
                    user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—",
                    String(stats.files),
                    fmt(stats.totalBytes),
                  ];
                  return (
                    <div key={label} className="rounded-2xl bg-white/50 px-4 py-3 backdrop-blur-sm">
                      <dt className="text-xs" style={{ color: "#5a6f82" }}>{label}</dt>
                      <dd className="mt-0.5 font-medium" style={{ color: "#1A2B3C" }}>{vals[i]}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
            <div className="mh-glass-strong p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Activity (last 14 days)</h2>
                <div className="flex gap-3 text-[10px]" style={{ color: "#5a6f82" }}>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#0F4C81" }} /> Uploads</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-slate-300" /> Logins</span>
                </div>
              </div>
              {activity.length === 0 || activity.every((a) => !a.uploads && !a.logins) ? (
                <p className="mt-8 text-center text-sm" style={{ color: "#5a6f82" }}>No activity yet — upload a file or sign in again to see the graph.</p>
              ) : (
                <div className="mt-6 flex h-44 items-end gap-1.5">
                  {activity.map((a) => {
                    const upPx = a.uploads ? Math.max(6, Math.round((a.uploads / maxY) * 120)) : 0;
                    const logPx = a.logins ? Math.max(4, Math.round((a.logins / maxY) * 120)) : 0;
                    return (
                      <div key={a.day} className="flex flex-1 flex-col items-center gap-1" title={`${a.day}: ${a.uploads} uploads, ${a.logins} logins`}>
                        <div className="flex h-32 w-full flex-col justify-end gap-0.5">
                          <div className="w-full rounded-t" style={{ height: upPx, background: "#0F4C81" }} />
                          <div className="w-full rounded-b bg-slate-300" style={{ height: logPx }} />
                        </div>
                        <span className="text-[9px]" style={{ color: "#5a6f82" }}>{a.day.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mh-glass p-6" style={{ borderColor: "rgba(248,113,113,0.4)" }}>
              <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>
              <button type="button" onClick={deleteAccount} disabled={deleting} className="mt-4 rounded-full border border-red-300 bg-white/80 px-4 py-2 text-sm font-medium text-red-700">
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
