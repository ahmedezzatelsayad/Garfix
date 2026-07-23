/**
 * /api/founder-panel/finops — FinOps Dashboard Data API
 *
 * Extracts all Prisma queries from the finops page.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformSavings } from "@/lib/ai-fabric/cost-optimizer";
import { getPlatformProfit } from "@/lib/ai-fabric/profit-engine";
import { requireFounder } from "@/lib/middleware";

const PLAN_REVENUE_MONTHLY_USD: Record<string, number> = {
  trial: 0,
  starter: 29,
  business: 99,
  enterprise: 299,
};

const INFRA_COST_PER_DAY = 5.0;

const CASCADE_COLORS: Record<string, string> = {
  cache: "hsl(142, 76%, 36%)",
  pattern: "hsl(199, 89%, 48%)",
  rule: "hsl(38, 92%, 50%)",
  memory: "hsl(262, 83%, 58%)",
  ai: "hsl(0, 84%, 60%)",
};

export interface FinOpsData {
  // Metrics
  totalMonthlyRevenue: number;
  activeRuntimeCount: number;
  aiCostMtd: number;
  totalTokensMtd: number;
  totalRequestsMtd: number;
  infraCostMtd: number;
  revenueMtd: number;
  platformSavings: {
    savedUsd: number;
    savingsPct: number;
    totalRequests: number;
    breakdown: { resolvedBy: string; count: number; percentage: number }[];
  } | null;
  platformProfit: {
    revenueUsd: number;
    aiCostUsd: number;
    infraCostUsd: number;
    workerCostUsd: number;
    profitUsd: number;
    companyCount: number;
  } | null;
  invoiceCountMtd: number;
  
  // Derived
  totalCostMtd: number;
  profitMtd: number;
  profitPct: number;
  costPerCompany: number;
  costPerInvoice: number;
  costPerAiCall: number;
  estAiCostEom: number;
  estInfraEom: number;
  estTotalCostEom: number;
  estProfitEom: number;
  estProfitPctEom: number;
  
  // Chart data
  pnlChartData: { date: string; revenue: number; aiCost: number; infraCost: number; profit: number }[];
  cascadeChartData: { stage: string; count: number; pct: number; fill: string }[];
  costTrendData: { date: string; aiCost: number; savedCost: number }[];
  
  // Period info
  periodStart: string;
  periodEnd: string;
  daysElapsed: number;
  daysInMonth: number;
}

export async function GET(req: NextRequest): Promise<NextResponse<FinOpsData>> {
  // SEC-C10 (Cycle 4): close missing-auth — exposed platform P&L (revenue, AI cost,
  // infra cost, profit %, cost per company, cost per invoice, cost per AI call).
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult as NextResponse<FinOpsData>;
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  try {
    // Companies
    const companies = await db.company.findMany({ select: { id: true, plan: true, slug: true } });
    const totalMonthlyRevenue = companies.reduce((sum, c) => sum + (PLAN_REVENUE_MONTHLY_USD[c.plan] ?? 0), 0);
    
    // Active runtimes
    const activeRuntimeCount = await db.companyRuntime.count({ where: { status: "active" } });
    
    // AI aggregates
    const aiAgg = await db.aIRequestLog.aggregate({
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
      _sum: { costUsd: true, tokensUsed: true },
      _count: true,
    });
    const aiCostMtd = Number(aiAgg._sum.costUsd ?? 0);
    const totalTokensMtd = Number(aiAgg._sum.tokensUsed ?? 0);
    const totalRequestsMtd = aiAgg._count;
    
    // AI call count
    const aiCallCountMtd = await db.aIRequestLog.count({
      where: { createdAt: { gte: periodStart, lte: periodEnd }, resolvedBy: "ai" },
    });
    
    // Infra cost
    const infraCostMtd = Math.round(INFRA_COST_PER_DAY * daysElapsed * activeRuntimeCount * 100) / 100;
    
    // Revenue MTD
    const revenueMtd = daysInMonth > 0 ? Math.round((totalMonthlyRevenue / daysInMonth) * daysElapsed * 100) / 100 : 0;
    
    // Platform savings
    let platformSavings: FinOpsData["platformSavings"] = null;
    try {
      const report = await getPlatformSavings(periodStart, periodEnd);
      platformSavings = {
        savedUsd: report.savedUsd,
        savingsPct: report.savingsPct,
        totalRequests: report.totalRequests,
        breakdown: report.breakdown.map((b) => ({
          resolvedBy: b.resolvedBy,
          count: b.count,
          percentage: b.percentage,
        })),
      };
    } catch { /* noop */ }
    
    // Platform profit
    let platformProfit: FinOpsData["platformProfit"] = null;
    try {
      const pp = await getPlatformProfit(periodStart, periodEnd);
      platformProfit = {
        revenueUsd: pp.revenueUsd,
        aiCostUsd: pp.aiCostUsd,
        infraCostUsd: pp.infraCostUsd,
        workerCostUsd: pp.workerCostUsd,
        profitUsd: pp.profitUsd,
        companyCount: pp.companyCount,
      };
    } catch { /* noop */ }
    
    // Invoice count
    const invoiceCountMtd = await db.invoice.count({
      where: { createdAt: { gte: periodStart, lte: periodEnd }, deletedAt: null },
    });
    
    // Cascade groups
    const cascadeGroups = await db.aIRequestLog.groupBy({
      by: ["resolvedBy"],
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
      _count: true,
    });
    
    // Derived metrics
    const totalCostMtd = aiCostMtd + infraCostMtd;
    const profitMtd = revenueMtd - totalCostMtd;
    const profitPct = revenueMtd > 0 ? Math.round((profitMtd / revenueMtd) * 1000) / 10 : 0;
    
    const costPerCompany = companies.length > 0 ? Math.round((totalCostMtd / companies.length) * 10000) / 10000 : 0;
    const costPerInvoice = invoiceCountMtd > 0 ? Math.round((aiCostMtd / invoiceCountMtd) * 100000) / 100000 : 0;
    const costPerAiCall = aiCallCountMtd > 0 ? Math.round((aiCostMtd / aiCallCountMtd) * 100000) / 100000 : 0;
    
    // Forecast
    const dailyAiRate = daysElapsed > 0 ? aiCostMtd / daysElapsed : 0;
    const estAiCostEom = Math.round(dailyAiRate * daysInMonth * 100) / 100;
    const estInfraEom = Math.round(INFRA_COST_PER_DAY * daysInMonth * activeRuntimeCount * 100) / 100;
    const estTotalCostEom = estAiCostEom + estInfraEom;
    const estProfitEom = Math.round((totalMonthlyRevenue - estTotalCostEom) * 100) / 100;
    const estProfitPctEom = totalMonthlyRevenue > 0 ? Math.round((estProfitEom / totalMonthlyRevenue) * 1000) / 10 : 0;
    
    // PnL chart data
    const snapshots = await db.profitSnapshot.findMany({ orderBy: { periodStart: "asc" }, take: 14 });
    const pnlChartData = snapshots.map((s) => ({
      date: s.periodStart.toISOString().slice(5, 10),
      revenue: Math.round(s.revenueUsd * 100) / 100,
      aiCost: Math.round(s.aiCostUsd * 100) / 100,
      infraCost: Math.round(s.infraCostUsd * 100) / 100,
      profit: Math.round(s.profitUsd * 100) / 100,
    }));
    
    // Cascade chart data
    const cascadeChartData: FinOpsData["cascadeChartData"] = cascadeGroups
      .map((g) => ({
        stage: g.resolvedBy,
        count: g._count,
        pct: totalRequestsMtd > 0 ? Math.round((g._count / totalRequestsMtd) * 1000) / 10 : 0,
        fill: CASCADE_COLORS[g.resolvedBy] ?? "hsl(0, 0%, 70%)",
      }))
      .sort((a, b) => b.count - a.count);
    
    // Cost trend data (last 7 days)
    const costTrendData: FinOpsData["costTrendData"] = [];
    for (let d = 6; d >= 0; d--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayAgg = await db.aIRequestLog.aggregate({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
        _sum: { costUsd: true },
        _count: true,
      });
      const aiOnlyAgg = await db.aIRequestLog.aggregate({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, resolvedBy: "ai" },
        _sum: { costUsd: true },
        _count: true,
      });
      
      const aiOnlyCost = Number(aiOnlyAgg._sum.costUsd ?? 0);
      const totalDayCost = Number(dayAgg._sum.costUsd ?? 0);
      const hypotheticalCost = dayAgg._count > 0 && aiOnlyAgg._count > 0
        ? (aiOnlyCost / aiOnlyAgg._count) * dayAgg._count
        : 0;
      const saved = Math.max(0, hypotheticalCost - totalDayCost);

      costTrendData.push({
        date: dayStart.toISOString().slice(5, 10),
        aiCost: Math.round(totalDayCost * 10000) / 10000,
        savedCost: Math.round(saved * 10000) / 10000,
      });
    }

    return NextResponse.json({
      totalMonthlyRevenue,
      activeRuntimeCount,
      aiCostMtd,
      totalTokensMtd,
      totalRequestsMtd,
      infraCostMtd,
      revenueMtd,
      platformSavings,
      platformProfit,
      invoiceCountMtd,
      totalCostMtd,
      profitMtd,
      profitPct,
      costPerCompany,
      costPerInvoice,
      costPerAiCall,
      estAiCostEom,
      estInfraEom,
      estTotalCostEom,
      estProfitEom,
      estProfitPctEom,
      pnlChartData,
      cascadeChartData,
      costTrendData,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      daysElapsed,
      daysInMonth,
    });
  } catch (error) {
    console.error("[finops-api] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch FinOps data" } as unknown as FinOpsData,
      { status: 500 }
    );
  }
}
