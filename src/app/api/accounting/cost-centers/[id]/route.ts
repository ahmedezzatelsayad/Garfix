/**
 * /api/accounting/cost-centers/[id]
 * PATCH / DELETE — single cost center
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  companySlug: z.string().min(1),
  code: z.string().optional(),
  nameAr: z.string().optional(),
  nameEn: z.string().optional(),
  parentId: z.number().int().optional().nullable(),
  isActive: z.boolean().optional(),
});

// ── PATCH: Update cost center ────────────────────────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const existing = await db.costCenter.findFirst({
    where: { id: parseInt(id), companySlug: data.companySlug },
  });
  if (!existing) return apiError("Cost center not found", 404);

  // Check for duplicate code if changing
  if (data.code && data.code !== existing.code) {
    const duplicate = await db.costCenter.findFirst({
      where: { companySlug: data.companySlug, code: data.code, id: { not: parseInt(id) } },
    });
    if (duplicate) return apiError(`Cost center code "${data.code}" already exists`, 400);
  }

  // Validate parent belongs to same company
  if (data.parentId) {
    const parent = await db.costCenter.findFirst({
      where: { id: data.parentId, companySlug: data.companySlug },
    });
    if (!parent) return apiError("Parent cost center not found or belongs to a different company", 400);
    // Prevent self-reference
    if (data.parentId === parseInt(id)) return apiError("Cost center cannot be its own parent", 400);
  }

  const updateData: Record<string, unknown> = {};
  if (data.code) updateData.code = data.code;
  if (data.nameAr) updateData.nameAr = data.nameAr;
  if (data.nameEn) updateData.nameEn = data.nameEn;
  if (data.parentId !== undefined) updateData.parentId = data.parentId;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const costCenter = await db.costCenter.update({
    where: { id: parseInt(id) },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "cost_center",
    entityId: costCenter.id,
    companySlug: data.companySlug,
    details: updateData,
  });

  return NextResponse.json({ ok: true, costCenter });
});

// ── DELETE: Delete cost center ────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const existing = await db.costCenter.findFirst({
    where: { id: parseInt(id), companySlug },
  });
  if (!existing) return apiError("Cost center not found", 404);

  // Check if any journal lines reference this cost center
  const linkedLines = await db.journalEntryLine.count({
    where: { costCenterId: parseInt(id) },
  });
  if (linkedLines > 0) {
    return apiError(
      `Cannot delete cost center — ${linkedLines} journal entry lines reference it. Deactivate it instead.`,
      400,
    );
  }

  // Check if any children exist
  const children = await db.costCenter.count({
    where: { parentId: parseInt(id) },
  });
  if (children > 0) {
    return apiError(
      `Cannot delete cost center — ${children} child cost centers exist. Reassign them first.`,
      400,
    );
  }

  await db.costCenter.delete({ where: { id: parseInt(id) } });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "cost_center",
    entityId: parseInt(id),
    companySlug,
    details: { code: existing.code, nameAr: existing.nameAr },
  });

  return NextResponse.json({ ok: true });
});
