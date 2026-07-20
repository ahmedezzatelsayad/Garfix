/**
 * /founder-panel/finops — FinOps Dashboard
 *
 * Server component showing real financial metrics from AI Fabric modules.
 * Every number sourced from actual DB queries — "N/A" when data unavailable.
 * RTL-aware layout. Uses shadcn/ui Card, Tabs, and Recharts via client wrapper.
 *
 * Data sources:
 *   Revenue       → db.company.plan → PLAN_REVENUE_MONTHLY_USD (pro-rated MTD)
 *   AI Cost       → db.aIRequestLog.aggregate SUM(costUsd)
 *   Infra Cost    → ESTIMATED_INFRA_COST_PER_DAY × daysElapsed × active companies
 *   Profit        → db.profitSnapshot.aggregate or derived
 *   Unit Economics→ computed from above aggregates
 *   AI Saved      → cost-optimizer.getPlatformSavings()
 *   Month-End     → linear forecast from MTD run-rate
 *   Charts        → db.profitSnapshot (daily) + AIRequestLog (daily aggregates)
 */

import { db } from "@/lib/db";
import { getPlatformSavings } from "@/lib/ai-fabric/cost-optimizer";
import { getPlatformProfit } from "@/lib/ai-fabric/profit-engine";
import {
  RevenueCostChart,
  CascadeBreakdownChart,
  CostTrendChart,
  type DailyPnLPoint,
  type CascadeSlice,
  type CostTrendPoint,
} from "./finops-charts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Source: profit-engine.ts — same mapping used for revenue estimation */
const PLAN_REVENUE_MONTHLY_USD: Record<string, number> = {
  trial: 0,
  starter: 29,
  business: 99,
  enterprise: 299,
};

/** Source: profit-engine.ts ESTIMATED_INFRA_COST_PER_DAY */
const INFRA_COST_PER_DAY = 5.0;

const CASCADE_COLORS: Record<string, string> = {
  cache: "hsl(142, 76%, 36%)",
  pattern: "hsl(199, 89%, 48%)",
  rule: "hsl(38, 92%, 50%)",
  memory: "hsl(262, 83%, 58%)",
  ai: "hsl(0, 84%, 60%)",
};

// ─── Period helpers ─────────────────────────────────────────────────────────

const now = new Date();
const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
const daysElapsed = now.getDate();
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

// ─── Data fetching (all server-side) ────────────────────────────────────────

// Source: db.company.findMany → plan mapped via PLAN_REVENUE_MONTHLY_USD
const companies = await db.company.findMany({
  select: { id: true, plan: true, slug: true },
});
const totalMonthlyRevenue = companies.reduce(
  (sum, c) => sum + (PLAN_REVENUE_MONTHLY_USD[c.plan] ?? 0),
  0,
);

// Source: db.companyRuntime.count WHERE status='active' — active runtimes
const activeRuntimeCount = await db.companyRuntime.count({
  where: { status: "active" },
});

// Source: db.aIRequestLog.aggregate — current month AI cost + token usage + request count
const aiAgg = await db.aIRequestLog.aggregate({
  where: { createdAt: { gte: periodStart, lte: periodEnd } },
  _sum: { costUsd: true, tokensUsed: true },
  _count: true,
});
const aiCostMtd = Number(aiAgg._sum.costUsd ?? 0);
const totalTokensMtd = Number(aiAgg._sum.tokensUsed ?? 0);
const totalRequestsMtd = aiAgg._count;

// Source: db.aIRequestLog.count WHERE resolvedBy='ai' — actual LLM calls
const aiCallCountMtd = await db.aIRequestLog.count({
  where: {
    createdAt: { gte: periodStart, lte: periodEnd },
    resolvedBy: "ai",
  },
});

// Source: ESTIMATED_INFRA_COST_PER_DAY × daysElapsed × activeCompanyCount
const infraCostMtd = Math.round(
  INFRA_COST_PER_DAY * daysElapsed * activeRuntimeCount * 100,
) / 100;

