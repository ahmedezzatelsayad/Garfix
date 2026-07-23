/**
 * /api/purchases/[id]
 * PATCH  — update purchase invoice
 * DELETE — delete purchase invoice
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const ItemSchema = z.object({
  description: z.string().default(""),
  qty: z.union([z.number(), z.string()]).default(0),
  price: z.union([z.number(), z.string()]).default(0),
});

const UpdateSchema = z.object({
  num: z.string().min(1).optional(),
  date: z.string().min(1).optional(),
  supplier: z.string().optional(),
  items: z.array(ItemSchema).optional(),
  notes: z.string().optional().nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.purchaseInvoice.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Purchase invoice not found", 404);

  // Enforce permission + company access (editing purchases is an admin/manager function)
  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (data.num !== undefined) updateData.num = data.num;
  if (data.date !== undefined) updateData.date = data.date;
  if (data.supplier !== undefined) updateData.supplier = data.supplier;
  if (data.notes !== undefined) updateData.notes = data.notes || null;

  // If items changed, recalc totalQty and persist as JSON string
  if (data.items !== undefined) {
    updateData.items = JSON.stringify(data.items);
    updateData.totalQty = data.items.reduce((sum, it) => sum + num(it.qty), 0);
  }

  const purchase = await db.purchaseInvoice.update({
    where: { id: existing.id },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "purchase", entityId: purchase.id, companySlug: existing.companySlug,
    details: { fields: Object.keys(updateData) },
  });

  return NextResponse.json({
    ok: true,
    purchase: {
      ...purchase,
      items: parseJsonField(purchase.items, []),
      sourceInvoiceIds: parseJsonField(purchase.sourceInvoiceIds, []),
    },
  });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.purchaseInvoice.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Purchase invoice not found", 404);

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  await db.purchaseInvoice.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "purchase", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});

