/**
 * clients.ts — React Query hooks for client CRUD operations.
 *
 * Provides typed query and mutation hooks for listing, fetching, creating,
 * updating, deleting, and bulk-deleting clients. All hooks use the centralized
 * `queryKeys` factory for granular cache invalidation and the typed
 * `apiGet`/`apiPost`/`apiPatch`/`apiDelete` helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of a client record returned by the API. */
export interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
  companySlug: string;
}

/** Payload for creating a new client. */
export interface CreateClientPayload {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
  companySlug: string;
}

/** Payload for updating an existing client. */
export interface UpdateClientPayload {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
}

/** Response shape for the client list endpoint. */
interface ClientListResponse {
  clients: Client[];
}

/** Response shape for a single client endpoint. */
interface ClientResponse {
  client: Client;
}

// ─── Query Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch a paginated / filtered list of clients for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose clients to fetch.
 * @param search      - Optional search string to filter results.
 */
export function useClients(companySlug: string, search?: string) {
  return useQuery<ClientListResponse, ApiError>({
    queryKey: queryKeys.clients.list({ companySlug, search }),
    queryFn: () => {
      const params = new URLSearchParams({ companySlug });
      if (search) {
        params.set("search", search);
      }
      return apiGet<ClientListResponse>(`/api/clients?${params.toString()}`);
    },
    enabled: !!companySlug,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Fetch a single client by ID.
 *
 * The query is disabled when `id` is not a positive number.
 *
 * @param id - Primary key of the client to fetch.
 */
export function useClient(id: number) {
  return useQuery<ClientResponse, ApiError>({
    queryKey: queryKeys.clients.detail(id),
    queryFn: () => apiGet<ClientResponse>(`/api/clients/${id}`),
    enabled: id > 0,
  });
}

/**
 * Fetch the extended profile of a client.
 *
 * The profile endpoint may include additional computed fields such as
 * lifetime value, invoice counts, and recent activity.
 *
 * @param id - Primary key of the client whose profile to fetch.
 */
export function useClientProfile(id: number) {
  return useQuery<ClientResponse, ApiError>({
    queryKey: queryKeys.clients.profile(id),
    queryFn: () => apiGet<ClientResponse>(`/api/clients/${id}/profile`),
    enabled: id > 0,
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────

/**
 * Create a new client.
 *
 * On success all client list queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation<ClientResponse, ApiError, CreateClientPayload>({
    mutationFn: (payload) =>
      apiPost<CreateClientPayload, ClientResponse>("/api/clients", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists() });
    },
  });
}

/**
 * Update an existing client.
 *
 * On success both the list queries **and** the specific detail query for the
 * updated client are invalidated, ensuring all views reflect the new data.
 */
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation<ClientResponse, ApiError, UpdateClientPayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, ClientResponse>(`/api/clients/${id}`, body);
    },
    onSuccess: (_data, variables) => {
      // Invalidate all list queries (any company / search filter)
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists() });
      // Invalidate the specific detail cache for this client
      void queryClient.invalidateQueries({
        queryKey: queryKeys.clients.detail(variables.id),
      });
      // Also invalidate the profile since it derives from client data
      void queryClient.invalidateQueries({
        queryKey: queryKeys.clients.profile(variables.id),
      });
    },
  });
}

/**
 * Delete a single client.
 *
 * On success all client list queries are invalidated. The detail and
 * profile caches for the deleted client are also removed to prevent
 * stale data from appearing if the user navigates back.
 */
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/clients/${id}`),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists() });
      // Remove detail and profile caches for the deleted client
      void queryClient.removeQueries({ queryKey: queryKeys.clients.detail(id) });
      void queryClient.removeQueries({ queryKey: queryKeys.clients.profile(id) });
    },
  });
}

/**
 * Bulk-delete multiple clients by ID.
 *
 * Loops through the provided IDs and issues a DELETE request for each.
 * Individual failures are collected but do not abort the remaining
 * deletions. After all requests complete the list queries are invalidated.
 *
 * On success returns an object with the count of succeeded and failed deletions.
 */
export function useBulkDeleteClients() {
  const queryClient = useQueryClient();

  return useMutation<
    { succeeded: number; failed: number },
    ApiError,
    number[]
  >({
    mutationFn: async (ids) => {
      let succeeded = 0;
      let failed = 0;

      for (const id of ids) {
        try {
          await apiDelete<void>(`/api/clients/${id}`);
          succeeded++;
        } catch {
          failed++;
        }
      }

      return { succeeded, failed };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists() });
    },
  });
}
