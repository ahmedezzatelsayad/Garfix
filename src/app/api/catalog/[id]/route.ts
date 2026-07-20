/**
 * /api/catalog/[id]
 * PATCH / DELETE
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, type AuthPayload } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const UpdateSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1).optional(),
  aliases: z.array(z.string()).optional(),
  purchasePrice: z.union([z.number(), z.string()]).optional().nullable(),
  sellingPrice: z.union([z.number(), z.string()]).optional().nullable(),
  wholesalePrice: z.union([z.number(), z.string()]).optional().nullable(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function loadForUser(id: number, user: AuthPayload) {
  const p = await db.productCatalog.findUnique({ where: { id } });
  if (!p) return null;
  if (!assertCompanyAccess(user, p.companySlug)) return null;
  return p;
}

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await loadForUser(parseInt(id), result.user);
  if (!existing) return apiError("Product not found", 404);

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);

  // Permission model:
  //   - Price edits (purchasePrice / sellingPrice / wholesalePrice) require
  //     `manage_wholesale_prices` (a sensitive financial permission the
  //     manager grants explicitly). Falls back to `settings_access` for admins.
  //   - Other product edits (name/code/aliases) require `edit_inventory`
  //     (grantable per-employee) or `settings_access`.
  const touchesPrices =
    parsed.data.purchasePrice !== undefined ||
    parsed.data.sellingPrice !== undefined ||
    parsed.data.wholesalePrice !== undefined;

  // Try the specific permission first; if it fails, fall back to settings_access
  // (admins/founder always pass via settings_access).
  const neededPerm = touchesPrices ? "manage_wholesale_prices" : "edit_inventory";
  let access = await requirePermissionForCompany(req, neededPerm, existing.companySlug);
  if ("error" in access) {
    // Fallback: settings_access (admin/manager gate)
    access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
    if ("error" in access) {
      return NextResponse.json(
        { error: touchesPrices ? "يتطلب هذا الإجراء صلاحية «إدارة أسعار الجملة» أو «الإعدادات»" : "يتطلب هذا الإجراء صلاحية «تعديل المخزون» أو «الإعدادات»" },
        { status: 403 },
      );
    }
  }
  const user = access.user;

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.aliases !== undefined) data.aliases = JSON.stringify(parsed.data.aliases);
  if (parsed.data.purchasePrice !== undefined && parsed.data.purchasePrice !== null)
    data.purchasePrice = num(parsed.data.purchasePrice, 3).toFixed(3);
  if (parsed.data.sellingPrice !== undefined && parsed.data.sellingPrice !== null)
    data.sellingPrice = num(parsed.data.sellingPrice, 3).toFixed(3);
  if (parsed.data.wholesalePrice !== undefined && parsed.data.wholesalePrice !== null)
    data.wholesalePrice = num(parsed.data.wholesalePrice, 3).toFixed(3);
  const product = await db.productCatalog.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: touchesPrices ? "update_price" : "update", entity: "product", entityId: product.id, companySlug: existing.companySlug,
    details: touchesPrices ? { touchedPrices: true } : undefined,
  });
  return NextResponse.json({ ok: true, product });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await loadForUser(parseInt(id), result.user);
  if (!existing) return apiError("Product not found", 404);

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  await db.productCatalog.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "product", entityId: existing.id, companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});
