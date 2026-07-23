/**
 * /api/accounting/asset-disposals
 * GET — list asset disposals for company (FixedAssets with disposal records)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, apiOk } from "@/lib/api";
import { z } from "zod";

const GetSchema = z.object({
  companySlug: z.string().min(1),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const parsed = GetSchema.safeParse({
    companySlug: sp.get("companySlug") || "",
  });
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;

  // Asset disposals are tracked via FixedAsset records with disposalDate set
  const disposals = await db.fixedAsset.findMany({
    where: {
      companySlug: data.companySlug,
      disposalDate: { not: null },
    },
    orderBy: { disposalDate: "desc" },
    include: {
      glAccount: { select: { id: true, code: true, nameAr: true } },
      depreciationAccount: { select: { id: true, code: true, nameAr: true } },
      expenseAccount: { select: { id: true, code: true, nameAr: true } },
    },
  });

  return apiOk({
    disposals: disposals.map((d) => ({
      id: d.id,
      nameAr: d.nameAr,
      nameEn: d.nameEn,
      category: d.category,
      acquisitionDate: d.acquisitionDate,
      acquisitionCost: num(d.acquisitionCost, 3),
      disposalDate: d.disposalDate,
      disposalType: d.disposalType,
      disposalAmount: num(d.disposalAmount ?? "0", 3),
      accumulatedDepreciation: num(d.accumulatedDepreciation, 3),
      currentBookValue: num(d.currentBookValue, 3),
      isActive: d.isActive,
    })),
  });
});
