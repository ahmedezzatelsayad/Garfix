/**
 * automation.ts — React Query hooks for automation rules and logs.
 *
 * Provides typed query and mutation hooks for automation CRUD operations
 * and execution log retrieval. All hooks use the centralized `queryKeys`
 * factory for granular cache invalidation and the typed `apiGet`/`apiPost`/
 * `apiPatch`/`apiDelete` helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of an automation record returned by the API. */
export interface Automation {
  id: number;
  name: string;
  type: string;
  trigger: string;
  action: string;
  enabled: boolean;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of an automation log entry returned by the API. */
export interface AutomationLog {
  id: number;
  automationId: number;
  status: string;
  message?: string;
  ranAt: string;
  [key: string]: unknown;
}

/** Payload for creating a new automation. */
export interface CreateAutomationPayload {
  name: string;
  type: string;
  trigger: string;
  action: string;
  enabled?: boolean;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing automation. */
export interface UpdateAutomationPayload {
  id: number;
  name?: string;
  type?: string;
  trigger?: string;
  action?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/** Response shape for the automation list endpoint. */
interface AutomationListResponse {
  automations: Automation[];
}

/** Response shape for the automation logs endpoint. */
interface AutomationLogListResponse {
  logs: AutomationLog[];
}

// ─── Query Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch a list of automations for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose automations to fetch.
 */
export function useAutomations(companySlug: string) {
  return useQuery<AutomationListResponse, ApiError>({
    queryKey: queryKeys.automation.list(companySlug),
    queryFn: () =>
      apiGet<AutomationListResponse>(
        `/api/automation?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Fetch execution logs for a specific automation.
 *
 * The query is disabled when `id` is not a positive number.
 *
 * @param id - Primary key of the automation whose logs to fetch.
 */
export function useAutomationLogs(id: number) {
  return useQuery<AutomationLogListResponse, ApiError>({
    queryKey: queryKeys.automation.logs(id),
    queryFn: () =>
      apiGet<AutomationLogListResponse>(`/api/automation/${id}/logs`),
    enabled: id > 0,
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────

/**
 * Create a new automation.
 *
 * On success all automation list queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateAutomation() {
  const queryClient = useQueryClient();

  return useMutation<Automation, ApiError, CreateAutomationPayload>({
    mutationFn: (payload) =>
      apiPost<CreateAutomationPayload, Automation>("/api/automation", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.automation.all,
      });
    },
  });
}

/**
 * Update an existing automation.
 *
 * On success both the list queries **and** the specific detail query for the
 * updated automation are invalidated, ensuring all views reflect the new data.
 */
export function useUpdateAutomation() {
  const queryClient = useQueryClient();

  return useMutation<Automation, ApiError, UpdateAutomationPayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, Automation>(`/api/automation/${id}`, body);
    },
    onSuccess: (_data, variables) => {
      // Invalidate all automation list queries
      void queryClient.invalidateQueries({
        queryKey: queryKeys.automation.all,
      });
      // Invalidate the specific detail cache for this automation
      void queryClient.invalidateQueries({
        queryKey: queryKeys.automation.detail(variables.id),
      });
    },
  });
}

/**
 * Delete an automation by ID.
 *
 * On success all automation list queries are invalidated so every mounted
 * list view refetches without the deleted entry.
 */
export function useDeleteAutomation() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/automation/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.automation.all,
      });
    },
  });
}
