/**
 * webhooks.ts — React Query hooks for webhook endpoints, deliveries, events,
 * and CRUD operations.
 *
 * Provides useWebhookEndpoints, useWebhookEndpoint, useWebhookDeliveries,
 * useWebhookEvents, useCreateWebhookEndpoint, useUpdateWebhookEndpoint,
 * and useDeleteWebhookEndpoint hooks.
 * All hooks use the centralized `queryKeys` factory and the typed
 * `apiGet`/`apiPost`/`apiPatch`/`apiDelete` helpers.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  createdAt: string;
  companySlug?: string;
  [key: string]: unknown;
}

interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  status: "success" | "failed" | "pending";
  attempts: number;
  createdAt: string;
  [key: string]: unknown;
}

interface WebhookEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
  [key: string]: unknown;
}

interface WebhookEndpointListResponse {
  endpoints: WebhookEndpoint[];
}

interface WebhookEndpointDetailResponse {
  endpoint: WebhookEndpoint;
}

interface WebhookDeliveriesResponse {
  deliveries: WebhookDelivery[];
}

interface WebhookEventsResponse {
  events: WebhookEvent[];
}

interface CreateWebhookEndpointPayload {
  url: string;
  events: string[];
  companySlug?: string;
  [key: string]: unknown;
}

interface UpdateWebhookEndpointPayload {
  id: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
  [key: string]: unknown;
}

// ─── useWebhookEndpoints ─────────────────────────────────────────────────────

export function useWebhookEndpoints() {
  return useQuery<WebhookEndpointListResponse, ApiError>({
    queryKey: queryKeys.webhooks.endpoints(),
    queryFn: () => apiGet<WebhookEndpointListResponse>("/api/webhooks/endpoints"),
  });
}

// ─── useWebhookEndpoint ──────────────────────────────────────────────────────

export function useWebhookEndpoint(id: string) {
  return useQuery<WebhookEndpointDetailResponse, ApiError>({
    queryKey: queryKeys.webhooks.endpointDetail(id),
    queryFn: () => apiGet<WebhookEndpointDetailResponse>(`/api/webhooks/endpoints/${id}`),
    enabled: !!id,
  });
}

// ─── useWebhookDeliveries ────────────────────────────────────────────────────

export function useWebhookDeliveries() {
  return useQuery<WebhookDeliveriesResponse, ApiError>({
    queryKey: queryKeys.webhooks.deliveries(),
    queryFn: () => apiGet<WebhookDeliveriesResponse>("/api/webhooks/deliveries"),
  });
}

// ─── useWebhookEvents ────────────────────────────────────────────────────────

export function useWebhookEvents() {
  return useQuery<WebhookEventsResponse, ApiError>({
    queryKey: queryKeys.webhooks.events(),
    queryFn: () => apiGet<WebhookEventsResponse>("/api/webhooks/events"),
  });
}

// ─── useCreateWebhookEndpoint ────────────────────────────────────────────────

export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();

  return useMutation<WebhookEndpointDetailResponse, ApiError, CreateWebhookEndpointPayload>({
    mutationFn: (payload) =>
      apiPost<CreateWebhookEndpointPayload, WebhookEndpointDetailResponse>(
        "/api/webhooks/endpoints",
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.webhooks.all,
      });
    },
  });
}

// ─── useUpdateWebhookEndpoint ────────────────────────────────────────────────

export function useUpdateWebhookEndpoint() {
  const queryClient = useQueryClient();

  return useMutation<WebhookEndpointDetailResponse, ApiError, UpdateWebhookEndpointPayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      // Server exports PUT not PATCH — use apiPut to match.
      return apiPut<typeof body, WebhookEndpointDetailResponse>(
        `/api/webhooks/endpoints/${id}`,
        body,
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.webhooks.endpointDetail(variables.id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.webhooks.all,
      });
    },
  });
}

// ─── useDeleteWebhookEndpoint ────────────────────────────────────────────────

export function useDeleteWebhookEndpoint() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => apiDelete<void>(`/api/webhooks/endpoints/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.webhooks.all,
      });
    },
  });
}

// ─── useRetryWebhookDelivery ──────────────────────────────────────────────────

/**
 * Retry a failed webhook delivery.
 *
 * On success the deliveries query is invalidated so the retried
 * delivery's new status is reflected.
 */
