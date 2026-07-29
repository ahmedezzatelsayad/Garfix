/**
 * / — GarfiX home route.
 *
 * Behavior:
 *   - Unauthenticated users  → render the public marketing landing page
 *                              (EnhancedLandingPage) with Sign In / Get
 *                              Started buttons that route to /login.
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

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { EnhancedLandingPage } from "@/modules/landing/EnhancedLandingPage";
import AppShell from "@/modules/common/AppShell";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleLogin = useCallback(() => {
    router.push("/login");
  }, [router]);

  const handleRegister = useCallback(() => {
    // No /register page yet — route to /login for now. When /register is
    // added, change this to router.push("/register").
    router.push("/login");
  }, [router]);

  // ── 1. Session resolving → neutral loader ───────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // ── 2. Unauthenticated → public marketing landing page ──────────────────
  if (!user) {
    return <EnhancedLandingPage onLogin={handleLogin} onRegister={handleRegister} />;
  }

  // ── 3. Authenticated → full accounting module shell ─────────────────────
  // AppShell internally renders Sidebar + Topbar + the active view
  // (defaults to DashboardView via hash routing). All 18 accounting
  // modules are reachable from the Sidebar.
  return <AppShell />;
}
