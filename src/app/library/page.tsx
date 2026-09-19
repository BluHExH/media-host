"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Temporary redirect while full library is restored */
export default function LibraryPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
      Restoring library… redirecting home.
    </div>
  );
}
