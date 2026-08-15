/**
 * / — GarfiX home route.
 *
 * Renders AppShell (full React app with all 18 modules) when authenticated,
 * otherwise renders the EnhancedLandingPage (React, hydrated, accessible).
 *
 * // FE-05 FIX (Audit v2 · Phase 1) — Vercel escape-hatch (StaticLanding)
 * deleted; the React EnhancedLandingPage works on every deployment target
 * (Next.js 16 + React 19 support streaming SSR — no hydration-mismatch
 * risk on Vercel that would have justified the static fallback).
 */
"use client";

import { useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import { EnhancedLandingPage } from "@/modules/landing/EnhancedLandingPage";

// AppShell — full accounting module shell (18 views + sidebar + topbar)
const AppShell = dynamic(() => import("@/modules/common/AppShell"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  ),
});

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleLogin = useCallback(() => {
    router.push("/login");
  }, [router]);

  const handleRegister = useCallback(() => {
    router.push("/signup");
  }, [router]);

  const landingProps = useMemo(
    () => ({ onLogin: handleLogin, onRegister: handleRegister }),
    [handleLogin, handleRegister],
  );

  // Authenticated → AppShell (full dashboard with 18 modules)
  if (!loading && user) {
    return <AppShell />;
  }

  // Loading OR unauthenticated → landing page
  return <EnhancedLandingPage {...landingProps} />;
}
