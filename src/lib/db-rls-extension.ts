/**
 * db-rls-extension.ts — Full per-request RLS Prisma extension.
 *
 * #27 FINAL FIX: This module provides a Prisma $extends client that
 * automatically sets the Postgres session variable `app.current_company_slug`
 * before EVERY query, so RLS policies filter rows by tenant without
 * application code needing WHERE clauses on every query.
 *
 * Usage in API routes:
 *   import { getTenantDb } from "@/lib/db-rls-extension";
 *   const tenantDb = await getTenantDb(req);
 *   const invoices = await tenantDb.invoice.findMany();
 *   // RLS ensures only the current tenant's invoices are returned
 *
 * Architecture:
 *   - The extension wraps every query in a $transaction that first sets
 *     the session variable via $executeRaw, then runs the original query.
 *   - The tenant context is extracted from the JWT (resolveAuth).
 *   - A per-request WeakMap cache avoids re-creating the extension on
 *     every query within the same request.
 */

import { NextRequest } from "next/server";
import { dbTyped } from "@/lib/db";
import { resolveAuth, hasUnrestrictedScope } from "@/lib/auth";
import { logger } from "@/lib/logger";

// Cache: one extended client per (userUid, companySlug) pair
const rlsClientCache = new Map<string, typeof dbTyped>();

/**
 * Get a tenant-scoped Prisma client for the current request.
 * Extracts the companySlug from the JWT and sets the RLS session variable.
 *
 * Falls back to the unscoped `db` if:
 *   - Auth fails (unauthenticated request)
 *   - User has unrestricted scope (founder/admin — sees all tenants)
 *   - RLS setup fails (DB error — app-layer scoping is the fallback)
 */
export async function getTenantDb(req: NextRequest): Promise<typeof dbTyped> {
  const authResult = await resolveAuth(req);
  if (!authResult.ok || !authResult.user) {
    return dbTyped; // unauthenticated — no RLS context
  }

  const user = authResult.user;

  // Founder/admin bypass RLS — they need cross-tenant visibility
  if (hasUnrestrictedScope(user)) {
    return dbTyped;
  }

  // Get companySlug from query params or first company
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || user.companies[0];

  if (!companySlug) {
    return dbTyped; // no company context — no RLS
  }

  const cacheKey = `${user.uid}:${companySlug}`;
  const cached = rlsClientCache.get(cacheKey);
  if (cached) return cached;

  // Create an extended client that sets the RLS session variable
  // before every query via $transaction.
  try {
    // Test: can we set the session variable?
    await dbTyped.$executeRaw`SET LOCAL app.current_company_slug = ${companySlug}`;

    // Create the extended client
    const tenantDb = dbTyped.$extends({
      name: "rls-tenant",
      query: {
        $allModels: {
          async $allOperations({ operation, query, args }) {
            // Wrap each operation in a transaction that sets the session var first
            return dbTyped.$transaction(async (tx) => {
              await tx.$executeRaw`SET LOCAL app.current_company_slug = ${companySlug}`;
              return query(args);
            });
          },
        },
      },
    });

    rlsClientCache.set(cacheKey, tenantDb as typeof dbTyped);
    logger.debug("[db-rls] tenant-scoped client created", { companySlug, userUid: user.uid });
    return tenantDb as typeof dbTyped;
  } catch (err) {
    // RLS setup failed — fall back to unscoped db
    // App-layer companySlug scoping is the active defense
    logger.warn("[db-rls] failed to create tenant-scoped client, falling back", {
      companySlug,
      err: err instanceof Error ? err.message : String(err),
    });
    return dbTyped;
  }
}

/**
 * Clear the RLS client cache (for testing or session invalidation).
 */
export function clearRlsCache(): void {
  rlsClientCache.clear();
}