export function useRetryWebhookDelivery() {
  const queryClient = useQueryClient();

  return useMutation<Record<string, unknown>, ApiError, { deliveryId: string }>({
    mutationFn: ({ deliveryId }) =>
      // Server route is POST /api/webhooks/deliveries with { deliveryId } body
      // (no /:id/retry sub-route exists).
      apiPost<Record<string, unknown>, { deliveryId: string }>(
        "/api/webhooks/deliveries",
        { deliveryId },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.webhooks.deliveries(),
      });
    },
  });
}

// ─── useTestWebhookEndpoint ───────────────────────────────────────────────────

/**
 * Test a webhook endpoint by sending a sample payload.
 *
 * This is a fire-and-forget style mutation — it does not invalidate
 * any query caches automatically.
 */
export function useTestWebhookEndpoint() {
  return useMutation<
    Record<string, unknown>,
    ApiError,
    { endpointId: string; eventType?: string }
  >({
    mutationFn: ({ endpointId, eventType }) =>
      // Server route is POST /api/webhooks/events with { endpointId, eventType } body
      // (no /endpoints/:id/test sub-route exists).
      apiPost<
        Record<string, unknown>,
        { endpointId: string; eventType: string }
      >("/api/webhooks/events", {
        endpointId,
        eventType: eventType || "system.error_alert",
      }),
  });
}

// ─── useWebhookDeliveriesFiltered ────────────────────────────────────────────

/** Parameters for filtering webhook deliveries. */
export interface WebhookDeliveriesFilterParams {
  status?: string;
  eventType?: string;
  endpointId?: string;
  limit?: number;
  [key: string]: unknown;
}

interface WebhookDeliveriesFilteredResponse {
  deliveries: WebhookDelivery[];
  stats?: DeliveryStats;
}

interface DeliveryStats {
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
  retried: number;
  successRate: number;
  avgLatencyMs: number;
}

/**
 * Fetch webhook deliveries with optional filters (status, event type, endpoint).
 *
 * The query key includes the filter params so cache is segmented per filter set.
 */
export function useWebhookDeliveriesFiltered(params: WebhookDeliveriesFilterParams) {
  return useQuery<WebhookDeliveriesFilteredResponse, ApiError>({
    queryKey: [...queryKeys.webhooks.deliveries(), "filtered", params] as const,
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params.status) searchParams.set("status", params.status);
      if (params.eventType) searchParams.set("eventType", params.eventType);
      if (params.endpointId) searchParams.set("endpointId", params.endpointId);
      if (params.limit) searchParams.set("limit", String(params.limit));
      return apiGet<WebhookDeliveriesFilteredResponse>(
        `/api/webhooks/deliveries?${searchParams.toString()}`,
      );
    },
  });
}

// ─── useRetryWebhookDeliveryLegacy ───────────────────────────────────────────

/**
 * Retry a failed webhook delivery via the legacy POST /api/webhooks/deliveries endpoint.
 *
 * Some views use this endpoint instead of the per-delivery retry endpoint.
 * This is a fire-and-forget style mutation — on success it invalidates
 * the deliveries query so the retried delivery's new status is reflected.
 */
export function useRetryWebhookDeliveryLegacy() {
  const queryClient = useQueryClient();

  return useMutation<Record<string, unknown>, ApiError, { deliveryId: string }>({
    mutationFn: ({ deliveryId }) =>
      apiPost<Record<string, unknown>, Record<string, unknown>>(
        "/api/webhooks/deliveries",
        { deliveryId },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.webhooks.all,
      });
    },
  });
}

// ─── useTestWebhookEvent ──────────────────────────────────────────────────────

/**
 * Test a webhook endpoint by sending a test event payload via
 * POST /api/webhooks/events.
 *
 * This is a fire-and-forget style mutation — it does not invalidate
 * any query caches automatically.
 */
export function useTestWebhookEvent() {
  return useMutation<Record<string, unknown>, ApiError, { endpointId: string; eventType: string }>({
    mutationFn: (payload) =>
      apiPost<{ endpointId: string; eventType: string }, Record<string, unknown>>(
        "/api/webhooks/events",
        payload,
      ),
  });
}
