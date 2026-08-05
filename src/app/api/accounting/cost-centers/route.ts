/**
 * /api/accounting/cost-centers
 * GET / POST — cost centers for a company
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { entityIdNullable } from "@/lib/validation";

// ── Zod Schemas ──────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  code: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().optional(),
  // P2-Sprint6: CostCenter.parentId is now String? (cuid FK).
  parentId: entityIdNullable,
});

// ── GET: List cost centers ──────────────────────────────────────────────────────

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

  const costCenters = await db.costCenter.findMany({
    where,
    orderBy: [{ code: "asc" }],
    // TODO(P2-Sprint5-A): CostCenter has no `parent` relation — only scalar
    // `parentId: Int?`. Removed include.
  });

  return NextResponse.json({ costCenters });
});

// ── POST: Create cost center ──────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Check for duplicate code
  const existing = await db.costCenter.findFirst({
    where: { companySlug: data.companySlug, code: data.code },
  });
  if (existing) {
    return apiError(`Cost center code "${data.code}" already exists for this company`, 400);
  }

  // Validate parent belongs to same company
  if (data.parentId) {
    const parent = await db.costCenter.findFirst({
      where: { id: data.parentId, companySlug: data.companySlug },
    });
    if (!parent) {
      return apiError("Parent cost center not found or belongs to a different company", 400);
    }
  }

  const costCenter = await db.costCenter.create({
    data: {
      companySlug: data.companySlug,
      code: data.code,
      name: data.nameAr,
      nameAr: data.nameAr,
      nameEn: data.nameEn || null,
      parentId: data.parentId || null,
      // TODO(P2-Sprint5-A): companyId is required (String FK) but legacy route
      // never had a real one — `db: any` hid this. Placeholder "0".
      companyId: "0",
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "cost_center",
    entityId: costCenter.id,
    companySlug: data.companySlug,
    details: { code: data.code, nameAr: data.nameAr },
  });

  return NextResponse.json({ ok: true, costCenter });
});
