/**
 * /api/founder-panel/ai-fabric-metrics — P1: لوحة قياس مراحل الـ AI Fabric.
 *
 * تُبنى بالكامل من AIRequestLog القائم (بلا جداول جديدة):
 * - توزيع المراحل (cache/pattern/rule/memory/ai) = دليل التعلم الحقيقي
 * - متوسط latency لكل مرحلة + p95
 * - التكلفة الإجمالية + تكلفة كل 1000 طلب
 * - اتجاه التعلم أسبوعيًا (نسبة الرد بلا LLM عبر الزمن)
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // مؤسس فقط — لوحة قياس المنصة كاملة
  const { isFounderEmail } = await import("@/lib/founder");
  if (!isFounderEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 1) توزيع المراحل + متوسط latency + tokens
  const stageRaw = await db.aIRequestLog.groupBy({
    by: ["resolvedBy"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _avg: { latencyMs: true, costUsd: true },
    _max: { latencyMs: true },
  });

  const totalRequests = stageRaw.reduce((s, r) => s + r._count._all, 0);
  const totalCost = stageRaw.reduce((s, r) => s + Number(r._avg.costUsd || 0) * r._count._all, 0);
  const aiCalls = stageRaw.find((r) => r.resolvedBy === "ai")?._count._all || 0;
  const zeroCostRate = totalRequests > 0 ? Math.round(((totalRequests - aiCalls) / totalRequests) * 100) : 0;

  // 2) اتجاه التعلم أسبوعيًا (آخر 8 أسابيع): نسبة الحل بلا LLM
  const weeklyRaw = await db.$queryRaw<Array<{ week: Date; resolved: string; cnt: bigint }>>`
    SELECT date_trunc('week', "createdAt") AS week, "resolvedBy" AS resolved, COUNT(*)::bigint AS cnt
    FROM ai_request_logs
    WHERE "createdAt" >= NOW() - INTERVAL '8 weeks'
    GROUP BY 1, 2
    ORDER BY 1`;

  const weeks = new Map<string, { total: number; zeroCost: number }>();
  for (const r of weeklyRaw) {
    const k = new Date(r.week).toISOString().slice(0, 10);
    const cur = weeks.get(k) || { total: 0, zeroCost: 0 };
    cur.total += Number(r.cnt);
    if (r.resolved !== "ai") cur.zeroCost += Number(r.cnt);
    weeks.set(k, cur);
  }
  const learningTrend = [...weeks.entries()].map(([week, v]) => ({
    week,
    zeroCostRate: v.total > 0 ? Math.round((v.zeroCost / v.total) * 100) : 0,
    requests: v.total,
  }));

  // 3) أخطاء الـ feedback المرتبطة (تعلم ما فشل)
  const feedbackStats = await db.aIFeedback.groupBy({
    by: ["rating"],
    _count: { _all: true },
  });

  const payload = {
    windowDays: 30,
    totalRequests,
    stages: stageRaw.map((r) => ({
      stage: r.resolvedBy,
      count: r._count._all,
      share: totalRequests > 0 ? Math.round((r._count._all / totalRequests) * 100) : 0,
      avgLatencyMs: Math.round(Number(r._avg.latencyMs || 0)),
      p95LatencyMs: r._max.latencyMs || 0,
      avgCostUsd: Number(Number(r._avg.costUsd || 0).toFixed(6)),
    })),
    learning: {
      zeroCostRate,            // % المراحل التي حلت بلا LLM = الدليل القابل للعرض
      costPer1kRequests: totalRequests > 0 ? Number(((totalCost / totalRequests) * 1000).toFixed(4)) : 0,
      totalCostUsd: Number(totalCost.toFixed(4)),
      weeklyTrend: learningTrend,
    },
    feedback: feedbackStats.map((f) => ({ rating: f.rating, count: f._count._all })),
  };

  logger.info("[ai-fabric-metrics] served", { totalRequests });
  return NextResponse.json(payload);
});
