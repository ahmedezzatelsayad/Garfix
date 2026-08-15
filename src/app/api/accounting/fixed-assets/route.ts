/**
 * /api/accounting/fixed-assets
 * GET — list fixed assets for company
 * POST — create fixed asset
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { entityIdOptional } from "@/lib/validation";
import { resolveCompanyId } from "@/lib/company-resolver";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

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
  glAccountId: entityIdOptional,
  // P2-Sprint6: FixedAsset.depreciationAccountId/expenseAccountId are now String? (cuid FKs).
  depreciationAccountId: entityIdOptional,
  expenseAccountId: entityIdOptional,
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
    take: 200,
    include: {
      glAccount: true,
      depreciationAccount: true,
      expenseAccount: true,
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
  // P5-H2: Rate limit POST /api/accounting-fixed-assets — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:accounting-fixed-assets", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate GL accounts belong to the company
  if (data.glAccountId) {
    const gl = await db.account.findFirst({ where: { id: data.glAccountId, companySlug: data.companySlug } });
    if (!gl) return apiError("GL asset account does not belong to this company", 400);
    if (gl.type !== "asset") return apiError("Fixed asset must be linked to an asset-type GL account", 400);
  }

  if (data.depreciationAccountId) {
    // Note (P2): Account.id is String cuid — convert number input.
    const dep = await db.account.findFirst({ where: { id: String(data.depreciationAccountId), companySlug: data.companySlug } });
    if (!dep) return apiError("Depreciation account does not belong to this company", 400);
    if (dep.type !== "contra_asset") return apiError("Depreciation account must be a contra-asset type", 400);
  }

  if (data.expenseAccountId) {
    // Note (P2): Account.id is String cuid — convert number input.
    const exp = await db.account.findFirst({ where: { id: String(data.expenseAccountId), companySlug: data.companySlug } });
    if (!exp) return apiError("Expense account does not belong to this company", 400);
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

  // P5-C1: resolve real Company.id (cuid) from slug — was `companyId: "0"` placeholder.
  let companyId: string;
  try {
    companyId = await resolveCompanyId(data.companySlug);
  } catch {
    return apiError("Invalid company", 400);
  }

  const asset = await db.fixedAsset.create({
    data: {
      companySlug: data.companySlug,
      // Note (P2): `name`, `code`, `purchaseDate`, `purchasePrice`,
      // `currentValue`, `isActive` are required fields without
      // defaults. Legacy `db: any` hid these. Use nameAr for name, generate
      // code from name, derive purchaseDate/price/currentValue from P2 fields.
      name: data.nameAr,
      code: data.assetTag || data.nameAr,
      companyId,
      purchaseDate: new Date(data.acquisitionDate),
      purchasePrice: acquisitionCostStr,
      currentValue: acquisitionCostStr,
      isActive: true,
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
      // P2-Sprint6: FixedAsset.glAccountId/depreciationAccountId/expenseAccountId
      // are now String? (cuid FKs). entityIdOptional already transforms to string.
      glAccountId: data.glAccountId ?? null,
      depreciationAccountId: data.depreciationAccountId ?? null,
      expenseAccountId: data.expenseAccountId ?? null,
    },
    include: {
      glAccount: true,
      depreciationAccount: true,
      expenseAccount: true,
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
