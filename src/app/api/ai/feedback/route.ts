/**
 * /api/ai/feedback — حلقة التغذية الراجعة الحقيقية (P0 Learning Loop).
 *
 * POST — تسجيل تقييم بشري لرد ذكاء اصطناعي (👍/👎 + تصحيح اختياري).
 * GET  — جلب التقييمات (للوحة التعلم) + إحصاءات التعلم.
 *
 * هذا يحوّل النظام من "يتعلم ما تكرر" إلى "يتعلم ما صُحّح":
 * الردود المصححة تُستخدم لاحقًا لخفض ترتيب الأنماط الفاشلة.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { withErrorHandler, apiError, parseJsonBody } from "@/lib/api";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";

const FeedbackSchema = z.object({
  companySlug: z.string().min(1),
  conversationId: z.string().optional(),
  requestLogId: z.number().int().optional().nullable(),
  question: z.string().max(4000).optional(),
  answer: z.string().max(8000).optional(),
  rating: z.enum(["up", "down"]),
  correctedAnswer: z.string().max(8000).optional(),
  correctionReason: z.string().max(1000).optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "post:ai-feedback", LIMITS.API_WRITE);
  if (rl) return rl;

  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = auth.user;

  const parsed = FeedbackSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  const d = parsed.data;

  if (!assertCompanyAccess(user, d.companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // لو التصحيح موجود → علّم النمط المرتبط بأنه تعلّم منه (سيُفحص لاحقًا)
  // P0: نربط التقييم ببصمة المدخل (إن توفرت) ليستخدمها patternIsTrusted
  // في إسقاط الأنماط المستمرة الفشل — هذا هو جسر feedback→learning.
  let inputHashPrefix: string | undefined;
  if (d.question && d.question.startsWith("hash:")) {
    inputHashPrefix = d.question; // أصلاً بصمة مخزنة
  } else if (d.question) {
    try {
      const { fabricHash } = await import("@/lib/ai-fabric/types");
      inputHashPrefix = `hash:${fabricHash(d.question)}`;
    } catch { /* best-effort */ }
  }

  const feedback = await db.aIFeedback.create({
    data: {
      companySlug: d.companySlug,
      conversationId: d.conversationId ?? null,
      requestLogId: d.requestLogId ?? null,
      question: inputHashPrefix ?? d.question ?? null,
      answer: d.answer ?? null,
      rating: d.rating,
      correctedAnswer: d.correctedAnswer ?? null,
      correctionReason: d.correctionReason ?? null,
      correctedBy: user.uid,
      learnedFrom: false,
    },
  });

  logger.info("[ai/feedback] recorded", {
    companySlug: d.companySlug,
    rating: d.rating,
    hasCorrection: !!d.correctedAnswer,
  });

  return NextResponse.json({ ok: true, id: feedback.id }, { status: 201 });
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(auth.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where = companySlug ? { companySlug } : {};
  const [items, upCount, downCount, corrected] = await Promise.all([
    db.aIFeedback.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    db.aIFeedback.count({ where: { ...where, rating: "up" } }),
    db.aIFeedback.count({ where: { ...where, rating: "down" } }),
    db.aIFeedback.count({ where: { ...where, correctedAnswer: { not: null } } }),
  ]);

  return NextResponse.json({
    items,
    stats: {
      up: upCount,
      down: downCount,
      corrected,
      satisfactionRate: upCount + downCount > 0 ? Math.round((upCount / (upCount + downCount)) * 100) : null,
    },
  });
});