// Source: PLAN_REVENUE_MONTHLY_USD pro-rated for MTD
const revenueMtd =
  daysInMonth > 0
    ? Math.round((totalMonthlyRevenue / daysInMonth) * daysElapsed * 100) / 100
    : 0;

// Source: cost-optimizer.getPlatformSavings() — actual cascade savings
let platformSavings: {
  savedUsd: number;
  savingsPct: number;
  totalRequests: number;
  breakdown: { resolvedBy: string; count: number; percentage: number }[];
} | null = null;
try {
  const savingsReport = await getPlatformSavings(periodStart, periodEnd);
  platformSavings = {
    savedUsd: savingsReport.savedUsd,
    savingsPct: savingsReport.savingsPct,
    totalRequests: savingsReport.totalRequests,
    breakdown: savingsReport.breakdown.map((b) => ({
      resolvedBy: b.resolvedBy,
      count: b.count,
      percentage: b.percentage,
    })),
  };
} catch {
  platformSavings = null;
}

// Source: profit-engine.getPlatformProfit() — aggregated profit snapshot
let platformProfit: {
  revenueUsd: number;
  aiCostUsd: number;
  infraCostUsd: number;
  workerCostUsd: number;
  profitUsd: number;
  companyCount: number;
} | null = null;
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
} catch {
  platformProfit = null;
}

// Source: db.invoice.count — for cost-per-invoice unit economics
const invoiceCountMtd = await db.invoice.count({
  where: { createdAt: { gte: periodStart, lte: periodEnd }, deletedAt: null },
});

// Source: db.aIRequestLog.groupBy resolvedBy — cascade breakdown for charts
const cascadeGroups = await db.aIRequestLog.groupBy({
  by: ["resolvedBy"],
  where: { createdAt: { gte: periodStart, lte: periodEnd } },
  _count: true,
});

// ─── Derived metrics ────────────────────────────────────────────────────────

const totalCostMtd = aiCostMtd + infraCostMtd;
const profitMtd = revenueMtd - totalCostMtd;
const profitPct = revenueMtd > 0 ? Math.round((profitMtd / revenueMtd) * 1000) / 10 : 0;

// Source: Unit Economics
const costPerCompany =
  companies.length > 0
    ? Math.round((totalCostMtd / companies.length) * 10000) / 10000
    : 0;
const costPerInvoice =
  invoiceCountMtd > 0
    ? Math.round((aiCostMtd / invoiceCountMtd) * 100000) / 100000
    : 0;
const costPerAiCall =
  aiCallCountMtd > 0
    ? Math.round((aiCostMtd / aiCallCountMtd) * 100000) / 100000
    : 0;

// Source: Forecast — linear projection from MTD run-rate
const dailyAiRate = daysElapsed > 0 ? aiCostMtd / daysElapsed : 0;
const estAiCostEom = Math.round(dailyAiRate * daysInMonth * 100) / 100;
const estInfraEom = Math.round(INFRA_COST_PER_DAY * daysInMonth * activeRuntimeCount * 100) / 100;
const estTotalCostEom = estAiCostEom + estInfraEom;
const estProfitEom = Math.round((totalMonthlyRevenue - estTotalCostEom) * 100) / 100;
const estProfitPctEom =
  totalMonthlyRevenue > 0
    ? Math.round((estProfitEom / totalMonthlyRevenue) * 1000) / 10
    : 0;

// ─── Chart data preparation ────────────────────────────────────────────────

// Source: db.profitSnapshot.findMany — daily P&L for bar chart
const snapshots = await db.profitSnapshot.findMany({
  orderBy: { periodStart: "asc" },
  take: 14,
});

