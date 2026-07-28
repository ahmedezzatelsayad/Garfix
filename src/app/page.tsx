"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import LandingPage from "@/modules/landing/LandingPage";
import AuthScreen from "@/modules/auth/AuthScreen";
import AppShell from "@/modules/common/AppShell";

type AppView = "landing" | "login" | "register" | "forgot" | "app";

/**
 * Root page — orchestrates the GARFIX app flow:
 *
 * 1. Landing → marketing page with login/register buttons
 * 2. AuthScreen → login / register / forgot-password / reset-password
 * 3. AppShell → authenticated shell with Sidebar, Topbar, and all views
 *
 * This replaces the previous standalone "Accounting Dashboard" that
 * directly called /api/accounting/dashboard without auth — which caused
 * the "Loading dashboard data..." blank page on deployment.
 */
export default function GarfixApp() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<AppView>("landing");

  // While checking auth, show a minimal branded loader
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-lg">G</span>
          </div>
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        </div>
      </div>
    );
  }

  // Authenticated → AppShell (main app)
  if (user) {
    return <AppShell />;
  }

  // Not authenticated → Landing or AuthScreen
  switch (view) {
    case "login":
    case "register":
    case "forgot":
      return <AuthScreen onBack={() => setView("landing")} />;
    default:
      return (
        <LandingPage
          onLogin={() => setView("login")}
          onRegister={() => setView("register")}
        />
      );
  }
}
