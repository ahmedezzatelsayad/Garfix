/**
 * / — GarfiX home route.
 *
 * Behavior:
 *   - Unauthenticated users  → render the public marketing landing page
 *                              (EnhancedLandingPage) with Sign In / Get
 *                              Started buttons that route to /login and
 *                              /signup respectively.
 *   - Authenticated users    → render <AppShell />, which is the canonical
 *                              authenticated shell hosting the Sidebar +
 *                              Topbar + ALL 18 accounting module views
 *                              (Dashboard, Invoices, Clients, Catalog,
 *                              Purchases, HR, Accounting, Settings, SaaS,
 *                              Admin, Audit, BulkInput, Reports, Team,
 *                              Account, Inventory, Automation, AI-Agents).
 *                              The default view is "dash" (DashboardView),
 *                              so a freshly-logged-in user lands on the
 *                              accounting dashboard.
 *
 * Flow:
 *   1. Landing page (guest) → click "Sign In"
 *   2. /login → submit credentials → /api/auth/login sets cookies
 *   3. AuthContext.refresh() resolves user → this page re-renders
 *   4. <AppShell /> mounts → hash defaults to "#dash" → <DashboardView />
 *
 * The loader state is shown only while useAuth() is resolving the session
 * to avoid flashing the landing page to already-authed users (or vice
 * versa).
 */
"use client";

import { useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

// P0-11 (Engineering Audit): Code-split the landing page and AppShell
// into separate dynamic chunks so the initial JS payload for an
// unauthenticated visitor doesn't drag in the entire accounting module
// shell (AppShell pulls in 18 module views, framer-motion, recharts,
// TanStack Query, etc.).
//
// Both components are loaded with next/dynamic and SSR disabled —
// the loader below covers the brief suspense gap, and neither component
// benefits from SSR (EnhancedLandingPage uses framer-motion animations;
// AppShell reads useAuth() which is client-only).
//
// Net effect: a first-time visitor to / downloads only the landing chunk
// (~150 KB instead of ~540 KB). Authenticated users still get AppShell,
// but only after their session resolves — which is the correct UX.
const EnhancedLandingPage = dynamic(
  () => import("@/modules/landing/EnhancedLandingPage").then((m) => ({
    default: m.EnhancedLandingPage,
  })),
  { ssr: false, loading: () => <PageLoader /> },
);

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

  // Memoize the props passed to the landing page so the dynamic chunk
  // doesn't re-render unnecessarily.
  const landingProps = useMemo(
    () => ({ onLogin: handleLogin, onRegister: handleRegister }),
    [handleLogin, handleRegister],
  );

  // ── 1. Session resolving → neutral loader ───────────────────────────────
  if (loading) {
    return <PageLoader />;
  }

  // ── 2. Unauthenticated → public marketing landing page ──────────────────
  if (!user) {
    return <EnhancedLandingPage {...landingProps} />;
  }

  // ── 3. Authenticated → full accounting module shell ─────────────────────
  // AppShell internally renders Sidebar + Topbar + the active view
  // (defaults to DashboardView via hash routing). All 18 accounting
  // modules are reachable from the Sidebar.
  return <AppShell />;
}
