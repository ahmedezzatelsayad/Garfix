/**
 * /api/accounting/inventory-valuation
 * GET — Inventory valuation report (companySlug + asOfDate)
 * POST — Calculate COGS for a sale (companySlug, itemId, quantitySold)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { withErrorHandler, apiError, parseJsonBody } from "@/lib/api";
import { runInventoryValuation, calculateCOGS, type CostingMethod } from "@/lib/accounting/inventory-costing";
import { num } from "@/lib/money";
import { z } from "zod";

// ── GET: Inventory valuation report ────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);
  const asOfDate = sp.get("asOfDate") || new Date().toISOString().slice(0, 10);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const valuation = await runInventoryValuation(companySlug, asOfDate);
  return NextResponse.json({ valuation });
});

// ── POST: Calculate COGS for a sale ────────────────────────────────────────────

const CalculateCOGSSchema = z.object({
  companySlug: z.string().min(1),
  itemId: z.number().int().positive(),
  quantitySold: z.union([z.number(), z.string()]),
  costingMethod: z.enum(["fifo", "weighted_average", "standard_cost"]).default("weighted_average"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CalculateCOGSSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;

  const quantitySoldStr = typeof data.quantitySold === "number"
    ? num(data.quantitySold, 3).toFixed(3)
    : String(data.quantitySold);

  const result = await calculateCOGS(
    data.companySlug,
    data.itemId,
    quantitySoldStr,
    data.costingMethod as CostingMethod,
  );

  return NextResponse.json({ ok: true, cogs: result });
});
