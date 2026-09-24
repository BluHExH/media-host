"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    const fromQuery = search.get("token") || "";
    const fromSession = sessionStorage.getItem("mh_reset_token") || "";
    const t = fromQuery || fromSession;
    if (fromQuery) sessionStorage.setItem("mh_reset_token", fromQuery);
    setToken(t);
    if (!t) setError("No reset session. Start from Forgot password.");
  }, [search]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOk("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("No reset session. Start from Forgot password.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetToken: token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Reset failed");
      return;
    }
    sessionStorage.removeItem("mh_reset_token");
    setOk("Password updated. Redirecting to sign in…");
    setTimeout(() => router.push("/login"), 1200);
  };

  return (
    <div className="mh-mesh flex min-h-screen flex-col">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Media Host</Link>
          <Link href="/login" className="text-sm" style={{ color: "#3BACB6" }}>Sign in</Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-14">
        <div className="mh-glass-strong p-8">
          <h1 className="text-xl font-bold" style={{ color: "#1A2B3C" }}>New password</h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "#5a6f82" }}>
            Choose a strong password (min 8 characters).
          </p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-xs font-semibold" style={{ color: "#5a6f82" }}>New password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  className="mh-input pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#5a6f82" }} onClick={() => setShowPass((v) => !v)}>
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Confirm</label>
              <input
                type={showPass ? "text" : "password"}
                className="mh-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {ok && <p className="text-sm text-emerald-700">{ok}</p>}
            <button type="submit" disabled={loading || !token} className="mh-btn mh-btn-primary h-12 w-full disabled:opacity-50">
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
