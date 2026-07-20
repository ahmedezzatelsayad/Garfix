/**
 * /api/platform-admin/ai-usage
 *
 * GET — Aggregate AI usage statistics from the `ai_usage_logs` table.
 *
 * Returns:
 *   - totals: totalCalls, totalCost, totalTokensIn, totalTokensOut, totalTokens,
 *     successCount, failureCount, callsToday, successRate
 *   - last30Days: [{ date, calls, cost }]
 *   - perCompany: [{ companySlug, calls, cost, tokens }]
 *   - perEndpoint: [{ endpoint, calls, cost, tokens, successCount, failureCount,
 *     p50Ms, p95Ms, minMs, maxMs, avgMs }]  ← latency breakdown per endpoint
 *   - perModel: [{ model, calls, cost, tokens }]
 *   - perCompanyMonthly: [{ companySlug, month, calls, tokens, cost }]
 *   - recentErrors: [{ id, provider, model, endpoint, errorMessage, createdAt }]
 *
 * Founder-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";

/**
 * Compute percentiles from an array of latencies (ms).
 * Returns { p50, p95, min, max, avg } or nulls if the array is empty.
 * Uses the nearest-rank method (no interpolation) — standard for latency SLOs.
 */
function computeLatencyStats(latencies: number[]): {
  p50: number | null; p95: number | null; min: number | null; max: number | null; avg: number | null;
} {
  if (latencies.length === 0) return { p50: null, p95: null, min: null, max: null, avg: null };
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  // Nearest-rank: percentile p → index ceil(p/100 * n) - 1 (clamped to [0, n-1])
  const rank = (p: number) => {
    const idx = Math.ceil((p / 100) * n) - 1;
    return sorted[Math.max(0, Math.min(n - 1, idx))];
  };
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    p50: rank(50),
    p95: rank(95),
    min: sorted[0],
    max: sorted[n - 1],
    avg: Math.round(sum / n),
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  // ── Overall totals ──────────────────────────────────────────────────────
  const all = await db.aIUsageLog.findMany({
    select: {
      id: true,
      companySlug: true,
      provider: true,
      model: true,
      endpoint: true,
      tokensIn: true,
      tokensOut: true,
      totalTokens: true,
      estimatedCost: true,
      processingMs: true,
      success: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  const totalCalls = all.length;
  const totalCost = all.reduce((s, r) => s + (r.estimatedCost || 0), 0);
  const totalTokensIn = all.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = all.reduce((s, r) => s + r.tokensOut, 0);
  const totalTokens = all.reduce((s, r) => s + r.totalTokens, 0);
  const successCount = all.filter((r) => r.success).length;
  const failureCount = totalCalls - successCount;

  // P0.3 FIX: calls/day + overall success rate — the two headline numbers
  // the founder asks for first ("how much AI are we using, and is it working?").
  // `callsToday` counts rows created since local midnight today.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const callsToday = all.filter((r) => r.createdAt >= today).length;
  const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 1000) / 10 : null;

  // ── Last 30 days daily series ───────────────────────────────────────────
  const now = new Date();
  const start30 = new Date(now);
  start30.setDate(now.getDate() - 29);
  start30.setHours(0, 0, 0, 0);

  const dayBuckets: Record<string, { calls: number; cost: number }> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(start30);
    d.setDate(start30.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dayBuckets[key] = { calls: 0, cost: 0 };
  }
  for (const r of all) {
    if (r.createdAt < start30) continue;
    const key = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}-${String(r.createdAt.getDate()).padStart(2, "0")}`;
    if (!dayBuckets[key]) dayBuckets[key] = { calls: 0, cost: 0 };
    dayBuckets[key].calls += 1;
    dayBuckets[key].cost += r.estimatedCost || 0;
  }
  const last30Days = Object.entries(dayBuckets).map(([date, v]) => ({
    date,
    calls: v.calls,
    cost: Math.round(v.cost * 1e6) / 1e6,
  }));

  // ── Per company breakdown ───────────────────────────────────────────────
  const perCompanyMap = new Map<string, { calls: number; cost: number; tokens: number }>();
  for (const r of all) {
    const key = r.companySlug || "(none)";
    const prev = perCompanyMap.get(key) || { calls: 0, cost: 0, tokens: 0 };
    prev.calls += 1;
    prev.cost += r.estimatedCost || 0;
    prev.tokens += r.totalTokens;
    perCompanyMap.set(key, prev);
  }
  const perCompany = Array.from(perCompanyMap.entries())
    .map(([companySlug, v]) => ({
      companySlug,
      calls: v.calls,
      cost: Math.round(v.cost * 1e6) / 1e6,
      tokens: v.tokens,
    }))
    .sort((a, b) => b.cost - a.cost);

  // ── Per endpoint breakdown (with latency p50/p95) ───────────────────────
  // P0.3 FIX (AI Effectiveness prompt): the founder dashboard needs to answer
  // "how fast is each AI endpoint?" — not just "how many calls / how much
  // cost". We now aggregate successCount, failureCount, and the full latency
  // distribution (min/p50/p95/max/avg) per endpoint, using only rows where
  // processingMs was recorded (null entries are excluded from the latency
  // arrays but still counted in the calls total).
  const perEndpointMap = new Map<string, {
    calls: number; cost: number; tokens: number;
    successCount: number; failureCount: number;
    latencies: number[];
  }>();
  for (const r of all) {
    const prev = perEndpointMap.get(r.endpoint) || { calls: 0, cost: 0, tokens: 0, successCount: 0, failureCount: 0, latencies: [] };
    prev.calls += 1;
    prev.cost += r.estimatedCost || 0;
    prev.tokens += r.totalTokens;
    if (r.success) prev.successCount += 1; else prev.failureCount += 1;
    if (typeof r.processingMs === "number" && r.processingMs > 0) prev.latencies.push(r.processingMs);
    perEndpointMap.set(r.endpoint, prev);
  }
  const perEndpoint = Array.from(perEndpointMap.entries())
    .map(([endpoint, v]) => {
      const stats = computeLatencyStats(v.latencies);
      return {
        endpoint,
        calls: v.calls,
        cost: Math.round(v.cost * 1e6) / 1e6,
        tokens: v.tokens,
        successCount: v.successCount,
        failureCount: v.failureCount,
        successRate: v.calls > 0 ? Math.round((v.successCount / v.calls) * 1000) / 10 : null,
        p50Ms: stats.p50,
        p95Ms: stats.p95,
        minMs: stats.min,
        maxMs: stats.max,
        avgMs: stats.avg,
      };
    })
    .sort((a, b) => b.calls - a.calls);

  // ── Per model breakdown ─────────────────────────────────────────────────
  const perModelMap = new Map<string, { calls: number; cost: number; tokens: number }>();
  for (const r of all) {
    const prev = perModelMap.get(r.model) || { calls: 0, cost: 0, tokens: 0 };
    prev.calls += 1;
    prev.cost += r.estimatedCost || 0;
    prev.tokens += r.totalTokens;
    perModelMap.set(r.model, prev);
  }
  const perModel = Array.from(perModelMap.entries())
    .map(([model, v]) => ({
      model,
      calls: v.calls,
      cost: Math.round(v.cost * 1e6) / 1e6,
      tokens: v.tokens,
    }))
    .sort((a, b) => b.calls - a.calls);

  // ── Per company × month breakdown (GATE 4 Task 3: founder AI usage table) ─
  // Returns one row per (tenant, year-month) so the founder panel can render
  // a tenant|month|AI calls|tokens|cost table. Months without activity are
  // omitted (no zero-fill) so the table stays compact.
  const perCompanyMonthlyMap = new Map<string, { companySlug: string; month: string; calls: number; tokens: number; cost: number }>();
  for (const r of all) {
    const slug = r.companySlug || "(none)";
    const month = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const key = `${slug}|${month}`;
    const prev = perCompanyMonthlyMap.get(key) || { companySlug: slug, month, calls: 0, tokens: 0, cost: 0 };
    prev.calls += 1;
    prev.tokens += r.totalTokens;
    prev.cost += r.estimatedCost || 0;
    perCompanyMonthlyMap.set(key, prev);
  }
  const perCompanyMonthly = Array.from(perCompanyMonthlyMap.values())
    .map((v) => ({
      companySlug: v.companySlug,
      month: v.month,
      calls: v.calls,
      tokens: v.tokens,
      cost: Math.round(v.cost * 1e6) / 1e6,
    }))
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : b.cost - a.cost));

  // ── Recent errors (last 20) ─────────────────────────────────────────────
  const recentErrors = all
    .filter((r) => !r.success)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      companySlug: r.companySlug,
      provider: r.provider,
      model: r.model,
      endpoint: r.endpoint,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
    }));

  return NextResponse.json({
    totals: {
      totalCalls,
      totalCost: Math.round(totalCost * 1e6) / 1e6,
      totalTokensIn,
      totalTokensOut,
      totalTokens,
      successCount,
      failureCount,
      callsToday,
      successRate,
    },
    last30Days,
    perCompany,
    perEndpoint,
    perModel,
    perCompanyMonthly,
    recentErrors,
  });
});
