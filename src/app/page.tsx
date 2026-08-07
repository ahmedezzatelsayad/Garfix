/**
 * / — GarfiX home route.
 *
 * VERCEL FIX: EnhancedLandingPage now uses dynamic import with ssr:false.
 * Previously it was a direct import (SSR-enabled), but framer-motion +
 * canvas animation cause SSR errors on Vercel that are silently caught
 * by the Suspense boundary (loading.tsx), leaving the page stuck on
 * "Loading…" spinner forever.
 *
 * With ssr:false:
 *   1. Server renders a lightweight static placeholder (no framer-motion)
 *   2. Client loads EnhancedLandingPage dynamically
 *   3. No SSR errors → page renders correctly
 *
 * AppShell stays dynamic + ssr:false as before.
 */
"use client";

import { useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

// VERCEL FIX: dynamic import with ssr:false to avoid framer-motion SSR errors
const EnhancedLandingPage = dynamic(
  () => import("@/modules/landing/EnhancedLandingPage").then(m => ({ default: m.EnhancedLandingPage })),
  {
    ssr: false,
    loading: () => <LandingPlaceholder />,
  }
);

// AppShell stays dynamic + ssr:false
const AppShell = dynamic(() => import("@/modules/common/AppShell"), {
  ssr: false,
  loading: () => <AppLoader />,
});

function LandingPlaceholder() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#0b1220] text-white p-6" dir="rtl">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
        <p className="text-sm font-medium text-emerald-400">GarfiX EOS</p>
      </div>
    </div>
  );
}

function AppLoader() {
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

  const landingProps = useMemo(
    () => ({ onLogin: handleLogin, onRegister: handleRegister }),
    [handleLogin, handleRegister],
  );

  // Authenticated → full accounting module shell
  if (!loading && user) {
    return <AppShell />;
  }

  // Loading OR unauthenticated → public marketing landing page
  return <EnhancedLandingPage {...landingProps} />;
}
