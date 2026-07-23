/**
 * /api/accounting/purchase-orders
 * GET  — List purchase orders (?companySlug=X&status=draft)
 * POST — Create purchase order
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

  const supplierId = sp.get("supplierId");
  if (supplierId) where.supplierId = parseInt(supplierId);

  const purchaseOrders = await db.purchaseOrder.findMany({
    where,
    orderBy: { date: "desc" },
    take: 500,
    include: {
      supplier: { select: { id: true, name: true, nameEn: true, email: true, phone: true } },
    },
  });

  return apiOk({
    purchaseOrders: purchaseOrders.map((po) => ({
      ...po,
      subtotal: num(po.subtotal, 3),
      taxRate: num(po.taxRate, 2),
      taxAmount: num(po.taxAmount, 3),
      total: num(po.total, 3),
    })),
  });
});

// ─── POST ──────────────────────────────────────────────────────────────

const POLineItemSchema = z.object({
  description: z.string(),
  qty: z.number().positive(),
  price: z.union([z.number(), z.string()]),
  total: z.union([z.number(), z.string()]).optional(),
});

const CreatePOSchema = z.object({
  companySlug: z.string().min(1),
  supplierId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  expectedDelivery: z.string().optional(),
  lineItems: z.array(POLineItemSchema).min(1, "At least one line item required"),
  taxRate: z.union([z.number(), z.string()]).default(0),
  notes: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreatePOSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Verify supplier exists and belongs to company
  const supplier = await db.supplier.findFirst({
    where: { id: data.supplierId, companySlug: data.companySlug, isActive: true, deletedAt: null },
  });
  if (!supplier) return apiError("Supplier not found or does not belong to this company", 404);

  // Calculate totals
  const totals = calcInvoiceTotals(
    data.lineItems.map((li) => ({
      description: li.description,
      qty: num(li.qty),
      price: num(li.price),
      total: li.total ? num(li.total) : undefined,
    })),
    num(data.taxRate),
    0,
    0,
  );

  // Generate PO number: PO-YYYY-NNNN
  const year = data.date.slice(0, 4);
  const lastPO = await db.purchaseOrder.findFirst({
    where: { companySlug: data.companySlug, poNumber: { startsWith: `PO-${year}-` } },
    orderBy: { poNumber: "desc" },
  });
  let nextSeq = 1;
  if (lastPO) {
    const lastSeq = parseInt(lastPO.poNumber.split("-")[2] || "0", 10);
    nextSeq = lastSeq + 1;
  }
  const poNumber = `PO-${year}-${String(nextSeq).padStart(4, "0")}`;

  const purchaseOrder = await db.purchaseOrder.create({
    data: {
      companySlug: data.companySlug,
      poNumber,
      supplierId: data.supplierId,
      date: data.date,
      expectedDelivery: data.expectedDelivery || null,
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
      supplier: { select: { id: true, name: true, nameEn: true, email: true, phone: true } },
    },
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "purchase_order", entityId: purchaseOrder.id, companySlug: data.companySlug,
    details: { poNumber, supplierId: data.supplierId, total: totals.total },
  });

  return apiOk({ ok: true, purchaseOrder });
});
