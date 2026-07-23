/**
 * /api/accounting/quotations/[id]/convert-to-invoice
 * POST — convert a quotation to an invoice
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const ConvertSchema = z.object({
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const quotationId = parseInt(id);

  const body = await parseJsonBody(req);
  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const quotation = await db.quotation.findUnique({
    where: { id: quotationId },
  });
  if (!quotation) return apiError("Quotation not found", 404);
  if (quotation.companySlug !== data.companySlug) return apiError("Quotation does not belong to this company", 403);

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Only accepted quotations can be converted
  if (quotation.status !== "accepted") {
    return apiError("Only accepted quotations can be converted to invoices", 400);
  }

  // Check if already converted
  if (quotation.convertedInvoiceId) {
    return apiError("This quotation has already been converted to an invoice", 400);
  }

  // Generate invoice number
  const lastInvoice = await db.invoice.findFirst({
    where: { companySlug: data.companySlug },
    orderBy: { id: "desc" },
    select: { invoiceNumber: true },
  });

  const invoiceNumber = lastInvoice
    ? `INV-${parseInt(lastInvoice.invoiceNumber.replace("INV-", ""), 10) + 1}`
    : "INV-1";

  // Get client name for invoice
  const client = quotation.clientId
    ? await db.client.findUnique({ where: { id: quotation.clientId } })
    : null;

  // Create invoice from quotation data
  const invoice = await db.invoice.create({
    data: {
      companySlug: data.companySlug,
      clientId: quotation.clientId,
      clientName: client?.name || "",
      clientEmail: client?.email,
      clientPhone: client?.phone,
      clientAddress: client?.address,
      invoiceNumber,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      lineItems: quotation.lineItems,
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      taxAmount: quotation.taxAmount,
      total: quotation.total,
      notes: quotation.notes,
      status: "draft",
      createdByEmail: user.email,
      createdByName: user.email,
    },
  });

  // Mark quotation as converted
  await db.quotation.update({
    where: { id: quotationId },
    data: {
      status: "converted",
      convertedInvoiceId: invoice.id,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "convert_to_invoice",
    entity: "quotation",
    entityId: quotationId,
    companySlug: data.companySlug,
    details: {
      quotationNumber: quotation.quotationNumber,
      invoiceId: invoice.id,
      invoiceNumber,
    },
  });

  return apiOk({
    ok: true,
    invoice: {
      ...invoice,
      subtotal: num(invoice.subtotal, 3),
      taxRate: num(invoice.taxRate, 2),
      taxAmount: num(invoice.taxAmount, 3),
      total: num(invoice.total, 3),
    },
  });
});
