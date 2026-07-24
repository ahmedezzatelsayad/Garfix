/**
 * BrandContext — Active company + theme + UI state.
 */
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useCompanies } from "@/hooks/queries";
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
}

interface BrandContextValue {
  companies: CompanyInfo[];
  activeCompany: CompanyInfo | null;
  setActiveSlug: (slug: string | null) => void;
  loadingCompanies: boolean;
  refreshCompanies: () => Promise<void>;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const BrandContext = createContext<BrandContextValue | null>(null);

const STORAGE_KEY = "garfix:active-slug";
const THEME_KEY = "garfix:theme";

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const companiesQuery = useCompanies();
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [activeSlug, setActiveSlugState] = useState<string | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Load theme from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
    // One-time init: read theme from localStorage on mount. Runs once (deps []), no cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setTheme(stored);
  }, []);

  // Apply theme to <html>
  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  // Sync companies from TanStack Query to local state
  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setActiveSlugState(null);
      setLoadingCompanies(false);
      return;
    }
    setLoadingCompanies(companiesQuery.isLoading);
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
      console.error("[brand] failed to load companies:", companiesQuery.error);
      setCompanies([]);
    }
  }, [user, companiesQuery.data, companiesQuery.isLoading, companiesQuery.isError]);

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

  return (
    <BrandContext.Provider
      value={{ companies, activeCompany, setActiveSlug, loadingCompanies, refreshCompanies, theme, toggleTheme }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used inside BrandProvider");
  return ctx;
}
