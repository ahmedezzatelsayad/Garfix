/**
 * /api/accounting/fx-revaluation
 * GET: List FX revaluations (?companySlug=X&period=2024-01)
 * POST: Calculate FX revaluation
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { calculateFxRevaluation } from "@/lib/accounting/trade-finance";
import { z } from "zod";

const CreateFxRevSchema = z.object({
  companySlug: z.string().min(1),
  fromCurrency: z.string().min(1),
  toCurrency: z.string().min(1),
  rate: z.number().positive(),
  period: z.string().min(1), // YYYY-MM
  postImmediately: z.boolean().default(false),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const where: Record<string, unknown> = { companySlug };
  const period = sp.get("period");
  if (period) where.period = period;

  const revaluations = await db.fxRevaluation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      journalEntry: { select: { id: true, reference: true, status: true } },
    },
  });

  return NextResponse.json({
    revaluations: revaluations.map((rv) => ({
      id: rv.id,
      fromCurrency: rv.fromCurrency,
      toCurrency: rv.toCurrency,
      rate: num(rv.rate, 3),
      period: rv.period,
      realizedGain: num(rv.realizedGain, 3),
      realizedLoss: num(rv.realizedLoss, 3),
      unrealizedGain: num(rv.unrealizedGain, 3),
      unrealizedLoss: num(rv.unrealizedLoss, 3),
      status: rv.status,
      journalEntryId: rv.journalEntryId,
      journalEntry: rv.journalEntry,
      createdAt: rv.createdAt,
      updatedAt: rv.updatedAt,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateFxRevSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

  const data = parsed.data;
  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const result = await calculateFxRevaluation(
    data.companySlug,
    data.fromCurrency,
    data.toCurrency,
    data.rate,
    data.period,
    user.email,
    data.postImmediately,
  );

  if (!result.ok) return apiError(result.error || "فشل حساب إعادة تقييم العملة", 400);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "fx_revaluation",
    entityId: result.result?.revaluationId,
    companySlug: data.companySlug,
    details: {
      fromCurrency: data.fromCurrency,
      toCurrency: data.toCurrency,
      rate: data.rate,
      period: data.period,
      unrealizedGain: result.result?.unrealizedGain,
      unrealizedLoss: result.result?.unrealizedLoss,
      postImmediately: data.postImmediately,
    },
  });

  return NextResponse.json({ ok: true, result: result.result }, { status: 201 });
});
