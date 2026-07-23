/**
 * /api/accounting/purchase-orders/[id]
 * GET   — Single purchase order details
 * PATCH — Update purchase order (status, line items, etc.)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num, calcInvoiceTotals } from "@/lib/money";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const poId = parseInt(id);

  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      supplier: { select: { id: true, name: true, nameEn: true, email: true, phone: true, address: true } },
    },
  });
  if (!purchaseOrder) return apiError("Purchase order not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", purchaseOrder.companySlug);
  if ("error" in access) return access.error;

  return apiOk({
    ...purchaseOrder,
    subtotal: num(purchaseOrder.subtotal, 3),
    taxRate: num(purchaseOrder.taxRate, 2),
    taxAmount: num(purchaseOrder.taxAmount, 3),
    total: num(purchaseOrder.total, 3),
    lineItems: JSON.parse(purchaseOrder.lineItems),
  });
});

// ─── PATCH ────────────────────────────────────────────────────────────

const PatchPOSchema = z.object({
  companySlug: z.string().min(1),
  status: z.enum(["draft", "sent", "received", "partial_received", "completed", "cancelled"]).optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    qty: z.number().positive(),
    price: z.union([z.number(), z.string()]),
    total: z.union([z.number(), z.string()]).optional(),
  })).optional(),
  taxRate: z.union([z.number(), z.string()]).optional(),
  expectedDelivery: z.string().optional(),
  notes: z.string().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const poId = parseInt(id);

  const body = await parseJsonBody(req);
  const parsed = PatchPOSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const purchaseOrder = await db.purchaseOrder.findUnique({ where: { id: poId } });
  if (!purchaseOrder) return apiError("Purchase order not found", 404);

  const companySlug = data.companySlug || purchaseOrder.companySlug;
  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Can only modify draft POs (except status changes)
  if (purchaseOrder.status !== "draft" && data.lineItems) {
    return apiError("Cannot modify line items on a non-draft purchase order", 400);
  }

  const updateData: Record<string, unknown> = {};

  if (data.status) updateData.status = data.status;
  if (data.expectedDelivery) updateData.expectedDelivery = data.expectedDelivery;
  if (data.notes) updateData.notes = data.notes;

  // Recalculate totals if line items or tax rate changed
  if (data.lineItems || data.taxRate) {
    const items = data.lineItems ?? JSON.parse(purchaseOrder.lineItems);
    const taxRate = data.taxRate ?? purchaseOrder.taxRate;

    const totals = calcInvoiceTotals(
      items.map((li: { description: string; qty: number; price: number; total?: number }) => ({
        description: li.description,
        qty: num(li.qty),
        price: num(li.price),
        total: li.total ? num(li.total) : undefined,
      })),
      num(taxRate),
      0,
      0,
    );

    updateData.lineItems = JSON.stringify(items.map((li: { description: string; qty: number; price: number; total?: number }) => ({
      description: li.description,
      qty: num(li.qty),
      price: num(li.price).toFixed(3),
      total: li.total ? num(li.total).toFixed(3) : num(num(li.qty) * num(li.price)).toFixed(3),
    })));
    updateData.subtotal = totals.subtotal;
    updateData.taxRate = totals.taxRate;
    updateData.taxAmount = totals.taxAmount;
    updateData.total = totals.total;
  }

  const updated = await db.purchaseOrder.update({
    where: { id: poId },
    data: updateData,
    include: { supplier: { select: { id: true, name: true } } },
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "purchase_order", entityId: poId, companySlug,
    details: { poNumber: purchaseOrder.poNumber, changes: Object.keys(updateData) },
  });

  return apiOk({
    ok: true,
    purchaseOrder: {
      ...updated,
      subtotal: num(updated.subtotal, 3),
      taxRate: num(updated.taxRate, 2),
      taxAmount: num(updated.taxAmount, 3),
      total: num(updated.total, 3),
    },
  });
});
