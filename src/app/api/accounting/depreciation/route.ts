/**
 * /api/accounting/depreciation
 * GET — list depreciation entries for company & period
 * POST — run depreciation for a period
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runDepreciationForPeriod } from "@/lib/accounting/fixed-assets";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const RunSchema = z.object({
  companySlug: z.string().min(1),
  period: z.string().min(1), // YYYY-MM
  postImmediately: z.boolean().default(false),
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

  // Filter by period
  const period = sp.get("period");
  if (period) where.period = period;

  // Filter by status
  const status = sp.get("status");
  if (status) where.status = status;

  const entries = await db.depreciationEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      asset: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          category: true,
          acquisitionCost: true,
          currentBookValue: true,
          depreciationMethod: true,
        },
      },
      journalEntry: {
        select: { id: true, reference: true, status: true },
      },
    },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      ...e,
      depreciationAmount: num(e.depreciationAmount, 3).toFixed(3),
      bookValueAfter: num(e.bookValueAfter, 3).toFixed(3),
      asset: {
        ...e.asset,
        acquisitionCost: num(e.asset.acquisitionCost, 3).toFixed(3),
        currentBookValue: num(e.asset.currentBookValue, 3).toFixed(3),
      },
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate period format
  const periodRegex = /^\d{4}-\d{2}$/;
  if (!periodRegex.test(data.period)) {
    return apiError("Period must be in YYYY-MM format", 400);
  }

  try {
    const results = await runDepreciationForPeriod(
      data.companySlug,
      data.period,
      data.postImmediately,
      user.email,
    );

    const totalDepreciation = results.reduce(
      (sum, r) => sum + num(r.depreciationAmount, 3),
      0,
    );

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "run_depreciation",
      entity: "depreciation_entry",
      companySlug: data.companySlug,
      details: {
        period: data.period,
        postImmediately: data.postImmediately,
        assetCount: results.length,
        totalDepreciation: num(totalDepreciation, 3).toFixed(3),
        postedCount: results.filter((r) => r.status === "posted").length,
        draftCount: results.filter((r) => r.status === "draft").length,
      },
    });

    return apiOk({
      period: data.period,
      companySlug: data.companySlug,
      assetCount: results.length,
      totalDepreciation: num(totalDepreciation, 3).toFixed(3),
      postImmediately: data.postImmediately,
      results,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Depreciation run failed";
    return apiError(message, 400);
  }
});
