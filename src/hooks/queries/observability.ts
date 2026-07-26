/**
 * observability.ts — React Query hooks for observability / monitoring.
 *
 * Provides circuit-breaker dashboard, audit trail, audit stats,
 * chain verification, system health, and circuit-breaker action hooks.
 * All hooks use the centralized `queryKeys` factory and the typed
 * `apiGet` / `apiPost` helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CircuitBreakerDashboard {
  breakers: {
    name: string;
    state: "closed" | "open" | "half-open";
    failures: number;
    successes: number;
    totalRequests: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    lastStateChangeTime: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    rejectedRequests: number;
    avgResponseTimeMs: number;
    responseTimes: number[];
  }[];
  summary: {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
    totalRequests: number;
    totalFailures: number;
    totalRejected: number;
    avgHealthScore: number;
  };
  timestamp: number;
}

interface AuditTrailResult {
  events: {
    id: string;
    correlationId: string;
    channel: string;
    payload: unknown;
    publisher: string;
    publisherIp?: string;
    timestamp: number;
    hash?: string;
    previousHash?: string;
  }[];
  total: number;
  hasMore: boolean;
}

interface AuditStats {
  totalEvents: number;
  channels: Record<string, number>;
  publishers: Record<string, number>;
  lastEventTime: number | null;
  firstEventTime: number | null;
  integrity: { verified: number; breaches: string[]; total: number };
}

interface SystemHealth {
  status: "ok" | "degraded";
  version: string;
  uptime: number | null;
  latencyMs: number;
  checks: Record<string, unknown>;
  timestamp: string;
}

interface CircuitBreakerActionPayload {
  action: "reset" | "trip";
  breaker: string;
}

// ─── useCircuitBreakerDashboard ────────────────────────────────────────────

/**
 * Fetch circuit-breaker dashboard data with auto-refresh (5s).
 */
export function useCircuitBreakerDashboard() {
  return useQuery<CircuitBreakerDashboard, ApiError>({
    queryKey: queryKeys.observability.circuitBreakers(),
    queryFn: () =>
      apiGet<CircuitBreakerDashboard>("/api/health/circuit-breakers"),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

// ─── useAuditTrail ─────────────────────────────────────────────────────────

/**
 * Fetch audit trail events with optional filters, auto-refresh (10s).
 */
export function useAuditTrail(
  query?: { channel?: string; correlationId?: string; limit?: number },
) {
  return useQuery<AuditTrailResult, ApiError>({
    queryKey: queryKeys.observability.auditTrail(query),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query?.channel) params.set("channel", query.channel);
      if (query?.correlationId)
        params.set("correlationId", query.correlationId);
      if (query?.limit) params.set("limit", String(query.limit));
      const qs = params.toString();
      const url = qs
        ? `/api/health/audit-trail?${qs}`
        : "/api/health/audit-trail";
      return apiGet<AuditTrailResult>(url);
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

// ─── useAuditStats ─────────────────────────────────────────────────────────

/**
 * Fetch audit trail statistics.
 */
export function useAuditStats() {
  return useQuery<AuditStats, ApiError>({
    queryKey: queryKeys.observability.auditStats(),
    queryFn: () => apiGet<AuditStats>("/api/health/audit-trail/stats"),
    staleTime: 30_000,
  });
}

// ─── useAuditChainVerification ────────────────────────────────────────────

/**
 * Verify audit trail chain integrity.
 */
export function useAuditChainVerification() {
  return useQuery<AuditStats["integrity"], ApiError>({
    queryKey: queryKeys.observability.auditVerify(),
    queryFn: () =>
      apiGet<AuditStats["integrity"]>("/api/health/audit-trail/verify"),
    staleTime: 60_000,
  });
}

// ─── useSystemHealth ──────────────────────────────────────────────────────

/**
 * Fetch system health status with auto-refresh (10s).
 */
export function useSystemHealth() {
  return useQuery<SystemHealth, ApiError>({
    queryKey: queryKeys.observability.systemHealth(),
    queryFn: () => apiGet<SystemHealth>("/api/health"),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

// ─── useCircuitBreakerAction ──────────────────────────────────────────────

/**
 * Mutation hook for circuit-breaker actions (reset / trip).
 *
 * On success, invalidates the circuit-breaker dashboard query so
 * the UI reflects the state change immediately.
 */
export function useCircuitBreakerAction() {
  return useMutation<
    unknown,
    ApiError,
    CircuitBreakerActionPayload
  >({
    mutationFn: (payload) =>
      apiPost<CircuitBreakerActionPayload, unknown>(
        "/api/health/circuit-breakers",
        payload,
      ),
  });
}
