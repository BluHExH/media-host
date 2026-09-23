"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForgotPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not verify account");
      return;
    }
    if (data.resetToken) {
      sessionStorage.setItem("mh_reset_token", data.resetToken);
      router.push("/reset");
    } else {
      setError("Unexpected response");
    }
  };

  return (
    <div className="mh-mesh flex min-h-screen flex-col">
      <header className="mh-nav-glass sticky top-0 z-20">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold" style={{ color: "#1A2B3C" }}>Media Host</Link>
          <Link href="/login" className="text-sm" style={{ color: "#3BACB6" }}>Sign in</Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mh-glass-strong p-8">
          <h1 className="text-2xl font-bold" style={{ color: "#1A2B3C" }}>Forgot password</h1>
          <p className="mt-2 text-sm" style={{ color: "#5a6f82" }}>
            Username + the recovery email saved on this account.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Username</label>
              <input className="mh-input" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#5a6f82" }}>Recovery email</label>
              <input type="email" className="mh-input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-700 space-y-2">
                <p>{error}</p>
                {/no recovery email/i.test(error) && (
                  <p className="text-xs text-red-800/90">
                    <strong>What to do:</strong> If you still know the password →{" "}
                    <Link href="/login" className="underline font-semibold">Sign in</Link>
                    {" "}→ Profile → add recovery email. If you forgot the password too →{" "}
                    <Link href="/login?tab=register" className="underline font-semibold">create a new account</Link>
                    {" "}with email (old files stay on the old account only).
                  </p>
                )}
              </div>
            )}
            <button type="submit" disabled={loading} className="mh-btn mh-btn-primary h-12 w-full disabled:opacity-50">
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
