/**
 * /api/accounting/fixed-assets
 * GET — list fixed assets for company
 * POST — create fixed asset
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().optional(),
  category: z.enum(["vehicle", "equipment", "building", "it", "furniture", "other"]),
  acquisitionDate: z.string().min(1), // YYYY-MM-DD
  acquisitionCost: z.union([z.number(), z.string()]),
  salvageValue: z.union([z.number(), z.string()]).default("0"),
  usefulLifeYears: z.number().int().min(1),
  depreciationMethod: z.enum(["straight_line", "declining_balance"]).default("straight_line"),
  decliningRate: z.union([z.number(), z.string()]).default("0"),
  location: z.string().optional(),
  assetTag: z.string().optional(),
  glAccountId: z.number().int().optional(),
  depreciationAccountId: z.number().int().optional(),
  expenseAccountId: z.number().int().optional(),
});

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

  // Filter by category
  const category = sp.get("category");
  if (category) where.category = category;

  // Filter by active status
  const showInactive = sp.get("showInactive") === "true";
  if (!showInactive) where.isActive = true;

  const assets = await db.fixedAsset.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      glAccount: { select: { id: true, code: true, nameAr: true } },
      depreciationAccount: { select: { id: true, code: true, nameAr: true } },
      expenseAccount: { select: { id: true, code: true, nameAr: true } },
      depreciationEntries: {
        orderBy: { period: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    assets: assets.map((a) => ({
      ...a,
      acquisitionCost: num(a.acquisitionCost, 3).toFixed(3),
      salvageValue: num(a.salvageValue, 3).toFixed(3),
      currentBookValue: num(a.currentBookValue, 3).toFixed(3),
      accumulatedDepreciation: num(a.accumulatedDepreciation, 3).toFixed(3),
      decliningRate: num(a.decliningRate, 3).toFixed(3),
      disposalAmount: a.disposalAmount ? num(a.disposalAmount, 3).toFixed(3) : null,
      depreciationEntries: a.depreciationEntries.map((d) => ({
        ...d,
        depreciationAmount: num(d.depreciationAmount, 3).toFixed(3),
        bookValueAfter: num(d.bookValueAfter, 3).toFixed(3),
      })),
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate GL accounts belong to the company
  if (data.glAccountId) {
    const gl = await db.account.findUnique({ where: { id: data.glAccountId } });
    if (!gl || gl.companySlug !== data.companySlug) return apiError("GL asset account does not belong to this company", 400);
    if (gl.type !== "asset") return apiError("Fixed asset must be linked to an asset-type GL account", 400);
  }

  if (data.depreciationAccountId) {
    const dep = await db.account.findUnique({ where: { id: data.depreciationAccountId } });
    if (!dep || dep.companySlug !== data.companySlug) return apiError("Depreciation account does not belong to this company", 400);
    if (dep.type !== "contra_asset") return apiError("Depreciation account must be a contra-asset type", 400);
  }

  if (data.expenseAccountId) {
    const exp = await db.account.findUnique({ where: { id: data.expenseAccountId } });
    if (!exp || exp.companySlug !== data.companySlug) return apiError("Expense account does not belong to this company", 400);
    if (exp.type !== "expense") return apiError("Depreciation expense must be an expense-type GL account", 400);
  }

  // Validate declining balance rate
  if (data.depreciationMethod === "declining_balance" && num(data.decliningRate, 3) <= 0) {
    return apiError("Declining rate must be positive for declining balance method", 400);
  }

  // Initial book value = acquisition cost, accumulated depreciation = 0
  const acquisitionCostStr = num(data.acquisitionCost, 3).toFixed(3);
  const salvageValueStr = num(data.salvageValue, 3).toFixed(3);
  const decliningRateStr = num(data.decliningRate, 3).toFixed(3);

  const asset = await db.fixedAsset.create({
    data: {
      companySlug: data.companySlug,
      nameAr: data.nameAr,
      nameEn: data.nameEn || null,
      category: data.category,
      acquisitionDate: data.acquisitionDate,
      acquisitionCost: acquisitionCostStr,
      salvageValue: salvageValueStr,
      usefulLifeYears: data.usefulLifeYears,
      depreciationMethod: data.depreciationMethod,
      decliningRate: decliningRateStr,
      currentBookValue: acquisitionCostStr, // initial = cost
      accumulatedDepreciation: "0.000",
      location: data.location || null,
      assetTag: data.assetTag || null,
      glAccountId: data.glAccountId || null,
      depreciationAccountId: data.depreciationAccountId || null,
      expenseAccountId: data.expenseAccountId || null,
    },
    include: {
      glAccount: { select: { id: true, code: true, nameAr: true } },
      depreciationAccount: { select: { id: true, code: true, nameAr: true } },
      expenseAccount: { select: { id: true, code: true, nameAr: true } },
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "fixed_asset",
    entityId: asset.id,
    companySlug: data.companySlug,
    details: {
      nameAr: data.nameAr,
      category: data.category,
      acquisitionCost: acquisitionCostStr,
      usefulLifeYears: data.usefulLifeYears,
      depreciationMethod: data.depreciationMethod,
    },
  });

  return apiOk({
    ...asset,
    acquisitionCost: num(asset.acquisitionCost, 3).toFixed(3),
    salvageValue: num(asset.salvageValue, 3).toFixed(3),
    currentBookValue: num(asset.currentBookValue, 3).toFixed(3),
    accumulatedDepreciation: num(asset.accumulatedDepreciation, 3).toFixed(3),
    decliningRate: num(asset.decliningRate, 3).toFixed(3),
  }, 201);
});
