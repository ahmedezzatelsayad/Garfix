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
import { dbTyped as db } from "@/lib/db";
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
  if (productId) where.productId = productId;
  // TODO(P2-Sprint5-D): StockMovement has no `warehouseId` column — filter dropped.
  // const warehouseId = sp.get("warehouseId");
  // if (warehouseId) where.warehouseId = warehouseId;
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
    // StockMovement doesn't have a product relation, so we filter post-query
  }

  const limit = Math.min(parseInt(sp.get("limit") || "100"), 500);
  const movements = await db.stockMovement.findMany({
    where, orderBy: { createdAt: "desc" }, take: limit,
  });

  // Fetch product names for the movements
  // ProductCatalog.id is String (cuid), StockMovement.productId is String.
  const productIds = [...new Set(movements.map(m => m.productId))];
  const products = await db.productCatalog.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, code: true },
  });
  const productMap = new Map<string, { id: string; name: string; code: string | null }>(products.map(p => [p.id, { id: p.id, name: p.name, code: p.code }]));

  const mapped = movements.map((m) => {
    const product = m.productId ? productMap.get(m.productId) : null;
    return {
      id: m.id, companySlug: m.companySlug, productId: m.productId,
      productName: product?.name || "— (orphan)", productCode: product?.code || null,
      // TODO(P2-Sprint5-D): StockMovement has no `warehouseId` column — return null.
      warehouseId: null as string | null, warehouseName: "—", warehouseCode: "—",
      qty: num(m.quantity, 3), sourceType: m.sourceType, sourceId: m.sourceId, note: null as string | null, createdBy: null as string | null, createdAt: m.createdAt,
    };
  });

  // Filter by product name if specified
  const filtered = productName && productName.trim()
    ? mapped.filter(m => m.productName.toLowerCase().includes(productName.toLowerCase()))
    : mapped;

  const summary: Record<string, number> = {};
  for (const m of filtered) {
    const key = m.sourceType || "unknown";
    summary[key] = (summary[key] || 0) + m.qty;
  }

  return NextResponse.json({
    movements: filtered,
    summary,
    count: filtered.length,
    mode: isAllTenantsMode ? "all-tenants" : "single-tenant",
  });
});
