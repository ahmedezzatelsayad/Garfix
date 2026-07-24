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
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
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
      return apiPatch<typeof body, WebhookEndpointDetailResponse>(
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
