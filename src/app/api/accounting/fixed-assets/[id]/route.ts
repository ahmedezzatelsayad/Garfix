/**
 * /api/accounting/fixed-assets/[id]
 * GET — get single fixed asset
 * PATCH — update asset, or dispose asset
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { disposeAsset } from "@/lib/accounting/fixed-assets";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const UpdateSchema = z.object({
  companySlug: z.string().min(1),
  nameAr: z.string().optional(),
  nameEn: z.string().optional(),
  category: z.enum(["vehicle", "equipment", "building", "it", "furniture", "other"]).optional(),
  location: z.string().optional(),
  assetTag: z.string().optional(),
  glAccountId: z.number().int().optional(),
  depreciationAccountId: z.number().int().optional(),
  expenseAccountId: z.number().int().optional(),
});

const DisposeSchema = z.object({
  companySlug: z.string().min(1),
  action: z.literal("dispose"),
  disposalType: z.enum(["sold", "scrapped", "donated"]),
  disposalAmount: z.union([z.number(), z.string()]),
  disposalDate: z.string().min(1), // YYYY-MM-DD
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const asset = await db.fixedAsset.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        glAccount: { select: { id: true, code: true, nameAr: true } },
        depreciationAccount: { select: { id: true, code: true, nameAr: true } },
        expenseAccount: { select: { id: true, code: true, nameAr: true } },
        depreciationEntries: {
          orderBy: { period: "desc" },
          take: 12,
        },
      },
    });

    if (!asset) return apiError("Fixed asset not found", 404);

    return apiOk({
      ...asset,
      acquisitionCost: num(asset.acquisitionCost, 3).toFixed(3),
      salvageValue: num(asset.salvageValue, 3).toFixed(3),
      currentBookValue: num(asset.currentBookValue, 3).toFixed(3),
      accumulatedDepreciation: num(asset.accumulatedDepreciation, 3).toFixed(3),
      decliningRate: num(asset.decliningRate, 3).toFixed(3),
      disposalAmount: asset.disposalAmount ? num(asset.disposalAmount, 3).toFixed(3) : null,
      depreciationEntries: asset.depreciationEntries.map((d) => ({
        ...d,
        depreciationAmount: num(d.depreciationAmount, 3).toFixed(3),
        bookValueAfter: num(d.bookValueAfter, 3).toFixed(3),
      })),
    });
  })();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const assetId = parseInt(id, 10);
    const body = await parseJsonBody(req) as Record<string, unknown> | null;

    // Check if this is a dispose action
    if (body && body.action === "dispose") {
      const parsed = DisposeSchema.safeParse(body);
      if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
      const data = parsed.data;

      const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
      if ("error" in access) return access.error;
      const user = access.user;

      try {
        const result = await disposeAsset(
          data.companySlug,
          assetId,
          data.disposalType,
          String(data.disposalAmount),
          data.disposalDate,
          user.email,
        );

        await logAudit({
          userEmail: user.email,
          userUid: user.uid,
          action: "dispose_asset",
          entity: "fixed_asset",
          entityId: assetId,
          companySlug: data.companySlug,
          details: {
            disposalType: data.disposalType,
            disposalAmount: result.disposalAmount,
            disposalDate: data.disposalDate,
            gainLossAmount: result.gainLossAmount,
            gainLossType: result.gainLossType,
            journalEntryId: result.journalEntryId,
          },
        });

        return apiOk(result, 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Disposal failed";
        return apiError(message, 400);
      }
    }

    // Normal update
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
    const data = parsed.data;

    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    const existing = await db.fixedAsset.findUnique({ where: { id: assetId } });
    if (!existing) return apiError("Fixed asset not found", 404);
    if (existing.companySlug !== data.companySlug) return apiError("Asset does not belong to this company", 403);

    // Validate GL accounts if updating
    if (data.glAccountId) {
      const gl = await db.account.findUnique({ where: { id: data.glAccountId } });
      if (!gl || gl.companySlug !== data.companySlug) return apiError("GL account does not belong to this company", 400);
    }
    if (data.depreciationAccountId) {
      const dep = await db.account.findUnique({ where: { id: data.depreciationAccountId } });
      if (!dep || dep.companySlug !== data.companySlug) return apiError("Depreciation account does not belong to this company", 400);
    }
    if (data.expenseAccountId) {
      const exp = await db.account.findUnique({ where: { id: data.expenseAccountId } });
      if (!exp || exp.companySlug !== data.companySlug) return apiError("Expense account does not belong to this company", 400);
    }

    const updateData: Record<string, unknown> = {};
    if (data.nameAr) updateData.nameAr = data.nameAr;
    if (data.nameEn !== undefined) updateData.nameEn = data.nameEn || null;
    if (data.category) updateData.category = data.category;
    if (data.location !== undefined) updateData.location = data.location || null;
    if (data.assetTag !== undefined) updateData.assetTag = data.assetTag || null;
    if (data.glAccountId !== undefined) updateData.glAccountId = data.glAccountId || null;
    if (data.depreciationAccountId !== undefined) updateData.depreciationAccountId = data.depreciationAccountId || null;
    if (data.expenseAccountId !== undefined) updateData.expenseAccountId = data.expenseAccountId || null;

    const asset = await db.fixedAsset.update({
      where: { id: assetId },
      data: updateData,
      include: {
        glAccount: { select: { id: true, code: true, nameAr: true } },
        depreciationAccount: { select: { id: true, code: true, nameAr: true } },
        expenseAccount: { select: { id: true, code: true, nameAr: true } },
      },
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "update",
      entity: "fixed_asset",
      entityId: assetId,
      companySlug: data.companySlug,
      details: { updatedFields: Object.keys(updateData) },
    });

    return apiOk({
      ...asset,
      acquisitionCost: num(asset.acquisitionCost, 3).toFixed(3),
      salvageValue: num(asset.salvageValue, 3).toFixed(3),
      currentBookValue: num(asset.currentBookValue, 3).toFixed(3),
      accumulatedDepreciation: num(asset.accumulatedDepreciation, 3).toFixed(3),
      decliningRate: num(asset.decliningRate, 3).toFixed(3),
    });
  })();
}
