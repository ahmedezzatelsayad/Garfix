/**
 * api-client — Type-safe HTTP client for React Query hooks.
 *
 * Wraps `authedFetch` with JSON parsing, error handling, and typed responses.
 * All React Query queryFn and mutationFn functions should use these helpers
 * instead of raw `authedFetch` to ensure consistent error handling and typing.
 *
 * Circuit Breaker Integration (Sprint 3):
 * - Payment endpoints (/api/saas/payments/*) → paymentCircuitBreaker
 * - External API endpoints → externalApiCircuitBreaker
 * - Internal endpoints (accounting, hr, /api/ai/*, etc.) → NO circuit breaker
 *
 * NOTE: /api/ai/* was previously wrapped in aiCircuitBreaker, but that caused
 * a permanent "Circuit breaker 'openrouter' is open" error after 5 failures.
 * The server-side aiProvider has its own fallback chain (z-ai always appended
 * as last resort) so AI calls should never fast-fail on the client. The
 * aiCircuitBreaker is still exported via getCircuitBreakerState/Metrics for
 * admin dashboards to inspect its state, but no longer gates /api/ai/* calls.
 */
"use client";

import { authedFetch } from "@/context/AuthContext";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  aiCircuitBreaker,
  paymentCircuitBreaker,
  externalApiCircuitBreaker,
  webhookCircuitBreaker,
  eInvoicingCircuitBreaker,
  whatsappCircuitBreaker,
} from "@/lib/circuit-breaker";

// ─── Error class ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(
      (body?.error as string) || `API Error ${status}`,
    );
    this.name = "ApiError";
  }
}

// ─── Circuit Breaker Resolution ────────────────────────────────────────────

/**
 * Determines which circuit breaker to use based on the API URL.
 *
 * Returns null for internal endpoints that don't need circuit breaker
 * protection (they're within our own infrastructure and don't call
 * external services).
 *
 * NOTE: /api/ai/* is intentionally NOT wrapped in a client-side circuit
 * breaker. The server-side aiProvider has its OWN fallback chain (z-ai
 * sandbox is always appended as last-resort), so AI calls should never
 * fast-fail on the client. Previously the client-side `aiCircuitBreaker`
 * would trip OPEN after 5 failures (e.g. OpenRouter rate-limit) and then
 * ALL subsequent AI browser calls would fast-fail with "Circuit breaker
 * 'openrouter' is open" forever — even after the upstream recovered.
 */
function resolveCircuitBreaker(url: string): CircuitBreaker | null {
  // Payment/SaaS endpoints — calls external payment gateways (MyFatoorah, etc.)
  if (url.startsWith("/api/saas/payments/")) return paymentCircuitBreaker;

  // Webhook delivery endpoints — calls external client servers (own breaker
  // so a webhook failure doesn't trip the AI breaker)
  if (url.startsWith("/api/webhooks/")) return webhookCircuitBreaker;

  // Product matching — may call external AI APIs
  if (url.startsWith("/api/product-matching/")) return externalApiCircuitBreaker;

  // Integration endpoints — calls external third-party services
  if (url.startsWith("/api/integrations/")) return externalApiCircuitBreaker;

  // E-invoicing endpoints — calls government tax authority APIs (slow recovery)
  if (url.startsWith("/api/e-invoicing/")) return eInvoicingCircuitBreaker;

  // WhatsApp integration — calls Meta/WhatsApp Business API
  if (url.startsWith("/api/whatsapp/")) return whatsappCircuitBreaker;

  // Storage endpoints — may call external cloud storage
  if (url.startsWith("/api/storage/")) return externalApiCircuitBreaker;

  // Internal endpoints — NO circuit breaker needed:
  // /api/accounting/*, /api/hr/*, /api/invoices/*, /api/clients/*,
  // /api/catalog/*, /api/inventory/*, /api/auth/*, /api/companies/*,
  // /api/dashboard/*, /api/reports/*, /api/settings/*, /api/notifications/*,
  // /api/audit/*, /api/automation/*, /api/feature-flags/*, etc.
  return null;
}

