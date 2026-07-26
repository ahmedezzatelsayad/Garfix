/**
 * cursor-pagination-server — Server-side cursor pagination utilities.
 *
 * Pure functions for API route handlers — no React, no client-side imports.
 * This file is the server-safe counterpart to src/hooks/cursor-pagination.ts
 * which contains the React Query hook (client-side only).
 *
 * API pattern: `GET /api/resource?companySlug=X&cursor=123&limit=20`
 * Response: `{ items: [...], nextCursor: "124" | null }`
 */

// ─── parseCursorParams (server-side helper) ─────────────────────────────────

/**
 * Parse cursor pagination parameters from a NextRequest URL.
 * Returns typed params with defaults.
 *
 * Usage in API route:
 *   const { companySlug, cursor, limit, search, status } = parseCursorParams(req);
 *   const where = buildWhere(companySlug, { search, status });
 *   const pagination = buildCursorPrismaQuery(cursor, limit);
 *   const allItems = await db.model.findMany({ where, ...pagination });
 *   const { items, nextCursor } = buildCursorResponse(allItems, limit);
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
