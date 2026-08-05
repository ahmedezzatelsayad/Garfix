/**
 * /api/accounting/cost-centers/[id]
 * PATCH / DELETE — single cost center
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

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
  // P5-H2: Rate limit PATCH /api/accounting-cost-centers-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "patch:accounting-cost-centers-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const existing = await db.costCenter.findFirst({
    where: { id, companySlug: data.companySlug },
  });
  if (!existing) return apiError("Cost center not found", 404);

  // Check for duplicate code if changing
  if (data.code && data.code !== existing.code) {
    const duplicate = await db.costCenter.findFirst({
      where: { companySlug: data.companySlug, code: data.code, id: { not: id } },
    });
    if (duplicate) return apiError(`Cost center code "${data.code}" already exists`, 400);
  }

  // Validate parent belongs to same company
  if (data.parentId) {
    const parent = await db.costCenter.findFirst({
      where: { id: String(data.parentId), companySlug: data.companySlug },
    });
    if (!parent) return apiError("Parent cost center not found or belongs to a different company", 400);
    // Prevent self-reference
    if (String(data.parentId) === id) return apiError("Cost center cannot be its own parent", 400);
  }

  const updateData: Record<string, unknown> = {};
  if (data.code) updateData.code = data.code;
  if (data.nameAr) updateData.nameAr = data.nameAr;
  if (data.nameEn) updateData.nameEn = data.nameEn;
  if (data.parentId !== undefined) updateData.parentId = data.parentId;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const costCenter = await db.costCenter.update({
    where: { id },
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
  // P5-H2: Rate limit DELETE /api/accounting-cost-centers-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "delete:accounting-cost-centers-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const existing = await db.costCenter.findFirst({
    where: { id, companySlug },
  });
  if (!existing) return apiError("Cost center not found", 404);

  // Block deletion if any journal entry lines reference this cost center
  const linkedLines = await db.journalEntryLine.count({
    where: { costCenterId: id },
  });
  if (linkedLines > 0) {
    return apiError(
      `Cannot delete cost center — ${linkedLines} journal entry lines linked. Reassign them first.`,
      400,
    );
  }

  // Check if any children exist
  const children = await db.costCenter.count({
    // P2-Sprint6: CostCenter.parentId is now String? (cuid FK).
    where: { parentId: id },
  });
  if (children > 0) {
    return apiError(
      `Cannot delete cost center — ${children} child cost centers exist. Reassign them first.`,
      400,
    );
  }

  await db.costCenter.delete({ where: { id } });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "cost_center",
    entityId: id,
    companySlug,
    details: { code: existing.code, nameAr: existing.nameAr },
  });

  return NextResponse.json({ ok: true });
});
