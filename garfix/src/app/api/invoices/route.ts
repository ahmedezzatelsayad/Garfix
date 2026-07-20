/**
 * /api/invoices
 * GET  — list invoices (filter by companySlug, status, search)
 * POST — create a new invoice
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { calcInvoiceTotals, num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { logger } from "@/lib/logger";
import { syncInventoryOnSale } from "@/lib/inventorySync";

const LineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.union([z.number(), z.string()]).default(1),
  price: z.union([z.number(), z.string()]).default(0),
  total: z.union([z.number(), z.string()]).optional(),
});

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  invoiceNumber: z.string().min(1, "رقم الفاتورة مطلوب"),
  clientId: z.number().int().optional().nullable(),
  clientName: z.string().min(1, "اسم العميل مطلوب"),
  clientEmail: z.string().email().optional().or(z.literal("")),
  clientPhone: z.string().optional(),
  clientAddress: z.string().optional(),
  issueDate: z.string().min(1, "تاريخ الإصدار مطلوب"),
  dueDate: z.string().min(1, "تاريخ الاستحقاق مطلوب"),
  status: z.string().default("draft"),
  lineItems: z.array(LineItemSchema).default([]),
  taxRate: z.union([z.number(), z.string()]).default(0),
  shipping: z.union([z.number(), z.string()]).default(0),
  discount: z.union([z.number(), z.string()]).default(0),
  notes: z.string().optional(),
  source: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  // Authorization: any authenticated user could previously read all invoices
  // regardless of role. Now enforce view_invoices permission.
  if (!hasPermission(user, "view_invoices")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: view_invoices" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  const status = sp.get("status") || undefined;
  const search = sp.get("search") || undefined;
  const limit = Math.min(parseInt(sp.get("limit") || "100"), 500);
  const cursor = sp.get("cursor") || undefined; // RI-016 FIX: cursor-based pagination (id as int)

  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = { deletedAt: null };
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(user)) where.companySlug = { in: user.companies };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search } },
      { clientName: { contains: search } },
      { clientEmail: { contains: search } },
      { clientPhone: { contains: search } },
    ];
  }

  // RI-016 FIX: Cursor-based pagination instead of offset-only
  // Invoice.id is Int (autoincrement), so cursor must be a number
  const cursorId = cursor ? parseInt(cursor, 10) : undefined;
  const cursorObj = cursorId && !isNaN(cursorId) ? { id: cursorId } : undefined;
  const take = limit + 1; // Fetch one extra to check if there's a next page

  const invoices = await db.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    cursor: cursorObj,
    skip: cursor ? 1 : 0,
  });

  // Check if there's a next page
  const hasNextPage = invoices.length > limit;
  const items = hasNextPage ? invoices.slice(0, limit) : invoices;
  const nextCursor = hasNextPage ? String(items[items.length - 1]?.id) : null;

  return NextResponse.json({
    invoices: items.map((inv) => ({
      ...inv,
      lineItems: parseJsonField(inv.lineItems, []),
      subtotal: num(inv.subtotal, 3),
      taxRate: num(inv.taxRate),
      taxAmount: num(inv.taxAmount, 3),
      total: num(inv.total, 3),
      shipping: num(inv.shipping, 3),
      paid: num(inv.paid, 3),
      discount: num(inv.discount, 3),
    })),
    nextCursor,
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "create_invoice", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // SAAS-001/SAAS-003 FIX: Enforce trial expiry + invoice quota
  const { checkTrialExpiry, checkInvoiceQuota } = await import("@/lib/usageMeter");
  const trialCheck = await checkTrialExpiry(data.companySlug);
  if (!trialCheck.ok) {
    return NextResponse.json({ error: trialCheck.reason, code: "TRIAL_EXPIRED" }, { status: 402 });
  }
  const quotaCheck = await checkInvoiceQuota(data.companySlug);
  if (!quotaCheck.ok) {
    return NextResponse.json({ error: quotaCheck.reason, code: "QUOTA_EXCEEDED" }, { status: 402 });
  }

  // Unique invoice number per company
  const existing = await db.invoice.findUnique({
    where: { companySlug_invoiceNumber: { companySlug: data.companySlug, invoiceNumber: data.invoiceNumber } },
  });
  if (existing) return apiError("رقم الفاتورة مستخدم مسبقاً في هذه الشركة", 409);

  const totals = calcInvoiceTotals(
    data.lineItems.map((it) => ({
      description: it.description,
      qty: num(it.qty),
      price: num(it.price),
      total: it.total !== undefined ? num(it.total) : undefined,
    })),
    num(data.taxRate),
    num(data.shipping),
    num(data.discount),
  );

  const invoice = await db.invoice.create({
    data: {
      companySlug: data.companySlug,
      invoiceNumber: data.invoiceNumber,
      clientId: data.clientId || null,
      clientName: data.clientName,
      clientEmail: data.clientEmail || null,
      clientPhone: data.clientPhone || null,
      clientAddress: data.clientAddress || null,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      status: data.status,
      lineItems: JSON.stringify(data.lineItems),
      subtotal: totals.subtotal,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
      total: totals.total,
      shipping: totals.shipping,
      discount: totals.discount,
      paid: "0",
      notes: data.notes || null,
      source: data.source || null,
      createdByEmail: user.email,
      createdByName: user.uid,
      version: 0,
    },
  });

  // Sync inventory (Task 24: oversell blocking + StockMovement ledger)
  const itemsForSync = data.lineItems.map((it: any) => ({
    description: it.description,
    qty: num(it.qty),
    price: num(it.price, 3),
  }));
  let inventoryWarnings: string[] = [];
  try {
    const syncResult = await db.$transaction(async (tx) => {
      return await syncInventoryOnSale(tx, data.companySlug, itemsForSync, invoice.id);
    });
    inventoryWarnings = syncResult.warnings;
  } catch (syncErr) {
    logger.error("[invoices] inventory sync failed", { err: syncErr instanceof Error ? syncErr.message : String(syncErr) });
  }
  const reviewQueueWarnings = inventoryWarnings.filter((w) => w.startsWith("[REVIEW-QUEUE]") || w.startsWith("[OVERSELL]"));
  // P1 FIX (QA audit): surface ALL inventory warnings to the UI, not just review-queue ones.
  // Without this, warnings like "No active warehouse" were silently swallowed — the UI
  // showed success while inventory wasn't actually updated.
  const warnings = inventoryWarnings.filter((w) => !w.startsWith("[REVIEW-QUEUE]") && !w.startsWith("[OVERSELL]"));

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "invoice",
    entityId: invoice.id,
    companySlug: data.companySlug,
    details: { invoiceNumber: data.invoiceNumber, total: totals.total, reviewQueueWarnings: reviewQueueWarnings.length, warnings: warnings.length },
  });

  return NextResponse.json({ ok: true, invoice, reviewQueueWarnings, warnings });
});
