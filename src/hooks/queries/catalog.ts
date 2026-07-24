/**
 * catalog.ts — React Query hooks for product catalog CRUD operations.
 *
 * Provides useCatalog, useCatalogItem, useCreateCatalogItem,
 * useUpdateCatalogItem, and useDeleteCatalogItem hooks.
 * All hooks use the centralized `queryKeys` factory and the typed
 * `apiGet`/`apiPost`/`apiPatch`/`apiDelete` helpers.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  name: string;
  nameAr?: string;
  sku: string;
  description?: string;
  unitPrice: number;
  category?: string;
  companySlug: string;
  [key: string]: unknown;
}

interface CatalogListResponse {
  items: CatalogItem[];
  total: number;
}

interface CatalogItemResponse {
  item: CatalogItem;
}

interface CreateCatalogItemPayload {
  name: string;
  sku: string;
  unitPrice: number;
  companySlug: string;
  [key: string]: unknown;
}

interface UpdateCatalogItemPayload {
  id: string;
  name?: string;
  sku?: string;
  unitPrice?: number;
  [key: string]: unknown;
}

// ─── useCatalog ─────────────────────────────────────────────────────────────

export function useCatalog(companySlug: string) {
  return useQuery<CatalogListResponse, ApiError>({
    queryKey: queryKeys.catalog.list(companySlug),
    queryFn: () =>
      apiGet<CatalogListResponse>(
        `/api/catalog?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ─── useCatalogItem ──────────────────────────────────────────────────────────

export function useCatalogItem(id: string) {
  return useQuery<CatalogItemResponse, ApiError>({
    queryKey: queryKeys.catalog.detail(id),
    queryFn: () => apiGet<CatalogItemResponse>(`/api/catalog/${id}`),
    enabled: !!id,
  });
}

// ─── useCreateCatalogItem ────────────────────────────────────────────────────

export function useCreateCatalogItem() {
  const queryClient = useQueryClient();

  return useMutation<CatalogItemResponse, ApiError, CreateCatalogItemPayload>({
    mutationFn: (payload) =>
      apiPost<CreateCatalogItemPayload, CatalogItemResponse>("/api/catalog", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.catalog.all,
      });
    },
  });
}

// ─── useUpdateCatalogItem ────────────────────────────────────────────────────

export function useUpdateCatalogItem() {
  const queryClient = useQueryClient();

  return useMutation<CatalogItemResponse, ApiError, UpdateCatalogItemPayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, CatalogItemResponse>(`/api/catalog/${id}`, body);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.catalog.detail(variables.id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.catalog.all,
      });
    },
  });
}

// ─── useDeleteCatalogItem ────────────────────────────────────────────────────

export function useDeleteCatalogItem() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => apiDelete<void>(`/api/catalog/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.catalog.all,
      });
    },
  });
}
