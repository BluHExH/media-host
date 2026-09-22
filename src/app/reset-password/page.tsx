"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function ResetForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Missing reset token. Start again from Forgot password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reset failed");
        setLoading(false);
        return;
      }
      setOk(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <div className="mh-glass-strong p-8 text-center">
        <p className="text-sm text-red-600">Invalid link.</p>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm underline" style={{ color: "#0F4C81" }}>
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <div className="mh-fade-up mh-glass-strong p-8">
      <h1
        className="text-2xl font-bold tracking-tight"
        style={{ color: "#1A2B3C", fontFamily: "var(--font-display), sans-serif" }}
      >
        Set new password
      </h1>
      <p className="mt-2 text-sm" style={{ color: "#5a6f82" }}>
        Choose a strong password (min 8 characters).
      </p>

      {ok ? (
        <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-800">
          Password updated. Redirecting to sign in…
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>
              New password
            </label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="mh-input pr-12"
                placeholder="min 8 characters"
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold"
                style={{ color: "#5a6f82" }}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>
              Confirm password
            </label>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="mh-input"
              placeholder="repeat password"
              required
            />
          </div>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mh-btn mh-btn-primary h-12 w-full disabled:opacity-50"
          >
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
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
            <span className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>
              Media Host
            </span>
          </Link>
          <Link href="/login" className="text-sm font-medium" style={{ color: "#3BACB6" }}>
            Sign in
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Suspense fallback={<div className="text-center text-sm" style={{ color: "#5a6f82" }}>Loading…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
