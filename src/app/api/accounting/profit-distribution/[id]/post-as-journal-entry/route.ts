/**
 * /api/accounting/profit-distribution/[id]/post-as-journal-entry
 * POST — post a profit distribution as a journal entry
 *
 * Note: ProfitDistribution is not a separate model — the [id] here
 * refers to the fiscal period used for the distribution calculation.
 */
import { NextRequest } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { calculateProfitDistribution, postProfitDistributionJE } from "@/lib/accounting/partner-capital";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const PostJESchema = z.object({
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const periodId = parseInt(id);

  const body = await parseJsonBody(req);
  const parsed = PostJESchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Use the fiscal period to determine the date range for profit calculation
  const period = await db.fiscalPeriod.findFirst({
    where: { id: periodId, companySlug: data.companySlug },
  });
  if (!period) return apiError("Fiscal period not found", 404);

  // Calculate profit distribution for this period
  const distribution = await calculateProfitDistribution(data.companySlug, period.startDate, period.endDate);

  if (distribution.partners.length === 0) {
    return apiError("No partner capital accounts found for profit distribution", 400);
  }

  if (num(distribution.netProfit, 3) <= 0) {
    return apiError("Net profit is zero or negative — cannot distribute", 400);
  }

  // Post JE
  const jeResult = await postProfitDistributionJE(
    data.companySlug,
    distribution,
    user.email,
  );

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "post_profit_distribution_as_je",
    entity: "profit_distribution",
    entityId: periodId,
    companySlug: data.companySlug,
    details: {
      periodId,
      periodName: period.name,
      netProfit: distribution.netProfit,
      partnersCount: distribution.partners.length,
      jeId: jeResult.jeId,
    },
  });

  return apiOk({
    ok: true,
    jeId: jeResult.jeId,
    lines: jeResult.lines,
    distribution,
  });
});
