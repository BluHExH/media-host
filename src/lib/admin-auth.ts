import type { NextRequest } from "next/server";

/** Shared admin gate — requires ADMIN_SECRET env and matching x-admin-secret header. */
export function isAdmin(request: NextRequest): boolean {
  const secret = request.headers.get("x-admin-secret") || "";
  const expected = process.env.ADMIN_SECRET || "";
  if (!expected || expected.length < 8) return false;
  return secret === expected;
}