/**
 * Wraps an async operation in the appropriate circuit breaker if the URL
 * requires one. If no circuit breaker is needed, executes directly.
 */
async function withCircuitBreaker<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const breaker = resolveCircuitBreaker(url);
  if (breaker) {
    return breaker.execute(fn);
  }
  return fn();
}

// ─── Core fetch helpers ────────────────────────────────────────────────────

/**
 * Default request timeout — 30s. Hung requests would otherwise hang React
 * Query indefinitely. AI streaming endpoints (/api/ai/chat/stream) bypass
 * this via the `stream: true` option.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Global 401 handler — when the access token has expired AND the refresh
 * attempt also fails, we redirect to /login. We only do this ONCE per page
 * load to avoid a redirect loop when multiple in-flight requests all 401.
 */
let isRedirectingToLogin = false;
/**
 * FRONTEND FIX (Review / 2026-08-24): once handle401 fired, the
 * isRedirectingToLogin latch was NEVER reset — but the redirect target is
 * /login?...&reason=expired, which the SPA login page renders WITHOUT a
 * full page reload. After a successful in-place login every subsequent 401
 * (e.g. an expired access token during normal usage) was silently ignored:
 * requests failed, no redirect happened, the UI just hung.
 * AuthContext now calls reset401Guard() after a successful login.
 */
export function reset401Guard(): void {
  isRedirectingToLogin = false;
}
function handle401(): void {
  if (isRedirectingToLogin) return;
  // VERCEL FIX: don't redirect on public pages — /, /login, /signup
  // The handle401 fires when /api/auth/me returns 401, which is NORMAL
  // for unauthenticated users visiting the landing page. Redirecting
  // them to /login creates a loop and breaks the landing page.
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    // Phase 2 P2 fix: removed "/dashboard" from publicPaths. /dashboard is a
    // protected route — if the session expires while viewing it, the global
    // 401 handler SHOULD redirect to /login (not silently stay on stale data).
    // FE-05 FIX (Audit v2 · Phase 1) — VercelDashboard was deleted; the
    // AppShell dashboard view now handles auth via AuthContext + this 401
    // handler uniformly across all deployment targets.
    const publicPaths = ["/", "/login", "/signup", "/help", "/status", "/privacy", "/terms", "/cookies", "/contact", "/partners", "/refund", "/api-docs"];
    if (publicPaths.includes(path)) return;
  }
  isRedirectingToLogin = true;
  // Defer the redirect so any pending toast.error() calls can render first.
  setTimeout(() => {
    if (typeof window !== "undefined") {
      // Preserve the current path so login can redirect back after success.
      // Use replace() so the expired-auth URL doesn't linger in browser history
      // (prevents the user from "back"-buttoning into a broken session).
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.hash);
      window.location.replace(`/login?returnTo=${returnUrl}&reason=expired`);
    }
  }, 100);
}

/**
 * Wrap authedFetch with a timeout via AbortController. Mutates `init` to add
 * the signal. If the fetch doesn't resolve in `timeoutMs`, aborts and throws
 * an ApiError with status 0 (network-style).
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await authedFetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, { error: "انتهت مهلة الطلب. حاول مرة أخرى." });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Unified response handler — checks status, parses JSON, surfaces ApiError.
 * - 401 → triggers global redirect to /login (after refresh attempt fails)
 * - 429 → returns ApiError with retry hint in body
 * - 5xx → returns ApiError
 */
async function handleResponse(res: Response): Promise<{ ok: boolean; status: number; body: unknown }> {
  if (res.ok) {
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return { ok: true, status: res.status, body: undefined };
    }
    return { ok: true, status: res.status, body: await res.json() };
  }
  const errBody = await res.json().catch(() => ({ error: "Request failed" }));
  if (res.status === 401) {
    // AuthContext's authedFetch already attempted a refresh; if we're here,
    // refresh failed → redirect to login.
    handle401();
  }
  throw new ApiError(res.status, errBody as Record<string, unknown>);
}

/** Typed GET request — parses JSON, throws ApiError on non-ok responses. */
export async function apiGet<T>(url: string): Promise<T> {
  return withCircuitBreaker(url, async () => {
    const res = await fetchWithTimeout(url, { method: "GET" });
    const { body } = await handleResponse(res);
    return body as T;
  });
}

