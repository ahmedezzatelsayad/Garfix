/**
 * BrandContext — Active company + theme + UI state.
 *
 * Theme handling delegates to next-themes (mounted in Providers.tsx). We do
 * NOT keep a parallel theme state here — that would race with next-themes'
 * own <html>.classList manipulation and cause flicker / inconsistency.
 * The layout.tsx inline theme-init script still runs before hydration to
 * prevent the first-paint flash; next-themes picks up from there.
 */
"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "./AuthContext";
import { useCompanies } from "@/hooks/queries";
import { logger } from "@/lib/logger";
import type { Company as QueryCompany } from "@/hooks/queries/dashboard";

export interface CompanyInfo {
  id: number;
  name: string;
  slug: string;
  nameAr?: string | null;
  emoji?: string | null;
  color?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  vatNumber?: string | null;
  currency: string;
  country?: string | null;
  defaultTaxRate: string;
  plan: string;
  subscriptionStatus: string;
  trialEndsAt?: string | null;
  updatedAt?: string | null;
}

interface BrandContextValue {
  companies: CompanyInfo[];
  activeCompany: CompanyInfo | null;
  setActiveSlug: (slug: string | null) => void;
  loadingCompanies: boolean;
  refreshCompanies: () => Promise<void>;
  theme: "light" | "dark" | "system";
  toggleTheme: () => void;
}

const BrandContext = createContext<BrandContextValue | null>(null);

const STORAGE_KEY = "garfix:active-slug";

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const companiesQuery = useCompanies();
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [activeSlug, setActiveSlugState] = useState<string | null>(null);
  // Initial state `true` so AppShell doesn't briefly flash the OnboardingScreen
  // (which checks `!loadingCompanies && companies.length === 0`) on the very
  // first render before TanStack Query has had a chance to flip isLoading on.
  // Previously this defaulted to `false`, causing a 1-frame onboarding flash
  // even for users with companies.
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  // Derive theme from next-themes (single source of truth).
  const theme = (nextTheme === "dark" ? "dark" : nextTheme === "light" ? "light" : "system") as "light" | "dark" | "system";

  const toggleTheme = useCallback(() => {
    setNextTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setNextTheme]);

  // Sync companies from TanStack Query to local state
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setActiveSlugState(null);
      setLoadingCompanies(false);
      return;
    }
    // While user is set but TanStack hasn't started loading yet, treat as
    // loading so AppShell shows the Suspense fallback rather than flashing
    // the OnboardingScreen for one frame.
    setLoadingCompanies(companiesQuery.isLoading || companiesQuery.isPending);
    if (companiesQuery.data?.companies) {
      // Map QueryCompany → CompanyInfo (they share the same shape for most fields)
      const mapped: CompanyInfo[] = companiesQuery.data.companies.map((c: QueryCompany) => ({
        id: (c as Record<string, unknown>).id as number ?? 0,
        name: c.name,
        slug: c.slug,
        nameAr: (c as Record<string, unknown>).nameAr as string | null | undefined ?? null,
        emoji: (c as Record<string, unknown>).emoji as string | null | undefined ?? null,
        color: (c as Record<string, unknown>).color as string | null | undefined ?? null,
        phone: (c as Record<string, unknown>).phone as string | null | undefined ?? null,
        email: (c as Record<string, unknown>).email as string | null | undefined ?? null,
        address: (c as Record<string, unknown>).address as string | null | undefined ?? null,
        vatNumber: (c as Record<string, unknown>).vatNumber as string | null | undefined ?? null,
        currency: (c as Record<string, unknown>).currency as string ?? "SAR",
        country: (c as Record<string, unknown>).country as string | null | undefined ?? null,
        defaultTaxRate: (c as Record<string, unknown>).defaultTaxRate as string ?? "0",
        plan: (c as Record<string, unknown>).plan as string ?? "trial",
        subscriptionStatus: (c as Record<string, unknown>).subscriptionStatus as string ?? "active",
        trialEndsAt: (c as Record<string, unknown>).trialEndsAt as string | null | undefined ?? null,
      }));
      setCompanies(mapped);
      // Restore active slug from localStorage or pick first
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && mapped.some((c: CompanyInfo) => c.slug === stored)) {
          setActiveSlugState(stored);
        } else if (mapped.length > 0) {
          setActiveSlugState(mapped[0].slug);
        } else {
          setActiveSlugState(null);
        }
      }
    } else if (companiesQuery.isError) {
      // Don't log 401s — they're expected before login / when session expired
      // and the retry policy already short-circuits them. Logging every 401
      // spams the console on every page load before the user signs in.
      const status = (companiesQuery.error as { status?: number } | null)?.status;
      if (status !== 401) {
        logger.error("[brand] failed to load companies:", { err: companiesQuery.error });
      }
      setCompanies([]);
    }
  }, [user, companiesQuery.data, companiesQuery.isLoading, companiesQuery.isError, companiesQuery.error, companiesQuery.isPending]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // When the user logs in (transitions from null → set), force a refetch of
  // companies. Without this, TanStack's cached 401 from the unauthenticated
  // attempt would persist and the user would see "no companies" until they
  // manually refreshed the page.
  useEffect(() => {
    if (user) {
      // Only refetch if the query is stale or errored (avoids hammering on every render).
      if (companiesQuery.isError || companiesQuery.isStale) {
        void companiesQuery.refetch();
      }
    }

  }, [user, companiesQuery]);

  const refreshCompanies = useCallback(async () => {
    await companiesQuery.refetch();
  }, [companiesQuery]);

  const setActiveSlug = useCallback((slug: string | null) => {
    setActiveSlugState(slug);
    if (typeof window !== "undefined") {
      if (slug) localStorage.setItem(STORAGE_KEY, slug);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeCompany = companies.find((c) => c.slug === activeSlug) || null;

  const value = useMemo(() => ({ companies, activeCompany, setActiveSlug, loadingCompanies, refreshCompanies, theme, toggleTheme }), [companies, activeCompany, setActiveSlug, loadingCompanies, refreshCompanies, theme, toggleTheme]);

  return (
    <BrandContext.Provider value={value}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used inside BrandProvider");
  return ctx;
}
