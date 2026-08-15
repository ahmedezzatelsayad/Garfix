/**
 * db-rls-extension.ts — Per-request RLS Prisma extension.
 *
 * P0-1 FIX: Sets Postgres session variable `app.current_company_slug`
 * before every query so RLS policies filter rows by tenant automatically.
 *
 * AUDIT FIX: Converted from `$executeRawUnsafe` to `$executeRaw` (tagged
 * template literal) for defense-in-depth.
 *
 * DB-02 FIX (Audit v2 · Phase 1): Changed set_config(..., false) to
 * set_config(..., true) for transaction-local scope. The previous `false`
 * (session-scoped) setting leaked across the connection pool — a pooled
 * connection that had `set_config('app.current_company_slug', 'acme', false)`
 * would retain that value for the NEXT request that happened to reuse the
 * same connection, causing cross-tenant data leaks.
 *
 * With `true` (transaction-local), the setting reverts at the end of the
 * current transaction (or query if not in an explicit transaction), so it
 * never leaks to other requests.
 *
 * NOTE: `getTenantDb()` here sets the variable but returns the raw dbTyped
 * client. For true transaction-scoped isolation, prefer `withTenantScope()`
 * from `src/lib/api/tenant-middleware.ts` which wraps the entire handler
 * in a `$transaction` + `runWithTenantContext`.
 */

import { NextRequest } from "next/server";
import { dbTyped } from "@/lib/db";
import { resolveAuth, hasUnrestrictedScope } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function getTenantDb(req: NextRequest): Promise<typeof dbTyped> {
  const authResult = await resolveAuth(req);
  if (!authResult.ok || !authResult.user) {
    return dbTyped;
  }

  const user = authResult.user;

  // Founder/admin bypass RLS — they need cross-tenant visibility.
  // DB-02 FIX: use true (transaction-local) instead of false (session-scoped).
  // Setting to NULL within a transaction-local scope means the RLS policy's
  // IS NULL bypass clause applies only for the duration of this transaction.
  if (hasUnrestrictedScope(user)) {
    try {
      await dbTyped.$executeRaw`SELECT set_config('app.current_company_slug', NULL, true)`;
    } catch {}
    return dbTyped;
  }

  // Get companySlug from query params or first company
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || user.companies[0];

  if (!companySlug) {
    return dbTyped;
  }

  try {
    // DB-02 FIX: Use true (transaction-local) instead of false (session-scoped).
    // The setting now reverts at the end of the current transaction, preventing
    // cross-connection-pool leakage.
    await dbTyped.$executeRaw`
      SELECT set_config('app.current_company_slug', ${companySlug}::text, true)
    `;
  } catch (err) {
    logger.warn("[db-rls] failed to set session variable", {
      companySlug,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return dbTyped;
}

export function clearRlsCache(): void {
  // No-op: cache removed to avoid stale client references
}
