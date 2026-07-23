/**
 * /founder-panel/finops — FinOps Dashboard (Client Component)
 *
 * Build-safe version - fetches data from /api/founder-panel/finops
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  RevenueCostChart,
  CascadeBreakdownChart,
  CostTrendChart,
  type DailyPnLPoint,
  type CascadeSlice,
  type CostTrendPoint,
} from "./finops-charts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FinOpsData {
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
  pnlChartData: DailyPnLPoint[];
  cascadeChartData: CascadeSlice[];
  costTrendData: CostTrendPoint[];
  periodStart: string;
  periodEnd: string;
  daysElapsed: number;
  daysInMonth: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PLAN_REVENUE_MONTHLY_USD: Record<string, number> = {
  trial: 0,
  starter: 29,
  business: 99,
  enterprise: 299,
};

const INFRA_COST_PER_DAY = 5.0;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function na(value: number, total: number): string {
  if (value === 0 && total === 0) return "N/A";
  return String(value);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  detail,
  color = "text-gray-700",
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
}) {
  return (
    <Card className="bg-white border-gray-200">
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <p className="text-xs text-gray-500 mt-1">{detail}</p>
      </CardContent>
    </Card>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default function FinOpsDashboard() {
  const [data, setData] = useState<FinOpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data (pure function)
  const fetchFinOpsData = useCallback(async (): Promise<FinOpsData> => {
    const res = await fetch("/api/founder-panel/finops");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  // State updaters
  const updateData = useCallback((result: FinOpsData) => {
    setData(result);
    setLoading(false);
    setError(null);
  }, []);

  const handleError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : "Unknown error");
    setLoading(false);
  }, []);

  // Effect with setState in async callback
  useEffect(() => {
    const load = async () => {
      try {
        const result = await fetchFinOpsData();
        updateData(result);
      } catch (err) {
        handleError(err);
      }
    };
    load();
  }, [fetchFinOpsData, updateData, handleError]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFinOpsData();
      updateData(result);
    } catch (err) {
      handleError(err);
    }
  }, [fetchFinOpsData, updateData, handleError]);

  // Loading state
  if (loading && !data) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading FinOps Dashboard...</p>
        </div>
      </main>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const hasData = data.totalRequestsMtd > 0 || (data.platformProfit && data.platformProfit.revenueUsd > 0);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8" dir="ltr">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">FinOps Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Period: {data.periodStart.slice(0, 10)} → {data.periodEnd.slice(0, 10)} (current month) · Day{" "}
              {data.daysElapsed}/{data.daysInMonth}
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            {Object.keys(PLAN_REVENUE_MONTHLY_USD).length} companies · {data.activeRuntimeCount} active
          </Badge>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          <KPICard label="Revenue (MTD)" value={hasData ? fmt(data.revenueMtd) : "N/A"} detail={`est. ${fmt(data.totalMonthlyRevenue)}/mo`} color="text-emerald-600" />
          <KPICard label="AI Cost (MTD)" value={data.totalRequestsMtd > 0 ? fmt(data.aiCostMtd) : "N/A"} detail={`${na(data.totalRequestsMtd, data.totalRequestsMtd)} requests`} color="text-red-600" />
          <KPICard label="Infra Cost (MTD)" value={data.activeRuntimeCount > 0 ? fmt(data.infraCostMtd) : "N/A"} detail={`$${INFRA_COST_PER_DAY}/day × ${data.activeRuntimeCount} companies`} color="text-amber-600" />
          <KPICard label="Profit (MTD)" value={hasData ? fmt(data.profitMtd) : "N/A"} detail={hasData ? `${data.profitPct >= 0 ? "+" : ""}${fmtPct(data.profitPct)} margin` : "no data"} color={data.profitMtd >= 0 ? "text-emerald-600" : "text-red-600"} />
          <KPICard label="AI Saved (cascade)" value={data.platformSavings?.savedUsd ? fmt(data.platformSavings.savedUsd) : "N/A"} detail={data.platformSavings ? `${fmtPct(data.platformSavings.savingsPct)} savings rate` : "no request data"} color="text-emerald-600" />
          <KPICard label="Est. Month-End Profit" value={hasData ? fmt(data.estProfitEom) : "N/A"} detail={hasData ? `${data.estProfitPctEom >= 0 ? "+" : ""}${fmtPct(data.estProfitPctEom)} projected` : "no data"} color={data.estProfitEom >= 0 ? "text-emerald-600" : "text-red-600"} />
          <KPICard label="Tokens Consumed" value={data.totalTokensMtd > 0 ? `${(data.totalTokensMtd / 1000).toFixed(1)}k` : "N/A"} detail="total input+output tokens" color="text-gray-700" />
          <KPICard label="AI Calls (LLM)" value={data.invoiceCountMtd > 0 ? String(Math.round(data.aiCostMtd / data.costPerAiCall)) : "N/A"} detail={data.totalRequestsMtd > 0 ? `${((1 - Math.min(100, (data.aiCostMtd / data.costPerAiCall) / data.totalRequestsMtd)) * 100).toFixed(1)}% avoided` : "no data"} color="text-gray-700" />
        </div>

        {/* Tabs for Charts and Details */}
        <Tabs defaultValue="unit-economics" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="unit-economics">Unit Economics</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          </TabsList>

          {/* Unit Economics Tab */}
          <TabsContent value="unit-economics">
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle>Unit Economics (MTD)</CardTitle>
                <CardDescription>Cost per unit — lower is better</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Cost per Company</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(data.costPerCompany)}</p>
                    <p className="text-xs text-gray-400">total cost ÷ {Object.keys(PLAN_REVENUE_MONTHLY_USD).length} tenants</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Cost per Invoice</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(data.costPerInvoice)}</p>
                    <p className="text-xs text-gray-400">AI cost ÷ {data.invoiceCountMtd} invoices</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Cost per AI Call</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(data.costPerAiCall)}</p>
                    <p className="text-xs text-gray-400">AI cost ÷ LLM calls</p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800">Forecast (Month-End)</p>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-xs text-blue-600">Est. AI Cost</p>
                      <p className="text-lg font-semibold text-blue-900">{fmt(data.estAiCostEom)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">Est. Infra</p>
                      <p className="text-lg font-semibold text-blue-900">{fmt(data.estInfraEom)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">Est. Total</p>
                      <p className="text-lg font-semibold text-blue-900">{fmt(data.estTotalCostEom)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">Est. Profit</p>
                      <p className={`text-lg font-semibold ${data.estProfitEom >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(data.estProfitEom)}</p>
                      <p className="text-xs text-gray-500">{fmtPct(data.estProfitPctEom)} margin</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts">
            <div className="space-y-6">
              <Card className="bg-white border-gray-200">
                <CardHeader>
                  <CardTitle>Daily P&L (Last 14 Days)</CardTitle>
                  <CardDescription>Revenue vs Costs vs Profit</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.pnlChartData.length > 0 ? (
                    <RevenueCostChart data={data.pnlChartData} />
                  ) : (
                    <p className="text-gray-400 text-center py-8">No snapshot data available</p>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-white border-gray-200">
                  <CardHeader>
                    <CardTitle>Cascade Breakdown</CardTitle>
                    <CardDescription>How requests were resolved</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.cascadeChartData.length > 0 ? (
                      <CascadeBreakdownChart data={data.cascadeChartData} />
                    ) : (
                      <p className="text-gray-400 text-center py-8">No cascade data</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-white border-gray-200">
                  <CardHeader>
                    <CardTitle>AI Cost Trend (7 Days)</CardTitle>
                    <CardDescription>Daily AI cost vs savings from cascade</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.costTrendData.length > 0 ? (
                      <CostTrendChart data={data.costTrendData} />
                    ) : (
                      <p className="text-gray-400 text-center py-8">No trend data</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Breakdown Tab */}
          <TabsContent value="breakdown">
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle>Cascade Savings Detail</CardTitle>
              </CardHeader>
              <CardContent>
                {data.platformSavings ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-gray-500">Total Saved</p>
                        <p className="text-xl font-bold text-emerald-600">{fmt(data.platformSavings.savedUsd)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Savings Rate</p>
                        <p className="text-xl font-bold text-emerald-600">{fmtPct(data.platformSavings.savingsPct)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Requests Analyzed</p>
                        <p className="text-xl font-bold text-gray-900">{data.platformSavings.totalRequests}</p>
                      </div>
                    </div>

                    <table className="w-full text-sm mt-4">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 text-gray-500">Resolver</th>
                          <th className="py-2 text-gray-500">Count</th>
                          <th className="py-2 text-gray-500">Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.platformSavings.breakdown.map((b) => (
                          <tr key={b.resolvedBy} className="border-b border-gray-100">
                            <td className="py-2 font-medium capitalize">{b.resolvedBy}</td>
                            <td className="py-2">{b.count}</td>
                            <td className="py-2">{fmtPct(b.percentage)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No savings data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between text-xs text-gray-400">
          <span>Data sourced from Prisma queries · N/A = no data for period</span>
          <button onClick={handleRefresh} className="hover:text-gray-600">↻ Refresh</button>
        </div>
      </div>
    </main>
  );
}
