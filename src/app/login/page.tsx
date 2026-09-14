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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">MH</div>
            <span className="text-sm font-semibold">Media Host</span>
          </Link>
          <Link href="/" className="text-sm text-slate-500">← Back</Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {tab === "login" ? "Sign in" : "Create free account"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {tab === "login"
            ? "Access your private media library."
            : "Register to upload. Your files stay private to your account."}
        </p>
        <div className="mt-8 flex rounded-lg border border-slate-200 bg-white p-1">
          <button type="button" onClick={() => setTab("login")} className={`flex-1 rounded-md py-2 text-sm font-medium ${tab === "login" ? "bg-slate-900 text-white" : "text-slate-500"}`}>Sign in</button>
          <button type="button" onClick={() => setTab("register")} className={`flex-1 rounded-md py-2 text-sm font-medium ${tab === "register" ? "bg-slate-900 text-white" : "text-slate-500"}`}>Register</button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === "register" ? "new-password" : "current-password"} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Please wait…" : tab === "register" ? "Create account" : "Sign in"}
          </button>
        </form>
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
