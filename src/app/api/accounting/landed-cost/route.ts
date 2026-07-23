/**
 * /api/accounting/landed-cost
 * GET — List landed cost allocations (companySlug)
 * POST — Create landed cost allocation
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { calculateLandedCost } from "@/lib/accounting/inventory-costing";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ── GET: List landed cost allocations ───────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const allocations = await db.landedCostAllocation.findMany({
    where: { companySlug },
    include: { lines: true, purchaseInvoice: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({
    allocations: allocations.map((a) => ({
      ...a,
      totalCost: num(a.totalCost, 3),
      lines: a.lines.map((l) => ({
        ...l,
        allocatedCost: num(l.allocatedCost, 3),
        baseQuantity: num(l.baseQuantity ?? "0", 3),
        baseValue: num(l.baseValue ?? "0", 3),
      })),
    })),
  });
});

// ── POST: Create landed cost allocation ─────────────────────────────────────────

const LandedCostLineSchema = z.object({
  itemId: z.number().int().optional(),
  productId: z.number().int().optional(),
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
  const body = await parseJsonBody(req);
  const parsed = CreateLandedCostSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Verify purchase invoice exists and belongs to this company
  const purchaseInvoice = await db.purchaseInvoice.findFirst({
    where: { id: data.purchaseInvoiceId, companySlug: data.companySlug },
  });
  if (!purchaseInvoice) return apiError("Purchase invoice not found or does not belong to this company", 404);

  // Calculate landed cost allocation
  const totalCostStr = typeof data.totalCost === "number"
    ? num(data.totalCost, 3).toFixed(3)
    : String(data.totalCost);

  const allocationResult = calculateLandedCost({
    allocationId: 0, // Will be set after creation
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
  const allocation = await db.$transaction(async (tx) => {
    const created = await tx.landedCostAllocation.create({
      data: {
        companySlug: data.companySlug,
        purchaseInvoiceId: data.purchaseInvoiceId,
        costType: data.costType,
        totalCost: totalCostStr,
        allocationMethod: data.allocationMethod,
        lines: {
          create: data.lines.map((l, i) => ({
            inventoryItemId: l.itemId ?? null,
            productCatalogId: l.productId ?? null,
            allocatedCost: allocationResult.lines[i].allocatedCost,
            baseQuantity: l.baseQuantity
              ? (typeof l.baseQuantity === "number" ? num(l.baseQuantity, 3).toFixed(3) : String(l.baseQuantity))
              : null,
            baseValue: l.baseValue
              ? (typeof l.baseValue === "number" ? num(l.baseValue, 3).toFixed(3) : String(l.baseValue))
              : null,
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
