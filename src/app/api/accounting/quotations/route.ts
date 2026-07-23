/**
 * /api/accounting/quotations
 * GET  — List quotations (?companySlug=X&status=draft)
 * POST — Create quotation
 * PATCH /convert — Convert accepted quotation to invoice
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num, calcInvoiceTotals } from "@/lib/money";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ─── GET ─────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };

  const status = sp.get("status");
  if (status) where.status = status;

  const clientId = sp.get("clientId");
  if (clientId) where.clientId = parseInt(clientId);

  const quotations = await db.quotation.findMany({
    where,
    orderBy: { date: "desc" },
    take: 500,
    include: {
      client: { select: { id: true, name: true, email: true } },
    },
  });

  return apiOk({
    quotations: quotations.map((q) => ({
      ...q,
      subtotal: num(q.subtotal, 3),
      taxRate: num(q.taxRate, 2),
      taxAmount: num(q.taxAmount, 3),
      total: num(q.total, 3),
    })),
  });
});

// ─── POST ──────────────────────────────────────────────────────────────

const LineItemSchema = z.object({
  description: z.string(),
  qty: z.number().positive(),
  price: z.union([z.number(), z.string()]),
  total: z.union([z.number(), z.string()]).optional(),
});

const CreateQuotationSchema = z.object({
  companySlug: z.string().min(1),
  clientId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lineItems: z.array(LineItemSchema).min(1, "At least one line item required"),
  taxRate: z.union([z.number(), z.string()]).default(0),
  notes: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateQuotationSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Verify client exists and belongs to company
  const client = await db.client.findFirst({
    where: { id: data.clientId, companySlug: data.companySlug, deletedAt: null },
  });
  if (!client) return apiError("Client not found or does not belong to this company", 404);

  // Calculate totals
  const totals = calcInvoiceTotals(
    data.lineItems.map((li) => ({
      description: li.description,
      qty: num(li.qty),
      price: num(li.price),
      total: li.total ? num(li.total) : undefined,
    })),
    num(data.taxRate),
    0, // shipping
    0, // discount
  );

  // Generate quotation number: QT-YYYY-NNNN
  const year = data.date.slice(0, 4);
  const lastQuotation = await db.quotation.findFirst({
    where: { companySlug: data.companySlug, quotationNumber: { startsWith: `QT-${year}-` } },
    orderBy: { quotationNumber: "desc" },
  });
  let nextSeq = 1;
  if (lastQuotation) {
    const lastSeq = parseInt(lastQuotation.quotationNumber.split("-")[2] || "0", 10);
    nextSeq = lastSeq + 1;
  }
  const quotationNumber = `QT-${year}-${String(nextSeq).padStart(4, "0")}`;

  const quotation = await db.quotation.create({
    data: {
      companySlug: data.companySlug,
      quotationNumber,
      clientId: data.clientId,
      date: data.date,
      validUntil: data.validUntil || null,
      lineItems: JSON.stringify(data.lineItems.map((li) => ({
        description: li.description,
        qty: num(li.qty),
        price: num(li.price).toFixed(3),
        total: li.total ? num(li.total).toFixed(3) : num(num(li.qty) * num(li.price)).toFixed(3),
      }))),
      subtotal: totals.subtotal,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: data.notes || null,
      status: "draft",
    },
    include: {
      client: { select: { id: true, name: true, email: true } },
    },
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "quotation", entityId: quotation.id, companySlug: data.companySlug,
    details: { quotationNumber, clientId: data.clientId, total: totals.total },
  });

  return apiOk({ ok: true, quotation });
});

// ─── PATCH /convert ──────────────────────────────────────────────────

const ConvertSchema = z.object({
  companySlug: z.string().min(1),
  quotationId: z.number().int(),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");

  // Only handle "convert" action here
  if (action !== "convert") return apiError("Unknown PATCH action. Use ?action=convert", 400);

  const body = await parseJsonBody(req);
  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const quotation = await db.quotation.findUnique({
    where: { id: data.quotationId },
    include: { client: true },
  });
  if (!quotation) return apiError("Quotation not found", 404);
  if (quotation.companySlug !== data.companySlug) return apiError("Quotation does not belong to this company", 400);
  if (quotation.status !== "accepted") return apiError("Only accepted quotations can be converted to invoices", 400);

  // Generate invoice number
  const year = quotation.date.slice(0, 4);
  const lastInvoice = await db.invoice.findFirst({
    where: { companySlug: data.companySlug, invoiceNumber: { startsWith: `INV-${year}-` } },
    orderBy: { invoiceNumber: "desc" },
  });
  let nextSeq = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.invoiceNumber.split("-")[2] || "0", 10);
    nextSeq = lastSeq + 1;
  }
  const invoiceNumber = `INV-${year}-${String(nextSeq).padStart(4, "0")}`;

  // Create invoice from quotation
  const invoice = await db.invoice.create({
    data: {
      companySlug: data.companySlug,
      invoiceNumber,
      clientId: quotation.clientId,
      clientName: quotation.client.name,
      clientEmail: quotation.client.email,
      clientPhone: quotation.client.phone,
      clientAddress: quotation.client.address,
      issueDate: quotation.date,
      dueDate: quotation.validUntil || quotation.date,
      status: "draft",
      lineItems: quotation.lineItems,
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      taxAmount: quotation.taxAmount,
      total: quotation.total,
      notes: quotation.notes,
      createdByEmail: user.email,
    },
  });

  // Update quotation status to "converted"
  await db.quotation.update({
    where: { id: data.quotationId },
    data: { status: "converted", convertedInvoiceId: invoice.id },
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "convert_quotation", entity: "quotation", entityId: data.quotationId, companySlug: data.companySlug,
    details: { quotationNumber: quotation.quotationNumber, invoiceId: invoice.id, invoiceNumber },
  });

  return apiOk({ ok: true, invoiceId: invoice.id, invoiceNumber });
});
