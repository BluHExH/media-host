const TK = "media_host_token";
const RK = "media_host_refresh";

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TK) || "";
}

export function getRefreshToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(RK) || "";
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TK);
  localStorage.removeItem(RK);
  localStorage.removeItem("media_host_pass");
}

export function hasSession(): boolean {
  if (typeof window === "undefined") return false;
  return !!(localStorage.getItem(TK) || localStorage.getItem(RK));
}

async function tryRefresh(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  try {
    const r = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!r.ok) {
      clearAuth();
      return null;
    }
    const d = await r.json();
    if (d.token) localStorage.setItem(TK, d.token);
    if (d.refreshToken) localStorage.setItem(RK, d.refreshToken);
    return d.token || null;
  } catch {
    return null;
  }
}

export async function ensureSession(): Promise<boolean> {
  if (getAccessToken()) return true;
  const t = await tryRefresh();
  return !!t;
}

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  let token = getAccessToken();

  if (!token) {
    token = (await tryRefresh()) || "";
  }
  if (token) headers.set("x-auth-token", token);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401 && typeof window !== "undefined") {
    const newToken = await tryRefresh();
    if (newToken) {
      headers.set("x-auth-token", newToken);
      res = await fetch(input, { ...init, headers });
    }
  }
  return res;
}

export { TK, RK };
