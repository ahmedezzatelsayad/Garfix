/**
 * /api/invoices/[id]
 * GET    — fetch invoice
 * PATCH  — update (with optimistic-lock version check)
 * DELETE — delete
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermission, requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { calcInvoiceTotals, num, type LineItem } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { applyKuwaitCompliance, formatKuwaitErrorsForResponse } from "@/lib/e-invoicing/kuwait-validation";
import { checkInvoiceRetention } from "@/lib/e-invoicing/retention";
import { isKuwait } from "@/lib/gulfConfig";
import { logger } from "@/lib/logger";

const UpdateSchema = z.object({
  invoiceNumber: z.string().min(1).optional(),
  clientId: z.number().int().optional().nullable(),
  clientName: z.string().min(1).optional(),
  clientEmail: z.string().email().optional().or(z.literal("")).nullable(),
  clientPhone: z.string().optional().nullable(),
  clientAddress: z.string().optional().nullable(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  // SECURITY: `status` is intentionally NOT accepted here. Status changes must
  // go through PATCH /api/invoices/[id]/status (operational statuses only) or
  // PATCH /api/invoices/[id]/payment (for paid/partial — requires
  // finance_access, updates the `paid` amount, and writes a payment audit
  // trail). Previously the general edit endpoint accepted `status` with only
  // `edit_invoice` permission, letting a non-finance employee mark an invoice
  // "paid" without updating `paid` or creating an audit record.
  lineItems: z.array(z.object({
    description: z.string(),
    qty: z.union([z.number(), z.string()]).default(1),
    price: z.union([z.number(), z.string()]).default(0),
    total: z.union([z.number(), z.string()]).optional(),
  })).optional(),
  taxRate: z.union([z.number(), z.string()]).optional(),
  shipping: z.union([z.number(), z.string()]).optional(),
  discount: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional(),
  // Kuwait Decree 10/2026 compliance fields
  sellerNameAr: z.string().optional(),
  sellerAddressAr: z.string().optional(),
  buyerNameAr: z.string().optional(),
  buyerAddressAr: z.string().optional(),
  lineItemsAr: z.string().optional(),
  notesAr: z.string().optional().nullable(),
  invoiceTypeAr: z.string().optional(),
  invoiceTypeEn: z.string().optional(),
  mociNumber: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

function serialize(inv: typeof db.invoice extends { findUnique: infer F } ? never : never) {
  return inv;
}

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const invoice = await db.invoice.findUnique({ where: { id: parseInt(id) } });
  if (!invoice) return apiError("Invoice not found", 404);
  if (!assertCompanyAccess(result.user, invoice.companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    invoice: {
      ...invoice,
      lineItems: parseJsonField(invoice.lineItems, []),
      subtotal: num(invoice.subtotal, 3),
      taxRate: num(invoice.taxRate),
      taxAmount: num(invoice.taxAmount, 3),
      total: num(invoice.total, 3),
      shipping: num(invoice.shipping, 3),
      paid: num(invoice.paid, 3),
      discount: num(invoice.discount, 3),
    },
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.invoice.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Invoice not found", 404);
  const access = await requirePermissionForCompany(req, "edit_invoice", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Optimistic locking
  if (data.expectedVersion !== undefined && data.expectedVersion !== existing.version) {
    return NextResponse.json(
      { error: "Conflict: invoice was modified by another user", code: "VERSION_CONFLICT" },
      { status: 409 },
    );
  }

  // Recalc totals if relevant fields changed
  let updateData: Record<string, unknown> = { ...data, expectedVersion: undefined };
  if (data.lineItems || data.taxRate !== undefined || data.shipping !== undefined || data.discount !== undefined) {
    const items = data.lineItems ?? parseJsonField(existing.lineItems, []);
    const taxRate = data.taxRate !== undefined ? num(data.taxRate) : num(existing.taxRate);
    const shipping = data.shipping !== undefined ? num(data.shipping) : num(existing.shipping);
    const discount = data.discount !== undefined ? num(data.discount) : num(existing.discount);
    const totals = calcInvoiceTotals(items as LineItem[], taxRate, shipping, discount);
    updateData.subtotal = totals.subtotal;
    updateData.taxRate = totals.taxRate;
    updateData.taxAmount = totals.taxAmount;
    updateData.total = totals.total;
    updateData.shipping = totals.shipping;
    updateData.discount = totals.discount;
    updateData.lineItems = JSON.stringify(items);
  }
  updateData.version = existing.version + 1;

  // ── Kuwait Decree 10/2026 compliance for updates ──────────────────────
  let kuwaitWarnings: Array<{ field: string; messageAr: string; messageEn: string }> = [];
  const company = await db.company.findUnique({ where: { slug: existing.companySlug } });
  if (company && isKuwait(company.country)) {
    const kuwaitResult = applyKuwaitCompliance(
      { ...updateData, ...existing },
      company as Record<string, unknown>,
    );
    if (!kuwaitResult.valid) {
      const errorResponse = formatKuwaitErrorsForResponse(kuwaitResult);
      return NextResponse.json(
        { error: errorResponse.error, code: "KUWAIT_COMPLIANCE_ERROR", details: errorResponse.details },
        { status: 400 },
      );
    }
    kuwaitWarnings = kuwaitResult.warnings;
    // Merge Kuwait-enriched fields into update data
    const enriched = kuwaitResult.enrichedData;
    for (const key of [
      "hijriIssueDate", "hijriDueDate", "mociNumber", "invoiceTypeAr", "invoiceTypeEn",
      "sellerNameAr", "sellerAddressAr", "buyerNameAr", "buyerAddressAr",
      "lineItemsAr", "notesAr", "currencyDecimalPlaces", "eInvoiceAuthority",
    ]) {
      if (enriched[key] !== undefined) {
        updateData[key] = enriched[key];
      }
    }
  }

  const invoice = await db.invoice.update({
    where: { id: existing.id },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "invoice",
    entityId: invoice.id,
    companySlug: existing.companySlug,
  });

  return NextResponse.json({ ok: true, invoice, kuwaitWarnings });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.invoice.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Invoice not found", 404);
  if (existing.deletedAt) return apiError("Invoice already deleted", 400);
  const access = await requirePermissionForCompany(req, "delete_invoice", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // ── Kuwait Decree 10/2026: retention enforcement ──────────────────────
  // Check retention period before allowing soft-delete
  const company = await db.company.findUnique({ where: { slug: existing.companySlug } });
  if (company) {
    const retentionCheck = checkInvoiceRetention(
      existing as Record<string, unknown>,
      company as Record<string, unknown>,
    );
    // Soft-delete is always allowed, but we log the retention warning
    if (retentionCheck.reasonAr) {
      logger.info("[invoice-delete] retention notice", {
        invoiceId: existing.id,
        retentionYears: retentionCheck.retentionYears,
        decreeRef: retentionCheck.decreeRef,
        reasonEn: retentionCheck.reasonEn,
      });
    }
  }

  // DB-005 FIX: Soft delete instead of hard delete
  await db.invoice.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), deletedBy: user.email },
  });
  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "invoice",
    entityId: existing.id,
    companySlug: existing.companySlug,
    details: { softDelete: true, retentionNotice: company ? checkInvoiceRetention(existing as Record<string, unknown>, company as Record<string, unknown>).reasonEn : undefined },
  });
  return NextResponse.json({ ok: true });
});
