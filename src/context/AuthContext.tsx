/**
 * AuthContext — Client-side auth provider.
 *
 * SEC-010: All mutating requests (POST, PUT, PATCH, DELETE) automatically
 * include the X-CSRF-Token header by reading the inv_csrf cookie. The
 * edge middleware verifies this header matches the cookie value (double-submit
 * pattern). GET requests and auth/refresh are exempt.
 */
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

/** Cookie name for CSRF double-submit (same as server-side CSRF_COOKIE in cookies.ts). */
const CSRF_COOKIE_NAME = "inv_csrf";

/** Read the CSRF token from the browser's cookie jar. */
function getCsrfToken(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Mutating HTTP methods that require the CSRF header. */
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  companies: string[];
  role: string;
  permissions?: Record<string, number>;
  effectivePermissions?: Record<string, number>;
  isFounder?: boolean;
  emailVerified?: boolean;
}

export interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isFounder: boolean;
  canEdit: boolean;
  allowedCompanies: string[];
  perms: Record<string, number>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_DEFAULTS: Record<string, Record<string, number>> = {
  admin: { create_invoice: 1, print_invoice: 1, view_customers: 1, bulk_input: 1, edit_invoice: 1, delete_invoice: 1, edit_customer: 1, delete_customer: 1, export_data: 1, reports_access: 1, settings_access: 1, finance_access: 1, employee_management: 1, e_invoicing_submit: 1 },
  editor: { create_invoice: 1, print_invoice: 1, view_customers: 1, bulk_input: 1, edit_invoice: 1, delete_invoice: 1, edit_customer: 1, delete_customer: 1, export_data: 1, reports_access: 0, settings_access: 0, finance_access: 0, employee_management: 0, e_invoicing_submit: 1 },
  employee: { create_invoice: 1, print_invoice: 1, view_customers: 1, bulk_input: 1, edit_invoice: 1, delete_invoice: 1, edit_customer: 1, delete_customer: 1, export_data: 0, reports_access: 0, settings_access: 0, finance_access: 0, employee_management: 0, e_invoicing_submit: 0 },
  viewer: { create_invoice: 0, print_invoice: 0, view_customers: 1, bulk_input: 0, edit_invoice: 0, delete_invoice: 0, edit_customer: 0, delete_customer: 0, export_data: 0, reports_access: 0, settings_access: 0, finance_access: 0, employee_management: 0, e_invoicing_submit: 0 },
};

function resolvePerms(profile: UserProfile | null): Record<string, number> {
  if (!profile) return { ...ROLE_DEFAULTS.viewer };
  if (profile.effectivePermissions) return { ...profile.effectivePermissions };
  if (profile.role === "admin") return { ...ROLE_DEFAULTS.admin };
  const role = profile.role || "viewer";
  const defaults = { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer) };
  if (profile.permissions) {
    Object.keys(profile.permissions).forEach((k) => { defaults[k] = profile.permissions?.[k] ? 1 : 0; });
  }
  return defaults;
}

async function fetchMe(): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) return res.json();
    if (res.status === 401) {
      const refreshRes = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      if (refreshRes.ok) {
        const retryRes = await fetch("/api/auth/me", { credentials: "include" });
        if (retryRes.ok) return retryRes.json();
      }
    }
    return null;
  } catch { return null; }
}

export async function authedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  // SEC-010: Attach CSRF token header on mutating requests.
  const method = (opts.method || "GET").toUpperCase();
  const headers = new Headers(opts.headers || undefined);
  if (MUTATING_METHODS.includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const finalOpts: RequestInit = { ...opts, headers, credentials: "include" };

  const res = await fetch(url, finalOpts);
  if (res.status !== 401) return res;
  const refreshRes = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
  if (!refreshRes.ok) return res;
  // After refresh, re-read CSRF token (it may have been re-issued)
  const refreshedHeaders = new Headers(opts.headers || undefined);
  if (MUTATING_METHODS.includes(method)) {
    const csrfAfterRefresh = getCsrfToken();
    if (csrfAfterRefresh) refreshedHeaders.set("X-CSRF-Token", csrfAfterRefresh);
  }
  return fetch(url, { ...opts, headers: refreshedHeaders, credentials: "include" });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    const me = await fetchMe();
    setUser(me);
  }, []);

  useEffect(() => {
    fetchMe().then(setUser).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Login is a PUBLIC route — no CSRF header needed (edge middleware skips CSRF for public routes)
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(data.error || "Login failed");
    }
    // After login, the server has set the inv_csrf cookie — fetchMe will now work with CSRF
    const me = await fetchMe();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    // SEC-010: Logout is a protected POST route — needs CSRF header
    const csrf = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrf) headers["X-CSRF-Token"] = csrf;
    await fetch("/api/auth/logout", {
      method: "POST", headers, credentials: "include",
    }).catch(() => {});
  }, []);

  const isAdmin = user?.role === "admin";
  const isFounder = !!user?.isFounder;
  const perms = resolvePerms(user);
  const canEdit = !!perms.edit_invoice;
  const allowedCompanies = user?.companies || [];

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isFounder, canEdit, allowedCompanies, perms, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
