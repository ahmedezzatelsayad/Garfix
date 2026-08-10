/**
 * /api/suppliers
 * GET  — list suppliers (scoped to companySlug query param)
 *
 * Backs the `useSuppliers` React Query hook in src/hooks/queries/clients.ts.
 * The Supplier Prisma model exists but no HTTP endpoint was wired, so the
 * ArApView's "Accounts Payable" tab kept 404-ing on every load.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { hasPermission } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { parseCursorParams, buildCursorResponse, buildCursorPrismaQuery } from "@/lib/cursor-pagination-server";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  if (!hasPermission(user, "view_customers")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: view_customers" }, { status: 403 });
  }

  const { companySlug, search, cursor, limit } = parseCursorParams(req);

  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = { isActive: true };
  if (companySlug) {
    where.companySlug = companySlug;
  } else if (!hasUnrestrictedScope(user)) {
    where.companySlug = { in: user.companies };
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
      { email: { contains: search } },
      { phone: { contains: search } },
      { taxId: { contains: search } },
    ];
  }

  const pagination = buildCursorPrismaQuery(cursor, limit, "createdAt", "desc");
  // Supplier.id is a String (cuid) — override cursor to use the string id.
  const allSuppliers = await db.supplier.findMany({
    where,
    take: pagination.take,
    skip: pagination.skip,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: pagination.orderBy,
  });

  const { items: suppliers, nextCursor } = buildCursorResponse(allSuppliers, limit);
  return NextResponse.json({ suppliers, nextCursor });
});