const pnlChartData: DailyPnLPoint[] = snapshots.map((s) => ({
  date: s.periodStart.toISOString().slice(5, 10),
  revenue: Math.round(s.revenueUsd * 100) / 100,
  aiCost: Math.round(s.aiCostUsd * 100) / 100,
  infraCost: Math.round(s.infraCostUsd * 100) / 100,
  profit: Math.round(s.profitUsd * 100) / 100,
}));

// Cascade breakdown for donut chart
const cascadeChartData: CascadeSlice[] = cascadeGroups
  .map((g) => ({
    stage: g.resolvedBy,
    count: g._count,
    pct:
      totalRequestsMtd > 0
        ? Math.round((g._count / totalRequestsMtd) * 1000) / 10
        : 0,
    fill: CASCADE_COLORS[g.resolvedBy] ?? "hsl(0, 0%, 70%)",
  }))
  .sort((a, b) => b.count - a.count);

// Daily cost trend for line chart (aggregate AIRequestLog by day, last 7 days)
const costTrendData: CostTrendPoint[] = [];
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
    where: {
      createdAt: { gte: dayStart, lt: dayEnd },
      resolvedBy: "ai",
    },
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

// ─── Formatting helpers ─────────────────────────────────────────────────────

function fmt(value: number | null | undefined, prefix = "$"): string {
  if (value === null || value === undefined) return "N/A";
  return `${prefix}${value.toFixed(2)}`;
}

function fmtCompact(value: number | null | undefined, prefix = "$"): string {
  if (value === null || value === undefined) return "N/A";
  if (Math.abs(value) >= 1000) return `${prefix}${(value / 1000).toFixed(1)}k`;
  if (Math.abs(value) >= 1) return `${prefix}${value.toFixed(2)}`;
  return `${prefix}${value.toFixed(4)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(1)}%`;
}

