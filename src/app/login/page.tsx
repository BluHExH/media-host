"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const TK = "media_host_token";
const RK = "media_host_refresh";

function safeNext(raw: string | null): string {
  if (!raw) return "/library";
  // only same-origin relative paths; block //evil.com and javascript:
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes(":")) return "/library";
  return raw;
}

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
    if (tab === "register" && password.length < 8) {
      setLoading(false);
      setError("Password must be at least 8 characters");
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
    router.push(safeNext(search.get("next")));
  };

  return (
    <div className="mh-mesh flex min-h-screen flex-col">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #0F4C81, #3BACB6)" }}
            >
              MH
            </div>
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Media Host</span>
          </Link>
          <Link href="/" className="text-sm font-medium" style={{ color: "#3BACB6" }}>← Home</Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mh-fade-up mh-glass-strong p-8">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1A2B3C", fontFamily: "var(--font-display), sans-serif" }}>
            {tab === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#5a6f82" }}>
            {tab === "login" ? "Sign in to your private media library." : "Free forever. Files stay private to your account."}
          </p>
          <div
            className="mt-6 flex rounded-full p-1"
            style={{ background: "rgba(245,249,252,0.8)", border: "1px solid rgba(15,76,129,0.1)" }}
          >
            <button
              type="button"
              onClick={() => setTab("login")}
              className="flex-1 rounded-full py-2 text-sm font-semibold transition"
              style={tab === "login" ? { background: "rgba(255,255,255,0.95)", color: "#0F4C81", boxShadow: "0 4px 14px rgba(15,76,129,0.12)" } : { color: "#5a6f82" }}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className="flex-1 rounded-full py-2 text-sm font-semibold transition"
              style={tab === "register" ? { background: "rgba(255,255,255,0.95)", color: "#0F4C81", boxShadow: "0 4px 14px rgba(15,76,129,0.12)" } : { color: "#5a6f82" }}
            >
              Register
            </button>
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="mh-input" placeholder="yourname" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === "register" ? "new-password" : "current-password"} className="mh-input" placeholder="min 8 characters" />
            </div>
            {error && <p className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={loading} className="mh-btn mh-btn-primary h-12 w-full disabled:opacity-50">
              {loading ? "Please wait…" : tab === "register" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs" style={{ color: "#5a6f82" }}>Session lasts 30 days · passwords are hashed (PBKDF2)</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center" style={{ color: "#5a6f82" }}>Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
