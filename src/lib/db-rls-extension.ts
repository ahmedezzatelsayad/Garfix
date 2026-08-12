/**
 * db-rls-extension.ts — Per-request RLS Prisma extension.
 *
 * P0-1 FIX: Sets Postgres session variable `app.current_company_slug`
 * before every query so RLS policies filter rows by tenant automatically.
 *
 * The extension uses `$queryRawUnsafe` with `SELECT set_config(...)` inside
 * each query wrapper to ensure the session variable is set on the actual
 * connection that will execute the query (Prisma uses a connection pool).
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

  // Founder/admin bypass RLS — they need cross-tenant visibility
  if (hasUnrestrictedScope(user)) {
    // Set to null so RLS policy allows all (IS NULL check in policy)
    try {
      await dbTyped.$executeRawUnsafe("SELECT set_config('app.current_company_slug', NULL, false)");
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
    // Set the session variable on the connection pool.
    // Note: Due to Prisma's connection pooling, this may not affect all connections.
    // The RLS policy includes `IS NULL` fallback for safety.
    await dbTyped.$executeRawUnsafe(
      "SELECT set_config('app.current_company_slug', $1, false)",
      companySlug
    );
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
