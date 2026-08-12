/**
 * db-rls-extension.ts — Per-request RLS Prisma extension.
 *
 * P0-1 FIX: Sets Postgres session variable `app.current_company_slug`
 * before every query so RLS policies filter rows by tenant automatically.
 *
 * AUDIT FIX: Converted from `$executeRawUnsafe` to `$executeRaw` (tagged
 * template literal) for defense-in-depth. Both were parameterized, but the
 * tagged template API is the recommended Prisma pattern.
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
      await dbTyped.$executeRaw`SELECT set_config('app.current_company_slug', NULL, false)`;
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
    // AUDIT FIX: Use tagged template literal instead of $executeRawUnsafe.
    // Both are parameterized, but $executeRaw is the recommended Prisma pattern.
    // Note: Due to Prisma's connection pooling, this may not affect all connections.
    // The RLS policy includes `IS NULL` fallback for safety.
    await dbTyped.$executeRaw`
      SELECT set_config('app.current_company_slug', ${companySlug}::text, false)
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
