/**
 * /api/founder-panel/ai-fabric — AI Fabric Data API
 *
 * Extracts all Prisma queries from the ai-fabric page.
 * The page is now a Client Component that fetches from this endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformSavings } from "@/lib/ai-fabric/cost-optimizer";
import { requireFounder } from "@/lib/middleware";

export interface AIFabricData {
  companiesCount: number;
  workersActive: number;
  activeRuntimeCount: number;
  queueDelay: number | null;
  platformSavings: { savedUsd: number; savingsPct: number } | null;
  cascadeBreakdown: Record<string, number>;
  totalCascadeRequests: number;
  grossAiMargin: number;
  totalRevenue: number;
  totalAiCost: number;
  periodStart: string;
  periodEnd: string;
}

export async function GET(req: NextRequest): Promise<NextResponse<AIFabricData>> {
  // SEC-C9 (Cycle 4): close missing-auth — exposed companies count, active workers,
  // AI latency, platform savings, total revenue, total AI cost to anyone.
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult as NextResponse<AIFabricData>;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  try {
    // Source: db.company.count
    const companiesCount = await db.company.count();

    // Source: db.companyRuntime.aggregate
    const activeWorkersAgg = await db.companyRuntime.aggregate({
      where: { status: "active" },
      _sum: { workerPoolSize: true },
      _count: true,
    });
    const workersActive = activeWorkersAgg._sum.workerPoolSize ?? 0;
    const activeRuntimeCount = activeWorkersAgg._count;

    // Source: db.aIRequestLog.aggregate AVG(latencyMs)
    const aiLatencyAgg = await db.aIRequestLog.aggregate({
      where: { resolvedBy: "ai", createdAt: { gte: periodStart, lte: periodEnd } },
      _avg: { latencyMs: true },
    });
    const queueDelay = aiLatencyAgg._avg.latencyMs
      ? Math.round(aiLatencyAgg._avg.latencyMs)
      : null;

    // Source: cost-optimizer.getPlatformSavings()
    let platformSavings: { savedUsd: number; savingsPct: number } | null = null;
    try {
      const report = await getPlatformSavings(periodStart, periodEnd);
      platformSavings = { savedUsd: report.savedUsd, savingsPct: report.savingsPct };
    } catch {
      platformSavings = null;
    }

    // Source: db.aIRequestLog.groupBy
    const cascadeGroups = await db.aIRequestLog.groupBy({
      by: ["resolvedBy"],
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
      _count: true,
    });
    const totalCascadeRequests = cascadeGroups.reduce((s, g) => s + g._count, 0);
    const cascadeBreakdown: Record<string, number> = {};
    for (const g of cascadeGroups) {
      cascadeBreakdown[g.resolvedBy] =
        totalCascadeRequests > 0
          ? Math.round((g._count / totalCascadeRequests) * 1000) / 10
          : 0;
    }

    // Source: db.profitSnapshot.aggregate
    const profitAgg = await db.profitSnapshot.aggregate({
      where: { periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
      _sum: { revenueUsd: true, aiCostUsd: true },
    });
    const totalRevenue = profitAgg._sum.revenueUsd ?? 0;
    const totalAiCost = profitAgg._sum.aiCostUsd ?? 0;
    const grossAiMargin = Math.round((totalRevenue - totalAiCost) * 100) / 100;

    return NextResponse.json({
      companiesCount,
      workersActive,
      activeRuntimeCount,
      queueDelay,
      platformSavings,
      cascadeBreakdown,
      totalCascadeRequests,
      grossAiMargin,
      totalRevenue,
      totalAiCost,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (error) {
    console.error("[ai-fabric-api] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI Fabric data" } as unknown as AIFabricData,
      { status: 500 }
    );
  }
}
