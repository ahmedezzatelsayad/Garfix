/**
 * /api/accounting/fx-revaluation/[id]
 * GET: Get single FX revaluation
 * PATCH: Update revaluation status (post/draft)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num, toNum } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { calculateFxRevaluation } from "@/lib/accounting/trade-finance";
import { z } from "zod";

const PatchFxRevSchema = z.object({
  companySlug: z.string().min(1),
  action: z.enum(["post", "unpost", "recalculate"]),
  rate: z.number().positive().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!id || isNaN(id)) return apiError("معرف إعادة التقييم غير صالح", 400);

    const sp = req.nextUrl.searchParams;
    const companySlug = sp.get("companySlug");
    if (!companySlug) return apiError("companySlug مطلوب", 400);

    const access = await requirePermissionForCompany(req, "finance_access", companySlug);
    if ("error" in access) return access.error;

    const rv = await db.fxRevaluation.findFirst({
      where: { id, companySlug },
      include: {
        journalEntry: { select: { id: true, reference: true, status: true, date: true } },
      },
    });

    if (!rv) return apiError("إعادة تقييم العملة غير موجودة", 404);

    return NextResponse.json({
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
    });
  })();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!id || isNaN(id)) return apiError("معرف إعادة التقييم غير صالح", 400);

    const body = await parseJsonBody(req);
    const parsed = PatchFxRevSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);

    const data = parsed.data;
    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    const existing = await db.fxRevaluation.findFirst({
      where: { id, companySlug: data.companySlug },
    });
    if (!existing) return apiError("إعادة تقييم العملة غير موجودة", 404);

    if (data.action === "post") {
      // Post the revaluation — recalculate with postImmediately=true
      if (existing.status === "posted") return apiError("إعادة التقييم مرحّلة بالفعل", 400);

      const result = await calculateFxRevaluation(
        data.companySlug,
        existing.fromCurrency,
        existing.toCurrency,
        num(existing.rate, 3),
        existing.period,
        user.email,
        true,
      );

      if (!result.ok) return apiError(result.error || "فشل ترحيل إعادة التقييم", 400);

      // Delete old draft and update status
      await db.fxRevaluation.update({
        where: { id },
        data: { status: "posted" },
      });

      await logAudit({
        userEmail: user.email,
        userUid: user.uid,
        action: "post",
        entity: "fx_revaluation",
        entityId: id,
        companySlug: data.companySlug,
        details: { fromCurrency: existing.fromCurrency, toCurrency: existing.toCurrency, period: existing.period },
      });

      return NextResponse.json({ ok: true, result: result.result });
    } else if (data.action === "unpost") {
      // Unpost — revert to draft
      if (existing.status !== "posted") return apiError("إعادة التقييم غير مرحّلة", 400);

      // If there's a linked JE, reverse it
      if (existing.journalEntryId) {
        await db.journalEntry.update({
          where: { id: existing.journalEntryId },
          data: { status: "reversed" },
        });
      }

      await db.fxRevaluation.update({
        where: { id },
        data: { status: "draft", journalEntryId: null },
      });

      await logAudit({
        userEmail: user.email,
        userUid: user.uid,
        action: "unpost",
        entity: "fx_revaluation",
        entityId: id,
        companySlug: data.companySlug,
      });

      return NextResponse.json({ ok: true });
    } else if (data.action === "recalculate") {
      // Recalculate with new rate
      const newRate = data.rate || num(existing.rate, 3);
      await db.fxRevaluation.delete({ where: { id } });

      const result = await calculateFxRevaluation(
        data.companySlug,
        existing.fromCurrency,
        existing.toCurrency,
        newRate,
        existing.period,
        user.email,
        existing.status === "posted",
      );

      if (!result.ok) return apiError(result.error || "فشل إعادة حساب التقييم", 400);

      await logAudit({
        userEmail: user.email,
        userUid: user.uid,
        action: "recalculate",
        entity: "fx_revaluation",
        entityId: result.result?.revaluationId,
        companySlug: data.companySlug,
        details: { oldRate: num(existing.rate, 3), newRate },
      });

      return NextResponse.json({ ok: true, result: result.result });
    }

    return apiError("إجراء غير صالح", 400);
  })();
}
