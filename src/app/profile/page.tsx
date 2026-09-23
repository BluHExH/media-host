"use client";
import { useState, useEffect, useRef } from "react";
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
  const [email, setEmail] = useState("");
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
    setEmail(data.user?.email || "");
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
      body: JSON.stringify({ displayName, username, email }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    if (data.token) localStorage.setItem(TK, data.token);
    setUser(data.user);
    setOk("Profile saved (email used for password recovery)");
  };

  const onAvatar = async (list: FileList | null) => {
    if (!list?.length) return;
    setAvatarBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", list[0]);
    const res = await authFetch("/api/profile/avatar", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setAvatarBusy(false);
    if (!res.ok) {
      setError(data.error || "Avatar upload failed");
      return;
    }
    setUser((u: any) => ({ ...u, avatarUrl: data.avatarUrl || data.url }));
    setOk("Avatar updated");
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
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    clearAuth();
    router.replace("/");
  };

  if (loading) {
    return <div className="mh-mesh flex min-h-screen items-center justify-center text-[#5a6f82]">Loading profile…</div>;
  }

  const maxAct = Math.max(1, ...activity.map((a) => a.uploads + a.logins));

  return (
    <div className="mh-mesh min-h-screen">
      <header className="mh-nav-glass sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Media Host</Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/library" style={{ color: "#5a6f82" }}>Library</Link>
            <button type="button" onClick={() => { clearAuth(); router.replace("/login"); }} style={{ color: "#b91c1c" }}>Sign out</button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mh-glass-strong p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <button type="button" onClick={() => avatarRef.current?.click()} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border bg-white/50" disabled={avatarBusy}>
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-2xl font-bold" style={{ color: "#0F4C81" }}>
                  {(user?.displayName || user?.username || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
            </button>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatar(e.target.files)} />
            <div>
              <h1 className="text-xl font-bold" style={{ color: "#1A2B3C" }}>{user?.displayName || user?.username}</h1>
              <p className="text-sm" style={{ color: "#5a6f82" }}>@{user?.username}</p>
              <p className="mt-1 text-xs" style={{ color: "#5a6f82" }}>{stats.files} files · click avatar to change photo</p>
            </div>
          </div>

          <form onSubmit={saveProfile} className="mt-6 space-y-4 border-t border-white/40 pt-6">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mh-input" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="mh-input" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Recovery email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mh-input" placeholder="you@example.com" />
              <p className="mt-1 text-[11px]" style={{ color: "#5a6f82" }}>Required for Forgot password</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {ok && <p className="text-sm text-emerald-700">{ok}</p>}
            <button type="submit" disabled={saving} className="mh-btn mh-btn-primary px-6 py-2.5 disabled:opacity-50">
              {saving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </div>

        <div className="mh-glass mt-6 p-6">
          <h2 className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Activity (14 days)</h2>
          <div className="mt-4 flex h-28 items-end gap-1">
            {activity.map((a) => {
              const h = Math.round(((a.uploads + a.logins) / maxAct) * 100);
              return (
                <div key={a.day} className="flex flex-1 flex-col items-center gap-1" title={`${a.day}: ${a.uploads} up · ${a.logins} login`}>
                  <div className="w-full rounded-t bg-gradient-to-t from-[#0F4C81] to-[#82DBD8]" style={{ height: `${Math.max(4, h)}%` }} />
                  <span className="text-[9px]" style={{ color: "#5a6f82" }}>{a.day.slice(8)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/80 p-4">
          <p className="text-sm font-semibold text-red-800">Danger zone</p>
          <button type="button" disabled={deleting} onClick={deleteAccount} className="mt-3 rounded-full border border-red-300 px-4 py-2 text-sm text-red-700">
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </main>
    </div>
  );
}
