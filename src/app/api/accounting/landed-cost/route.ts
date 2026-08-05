/**
 * /api/accounting/landed-cost
 * GET — List landed cost allocations (companySlug)
 * POST — Create landed cost allocation
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { calculateLandedCost } from "@/lib/accounting/inventory-costing";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";
import { resolveCompanyId } from "@/lib/company-resolver";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ── GET: List landed cost allocations ───────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const allocations = await db.landedCostAllocation.findMany({
    where: { companySlug },
    include: { purchaseInvoice: true, lines: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({
    allocations: allocations.map((a) => ({
      ...a,
      totalCost: num(a.totalCost, 3),
      lines: a.lines.map((l) => ({
        ...l,
        // Note (P2): LandedCostLine has `amount` (Decimal), not
        // `allocatedAmount`. Legacy `db: any` hid this missing access.
        allocatedCost: num(l.amount, 3),
      })),
    })),
  });
});

// ── POST: Create landed cost allocation ─────────────────────────────────────────

const LandedCostLineSchema = z.object({
  // Note (P2): InventoryItem.id / ProductCatalog.id are String cuids
  // — accept strings. (Legacy `z.number().int()` never matched real cuids.)
  itemId: z.string().optional(),
  productId: z.string().optional(),
  baseQuantity: z.union([z.number(), z.string()]).optional(),
  baseValue: z.union([z.number(), z.string()]).optional(),
  weight: z.union([z.number(), z.string()]).optional(),
  volume: z.union([z.number(), z.string()]).optional(),
});

const CreateLandedCostSchema = z.object({
  companySlug: z.string().min(1),
  purchaseInvoiceId: z.number().int().positive(),
  costType: z.enum(["shipping", "customs", "clearance", "insurance", "other"]),
  totalCost: z.union([z.number(), z.string()]),
  allocationMethod: z.enum(["quantity", "value", "weight", "volume"]).default("quantity"),
  lines: z.array(LandedCostLineSchema).min(1, "At least one line required"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/accounting-landed-cost — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:accounting-landed-cost", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = CreateLandedCostSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Verify purchase invoice exists and belongs to this company
  const purchaseInvoice = await db.purchaseInvoice.findFirst({
    where: { id: String(data.purchaseInvoiceId), companySlug: data.companySlug },
  });
  if (!purchaseInvoice) return apiError("Purchase invoice not found or does not belong to this company", 404);

  // Calculate landed cost allocation
  const totalCostStr = typeof data.totalCost === "number"
    ? num(data.totalCost, 3).toFixed(3)
    : String(data.totalCost);

  const allocationResult = calculateLandedCost({
    // Note (P2): LandedCostAllocationInput.allocationId is `string`
    // — pass "0" placeholder (real ID set after allocation row is created).
    allocationId: "0",
    costType: data.costType,
    totalCost: totalCostStr,
    allocationMethod: data.allocationMethod,
    lines: data.lines.map((l) => ({
      itemId: l.itemId,
      productId: l.productId,
      baseQuantity: l.baseQuantity ? (typeof l.baseQuantity === "number" ? num(l.baseQuantity, 3).toFixed(3) : String(l.baseQuantity)) : undefined,
      baseValue: l.baseValue ? (typeof l.baseValue === "number" ? num(l.baseValue, 3).toFixed(3) : String(l.baseValue)) : undefined,
      weight: l.weight ? (typeof l.weight === "number" ? num(l.weight, 3).toFixed(3) : String(l.weight)) : undefined,
      volume: l.volume ? (typeof l.volume === "number" ? num(l.volume, 3).toFixed(3) : String(l.volume)) : undefined,
    })),
  });

  // Create allocation with lines in a transaction
  // P5-C1: resolve real Company.id (cuid) from slug BEFORE the transaction
  // (does not need to be inside the tx). Was `companyId: "0"` placeholder.
  let companyId: string;
  try {
    companyId = await resolveCompanyId(data.companySlug);
  } catch {
    return apiError("Invalid company", 400);
  }

  const allocation = await db.$transaction(async (tx) => {
    const created = await tx.landedCostAllocation.create({
      data: {
        companySlug: data.companySlug,
        // Note (P2): LandedCostAllocation.purchaseInvoiceId is String?;
        // convert number input. Also `amount`, `currency`, `costType`,
        // `allocationMethod` are required — legacy `db: any` hid this.
        companyId,
        purchaseInvoiceId: String(data.purchaseInvoiceId),
        costType: data.costType,
        amount: totalCostStr,
        currency: "USD",
        totalCost: totalCostStr,
        allocationMethod: data.allocationMethod,
        lines: {
          create: data.lines.map((l, i) => ({
            // Note (P2): LandedCostLine has `costType` (required),
            // `amount` (Decimal), `allocationMethod` (String). No `productId`/
            // `allocatedAmount`/`proportionalWeight` — legacy `db: any` hid this.
            costType: data.costType,
            amount: allocationResult.lines[i].allocatedCost,
            allocationMethod: data.allocationMethod,
          })),
        },
      },
      include: { lines: true },
    });
    return created;
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "landed_cost_allocation",
    entityId: allocation.id,
    companySlug: data.companySlug,
    details: { costType: data.costType, totalCost: totalCostStr, allocationMethod: data.allocationMethod, lineCount: data.lines.length },
  });

  return NextResponse.json({ ok: true, allocation, allocationResult });
});