function na(value: number): string {
  if (value === 0 && totalRequestsMtd === 0) return "N/A";
  return String(value);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function FinOpsDashboard() {
  const hasData = totalRequestsMtd > 0 || (platformProfit && platformProfit.revenueUsd > 0);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8" dir="ltr">
      <div className="max-w-7xl mx-auto">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">FinOps Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Period: {periodStart.toISOString().slice(0, 10)} &rarr;{" "}
              {periodEnd.toISOString().slice(0, 10)} (current month) &middot; Day{" "}
              {daysElapsed}/{daysInMonth}
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            {companies.length} companies &middot; {activeRuntimeCount} active
          </Badge>
        </div>

        {/* ── KPI Row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            label="Revenue (MTD)"
            value={hasData ? fmt(revenueMtd) : "N/A"}
            detail={`est. ${fmt(totalMonthlyRevenue)}/mo`}
            color="text-emerald-600"
          />
          <KPICard
            label="AI Cost (MTD)"
            value={totalRequestsMtd > 0 ? fmt(aiCostMtd) : "N/A"}
            detail={`${na(totalRequestsMtd)} requests`}
            color="text-red-600"
          />
          <KPICard
            label="Infra Cost (MTD)"
            value={activeRuntimeCount > 0 ? fmt(infraCostMtd) : "N/A"}
            detail={`$${INFRA_COST_PER_DAY}/day × ${activeRuntimeCount} companies`}
            color="text-amber-600"
          />
          <KPICard
            label="Profit (MTD)"
            value={hasData ? fmt(profitMtd) : "N/A"}
            detail={hasData ? `${profitPct >= 0 ? "+" : ""}${fmtPct(profitPct)} margin` : "no data"}
            color={profitMtd >= 0 ? "text-emerald-600" : "text-red-600"}
          />
          <KPICard
            label="AI Saved (cascade)"
            value={platformSavings && platformSavings.savedUsd > 0 ? fmt(platformSavings.savedUsd) : "N/A"}
            detail={platformSavings ? `${fmtPct(platformSavings.savingsPct)} savings rate` : "no request data"}
            color="text-emerald-600"
          />
          <KPICard
            label="Est. Month-End Profit"
            value={hasData ? fmt(estProfitEom) : "N/A"}
            detail={hasData ? `${estProfitPctEom >= 0 ? "+" : ""}${fmtPct(estProfitPctEom)} projected` : "no data"}
            color={estProfitEom >= 0 ? "text-emerald-600" : "text-red-600"}
          />
          <KPICard
            label="Tokens Consumed"
            value={totalTokensMtd > 0 ? `${(totalTokensMtd / 1000).toFixed(1)}k` : "N/A"}
            detail="total input+output tokens"
            color="text-gray-700"
          />
          <KPICard
            label="AI Calls (LLM)"
            value={aiCallCountMtd > 0 ? String(aiCallCountMtd) : "N/A"}
            detail={totalRequestsMtd > 0 ? `${((1 - aiCallCountMtd / totalRequestsMtd) * 100).toFixed(1)}% avoided` : "no data"}
            color="text-gray-700"
          />
        </div>

        {/* ── Tabs: Unit Economics | Trends | Forecast ───────────────── */}
        <Tabs defaultValue="unit-economics" className="space-y-4">
          <TabsList>
            <TabsTrigger value="unit-economics">Unit Economics</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="forecast">Month-End Forecast</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Unit Economics ─────────────────────────────────── */}
          <TabsContent value="unit-economics">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cost per Company</CardTitle>
                  <CardDescription>AI + Infra cost ÷ total companies</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 font-mono">
                    {companies.length > 0 ? fmtCompact(costPerCompany) : "N/A"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    AI: {fmtCompact(aiCostMtd / (companies.length || 1))} + Infra: {fmtCompact(infraCostMtd / (companies.length || 1))} per company
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cost per Invoice</CardTitle>
                  <CardDescription>AI cost ÷ invoices processed this month</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 font-mono">
                    {invoiceCountMtd > 0 ? fmtCompact(costPerInvoice) : "N/A"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {na(invoiceCountMtd)} invoices processed &middot; {fmt(aiCostMtd)} total AI cost
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cost per AI Call</CardTitle>
                  <CardDescription>AI cost ÷ LLM calls (resolvedBy=&apos;ai&apos;)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 font-mono">
                    {aiCallCountMtd > 0 ? fmtCompact(costPerAiCall) : "N/A"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {na(aiCallCountMtd)} LLM calls &middot; {totalTokensMtd > 0 ? `${(totalTokensMtd / (aiCallCountMtd || 1)).toFixed(0)} avg tokens/call` : "no token data"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cascade Efficiency</CardTitle>
                  <CardDescription>
                    Requests resolved without calling LLM
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-600 font-mono">
                    {totalRequestsMtd > 0
                      ? fmtPct(100 - (aiCallCountMtd / totalRequestsMtd) * 100)
                      : "N/A"}
                  </div>
                  <div className="space-y-1 mt-3">
                    {cascadeGroups
                      .sort((a, b) => b._count - a._count)
                      .map((g) => {
                        const pct =
                          totalRequestsMtd > 0
                            ? (g._count / totalRequestsMtd) * 100
                            : 0;
                        return (
                          <div key={g.resolvedBy} className="flex items-center gap-2 text-xs">
                            <span className="w-16 capitalize text-gray-600">
                              {g.resolvedBy}
                            </span>
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: CASCADE_COLORS[g.resolvedBy] ?? "#9ca3af",
                                }}
                              />
                            </div>
                            <span className="w-12 text-right font-mono text-gray-500">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 2: Trends ─────────────────────────────────────────── */}
          <TabsContent value="trends">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Source: db.profitSnapshot — daily revenue vs cost */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Daily Revenue vs Cost</CardTitle>
                  <CardDescription>Source: ProfitSnapshot (last 14 days)</CardDescription>
                </CardHeader>
                <CardContent>
                  <RevenueCostChart data={pnlChartData} />
                </CardContent>
              </Card>

              {/* Source: db.aIRequestLog.groupBy resolvedBy */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cascade Breakdown</CardTitle>
                  <CardDescription>Source: AIRequestLog.resolvedBy (MTD)</CardDescription>
                </CardHeader>
                <CardContent>
                  <CascadeBreakdownChart data={cascadeChartData} />
                  {cascadeChartData.length > 0 && (
                    <div className="flex flex-wrap gap-3 mt-3 justify-center text-xs text-gray-600">
                      {cascadeChartData.map((s) => (
                        <span key={s.stage} className="flex items-center gap-1">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-sm"
                            style={{ backgroundColor: s.fill }}
                          />
                          <span className="capitalize">{s.stage}</span>
                          <span className="font-mono text-gray-500">{s.pct}%</span>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Source: db.aIRequestLog daily aggregate */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">AI Cost vs Savings (7 Days)</CardTitle>
                  <CardDescription>Source: AIRequestLog.costUsd daily aggregate</CardDescription>
                </CardHeader>
                <CardContent>
                  <CostTrendChart data={costTrendData} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 3: Month-End Forecast ─────────────────────────────── */}
          <TabsContent value="forecast">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Estimated Month-End P&L</CardTitle>
                <CardDescription>
                  Linear projection from {daysElapsed}-day run-rate to {daysInMonth}-day month
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Revenue */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Revenue (Monthly)
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 font-mono">
                      {fmt(totalMonthlyRevenue)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {companies.length} companies × plan average
                    </div>
                  </div>

                  {/* AI Cost Forecast */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      AI Cost (Forecast)
                    </div>
                    <div className="text-2xl font-bold text-red-600 font-mono">
                      {hasData ? fmt(estAiCostEom) : "N/A"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      MTD: {fmt(aiCostMtd)} &middot;{" "}
                      {daysElapsed > 0 ? fmtCompact(dailyAiRate) : "N/A"}/day
                    </div>
                  </div>

                  {/* Infra Cost Forecast */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Infra Cost (Forecast)
                    </div>
                    <div className="text-2xl font-bold text-amber-600 font-mono">
                      {activeRuntimeCount > 0 ? fmt(estInfraEom) : "N/A"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      $5/day × {activeRuntimeCount} companies × {daysInMonth} days
                    </div>
                  </div>

                  {/* Profit Forecast */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Profit (Forecast)
                    </div>
                    <div className={`text-2xl font-bold font-mono ${estProfitEom >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {hasData ? fmt(estProfitEom) : "N/A"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {hasData ? `Gross margin: ${estProfitPctEom}%` : "no data"}
                    </div>
                  </div>
                </div>

                {/* Source: profit-engine.getPlatformProfit() — actual snapshot comparison */}
                {platformProfit && platformProfit.revenueUsd > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <div className="text-xs font-medium text-gray-500 mb-3">
                      Actual ProfitSnapshot (aggregated from cron runs)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Revenue:</span>{" "}
                        <span className="font-mono font-medium">{fmt(platformProfit.revenueUsd)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">AI Cost:</span>{" "}
                        <span className="font-mono font-medium">{fmt(platformProfit.aiCostUsd)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Infra:</span>{" "}
                        <span className="font-mono font-medium">{fmt(platformProfit.infraCostUsd)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Profit:</span>{" "}
                        <span className={`font-mono font-medium ${platformProfit.profitUsd >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {fmt(platformProfit.profitUsd)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-gray-400 mt-8">
          Every number sourced from real DB queries. &quot;N/A&quot; = no data available for this period.
          Infrastructure cost is estimated at $5/day per active company (no metering in sandbox).
        </p>
      </div>
    </main>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  detail,
  color = "text-gray-900",
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4 pb-0 pt-0">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
          {label}
        </div>
        <div className={`text-xl font-bold font-mono ${color} mb-0.5`}>
          {value}
        </div>
        <div className="text-xs text-gray-500">{detail}</div>
      </CardContent>
    </Card>
  );
}