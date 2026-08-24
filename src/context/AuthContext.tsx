/**
 * AuthContext — Client-side auth provider.
 *
 * SEC-010: All mutating requests (POST, PUT, PATCH, DELETE) automatically
 * include the X-CSRF-Token header by reading the inv_csrf cookie. The
 * edge middleware verifies this header matches the cookie value (double-submit
 * pattern). GET requests and auth/refresh are exempt.
 */
"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";

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

/**
 * ARCHITECTURE FIX (Vercel infinite-loading RCA):
 *
 * Every fetch here is wrapped with a 5-second AbortController timeout.
 * Previously, if /api/auth/me hung (Vercel cold start, Redis outage,
 * function timeout, network blip), `loading` stayed `true` FOREVER and
 * the UI was trapped on the loader. With the timeout, even if the
 * server never responds, we resolve to `null` within 5s — at which
 * point the home page swaps to the public landing page (not a spinner).
 *
 * The 5s value matches Vercel Hobby-tier function timeout (10s) with
 * a safety margin — we'd rather fail fast and show content than wait
 * the full Vercel timeout.
 */
const AUTH_FETCH_TIMEOUT_MS = 5000;

/**
 * P0 FIX (مهلة الطلبات): كان authedFetch يستخدم مهلة 5 ثوانٍ لكل الطلبات —
 * مسارات الـ AI (استخراج/تحليل/محادثة) تستغرق 3-30 ثانية بطبيعتها فكانت
 * تُقطع في منتصف التنفيذ والواجهة تظهر "لا شيء حدث" رغم أن السيرفر
 * أكمل العمل. الآن: 5 ثوانٍ لمسارات الـ auth السريعة فقط، و30 ثانية
 * لأي طلب آخر (والـ api-client يمرر signal خاصاً له حين يريد أقل/أكثر).
 */
const API_FETCH_TIMEOUT_MS = 30_000;

function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = API_FETCH_TIMEOUT_MS,
): Promise<Response> {
  // Caller-provided signal (from api-client) takes precedence — link both.
  const controller = new AbortController();
  const externalSignal = opts.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { signal: _ignored, ...restOpts } = opts;
  return fetch(url, { ...restOpts, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

async function fetchMe(): Promise<UserProfile | null> {
  try {
    // مهلة قصيرة لمسارات الـ auth فقط (كانت 5 ثوانٍ للجميع)
    const res = await fetchWithTimeout("/api/auth/me", { credentials: "include" }, AUTH_FETCH_TIMEOUT_MS);
    if (res.ok) return res.json();
    if (res.status === 401) {
      const refreshRes = await fetchWithTimeout("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      }, AUTH_FETCH_TIMEOUT_MS);
      if (refreshRes.ok) {
        const retryRes = await fetchWithTimeout("/api/auth/me", { credentials: "include" }, AUTH_FETCH_TIMEOUT_MS);
        if (retryRes.ok) return retryRes.json();
      }
    }
    return null;
  } catch {
    // AbortError / network failure → treat as "not authenticated".
    // The home page will render the public landing page in this case,
    // so the user always sees SOMETHING usable.
    return null;
  }
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

  // P0 FIX: مهلة 30 ثانية (كانت 5) — انظر تعليق API_FETCH_TIMEOUT_MS أعلاه.
  // الـ api-client يمرر signal خاصاً للطلبات التي تحتاج مهلة مختلفة.
  const res = await fetchWithTimeout(url, finalOpts);
  if (res.status !== 401) return res;
  const refreshRes = await fetchWithTimeout("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
  }, AUTH_FETCH_TIMEOUT_MS);
  if (!refreshRes.ok) return res;
  // After refresh, re-read CSRF token (it may have been re-issued)
  const refreshedHeaders = new Headers(opts.headers || undefined);
  if (MUTATING_METHODS.includes(method)) {
    const csrfAfterRefresh = getCsrfToken();
    if (csrfAfterRefresh) refreshedHeaders.set("X-CSRF-Token", csrfAfterRefresh);
  }
  return fetchWithTimeout(url, { ...opts, headers: refreshedHeaders, credentials: "include" });
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
    // FRONTEND FIX (Review / 2026-08-24): a previous session-expiry 401 may
    // have latched the api-client's redirect guard. Since the SPA login
    // doesn't reload the page, reset it so future 401s are handled properly.
    try {
      const { reset401Guard } = await import("@/hooks/api-client");
      reset401Guard();
    } catch { /* non-fatal */ }
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
  // Wrap fallback array in useMemo so the context value's deps stay stable
  // (avoids react-hooks/exhaustive-deps "logical expression" warning).
  const allowedCompanies = useMemo(() => user?.companies || [], [user?.companies]);

  const value = useMemo(() => ({ user, loading, isAdmin, isFounder, canEdit, allowedCompanies, perms, login, logout, refresh }), [user, loading, isAdmin, isFounder, canEdit, allowedCompanies, perms, login, logout, refresh]);
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
