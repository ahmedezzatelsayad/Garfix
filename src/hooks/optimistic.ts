/**
 * optimistic — Reusable optimistic update helpers for TanStack React Query.
 *
 * These utilities implement the "optimistic update" pattern where UI changes
 * are applied immediately before the server confirms them. If the server
 * rejects the change, the UI rolls back automatically.
 *
 * Pattern:
 *   1. onMutate: Cancel in-flight queries, snapshot current cache, apply change
 *   2. onError: Roll back to snapshot, show error toast
 *   3. onSettled: Refetch to sync with server
 *
 * Usage in mutation hooks:
 *   const mutation = useMutation({
 *     ...optimisticAdd(queryClient, queryKeys.invoices.lists(), (old, newItem) => [...old, newItem]),
 *     mutationFn: apiPost,
 *   });
 */

"use client";

import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

type ListUpdater<T> = (oldList: T[], newItem: Partial<T>) => T[];
type ItemUpdater<T> = (oldItem: T, updates: Partial<T>) => T;

interface OptimisticContext<T> {
  previousData: T | undefined;
}

// ─── Optimistic Add (list append) ────────────────────────────────────────────

/**
 * Create optimistic mutation options for adding an item to a list.
 * The new item appears instantly in the UI, and is rolled back on error.
 *
 * @param queryClient - The QueryClient instance
 * @param queryKey - The query key for the list to update
 * @param updater - Function that merges the new item into the existing list
 * @param errorMsg - Optional custom error message for rollback toast
 */
export function optimisticAdd<T extends { id: number | string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: ListUpdater<T>,
  errorMsg?: string,
) {
  return {
    onMutate: async (newItem: Partial<T>) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<T[]>(queryKey);

      // Optimistically update to the new value
      if (previousData) {
        queryClient.setQueryData(queryKey, updater(previousData, newItem));
      }

      // Return context with snapshot for rollback
      return { previousData } as OptimisticContext<T[]>;
    },
    onError: (_err: Error, _newItem: Partial<T>, context?: OptimisticContext<T[]>) => {
      // Roll back to the snapshot
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(errorMsg || "فشل إضافة العنصر — تم استعادة البيانات السابقة");
    },
    onSettled: () => {
      // Always refetch after error or success to ensure server state
      queryClient.invalidateQueries({ queryKey });
    },
  };
}

// ─── Optimistic Update (single item) ──────────────────────────────────────────

/**
 * Create optimistic mutation options for updating a single item.
 * The changes appear instantly, rolled back on error.
 *
 * @param queryClient - The QueryClient instance
 * @param listQueryKey - The query key for the list containing the item
 * @param updater - Function that applies updates to the item
 * @param errorMsg - Optional custom error message
 */
export function optimisticUpdate<T extends { id: number | string }>(
  queryClient: QueryClient,
  listQueryKey: readonly unknown[],
  updater: ItemUpdater<T>,
  errorMsg?: string,
) {
  return {
    onMutate: async (updates: Partial<T> & { id: T["id"] }) => {
      await queryClient.cancelQueries({ queryKey: listQueryKey });

      const previousData = queryClient.getQueryData<T[]>(listQueryKey);

      if (previousData) {
        queryClient.setQueryData(
          listQueryKey,
          previousData.map((item) =>
            item.id === updates.id ? updater(item, updates) : item,
          ),
        );
      }

      return { previousData } as OptimisticContext<T[]>;
    },
    onError: (_err: Error, _updates: Partial<T>, context?: OptimisticContext<T[]>) => {
      if (context?.previousData) {
        queryClient.setQueryData(listQueryKey, context.previousData);
      }
      toast.error(errorMsg || "فشل تحديث العنصر — تم استعادة البيانات السابقة");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
  };
}

// ─── Optimistic Delete (remove from list) ────────────────────────────────────

/**
 * Create optimistic mutation options for deleting an item from a list.
 * The item disappears instantly, restored on error.
 *
 * @param queryClient - The QueryClient instance
 * @param queryKey - The query key for the list
 * @param errorMsg - Optional custom error message
 */
export function optimisticDelete<T extends { id: number | string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  errorMsg?: string,
) {
  return {
    onMutate: async (id: T["id"]) => {
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<T[]>(queryKey);

      if (previousData) {
        queryClient.setQueryData(
          queryKey,
          previousData.filter((item) => item.id !== id),
        );
      }

      return { previousData } as OptimisticContext<T[]>;
    },
    onError: (_err: Error, _id: T["id"], context?: OptimisticContext<T[]>) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(errorMsg || "فشل حذف العنصر — تم استعادة البيانات السابقة");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  };
}

// ─── Cache Prefetch ─────────────────────────────────────────────────────────

/**
 * Prefetch a query to have data ready before the user navigates.
 * Useful for hover-based prefetching on links.
 */
export async function prefetchQuery<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  staleTime = 30_000,
) {
  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime,
  });
}

// ─── Batch Invalidation ─────────────────────────────────────────────────────

/**
 * Invalidate multiple query keys at once (e.g., after a multi-resource mutation).
 */
export async function invalidateMany(
  queryClient: QueryClient,
  queryKeys: readonly unknown[][],
) {
  await Promise.all(
    queryKeys.map((key) =>
      queryClient.invalidateQueries({ queryKey: key }),
    ),
  );
}
