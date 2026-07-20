/**
 * tenantScope.ts — Shared tenant-scoping helper used by every list endpoint.
 *
 * Without this, every route hand-rolled its own WHERE clause — sometimes
 * forgetting to scope by companySlug at all (security hole), sometimes
 * using inconsistent precedence for founder/admin (returns all) vs.
 * regular user (returns only assigned companies).
 *
 * Usage:
 *   import { buildTenantScope } from "@/lib/tenantScope";
 *   const scope = buildTenantScope(user, companySlugFromQuery);
 *   if (scope.forbidden) return NextResponse.json({error:"Forbidden"}, {status:403});
 *   const where = scope.where; // Prisma where clause
 */

import { hasUnrestrictedScope, type AuthPayload } from "./auth";

export interface TenantScope {
  /** Prisma where clause to AND into the existing filter. */
  where: Record<string, unknown>;
  /** True if the user is not allowed to access the requested company. */
  forbidden: boolean;
  /** True if the user is founder/admin and sees all tenants. */
  unrestricted: boolean;
  /** The effective company slug filter (null = no filter). */
  effectiveSlug: string | null;
}

/**
 * Build a tenant-scope WHERE clause.
 *
 * @param user — The authenticated user payload
 * @param companySlug — Optional company slug from the query string
 * @param slugField — The Prisma field name (default: "companySlug")
 */
export function buildTenantScope(
  user: AuthPayload,
  companySlug?: string | null,
  slugField = "companySlug",
): TenantScope {
  const unrestricted = hasUnrestrictedScope(user);

  // Case 1: Specific company requested — must be in user's allowed list
  if (companySlug) {
    if (!unrestricted && !user.companies.includes(companySlug)) {
      return { where: {}, forbidden: true, unrestricted: false, effectiveSlug: null };
    }
    return {
      where: { [slugField]: companySlug },
      forbidden: false,
      unrestricted: false,
      effectiveSlug: companySlug,
    };
  }

  // Case 2: No specific company — unrestricted users see everything
  if (unrestricted) {
    return { where: {}, forbidden: false, unrestricted: true, effectiveSlug: null };
  }

  // Case 3: No specific company — restricted users see only their assigned companies
  if (user.companies.length === 0) {
    // No companies assigned → see nothing (use impossible condition)
    return {
      where: { [slugField]: "__NO_COMPANIES_ASSIGNED__" },
      forbidden: false,
      unrestricted: false,
      effectiveSlug: null,
    };
  }
  return {
    where: { [slugField]: { in: user.companies } },
    forbidden: false,
    unrestricted: false,
    effectiveSlug: null,
  };
}

/**
 * Assert that a user can access a specific company. Returns true/false.
 * Use this for single-resource access (GET /api/invoices/[id]) where
 * the company slug isn't known until after fetching the record.
 */
export function canAccessCompany(user: AuthPayload, companySlug: string): boolean {
  if (hasUnrestrictedScope(user)) return true;
  return user.companies.includes(companySlug);
}
