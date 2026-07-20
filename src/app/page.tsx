/**
 * GARFIX v11 — Main Application Entry
 *
 * Renders Landing / Auth / Onboarding / App based on auth state.
 * The onboarding wizard shows for new users who haven't completed setup.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, authedFetch } from "@/context/AuthContext";
import LandingPage from "@/modules/landing/LandingPage";
import AuthScreen from "@/modules/auth/AuthScreen";
import AppShell from "@/modules/common/AppShell";
import { FullScreenLoader } from "@/modules/common/FullScreenLoader";
import SetupWizard from "@/modules/onboarding/SetupWizard";

export default function Home() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<"app" | "auth" | "landing" | "onboarding">("landing");
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Reset view when user logs out (render-time adjustment, no cascading render).
  const [prevUser, setPrevUser] = useState(user);
  const [prevLoading, setPrevLoading] = useState(loading);
  if (user !== prevUser || loading !== prevLoading) {
    setPrevUser(user);
    setPrevLoading(loading);
    if (!user && !loading) {
      setCheckingOnboarding(false);
      if (view === "app" || view === "onboarding") setView("landing");
    }
  }

  // Check if onboarding is needed when user logs in
  const checkOnboarding = useCallback(async () => {
    if (!user) {
      setCheckingOnboarding(false);
      return;
    }
    try {
      const res = await authedFetch("/api/onboarding");
      if (res.ok) {
        const data = await res.json();
        if (!data.completed && data.needsCompany) {
          setOnboardingNeeded(true);
          setView("onboarding");
        } else if (!data.completed) {
          setOnboardingNeeded(true);
          setView("onboarding");
        } else {
          setOnboardingNeeded(false);
          setView("app");
        }
      } else {
        setView("app");
      }
    } catch {
      setView("app");
    } finally {
      setCheckingOnboarding(false);
    }
  }, [user]);

  // checkOnboarding is async (setState calls happen after `await authedFetch`); not synchronous in effect body; no cascading render.
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      checkOnboarding();
    }
  }, [user, loading]);

  if (loading || (user && checkingOnboarding)) return <FullScreenLoader />;

  if (user && view === "onboarding") {
    return (
      <SetupWizard
        onComplete={() => {
          setOnboardingNeeded(false);
          setView("app");
          // Reload to pick up new company/modules
          window.location.reload();
        }}
        onSkip={() => setView("app")}
      />
    );
  }

  if (user || view === "app") return <AppShell />;

  if (view === "auth") {
    return <AuthScreen onBack={() => setView("landing")} />;
  }

  return (
    <LandingPage
      onLogin={() => setView("auth")}
      onRegister={() => setView("auth")}
    />
  );
}
