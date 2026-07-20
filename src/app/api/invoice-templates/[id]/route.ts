/**
 * /api/invoice-templates/[id]
 * PATCH — update template
 * DELETE — delete template
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  layoutType: z.enum(["classic", "modern", "minimal", "thermal"]).optional(),
  primaryColor: z.string().optional(),
  fontFamily: z.string().optional(),
  logoPosition: z.enum(["right", "left", "center"]).optional(),
  showTaxNumber: z.boolean().optional(),
  showQrCode: z.boolean().optional(),
  showBankDetails: z.boolean().optional(),
  footerText: z.string().nullable().optional(),
  termsAndConditions: z.string().nullable().optional(),
  paperSize: z.enum(["A4", "Thermal80mm"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.invoiceTemplate.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("القالب غير موجود", 404);

  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await db.invoiceTemplate.updateMany({
      where: { companySlug: existing.companySlug, isDefault: true, id: { not: existing.id } },
      data: { isDefault: false },
    });
  }

  const template = await db.invoiceTemplate.update({ where: { id: existing.id }, data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "update", entity: "invoice_template", entityId: template.id,
    companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true, template });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.invoiceTemplate.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("القالب غير موجود", 404);

  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Don't delete the default template if it's the only one
  if (existing.isDefault) {
    const count = await db.invoiceTemplate.count({ where: { companySlug: existing.companySlug } });
    if (count <= 1) return apiError("لا يمكن حذف القالب الوحيد", 400);
  }

  await db.invoiceTemplate.delete({ where: { id: existing.id } });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "invoice_template", entityId: existing.id,
    companySlug: existing.companySlug,
  });
  return NextResponse.json({ ok: true });
});
