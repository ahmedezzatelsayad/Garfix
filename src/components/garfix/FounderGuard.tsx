"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { isFounderEmail } from "@/lib/founder";

/**
 * FounderGuard — client-side guard for founder-only pages (DS v4.0)
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
 *
 * DS v4.0 Styling:
 * - Emerald Deep (#047857) accent colors
 * - shadow-brand-md for access denied card
 * - Dark-first hierarchy: #0b1220 background
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
          <div className="w-10 h-10 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-sm text-emerald-400/80">جارٍ التحقق من الصلاحيات…</p>
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
        <div className="max-w-md w-full text-center space-y-4 glass rounded-2xl p-8 shadow-brand-md border border-border/50">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
            <Shield size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-xl font-extrabold text-foreground">🔒 صلاحية غير كافية</h1>
          <p className="text-sm text-emerald-100/70 leading-relaxed">
            عذراً، هذه الصفحة متاحة لحساب المؤسس فقط.
            <br />
            جارٍ تحويلك إلى لوحة التحكم الرئيسية…
          </p>
          <div className="pt-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              جارٍ التحويل...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
