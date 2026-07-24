/**
 * cursor-pagination — Cursor-based pagination utilities for TanStack React Query.
 *
 * Cursor-based pagination uses a unique identifier (typically the row `id`)
 * as the page boundary, which avoids the "skipped rows" problem that offset
 * pagination suffers from when rows are inserted/deleted between pages.
 *
 * API pattern: `GET /api/resource?companySlug=X&cursor=123&limit=20`
 * Response: `{ items: [...], nextCursor: "124" | null }`
 *
 * This module provides:
 *  1. `useCursorPagination` — React Query hook with infinite scrolling
 *  2. `parseCursorParams` — Helper for API route handlers
 *  3. `buildCursorResponse` — Helper for API route response formatting
 */

"use client";

import {
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  QueryClient,
  InfiniteData,
} from "@tanstack/react-query";
import { apiGet, ApiError } from "@/hooks/api-client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  totalCount?: number;
}

export interface CursorPaginationParams {
  companySlug: string;
  limit?: number;
  search?: string;
  status?: string;
  /** Extra filters to pass to the API */
  extraFilters?: Record<string, string>;
}

// ─── useCursorPagination ────────────────────────────────────────────────────

/**
 * Infinite query hook that uses cursor-based pagination.
 * Supports "Load More" pattern and infinite scroll.
 *
 * Usage:
 *   const { items, fetchNextPage, hasNextPage, isFetchingNextPage } =
 *     useCursorPagination<Invoice>({
 *       queryKey: queryKeys.invoices.lists(),
 *       url: "/api/invoices",
 *       params: { companySlug: "gfx-01" },
 *     });
 */
export function useCursorPagination<T>(
  options: {
    queryKey: readonly unknown[];
    url: string;
    params: CursorPaginationParams;
    enabled?: boolean;
  },
) {
  const { queryKey, url, params, enabled = true } = options;
  const limit = params.limit || 20;

  // Build the base URL with static params
  const buildUrl = (cursor?: string | null) => {
    const sp = new URLSearchParams();
    sp.set("companySlug", params.companySlug);
    sp.set("limit", String(limit));
    if (cursor) sp.set("cursor", cursor);
    if (params.search) sp.set("search", params.search);
    if (params.status) sp.set("status", params.status);
    if (params.extraFilters) {
      for (const [k, v] of Object.entries(params.extraFilters)) {
        sp.set(k, v);
      }
    }
    return `${url}?${sp.toString()}`;
  };

  const query = useInfiniteQuery<CursorPage<T>, ApiError>({
    queryKey: [...queryKey, params],
    queryFn: ({ pageParam }) => apiGet<CursorPage<T>>(buildUrl(pageParam as string | null)),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 30_000,
  });

  // Flatten all pages into a single items array
  const items: T[] =
    query.data?.pages.flatMap((page) => page.items) ?? [];

  // Total count from the first page (if the API provides it)
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    items,
    totalCount,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    // Raw query object for advanced usage
    query,
  };
}

// ─── parseCursorParams (server-side helper) ─────────────────────────────────

/**
 * Parse cursor pagination parameters from a NextRequest URL.
 * Returns typed params with defaults.
 *
 * Usage in API route:
 *   const { companySlug, cursor, limit, search, status } = parseCursorParams(req);
 *   const where = buildWhere(companySlug, { search, status });
 *   const { items, nextCursor } = await fetchPage(db.model, where, cursor, limit);
 */
export function parseCursorParams(req: { nextUrl: URL }) {
  const sp = req.nextUrl.searchParams;
  return {
    companySlug: sp.get("companySlug") || "",
    cursor: sp.get("cursor") || undefined,
    limit: Math.min(parseInt(sp.get("limit") || "20", 10), 500),
    search: sp.get("search") || undefined,
    status: sp.get("status") || undefined,
    // Collect any extra filter params
    extraFilters: Object.fromEntries(
      Array.from(sp.entries()).filter(
        ([k]) =>
          !["companySlug", "cursor", "limit", "search", "status"].includes(k),
      ),
    ),
  };
}

// ─── buildCursorResponse (server-side helper) ───────────────────────────────

/**
 * Build a standard cursor pagination response from query results.
 *
 * Pattern: Fetch limit+1 items. If we got limit+1, there's a next page.
 * The nextCursor is the id of the last item in the current page.
 *
 * Usage in API route:
 *   const allItems = await db.model.findMany({ where, orderBy: { id: "desc" }, take: limit + 1, ... });
 *   return buildCursorResponse(allItems, limit);
 */
export function buildCursorResponse<T extends { id: number }>(
  allItems: T[],
  limit: number,
  totalCount?: number,
) {
  const hasNextPage = allItems.length > limit;
  const items = hasNextPage ? allItems.slice(0, limit) : allItems;
  const nextCursor = hasNextPage
    ? String(items[items.length - 1]?.id)
    : null;

  return {
    items,
    nextCursor,
    totalCount,
  };
}

// ─── buildCursorPrismaQuery (server-side helper) ────────────────────────────

/**
 * Build Prisma query parameters for cursor-based pagination.
 * Returns { take, skip, cursor, orderBy } ready to spread into findMany.
 *
 * Usage:
 *   const pagination = buildCursorPrismaQuery(cursor, limit);
 *   const items = await db.invoice.findMany({ where, ...pagination });
 */
export function buildCursorPrismaQuery(
  cursor?: string,
  limit: number = 20,
  orderField: string = "id",
  orderDirection: "asc" | "desc" = "desc",
) {
  const cursorId = cursor ? parseInt(cursor, 10) : undefined;
  const cursorObj = cursorId && !isNaN(cursorId) ? { id: cursorId } : undefined;

  return {
    take: limit + 1, // Fetch one extra to check if there's a next page
    skip: cursor ? 1 : 0,
    cursor: cursorObj,
    orderBy: { [orderField]: orderDirection },
  };
}

// ─── Prefetch Next Page ────────────────────────────────────────────────────

/**
 * Prefetch the next page of a cursor-paginated query.
 * Useful for hover-based prefetching on "Load More" buttons.
 */
export async function prefetchNextCursorPage<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  url: string,
  params: CursorPaginationParams,
  currentNextCursor: string | null,
) {
  if (!currentNextCursor) return;

  const sp = new URLSearchParams();
  sp.set("companySlug", params.companySlug);
  sp.set("limit", String(params.limit || 20));
  sp.set("cursor", currentNextCursor);
  if (params.search) sp.set("search", params.search);
  if (params.status) sp.set("status", params.status);

  await queryClient.prefetchInfiniteQuery({
    queryKey: [...queryKey, params],
    queryFn: () => apiGet<CursorPage<T>>(`${url}?${sp.toString()}`),
    initialPageParam: null,
    staleTime: 30_000,
  });
}
