/**
 * GET /api/platform-admin/review-queue
 *
 * Founder-only endpoint that aggregates ProductMatchAudit entries across ALL
 * tenants — the founder-panel equivalent of the per-tenant
 * /api/product-matching/review endpoint.
 *
 * Returns pending review-queue items (tier="suggested", isUndone=false) plus
 * collision-recovery-failed items (tier="collision-recovery-failed") so the
 * founder can see data-quality issues across the entire platform in one view.
 *
 * Query params:
 *   ?tier=suggested|collision-recovery-failed   — filter by tier (default: both)
 *   ?companySlug=<slug>                          — filter to one tenant (optional)
 *   ?limit=<n>                                   — max items (default 200, max 500)
 *
 * P1.8 fix (Remaining Work Handoff): the prior v13 build only showed a
 * `reviewQueueCount` number in the tenant detail drawer. This endpoint
 * powers the new "Review Queue" tab in PlatformAdminPanel which lists the
 * actual items with accept/reject/override actions.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler, apiError } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;

  const sp = req.nextUrl.searchParams;
  const tierFilter = sp.get("tier"); // "suggested" | "collision-recovery-failed" | null (both)
  const companySlug = sp.get("companySlug");
  const limit = Math.min(parseInt(sp.get("limit") || "200", 10) || 200, 500);

  const where: Record<string, unknown> = { isUndone: false };
  if (tierFilter === "suggested" || tierFilter === "collision-recovery-failed") {
    where.tier = tierFilter;
  } else {
    // Default: both tiers that need founder attention.
    where.OR = [
      { tier: "suggested" },
      { tier: "collision-recovery-failed" },
    ];
  }
  if (companySlug) where.companySlug = companySlug;

  const items = await db.productMatchAudit.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Fetch product names in a separate batch query (ProductMatchAudit has no
  // relation to ProductCatalog in the current Prisma schema — adding one
  // would require a schema migration, which is out of scope for this fix).
  const productIds = Array.from(new Set(
    items.map((i) => i.matchedProductId).filter((id): id is number => id != null),
  ));
  const products = productIds.length > 0
    ? await db.productCatalog.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Group by tenant for the founder panel's "by tenant" view.
  const byTenant = new Map<string, number>();
  for (const item of items) {
    byTenant.set(item.companySlug, (byTenant.get(item.companySlug) || 0) + 1);
  }

  return NextResponse.json({
    items: items.map((i) => {
      const product = i.matchedProductId ? productMap.get(i.matchedProductId) : null;
      return {
        id: i.id,
        companySlug: i.companySlug,
        inputText: i.inputText,
        matchedProductId: i.matchedProductId,
        matchedAlias: i.matchedAlias,
        confidence: i.confidence,
        tier: i.tier,
        action: i.action,
        invoiceId: i.invoiceId,
        productName: product?.name || null,
        productCode: product?.code || null,
        createdAt: i.createdAt,
      };
    }),
    count: items.length,
    byTenant: Array.from(byTenant.entries())
      .map(([slug, count]) => ({ companySlug: slug, count }))
      .sort((a, b) => b.count - a.count),
  });
});
