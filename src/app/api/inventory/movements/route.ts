/**
 * GET /api/inventory/movements
 * Returns the StockMovement ledger for a company.
 *
 * GATE 4 Task 6: extended with founder cross-tenant + date-range + product-name
 * filters so the founder panel can render a unified ledger across all tenants.
 *
 * Query params:
 *   companySlug   — required (tenant scope). Use "__all__" for founder
 *                   cross-tenant mode (requires founder session).
 *   productId     — filter to a specific product id (optional)
 *   warehouseId   — filter to a specific warehouse id (optional)
 *   sourceType    — filter to a movement source type (optional)
 *   productName   — case-insensitive contains filter on product.name (optional)
 *   from          — ISO date string; movements with createdAt >= from (optional)
 *   to            — ISO date string; movements with createdAt <= to (optional)
 *   limit         — max results (default 100, max 500)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, requireFounder } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { num } from "@/lib/money";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  // Founder cross-tenant mode: when slug === "__all__", require a founder
  // session instead of a per-tenant permission check. Non-founders get 403.
  const isAllTenantsMode = companySlug === "__all__";
  if (isAllTenantsMode) {
    const founderAccess = await requireFounder(req);
    if (founderAccess instanceof NextResponse) return founderAccess;
  } else {
    const access = await requirePermissionForCompany(req, "settings_access", companySlug);
    if ("error" in access) return access.error;
  }

  // Build the where clause. In all-tenants mode, no companySlug filter is
  // applied (movements from every tenant are returned).
  const where: Record<string, unknown> = {};
  if (!isAllTenantsMode) where.companySlug = companySlug;

  const productId = sp.get("productId");
  if (productId) where.productId = parseInt(productId);
  const warehouseId = sp.get("warehouseId");
  if (warehouseId) where.warehouseId = parseInt(warehouseId);
  const sourceType = sp.get("sourceType");
  if (sourceType) where.sourceType = sourceType;

  // Date range filters (ISO strings — e.g. "2025-01-01T00:00:00.000Z").
  const from = sp.get("from");
  const to = sp.get("to");
  const createdAtFilter: Record<string, Date> = {};
  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) createdAtFilter.gte = fromDate;
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) createdAtFilter.lte = toDate;
  }
  if (Object.keys(createdAtFilter).length > 0) {
    where.createdAt = createdAtFilter;
  }

  // Product name (case-insensitive contains). Prisma's `contains` is
  // case-insensitive by default on SQLite for ASCII; for full Unicode
  // case-insensitivity the mode parameter would require Postgres. We accept
  // the SQLite default — founder can search by exact substring.
  const productName = sp.get("productName");
  if (productName && productName.trim()) {
    where.product = { name: { contains: productName.trim() } };
  }

  const limit = Math.min(parseInt(sp.get("limit") || "100"), 500);
  const movements = await db.stockMovement.findMany({
    where, orderBy: { createdAt: "desc" }, take: limit,
    include: { product: { select: { id: true, name: true, code: true } }, warehouse: { select: { id: true, name: true, code: true } } },
  });

  const mapped = movements.map((m) => ({
    id: m.id, companySlug: m.companySlug, productId: m.productId,
    productName: m.product?.name || "— (orphan)", productCode: m.product?.code || null,
    warehouseId: m.warehouseId, warehouseName: m.warehouse?.name || "—", warehouseCode: m.warehouse?.code || "—",
    qty: num(m.qty, 3), sourceType: m.sourceType, sourceId: m.sourceId, note: m.note, createdBy: m.createdBy, createdAt: m.createdAt,
  }));

  const summary: Record<string, number> = {};
  for (const m of mapped) summary[m.sourceType] = (summary[m.sourceType] || 0) + m.qty;

  return NextResponse.json({
    movements: mapped,
    summary,
    count: mapped.length,
    mode: isAllTenantsMode ? "all-tenants" : "single-tenant",
  });
});
