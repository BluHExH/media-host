"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetPath, setResetPath] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResetPath("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        setLoading(false);
        return;
      }
      if (data.resetPath) {
        setResetPath(data.resetPath);
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
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
        <div className="mh-fade-up mh-glass-strong p-8">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "#1A2B3C", fontFamily: "var(--font-display), sans-serif" }}
          >
            Forgot password
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#5a6f82" }}>
            Enter the <strong>username</strong> and <strong>email</strong> you used when
            registering. We will give you a one-time reset link (valid 1 hour).
          </p>

          {!resetPath ? (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>
                  Username
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="mh-input"
                  placeholder="yourname"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mh-input"
                  placeholder="you@email.com"
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
                {loading ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : (
            <div className="mt-6 space-y-4">
              <p className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-800">
                Identity verified. Open the reset page and set a new password.
              </p>
              <button
                type="button"
                className="mh-btn mh-btn-primary h-12 w-full"
                onClick={() => router.push(resetPath)}
              >
                Set new password
              </button>
              <p className="text-center text-xs" style={{ color: "#5a6f82" }}>
                Link expires in 1 hour. Do not share it.
              </p>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs" style={{ color: "#5a6f82" }}>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold underline" style={{ color: "#0F4C81" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
