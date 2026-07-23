/**
 * /api/accounting/profit-distribution
 * GET  — Profit distribution calculation (?companySlug=X&from=YYYY-MM-DD&to=YYYY-MM-DD)
 * POST — Post profit distribution JE
 */
import { NextRequest } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { calculateProfitDistribution, postProfitDistributionJE } from "@/lib/accounting/partner-capital";
import { num } from "@/lib/money";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ─── GET ─────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to) return apiError("from و to مطلوبان (YYYY-MM-DD)", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const result = await calculateProfitDistribution(companySlug, from, to);
  return apiOk(result);
});

// ─── POST ──────────────────────────────────────────────────────────────

const PostDistributionSchema = z.object({
  companySlug: z.string().min(1),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = PostDistributionSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // First calculate distribution
  const distribution = await calculateProfitDistribution(data.companySlug, data.periodFrom, data.periodTo);

  if (distribution.partners.length === 0) {
    return apiError("No partner capital accounts found for profit distribution", 400);
  }

  if (num(distribution.netProfit, 3) <= 0) {
    return apiError("Net profit is zero or negative — cannot distribute", 400);
  }

  // Then post JE
  const jeResult = await postProfitDistributionJE(
    data.companySlug,
    distribution,
    user.email,
  );

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "post_profit_distribution", entity: "journal_entry", entityId: jeResult.jeId, companySlug: data.companySlug,
    details: { periodFrom: data.periodFrom, periodTo: data.periodTo, netProfit: distribution.netProfit, partnersCount: distribution.partners.length },
  });

  return apiOk({
    ok: true,
    jeId: jeResult.jeId,
    lines: jeResult.lines,
    distribution,
  });
});