/** Typed POST request. */
export async function apiPost<TReq, TRes = void>(
  url: string,
  body?: TReq,
): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const { body: respBody } = await handleResponse(res);
    return respBody as TRes;
  });
}

/** Typed PATCH request. */
export async function apiPatch<TReq, TRes = void>(
  url: string,
  body: TReq,
): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await fetchWithTimeout(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const { body: respBody } = await handleResponse(res);
    return respBody as TRes;
  });
}

/** Typed PUT request. */
export async function apiPut<TReq, TRes = void>(
  url: string,
  body: TReq,
): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await fetchWithTimeout(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const { body: respBody } = await handleResponse(res);
    return respBody as TRes;
  });
}

/** Typed DELETE request. */
export async function apiDelete<TRes = void>(url: string): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await fetchWithTimeout(url, { method: "DELETE" });
    const { body: respBody } = await handleResponse(res);
    return respBody as TRes;
  });
}

// ─── File upload helper ────────────────────────────────────────────────────

/** Upload a file via POST with multipart/form-data. */
export async function apiUpload<TRes>(
  url: string,
  formData: FormData,
): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    // 2-minute timeout for uploads (large files)
    const res = await fetchWithTimeout(url, { method: "POST", body: formData }, 120_000);
    const { body } = await handleResponse(res);
    return body as TRes;
  });
}

// ─── Blob download helper ──────────────────────────────────────────────────

/**
 * Download a binary blob (PDF, CSV, Excel, etc.) via GET.
 *
 * Returns a Blob that the caller can convert to a download link.
 * Throws ApiError on non-ok responses, trying to parse JSON error
 * bodies when available.
 */
export async function apiDownloadBlob(url: string): Promise<Blob> {
  return withCircuitBreaker(url, async () => {
    const res = await fetchWithTimeout(url, { method: "GET" }, 60_000);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Download failed" }));
      if (res.status === 401) handle401();
      throw new ApiError(res.status, errBody as Record<string, unknown>);
    }
    return res.blob();
  });
}

/**
 * Download a binary blob via POST (e.g. for export endpoints that
 * require a request body).
 *
 * Returns a Blob that the caller can convert to a download link.
 * Throws ApiError on non-ok responses.
 */
export async function apiPostBlob<TReq>(
  url: string,
  body?: TReq,
): Promise<Blob> {
  return withCircuitBreaker(url, async () => {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      },
      60_000,
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Download failed" }));
      if (res.status === 401) handle401();
      throw new ApiError(res.status, errBody as Record<string, unknown>);
    }
    return res.blob();
  });
}

// ─── Circuit Breaker utilities ─────────────────────────────────────────────

/**
 * Check if an error is a CircuitBreakerOpenError.
 * Useful in React Query error handlers to show "service unavailable" UI.
 */
export function isCircuitBreakerOpenError(error: unknown): boolean {
  return error instanceof CircuitBreakerOpenError;
}

/**
 * Get the current state of a named circuit breaker.
 * Returns null for unknown breaker names.
 */
export function getCircuitBreakerState(
  name: "ai-service" | "payment-service" | "external-api",
): "closed" | "open" | "half-open" | null {
  const breakers: Record<string, CircuitBreaker> = {
    "ai-service": aiCircuitBreaker,
    "payment-service": paymentCircuitBreaker,
    "external-api": externalApiCircuitBreaker,
  };
  const breaker = breakers[name];
  return breaker ? breaker.getState() : null;
}

/**
 * Get metrics snapshot for a named circuit breaker.
 * Useful for dashboards showing service health.
 */
export function getCircuitBreakerMetrics(
  name: "ai-service" | "payment-service" | "external-api",
) {
  const breakers: Record<string, CircuitBreaker> = {
    "ai-service": aiCircuitBreaker,
    "payment-service": paymentCircuitBreaker,
    "external-api": externalApiCircuitBreaker,
  };
  const breaker = breakers[name];
  return breaker ? breaker.getMetrics() : null;
}
