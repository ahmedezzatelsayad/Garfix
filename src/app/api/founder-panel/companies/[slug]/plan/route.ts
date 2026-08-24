/**
 * /api/founder-panel/companies/[slug]/plan — أداة المؤسس للترقية/تخفيض خطة شركة.
 *
 * PATCH { plan: "trial"|"starter"|"ai_agent", subscriptionStatus?: string, extendDays?: number }
 * المؤسس فقط. تُسجل في سجل التدقيق.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { withErrorHandler, apiError, parseJsonBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";

const PlanSchema = z.object({
  plan: z.enum(["trial", "starter", "ai_agent"]),
  subscriptionStatus: z.enum(["active", "trialing", "suspended", "cancelled"]).optional(),
  extendDays: z.number().int().min(1).max(30).optional(),
});

type RouteParams = { params: Promise<{ slug: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const rl = await rateLimitResponse(req, "founder-plan-change", LIMITS.API_WRITE);
  if (rl) return rl;

  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isFounderEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden — مؤسس المنصة فقط" }, { status: 403 });
  }

  const { slug } = await params;
  const parsed = PlanSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  const { plan, subscriptionStatus, extendDays } = parsed.data;

  const company = await db.company.findUnique({ where: { slug }, select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionStatus: true } });
  if (!company) return apiError("الشركة غير موجودة", 404);

  const data: Record<string, unknown> = { plan };
  if (subscriptionStatus) data.subscriptionStatus = subscriptionStatus;
  if (plan === "trial") {
    const base = company.trialEndsAt && company.trialEndsAt > new Date() ? company.trialEndsAt : new Date();
    data.trialEndsAt = new Date(base.getTime() + (extendDays || 7) * 24 * 60 * 60 * 1000);
    data.subscriptionStatus = subscriptionStatus || "trialing";
  } else {
    data.subscriptionStatus = subscriptionStatus || "active";
  }

  await db.company.update({ where: { slug }, data });

  await logAudit({
    userEmail: auth.user.email,
    userUid: auth.user.uid,
    action: "founder_plan_change",
    entity: "company",
    entityId: company.id,
    companySlug: slug,
    details: { from: company.plan, to: plan, extendDays, by: auth.user.email },
  });

  logger.info("[founder/plan] updated", { slug, from: company.plan, to: plan });
  return NextResponse.json({ ok: true, company: { slug, plan, subscriptionStatus: data.subscriptionStatus } });
});
