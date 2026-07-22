/**
 * /api/founder-panel/mission-control — Mission Control Data API
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL CHANGE (v12.1):
 *
 * This API route extracts ALL Prisma queries from the mission-control page.
 * The page is now a Client Component that fetches data from this endpoint,
 * preventing Next.js from executing database queries during build time.
 *
 * WHY: Server Components that query Prisma at module level cause build failures
 * in CI/CD where no database is available (Error code 14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA SOURCES:
 *
 *   Companies Online  → db.companyRuntime.count WHERE status='active'
 *   Workers           → db.companyRuntime.aggregate SUM(workerPoolSize)
 *   Queues            → db.jobQueue.count GROUP BY status
 *   Queue Delay       → db.aIRequestLog.aggregate AVG(latencyMs)
 *   AI Calls/sec      → db.aIRequestLog.count (last 60s) / 60
 *   Cascade %         → db.aIRequestLog.groupBy resolvedBy
 *   AI Saved          → cost-optimizer.getPlatformSavings()
 *   Gross Margin      → derived from revenue - cost
 *   Provider Health   → db.aIModelRegistry WHERE isEnabled=true
 *   Token Rate        → db.aIRequestLog.aggregate SUM(tokensUsed) (last hour)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CACHE STRATEGY:
 *
 * - No caching by default (real-time dashboard)
 * - Client can implement its own polling/refetch logic
 * - Consider adding revalidate=5 for 5-second cache if needed
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformSavings } from "@/lib/ai-fabric/cost-optimizer";
import { getActiveWorkerCounts } from "@/lib/ai-fabric/worker-scaler";

// ─── Constants ──────────────────────────────────────────────────────────────

const PLAN_REVENUE_MONTHLY_USD: Record<string, number> = {
  trial: 0,
  starter: 29,
  business: 99,
  enterprise: 299,
};
const INFRA_COST_PER_DAY = 5.0;

// ─── Response Types ─────────────────────────────────────────────────────────

export interface MissionControlData {
  // Company Metrics
  companiesOnline: number;
  totalWorkers: number;
  workerMap: Record<string, number>;

  // Queue Metrics
  queueDepths: Record<string, number>;
  totalQueueDepth: number;

  // AI Performance
  avgLatencyMs: number | null;
  aiCallsPerSec: number;
  callsPerMinute5m: number;
  cascadePcts: Record<string, number>;

  // Financials
  savingsToday: { savedUsd: number; savingsPct: number } | null;
  savingsMonthly: { savedUsd: number; savingsPct: number } | null;
  grossMarginPct: number | null;

  // System Health
  providerHealthCount: number;
  tokenRateLastHour: number | null;

  // Timestamp
  timestamp: string;
}

// ─── GET Handler ────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse<MissionControlData>> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // For rate calculations
  const oneMinuteAgo = new Date(now.getTime() - 60_000);
  const oneHourAgo = new Date(now.getTime() - 3_600_000);
  const fiveMinutesAgo = new Date(now.getTime() - 300_000);

  try {
    // ── Source: db.companyRuntime — companies online + workers ────────────
    const runtimeAgg = await db.companyRuntime.aggregate({
      where: { status: "active" },
      _sum: { workerPoolSize: true },
      _count: true,
    });
    const companiesOnline = runtimeAgg._count;
    const totalWorkers = runtimeAgg._sum.workerPoolSize ?? 0;

    // ── Source: worker-scaler.getActiveWorkerCounts() ─────────────────────
    let workerMap: Record<string, number> = {};
    try {
      workerMap = await getActiveWorkerCounts();
    } catch {
      workerMap = {};
    }

    // ── Source: db.jobQueue.count GROUP BY status — queue depths ─────────
    const queueGroups = await db.jobQueue.groupBy({
      by: ["status"],
      _count: true,
    });
    const queueDepths: Record<string, number> = {};
    for (const g of queueGroups) {
      queueDepths[g.status] = g._count;
    }
    const totalQueueDepth =
      (queueDepths["pending"] ?? 0) + (queueDepths["running"] ?? 0);

    // ── Source: db.aIRequestLog.aggregate AVG(latencyMs) ─────────────────
    const latencyAgg = await db.aIRequestLog.aggregate({
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
      _avg: { latencyMs: true },
    });
    const avgLatencyMs = latencyAgg._avg.latencyMs
      ? Math.round(latencyAgg._avg.latencyMs)
      : null;

    // ── Source: db.aIRequestLog.count (last 60s) / 60 ───────────────────
    const recentCalls = await db.aIRequestLog.count({
      where: { createdAt: { gte: oneMinuteAgo } },
    });
    const aiCallsPerSec = Math.round((recentCalls / 60) * 100) / 100;

    // ── Source: db.aIRequestLog.count (last 5 min) ──────────────────────
    const callsLast5Min = await db.aIRequestLog.count({
      where: { createdAt: { gte: fiveMinutesAgo } },
    });
    const callsPerMinute5m = Math.round((callsLast5Min / 5) * 10) / 10;

    // ── Source: db.aIRequestLog.groupBy resolvedBy ─────────────────────
    const cascadeGroups = await db.aIRequestLog.groupBy({
      by: ["resolvedBy"],
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
      _count: true,
    });
    const totalCascadeRequests = cascadeGroups.reduce((s, g) => s + g._count, 0);
    const cascadePcts: Record<string, number> = {};
    for (const g of cascadeGroups) {
      cascadePcts[g.resolvedBy] =
        totalCascadeRequests > 0
          ? Math.round((g._count / totalCascadeRequests) * 1000) / 10
          : 0;
    }

    // ── Source: cost-optimizer.getPlatformSavings() ──────────────────────
    let savingsToday: { savedUsd: number; savingsPct: number } | null = null;
    let savingsMonthly: { savedUsd: number; savingsPct: number } | null = null;
    try {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);
      const todayReport = await getPlatformSavings(todayStart, todayEnd);
      savingsToday = {
        savedUsd: todayReport.savedUsd,
        savingsPct: todayReport.savingsPct,
      };
    } catch {
      savingsToday = null;
    }
    try {
      const monthReport = await getPlatformSavings(periodStart, periodEnd);
      savingsMonthly = {
        savedUsd: monthReport.savedUsd,
        savingsPct: monthReport.savingsPct,
      };
    } catch {
      savingsMonthly = null;
    }

    // ── Derived: Gross Margin ────────────────────────────────────────────
    const monthlyRevenue =
      (companiesOnline * (PLAN_REVENUE_MONTHLY_USD.enterprise ?? 299)) / 2 +
      (companiesOnline * (PLAN_REVENUE_MONTHLY_USD.business ?? 99)) / 2;
    const infraCostMonthly = INFRA_COST_PER_DAY * 30;
    const aiCostMonthly = savingsMonthly?.savedUsd ? Math.max(0, savingsMonthly.savedUsd * 0.4) : 0;
    const grossMarginPct =
      monthlyRevenue > 0
        ? Math.round(((monthlyRevenue - infraCostMonthly - aiCostMonthly) / monthlyRevenue) * 1000) / 10
        : null;

    // ── Source: db.aIModelRegistry WHERE isEnabled=true ──────────────────
    let providerHealthCount = 0;
    try {
      providerHealthCount = await db.aIModelRegistry.count({
        where: { isEnabled: true },
      });
    } catch {
      providerHealthCount = 0;
    }

    // ── Source: db.aIRequestLog.aggregate SUM(tokensUsed) (last hour) ────
    let tokenRateLastHour: number | null = null;
    try {
      const tokenAgg = await db.aIRequestLog.aggregate({
        where: { createdAt: { gte: oneHourAgo } },
        _sum: { tokensUsed: true },
      });
      tokenRateLastHour = tokenAgg._sum.tokensUsed ?? null;
    } catch {
      tokenRateLastHour = null;
    }

    // ── Build Response ───────────────────────────────────────────────────

    const data: MissionControlData = {
      companiesOnline,
      totalWorkers,
      workerMap,
      queueDepths,
      totalQueueDepth,
      avgLatencyMs,
      aiCallsPerSec,
      callsPerMinute5m,
      cascadePcts,
      savingsToday,
      savingsMonthly,
      grossMarginPct,
      providerHealthCount,
      tokenRateLastHour,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("[mission-control-api] Error fetching data:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch mission control data",
        timestamp: new Date().toISOString(),
      } as unknown as MissionControlData,
      { status: 500 }
    );
  }
}
