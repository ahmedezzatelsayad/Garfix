"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFounderEmail } from "@/lib/founder";

/**
 * FounderGuard — client-side guard for founder-only pages.
 *
 * Middleware handles /api/* auth, but page routes under /founder-panel/*
 * are publicly accessible (in PUBLIC_PAGE_PREFIXES) so the founder can
 * bookmark them. Without this guard, a non-founder who types the URL
 * would see the page render with empty data (queries 403 silently).
 *
 * This guard:
 *   1. Waits for AuthContext to resolve (loading state)
 *   2. If user is not logged in → redirect to /login?returnTo=<current>
 *   3. If user is logged in but not founder → redirect to / (dashboard)
 *   4. If founder → render children
 */
export function FounderGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const returnTo = encodeURIComponent(window.location.pathname);
      router.replace(`/login?returnTo=${returnTo}`);
      return;
    }
    if (!isFounderEmail(user.email)) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground"
        dir="rtl"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm">جارٍ التحقق من الصلاحيات…</p>
        </div>
      </div>
    );
  }

  if (!isFounderEmail(user.email)) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6"
        dir="rtl"
      >
        <div className="max-w-md w-full text-center space-y-3">
          <h1 className="text-xl font-extrabold">صلاحية غير كافية</h1>
          <p className="text-sm text-muted-foreground">
            هذه الصفحة متاحة لحساب المؤسس فقط. جارٍ تحويلك إلى لوحة التحكم…
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
