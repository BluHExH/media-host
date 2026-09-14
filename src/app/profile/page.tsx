"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TK = "media_host_token";
const RK = "media_host_refresh";

type Activity = { day: string; uploads: number; logins: number };

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ files: 0, totalBytes: 0 });
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => {
    const token = localStorage.getItem(TK) || "";
    if (!token) {
      router.replace("/login?next=/profile");
      return;
    }
    (async () => {
      try {
        let res = await fetch("/api/profile", { headers: { "x-auth-token": token }, cache: "no-store" });
        if (res.status === 401) {
          const rt = localStorage.getItem(RK) || "";
          if (rt) {
            const r = await fetch("/api/auth/refresh", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refreshToken: rt }),
            });
            if (r.ok) {
              const d = await r.json();
              localStorage.setItem(TK, d.token);
              if (d.refreshToken) localStorage.setItem(RK, d.refreshToken);
              res = await fetch("/api/profile", { headers: { "x-auth-token": d.token }, cache: "no-store" });
            }
          }
        }
        if (res.status === 401) {
          localStorage.removeItem(TK);
          localStorage.removeItem(RK);
          router.replace("/login?next=/profile");
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          setLoading(false);
          return;
        }
        setUser(data.user);
        setStats(data.stats || { files: 0, totalBytes: 0 });
        setActivity(data.activity || []);
      } catch {
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const fmt = (b: number) =>
    b < 1024 ? b + " B" : b < 1e6 ? (b / 1024).toFixed(1) + " KB" : (b / 1e6).toFixed(1) + " MB";
  const maxY = Math.max(1, ...activity.map((a) => a.uploads + a.logins));

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading…</div>;
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
        {user && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
                  {(user.displayName || user.username || "?").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{user.displayName || user.username}</h1>
                  <p className="text-sm text-slate-500">@{user.username}</p>
                </div>
              </div>
              <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-400">Account created</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-400">Last login</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}
                  </dd>
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
              <p className="mt-1 text-xs text-slate-400">Blue = uploads · Gray = logins</p>
              <div className="mt-6 flex h-40 items-end gap-1.5">
                {activity.map((a) => {
                  const upH = Math.round((a.uploads / maxY) * 100);
                  const logH = Math.round((a.logins / maxY) * 100);
                  return (
                    <div key={a.day} className="flex flex-1 flex-col items-center gap-1" title={`${a.day}: ${a.uploads} uploads, ${a.logins} logins`}>
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
          </>
        )}
      </main>
    </div>
  );
}
