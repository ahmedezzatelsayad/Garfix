/**
 * api-client — Type-safe HTTP client for React Query hooks.
 *
 * Wraps `authedFetch` with JSON parsing, error handling, and typed responses.
 * All React Query queryFn and mutationFn functions should use these helpers
 * instead of raw `authedFetch` to ensure consistent error handling and typing.
 *
 * Circuit Breaker Integration (Sprint 3):
 * - AI endpoints (/api/ai/*) → aiCircuitBreaker
 * - Payment endpoints (/api/saas/payments/*) → paymentCircuitBreaker
 * - External API endpoints → externalApiCircuitBreaker
 * - Internal endpoints (accounting, hr, etc.) → NO circuit breaker
 */
"use client";

import { authedFetch } from "@/context/AuthContext";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  aiCircuitBreaker,
  paymentCircuitBreaker,
  externalApiCircuitBreaker,
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
 */
function resolveCircuitBreaker(url: string): CircuitBreaker | null {
  // AI service endpoints — calls external AI providers (OpenRouter, etc.)
  if (url.startsWith("/api/ai/")) return aiCircuitBreaker;

  // Payment/SaaS endpoints — calls external payment gateways (MyFatoorah, etc.)
  if (url.startsWith("/api/saas/payments/")) return paymentCircuitBreaker;

  // Webhook delivery endpoints — calls external client servers
  if (url.startsWith("/api/webhooks/")) return externalApiCircuitBreaker;

  // Product matching — may call external AI APIs
  if (url.startsWith("/api/product-matching/")) return externalApiCircuitBreaker;

  // Integration endpoints — calls external third-party services
  if (url.startsWith("/api/integrations/")) return externalApiCircuitBreaker;

  // E-invoicing endpoints — calls government tax authority APIs
  if (url.startsWith("/api/e-invoicing/")) return externalApiCircuitBreaker;

  // WhatsApp integration — calls Meta/WhatsApp Business API
  if (url.startsWith("/api/whatsapp/")) return externalApiCircuitBreaker;

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

/** Typed GET request — parses JSON, throws ApiError on non-ok responses. */
export async function apiGet<T>(url: string): Promise<T> {
  return withCircuitBreaker(url, async () => {
    const res = await authedFetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      throw new ApiError(res.status, body as Record<string, unknown>);
    }
    return res.json() as Promise<T>;
  });
}

/** Typed POST request. */
export async function apiPost<TReq, TRes = void>(
  url: string,
  body?: TReq,
): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await authedFetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Request failed" }));
      throw new ApiError(res.status, errBody as Record<string, unknown>);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as TRes;
    }
    return res.json() as Promise<TRes>;
  });
}

/** Typed PATCH request. */
export async function apiPatch<TReq, TRes = void>(
  url: string,
  body: TReq,
): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await authedFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Request failed" }));
      throw new ApiError(res.status, errBody as Record<string, unknown>);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as TRes;
    }
    return res.json() as Promise<TRes>;
  });
}

/** Typed PUT request. */
export async function apiPut<TReq, TRes = void>(
  url: string,
  body: TReq,
): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await authedFetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Request failed" }));
      throw new ApiError(res.status, errBody as Record<string, unknown>);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as TRes;
    }
    return res.json() as Promise<TRes>;
  });
}

/** Typed DELETE request. */
export async function apiDelete<TRes = void>(url: string): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await authedFetch(url, { method: "DELETE" });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Request failed" }));
      throw new ApiError(res.status, errBody as Record<string, unknown>);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as TRes;
    }
    return res.json() as Promise<TRes>;
  });
}

// ─── File upload helper ────────────────────────────────────────────────────

/** Upload a file via POST with multipart/form-data. */
export async function apiUpload<TRes>(
  url: string,
  formData: FormData,
): Promise<TRes> {
  return withCircuitBreaker(url, async () => {
    const res = await authedFetch(url, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new ApiError(res.status, errBody as Record<string, unknown>);
    }
    return res.json() as Promise<TRes>;
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
    const res = await authedFetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Download failed" }));
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
    const res = await authedFetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Download failed" }));
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
