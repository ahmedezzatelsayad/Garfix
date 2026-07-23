/**
 * /api/accounting/quotations/[id]
 * GET    — Single quotation details
 * PATCH  — Update quotation (status, line items, etc.)
 * DELETE — Delete a draft quotation
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
  const quotationId = parseInt(id);

  const quotation = await db.quotation.findUnique({
    where: { id: quotationId },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true, address: true } },
    },
  });
  if (!quotation) return apiError("Quotation not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", quotation.companySlug);
  if ("error" in access) return access.error;

  return apiOk({
    ...quotation,
    subtotal: num(quotation.subtotal, 3),
    taxRate: num(quotation.taxRate, 2),
    taxAmount: num(quotation.taxAmount, 3),
    total: num(quotation.total, 3),
    lineItems: JSON.parse(quotation.lineItems),
  });
});

// ─── PATCH ────────────────────────────────────────────────────────────

const PatchQuotationSchema = z.object({
  companySlug: z.string().min(1),
  status: z.enum(["draft", "sent", "accepted", "rejected"]).optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    qty: z.number().positive(),
    price: z.union([z.number(), z.string()]),
    total: z.union([z.number(), z.string()]).optional(),
  })).optional(),
  taxRate: z.union([z.number(), z.string()]).optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const quotationId = parseInt(id);

  const body = await parseJsonBody(req);
  const parsed = PatchQuotationSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
  if (!quotation) return apiError("Quotation not found", 404);

  const companySlug = data.companySlug || quotation.companySlug;
  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Can only modify draft quotations (except status changes)
  if (quotation.status !== "draft" && data.lineItems) {
    return apiError("Cannot modify line items on a non-draft quotation", 400);
  }

  const updateData: Record<string, unknown> = {};

  if (data.status) updateData.status = data.status;
  if (data.validUntil) updateData.validUntil = data.validUntil;
  if (data.notes) updateData.notes = data.notes;

  // Recalculate totals if line items or tax rate changed
  if (data.lineItems || data.taxRate) {
    const items = data.lineItems ?? JSON.parse(quotation.lineItems);
    const taxRate = data.taxRate ?? quotation.taxRate;

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

  const updated = await db.quotation.update({
    where: { id: quotationId },
    data: updateData,
    include: { client: { select: { id: true, name: true } } },
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "quotation", entityId: quotationId, companySlug,
    details: { quotationNumber: quotation.quotationNumber, changes: Object.keys(updateData) },
  });

  return apiOk({ ok: true, quotation: { ...updated, subtotal: num(updated.subtotal, 3), taxRate: num(updated.taxRate, 2), taxAmount: num(updated.taxAmount, 3), total: num(updated.total, 3) } });
});

// ─── DELETE ────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const quotationId = parseInt(id);

  const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
  if (!quotation) return apiError("Quotation not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", quotation.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  if (quotation.status !== "draft" && quotation.status !== "rejected") {
    return apiError("Only draft or rejected quotations can be deleted", 400);
  }

  await db.quotation.delete({ where: { id: quotationId } });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "quotation", entityId: quotationId, companySlug: quotation.companySlug,
    details: { quotationNumber: quotation.quotationNumber },
  });

  return apiOk({ ok: true });
});
