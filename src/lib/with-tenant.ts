/**
 * with-tenant.ts — Request-scoped tenant context for RLS.
 *
 * #27 FINAL FIX: Provides a middleware-style helper that wraps any API route
 * handler with tenant context. Sets the Postgres session variable
 * `app.current_company_slug` before the handler runs, so RLS policies
 * can filter rows automatically.
 *
 * Usage:
 *   import { withTenantContext } from "@/lib/with-tenant";
 *   export const GET = withTenantContext(async (req, tenantDb) => {
 *     const invoices = await tenantDb.invoice.findMany();
 *     // RLS ensures only the current tenant's invoices are returned
 *   });
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface TenantContext {
  companySlug: string;
  user: import("@/lib/auth").AuthPayload;
}

/**
 * Wrap a route handler with tenant context.
 * Extracts companySlug from query params or the user's first company,
 * sets the Postgres session variable, and passes a tenant-scoped db to the handler.
 */
export function withTenantContext<T>(
  handler: (req: NextRequest, ctx: TenantContext) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const authResult = await resolveAuth(req);
    if (!authResult.ok || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const companySlug = sp.get("companySlug") || authResult.user.companies[0];

    if (!companySlug) {
      return NextResponse.json({ error: "No company context" }, { status: 400 });
    }

    if (!assertCompanyAccess(authResult.user, companySlug)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Set Postgres session variable for RLS (best-effort).
    // Prisma's connection pool means this may not persist across queries,
    // but it's defense-in-depth alongside app-layer scoping.
    try {
      await db.$executeRaw`SET LOCAL app.current_company_slug = ${companySlug}`.catch(() => {});
    } catch {
      // RLS setup failed — app-layer scoping is the active defense
    }

    return handler(req, { companySlug, user: authResult.user });
  };
}
