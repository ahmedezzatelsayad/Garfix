/**
 * /api/purchases
 * GET  — list purchase invoices
 * POST — create purchase invoice
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { logger } from "@/lib/logger";
import { syncInventoryOnPurchase } from "@/lib/inventorySync";

const ItemSchema = z.object({
  description: z.string().default(""),
  qty: z.union([z.number(), z.string()]).default(0),
  price: z.union([z.number(), z.string()]).default(0),
});

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  num: z.string().min(1, "رقم فاتورة الشراء مطلوب"),
  date: z.string().min(1),
  supplier: z.string().default(""),
  items: z.array(ItemSchema).default([]),
  sourceInvoiceIds: z.array(z.number()).default([]),
  notes: z.string().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(user)) where.companySlug = { in: user.companies };
  const purchases = await db.purchaseInvoice.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({
    purchases: purchases.map((p) => ({
      ...p,
      items: parseJsonField(p.items, []),
      sourceInvoiceIds: parseJsonField(p.sourceInvoiceIds, []),
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Enforce permission + company access (purchasing is an admin/manager function)
  const access = await requirePermissionForCompany(req, "settings_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const totalQty = data.items.reduce((sum, it) => sum + num(it.qty), 0);
  const purchase = await db.purchaseInvoice.create({
    data: {
      companySlug: data.companySlug,
      num: data.num,
      date: data.date,
      supplier: data.supplier,
      items: JSON.stringify(data.items),
      sourceInvoiceIds: JSON.stringify(data.sourceInvoiceIds),
      totalQty,
      notes: data.notes || null,
    },
  });

  // P1 FIX: sync inventory on purchase (was missing — purchase invoices didn't update stock).
  // Mirrors the sale-side pattern in /api/invoices/route.ts.
  const itemsForSync = data.items.map((it: any) => ({
    description: it.description,
    qty: num(it.qty),
    price: num(it.price, 3),
  }));
  let inventoryWarnings: string[] = [];
  try {
    const syncResult = await db.$transaction(async (tx) => {
      return await syncInventoryOnPurchase(tx, data.companySlug, itemsForSync, purchase.id);
    });
    inventoryWarnings = syncResult.warnings;
  } catch (syncErr) {
    logger.error("[purchases] inventory sync failed", { err: syncErr instanceof Error ? syncErr.message : String(syncErr) });
  }
  const reviewQueueWarnings = inventoryWarnings.filter((w) => w.startsWith("[REVIEW-QUEUE]") || w.startsWith("[OVERSELL]"));
  // P1 FIX (QA audit): surface ALL inventory warnings to the UI, not just review-queue ones.
  const warnings = inventoryWarnings.filter((w) => !w.startsWith("[REVIEW-QUEUE]") && !w.startsWith("[OVERSELL]"));

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "purchase", entityId: purchase.id, companySlug: data.companySlug,
    details: { num: data.num, totalQty, reviewQueueWarnings: reviewQueueWarnings.length, warnings: warnings.length },
  });
  return NextResponse.json({ ok: true, purchase, reviewQueueWarnings, warnings });
});
