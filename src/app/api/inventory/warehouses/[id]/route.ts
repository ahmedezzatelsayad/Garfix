/**
 * /api/inventory/warehouses/[id]
 * PATCH — update a warehouse
 * DELETE — delete a warehouse (must not have inventory items)
 *
 * Both require `settings_access` permission.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.warehouse.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("المستودع غير موجود", 404);

  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // If updating code, enforce uniqueness within the company
  if (data.code && data.code !== existing.code) {
    const conflict = await db.warehouse.findFirst({
      where: { companySlug: existing.companySlug, code: data.code, NOT: { id: existing.id } },
    });
    if (conflict) return apiError("كود المستودع مستخدم بالفعل", 409);
  }

  const updated = await db.warehouse.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "warehouse",
    entityId: existing.id,
    companySlug: existing.companySlug,
  });

  return NextResponse.json({ ok: true, warehouse: updated });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.warehouse.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("المستودع غير موجود", 404);

  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const itemCount = await db.inventoryItem.count({ where: { warehouseId: existing.id } });
  if (itemCount > 0) {
    return apiError(`لا يمكن حذف المستودع — يحتوي على ${itemCount} صنف مخزون. احذف الأصناف أولاً.`, 400);
  }

  await db.warehouse.delete({ where: { id: existing.id } });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "warehouse",
    entityId: existing.id,
    companySlug: existing.companySlug,
    details: { code: existing.code, name: existing.name },
  });

  return NextResponse.json({ ok: true });
});
