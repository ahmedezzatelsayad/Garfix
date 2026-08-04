/**
 * / — GarfiX home route.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE FIX (Vercel infinite-loading RCA):
 *
 * Previously this page rendered <PageLoader /> while `useAuth()` was
 * resolving the session, and only swapped to <EnhancedLandingPage /> or
 * <AppShell /> AFTER the auth fetch resolved. On Vercel, if /api/auth/me
 * hung (cold start, Redis timeout, etc.) the loader would spin forever.
 *
 * Now:
 *   - <EnhancedLandingPage /> is imported directly (NOT dynamic + ssr:false)
 *     so it renders on the server and reaches the user on the FIRST byte.
 *     This is critical for SEO — search engines see real marketing content
 *     instead of a loader skeleton.
 *   - While `loading === true`, we STILL render <EnhancedLandingPage />.
 *     A first-time visitor (no cookies) sees the marketing page instantly;
 *     an authenticated user briefly sees the landing page before being
 *     swapped to <AppShell /> when their session resolves. This is the
 *     correct UX tradeoff — never block the UI on auth.
 *   - <AppShell /> stays as a dynamic import (with ssr:false) because it
 *     pulls in 18 accounting module views + framer-motion + recharts +
 *     TanStack Query and would bloat the initial HTML for anonymous
 *     visitors. Authenticated users have already paid the network cost
 *     of the auth round-trip; the additional chunk fetch is invisible.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Behavior:
 *   - Unauthenticated users  → render the public marketing landing page
 *                              (EnhancedLandingPage) with Sign In / Get
 *                              Started buttons that route to /login and
 *                              /signup respectively.
 *   - Authenticated users    → render <AppShell />, which is the canonical
 *                              authenticated shell hosting the Sidebar +
 *                              Topbar + ALL 18 accounting module views.
 */
"use client";

import { useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
// P0 RCA FIX: direct import (SSR-enabled) so the landing page reaches the
// client on the first response byte. Previously this was a dynamic import
// with ssr:false, which meant the initial HTML was just <PageLoader /> —
// bad for SEO and bad for Vercel cold starts (no useful content until JS
// hydrates AND fetchMe resolves).
import { EnhancedLandingPage } from "@/modules/landing/EnhancedLandingPage";

// AppShell stays dynamic + ssr:false — it pulls in 18 accounting module
// views and is only relevant for authenticated users. Code-splitting keeps
// the initial JS payload small for anonymous visitors.
const AppShell = dynamic(() => import("@/modules/common/AppShell"), {
  ssr: false,
  loading: () => <PageLoader />,
});

function PageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleLogin = useCallback(() => {
    router.push("/login");
  }, [router]);

  const handleRegister = useCallback(() => {
    router.push("/signup");
  }, [router]);

  // Memoize the props passed to the landing page so it doesn't re-render
  // unnecessarily when auth state changes.
  const landingProps = useMemo(
    () => ({ onLogin: handleLogin, onRegister: handleRegister }),
    [handleLogin, handleRegister],
  );

  // ── 1. Authenticated → full accounting module shell ────────────────────
  // Auth takes priority: once we KNOW the user is signed in, swap to
  // AppShell immediately. We check `user` first so a signed-in user never
  // sees the landing page flash.
  if (!loading && user) {
    return <AppShell />;
  }

  // ── 2. Loading OR unauthenticated → public marketing landing page ──────
  // Key insight: we no longer block on auth. While `loading === true`,
  // we render the landing page. This means:
  //   - Anonymous visitors see the marketing page INSTANTLY (no loader).
  //   - Authenticated visitors see the landing page for the brief moment
  //     until /api/auth/me resolves, then swap to AppShell.
  //   - If /api/auth/me hangs (Vercel cold start, Redis outage, etc.),
  //     the user STILL sees a usable page — the landing page — instead
  //     of an infinite spinner. Combined with the 5s timeout on
  //     fetchMe(), this guarantees the UI is never stuck.
  return <EnhancedLandingPage {...landingProps} />;
}
