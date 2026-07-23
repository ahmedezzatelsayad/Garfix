/**
 * /api/accounting/landed-cost/[id]
 * GET — Single landed cost allocation
 * PATCH — Update landed cost allocation
 * DELETE — Delete landed cost allocation
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET: Single allocation ──────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const allocationId = parseInt(id, 10);
  if (!allocationId) return apiError("Invalid allocation ID", 400);

  const allocation = await db.landedCostAllocation.findUnique({
    where: { id: allocationId },
    include: { lines: true, purchaseInvoice: true },
  });
  if (!allocation) return apiError("Landed cost allocation not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", allocation.companySlug);
  if ("error" in access) return access.error;

  return NextResponse.json({
    allocation: {
      ...allocation,
      totalCost: num(allocation.totalCost, 3),
      lines: allocation.lines.map((l) => ({
        ...l,
        allocatedCost: num(l.allocatedCost, 3),
        baseQuantity: num(l.baseQuantity ?? "0", 3),
        baseValue: num(l.baseValue ?? "0", 3),
      })),
    },
  });
});

// ── PATCH: Update allocation ────────────────────────────────────────────────────

const PatchSchema = z.object({
  costType: z.enum(["shipping", "customs", "clearance", "insurance", "other"]).optional(),
  totalCost: z.union([z.number(), z.string()]).optional(),
  allocationMethod: z.enum(["quantity", "value", "weight", "volume"]).optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const allocationId = parseInt(id, 10);
  if (!allocationId) return apiError("Invalid allocation ID", 400);

  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Check existing allocation
  const existing = await db.landedCostAllocation.findUnique({
    where: { id: allocationId },
  });
  if (!existing) return apiError("Landed cost allocation not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const updateData: Record<string, unknown> = {};
  if (data.costType) updateData.costType = data.costType;
  if (data.totalCost) updateData.totalCost = typeof data.totalCost === "number" ? num(data.totalCost, 3).toFixed(3) : String(data.totalCost);
  if (data.allocationMethod) updateData.allocationMethod = data.allocationMethod;

  const allocation = await db.landedCostAllocation.update({
    where: { id: allocationId },
    data: updateData,
    include: { lines: true },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "landed_cost_allocation",
    entityId: allocationId,
    companySlug: existing.companySlug,
    details: { updatedFields: Object.keys(data) },
  });

  return NextResponse.json({ ok: true, allocation });
});

// ── DELETE: Delete allocation ───────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const allocationId = parseInt(id, 10);
  if (!allocationId) return apiError("Invalid allocation ID", 400);

  const existing = await db.landedCostAllocation.findUnique({
    where: { id: allocationId },
  });
  if (!existing) return apiError("Landed cost allocation not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Delete lines first (cascade), then allocation
  await db.landedCostLine.deleteMany({ where: { allocationId } });
  await db.landedCostAllocation.delete({ where: { id: allocationId } });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "landed_cost_allocation",
    entityId: allocationId,
    companySlug: existing.companySlug,
  });

  return NextResponse.json({ ok: true, deleted: allocationId });
});
