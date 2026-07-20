/**
 * /founder-panel/ai-fabric — Phase 8 Task 2: AI Fabric Founder Panel Dashboard
 *
 * Simple server component page showing real platform metrics.
 * Every number has a comment indicating its data source.
 * Uses "N/A" when no data is available — never placeholder/mock numbers.
 *
 * This is a standalone page (no sidebar layout) for founder visibility.
 */

import { db } from "@/lib/db";
import { getPlatformSavings } from "@/lib/ai-fabric/cost-optimizer";
import { getPlatformProfit } from "@/lib/ai-fabric/profit-engine";

// ─── Current month period ───────────────────────────────────────────────────

const now = new Date();
const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

// ─── Data fetching (server-side, no client JS) ─────────────────────────────

// Source: db.company.count — total companies on the platform
const companiesCount = await db.company.count();

// Source: db.companyRuntime.aggregate SUM(workerPoolSize) WHERE status='active'
const activeWorkersAgg = await db.companyRuntime.aggregate({
  where: { status: "active" },
  _sum: { workerPoolSize: true },
  _count: true,
});
const workersActive = activeWorkersAgg._sum.workerPoolSize ?? 0;
// Source: db.companyRuntime._count WHERE status='active' — number of active runtimes
const activeRuntimeCount = activeWorkersAgg._count;

// Source: db.aIRequestLog.aggregate AVG(latencyMs) WHERE resolvedBy='ai'
const aiLatencyAgg = await db.aIRequestLog.aggregate({
  where: {
    resolvedBy: "ai",
    createdAt: { gte: periodStart, lte: periodEnd },
  },
  _avg: { latencyMs: true },
  _count: true,
});
const queueDelay = aiLatencyAgg._avg.latencyMs
  ? Math.round(aiLatencyAgg._avg.latencyMs)
  : null;

// Source: cost-optimizer.getPlatformSavings() — actual savings from cascade
let platformSavings: { savedUsd: number; savingsPct: number } | null = null;
try {
  const savingsReport = await getPlatformSavings(periodStart, periodEnd);
  platformSavings = {
    savedUsd: savingsReport.savedUsd,
    savingsPct: savingsReport.savingsPct,
  };
} catch {
  platformSavings = null;
}

// Source: db.aIRequestLog.groupBy resolvedBy — cascade breakdown percentages
const cascadeGroups = await db.aIRequestLog.groupBy({
  by: ["resolvedBy"],
  where: { createdAt: { gte: periodStart, lte: periodEnd } },
  _count: true,
});
const totalCascadeRequests = cascadeGroups.reduce((sum, g) => sum + g._count, 0);
const cascadeBreakdown: Record<string, number> = {};
for (const group of cascadeGroups) {
  cascadeBreakdown[group.resolvedBy] =
    totalCascadeRequests > 0
      ? Math.round((group._count / totalCascadeRequests) * 1000) / 10
      : 0;
}

// Source: db.profitSnapshot.aggregate SUM(revenueUsd) - SUM(aiCostUsd) — gross AI margin
const profitAgg = await db.profitSnapshot.aggregate({
  where: {
    periodStart: { gte: periodStart },
    periodEnd: { lte: periodEnd },
  },
  _sum: {
    revenueUsd: true,
    aiCostUsd: true,
  },
});
const totalRevenue = profitAgg._sum.revenueUsd ?? 0;
const totalAiCost = profitAgg._sum.aiCostUsd ?? 0;
// Source: grossAiMargin = totalRevenue - totalAiCost (from ProfitSnapshot sums)
const grossAiMargin = Math.round((totalRevenue - totalAiCost) * 100) / 100;

// ─── Helper ─────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined, prefix = "$"): string {
  if (value === null || value === undefined) return "N/A";
  return `${prefix}${value.toFixed(2)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(1)}%`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function AIFabricFounderPanel() {
  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-10" dir="ltr">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          AI Fabric — Founder Panel
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Period: {periodStart.toISOString().slice(0, 10)} → {periodEnd.toISOString().slice(0, 10)}
          {" "}(current month)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* ── Companies ─────────────────────────────────────────────── */}
          {/* Source: db.company.count */}
          <MetricCard
            label="Companies"
            value={String(companiesCount)}
            detail="total platform tenants"
          />

          {/* ── Workers Active ────────────────────────────────────────── */}
          {/* Source: db.companyRuntime.aggregate SUM(workerPoolSize) WHERE status='active' */}
          <MetricCard
            label="Workers Active"
            value={workersActive > 0 ? String(workersActive) : "N/A"}
            detail={`${activeRuntimeCount} active runtimes`}
          />

          {/* ── Queue Delay ───────────────────────────────────────────── */}
          {/* Source: db.aIRequestLog.aggregate AVG(latencyMs) WHERE resolvedBy='ai' */}
          <MetricCard
            label="Queue Delay (AI avg)"
            value={queueDelay !== null ? `${queueDelay}ms` : "N/A"}
            detail="avg latency for AI-resolved requests"
          />

          {/* ── AI Saved ──────────────────────────────────────────────── */}
          {/* Source: cost-optimizer.getPlatformSavings() — savedUsd field */}
          <MetricCard
            label="AI Saved (cascade)"
            value={
              platformSavings
                ? fmt(platformSavings.savedUsd)
                : "N/A"
            }
            detail={
              platformSavings
                ? `${fmtPct(platformSavings.savingsPct)} savings rate`
                : "no request data"
            }
          />

          {/* ── Gross AI Margin ───────────────────────────────────────── */}
          {/* Source: db.profitSnapshot.aggregate SUM(revenueUsd) - SUM(aiCostUsd) */}
          <MetricCard
            label="Gross AI Margin"
            value={totalCascadeRequests > 0 ? fmt(grossAiMargin) : "N/A"}
            detail={totalCascadeRequests > 0 ? `revenue ${fmt(totalRevenue)} − AI cost ${fmt(totalAiCost)}` : "no profit snapshots"}
          />

          {/* ── Cascade Breakdown ─────────────────────────────────────── */}
          {/* Source: db.aIRequestLog.groupBy resolvedBy — percentages */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Cascade Breakdown
            </div>
            <div className="text-lg font-semibold text-gray-900 mb-3">
              {totalCascadeRequests > 0
                ? `${totalCascadeRequests} requests`
                : "N/A"}
            </div>
            <div className="space-y-1 text-sm text-gray-700">
              {/* Source: db.aIRequestLog.groupBy resolvedBy = 'cache' */}
              <Row label="Cache" pct={cascadeBreakdown["cache"]} />
              {/* Source: db.aIRequestLog.groupBy resolvedBy = 'pattern' */}
              <Row label="Pattern" pct={cascadeBreakdown["pattern"]} />
              {/* Source: db.aIRequestLog.groupBy resolvedBy = 'rule' */}
              <Row label="Rule" pct={cascadeBreakdown["rule"]} />
              {/* Source: db.aIRequestLog.groupBy resolvedBy = 'memory' */}
              <Row label="Memory" pct={cascadeBreakdown["memory"]} />
              {/* Source: db.aIRequestLog.groupBy resolvedBy = 'ai' */}
              <Row label="LLM Usage" pct={cascadeBreakdown["ai"]} />
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-8">
          Every number sourced from real DB queries. &quot;N/A&quot; = no data available for this period.
        </p>
      </div>
    </main>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-xs text-gray-500">{detail}</div>
    </div>
  );
}

function Row({ label, pct }: { label: string; pct: number | undefined }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono">
        {pct !== undefined ? `${pct.toFixed(1)}%` : "N/A"}
      </span>
    </div>
  );
}