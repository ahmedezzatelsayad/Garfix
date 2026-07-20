/**
 * inventory.ts — React Query hooks for inventory management.
 *
 * Provides typed query and mutation hooks for inventory items, movements,
 * and warehouses. All hooks use the centralized `queryKeys` factory for
 * granular cache invalidation and the typed `apiGet`/`apiPost`/`apiPatch`/
 * `apiDelete` helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of an inventory item record returned by the API. */
export interface InventoryItem {
  id: number;
  name: string;
  sku?: string;
  quantity: number;
  unit?: string;
  price?: number;
  warehouseId?: number;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of an inventory movement record returned by the API. */
export interface InventoryMovement {
  id: number;
  itemId: number;
  type: string;
  quantity: number;
  date: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a warehouse record returned by the API. */
export interface Warehouse {
  id: number;
  name: string;
  address?: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for creating a new inventory item. */
export interface CreateInventoryItemPayload {
  name: string;
  sku?: string;
  quantity: number;
  unit?: string;
  price?: number;
  warehouseId?: number;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for creating a new warehouse. */
export interface CreateWarehousePayload {
  name: string;
  address?: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing warehouse. */
export interface UpdateWarehousePayload {
  id: number;
  name?: string;
  address?: string;
  [key: string]: unknown;
}

/** Response shape for the inventory items list endpoint. */
interface InventoryItemListResponse {
  items: InventoryItem[];
}

/** Response shape for the inventory movements list endpoint. */
interface InventoryMovementListResponse {
  movements: InventoryMovement[];
}

/** Response shape for the warehouses list endpoint. */
interface WarehouseListResponse {
  warehouses: Warehouse[];
}

// ─── Query Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch a list of inventory items for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose inventory items to fetch.
 */
export function useInventoryItems(companySlug: string) {
  return useQuery<InventoryItemListResponse, ApiError>({
    queryKey: queryKeys.inventory.items(companySlug),
    queryFn: () =>
      apiGet<InventoryItemListResponse>(
        `/api/inventory/items?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Fetch a list of inventory movements for a given company.
 *
 * @param companySlug - Slug of the company whose inventory movements to fetch.
 */
export function useInventoryMovements(companySlug: string) {
  return useQuery<InventoryMovementListResponse, ApiError>({
    queryKey: queryKeys.inventory.movements(companySlug),
    queryFn: () =>
      apiGet<InventoryMovementListResponse>(
        `/api/inventory/movements?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Fetch a list of warehouses for a given company.
 *
 * @param companySlug - Slug of the company whose warehouses to fetch.
 */
export function useWarehouses(companySlug: string) {
  return useQuery<WarehouseListResponse, ApiError>({
    queryKey: queryKeys.inventory.warehouses(companySlug),
    queryFn: () =>
      apiGet<WarehouseListResponse>(
        `/api/inventory/warehouses?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────

/**
 * Create a new inventory item.
 *
 * On success all inventory item queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation<InventoryItem, ApiError, CreateInventoryItemPayload>({
    mutationFn: (payload) =>
      apiPost<CreateInventoryItemPayload, InventoryItem>(
        "/api/inventory/items",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.inventory.items(variables.companySlug),
      });
    },
  });
}

/**
 * Create a new warehouse.
 *
 * On success all warehouse queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation<Warehouse, ApiError, CreateWarehousePayload>({
    mutationFn: (payload) =>
      apiPost<CreateWarehousePayload, Warehouse>(
        "/api/inventory/warehouses",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.inventory.warehouses(variables.companySlug),
      });
    },
  });
}

/**
 * Update an existing warehouse.
 *
 * On success warehouse queries are invalidated, ensuring all views
 * reflect the updated data.
 */
export function useUpdateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation<Warehouse, ApiError, UpdateWarehousePayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, Warehouse>(
        `/api/inventory/warehouses/${id}`,
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.inventory.all,
      });
    },
  });
}

/**
 * Delete a warehouse by ID.
 *
 * On success all warehouse queries are invalidated so every mounted
 * list view refetches without the deleted entry.
 */
export function useDeleteWarehouse() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/inventory/warehouses/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.inventory.all,
      });
    },
  });
}
