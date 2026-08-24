/**
 * tenant-middleware.ts — Unified tenant-scoped API handler wrapper.
 *
 * DB-01 FIX (Audit v2 · Phase 1): This is the canonical HOF (Higher-Order
 * Function) that all tenant-scoped API routes SHOULD use. It combines:
 *
 *   1. requireAuth — resolves the user from JWT cookies
 *   2. runWithTenantContext — sets the Postgres session variable
 *      `app.current_company_slug` within a $transaction (transaction-local,
 *      NOT session-scoped — see DB-02 fix in db-rls-extension.ts)
 *   3. withErrorHandler — try/catch + persist rotated tokens
 *
 * Usage:
 *   export const GET = withTenantScope<{ params: Promise<{ id: string } } }>(
 *     async (req, { params }) => {
 *       const { id } = await params;
 *       // db queries here are automatically tenant-scoped via RLS
 *       const invoice = await db.invoice.findUnique({ where: { id } });
 *       return NextResponse.json(invoice);
 *     }
 *   );
 *
 * The HOF determines the companySlug from:
 *   1. URL query param `?companySlug=xxx` (explicit override)
 *   2. The user's first company (default)
 *   3. `__ALL__` for founder/admin (bypasses RLS — sees all tenants)
 *
 * REGRESSION TEST: Set env var RLS_LEAK_TEST=1 to intentionally strip
 * `where: { companySlug }` clauses from 3 sample routes (invoices, clients,
 * journal-entries). The RLS policy should STILL prevent cross-tenant data
 * access — if it doesn't, the test fails. This proves RLS is a real
 * defense layer, not just dead code.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, persistRotatedRefreshToken, hasUnrestrictedScope, type AuthPayload } from "@/lib/auth";
import { dbTyped } from "@/lib/db";
import { runWithTenantContext } from "@/lib/db-rls";
import { logger } from "@/lib/logger";

export interface TenantContext {
  user: AuthPayload;
  companySlug: string;
  isPlatformAdmin: boolean;
}

export type TenantHandler<T extends unknown[]> = (
  req: NextRequest,
  ctx: TenantContext,
  ...args: T
) => Promise<NextResponse>;

/**
 * Wrap an API handler with tenant-scoped RLS enforcement.
 *
 * The handler receives (req, ctx, ...args) where ctx contains the resolved
 * user, companySlug, and isPlatformAdmin flag.
 *
 * All db queries inside the handler are wrapped in a $transaction that
 * sets `app.current_company_slug` via set_config(..., true) — transaction-local.
 */
export function withTenantScope<T extends unknown[]>(
  handler: TenantHandler<T>,
): (req: NextRequest, ...args: T) => Promise<NextResponse> {
  return async (req: NextRequest, ...args: T) => {
    // 1. Resolve auth
    const authResult = await resolveAuth(req);
    if (!authResult.ok || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || "غير مصرّح" },
        { status: authResult.status || 401 },
      );
    }

    const user = authResult.user;
    const isPlatformAdmin = hasUnrestrictedScope(user);

    // 2. Determine companySlug
    const sp = req.nextUrl.searchParams;
    let companySlug: string;

    if (isPlatformAdmin && !sp.get("companySlug")) {
      // Founder without explicit companySlug → see all tenants
      companySlug = "__ALL__";
    } else {
      companySlug = sp.get("companySlug") || user.companies[0] || "";
      // SECURITY FIX (Review F2/C2 / 2026-08-24): a client-supplied
      // ?companySlug must be validated against the user's memberships.
      // Previously the raw query param was fed straight into the RLS
      // session var (app.current_company_slug), letting any user point
      // the tenant scope at another company. Only the platform founder
      // may address a company they are not a member of.
      if (companySlug && !isPlatformAdmin && !user.companies.includes(companySlug)) {
        return NextResponse.json(
          { error: "ليس لديك صلاحية الوصول لهذه الشركة" },
          { status: 403 },
        );
      }
      if (!companySlug) {
        return NextResponse.json(
          { error: "No company context — user has no company membership" },
          { status: 403 },
        );
      }
    }

    // 3. Run the handler inside a tenant-scoped transaction
    try {
      // dbTyped is an extended Prisma client (via $extends for soft-delete + RLS).
      // It satisfies RlsCapableDb structurally — runWithTenantContext only needs
      // $transaction and $queryRaw, both available on extended clients.
      const result = await runWithTenantContext(dbTyped, companySlug, async () => {
        const ctx: TenantContext = { user, companySlug, isPlatformAdmin };
        return handler(req, ctx, ...args);
      });

      // 4. Persist any rotated tokens (SEC-01 fix from Phase 0)
      if (authResult.rotatedRefreshToken) {
        persistRotatedRefreshToken(result, authResult.rotatedRefreshToken);
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[tenant-middleware] handler failed", {
        companySlug,
        err: msg,
        path: req.nextUrl.pathname,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}

/**
 * Helper: extract companySlug from request for routes that don't use
 * withTenantScope but still need to determine the tenant.
 */
export function getCompanySlugFromRequest(
  req: NextRequest,
  user: AuthPayload,
): string {
  const sp = req.nextUrl.searchParams;
  if (hasUnrestrictedScope(user) && !sp.get("companySlug")) {
    return "__ALL__";
  }
  return sp.get("companySlug") || user.companies[0] || "";
}

/**
 * RLS_LEAK_TEST helper: when env var is set, strips `where: { companySlug }`
 * from sample routes to prove RLS is the real defense layer.
 *
 * In production, this is always false. In tests with RLS_LEAK_TEST=1,
 * the test deliberately omits the where clause and asserts the query
 * still returns 0 rows (because RLS blocks cross-tenant access).
 */
export const RLS_LEAK_TEST_MODE = process.env.RLS_LEAK_TEST === "1";
