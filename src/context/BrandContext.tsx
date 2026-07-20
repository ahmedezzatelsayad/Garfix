/**
 * BrandContext — Active company + theme + UI state.
 */
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { authedFetch } from "./AuthContext";

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

  // Fetch companies when user logs in
  const refreshCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setActiveSlugState(null);
      return;
    }
    setLoadingCompanies(true);
    try {
      const res = await authedFetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
        // Restore active slug from localStorage or pick first
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored && data.companies.some((c: CompanyInfo) => c.slug === stored)) {
            setActiveSlugState(stored);
          } else if (data.companies.length > 0) {
            setActiveSlugState(data.companies[0].slug);
          } else {
            setActiveSlugState(null);
          }
        }
      }
    } catch (err) {
      console.error("[brand] failed to load companies:", err);
    } finally {
      setLoadingCompanies(false);
    }
  }, [user]);

  // setState runs inside async .then() callback in refreshCompanies (after await authedFetch) — not synchronous in effect body; no cascading render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCompanies();
  }, [refreshCompanies]);

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
