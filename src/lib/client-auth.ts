const TK = "media_host_token";
const RK = "media_host_refresh";

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TK) || "";
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TK);
  localStorage.removeItem(RK);
  localStorage.removeItem("media_host_pass");
}

/** Fetch with auto refresh on 401 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  let token = getAccessToken();
  if (token) headers.set("x-auth-token", token);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401 && typeof window !== "undefined") {
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
        headers.set("x-auth-token", d.token);
        res = await fetch(input, { ...init, headers });
      } else {
        clearAuth();
      }
    }
  }
  return res;
}

export { TK, RK };
