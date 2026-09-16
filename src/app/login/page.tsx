"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const TK = "media_host_token";
const RK = "media_host_refresh";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (search.get("tab") === "register") setTab("register");
  }, [search]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (!username.trim() || !password) {
      setLoading(false);
      setError("Username and password required");
      return;
    }
    if (tab === "register" && password.length < 6) {
      setLoading(false);
      setError("Password must be at least 6 characters");
      return;
    }
    const endpoint = tab === "register" ? "/api/auth/register" : "/api/auth/login";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        password,
        displayName: username.trim(),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    localStorage.setItem(TK, data.token);
    if (data.refreshToken) localStorage.setItem(RK, data.refreshToken);
    localStorage.removeItem("media_host_pass");
    const next = search.get("next");
    router.push(next && next.startsWith("/") ? next : "/library");
  };

  return (
    <div className="mh-mesh flex min-h-screen flex-col">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white">MH</div>
            <span className="text-sm font-semibold">Media Host</span>
          </Link>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Home</Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mh-fade-up mh-card p-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{tab === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-sm text-slate-500">{tab === "login" ? "Sign in to your private media library." : "Free forever. Files stay private to your account."}</p>
          <div className="mt-6 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => setTab("login")} className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${tab === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Sign in</button>
            <button type="button" onClick={() => setTab("register")} className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${tab === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Register</button>
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="mh-input" placeholder="yourname" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === "register" ? "new-password" : "current-password"} className="mh-input" placeholder="••••••••" />
            </div>
            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={loading} className="mh-btn mh-btn-primary h-11 w-full disabled:opacity-50">{loading ? "Please wait…" : tab === "register" ? "Create account" : "Sign in"}</button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Session lasts 30 days · passwords are hashed</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
