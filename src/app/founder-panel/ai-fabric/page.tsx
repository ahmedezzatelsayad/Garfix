"use client";

import { useState, useEffect } from "react";
import { useAIFabric } from "@/hooks/queries/founder-panel";

// ─── Types ──────────────────────────────────────────────────────────────────

// Kept locally for rendering convenience (hook uses same shape)
interface _AIFabricData {
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined, prefix = "$"): string {
  if (value === null || value === undefined) return "N/A";
  return `${prefix}${value.toFixed(2)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(1)}%`;
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
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
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

// ─── Main Page Component ───────────────────────────────────────────────────

export default function AIFabricFounderPanel() {
  const { data, isLoading, error, refetch } = useAIFabric();

  // P1: Stage Metrics — توزيع المراحل واتجاه التعلم (من AIRequestLog)
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetch("/api/founder-panel/ai-fabric-metrics", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMetrics)
      .catch(() => {});
  }, []);
  // Loading state
  if (isLoading && !data) {
    return (
      <main className="min-h-screen bg-muted p-6 md:p-10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading AI Fabric...</p>
        </div>
      </main>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <main className="min-h-screen bg-muted p-6 md:p-10 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error?.message ?? "Unknown error"}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const periodStart = new Date(data.periodStart).toISOString().slice(0, 10);
  const periodEnd = new Date(data.periodEnd).toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-muted p-6 md:p-10" dir="ltr">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          AI Fabric — Founder Panel
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Period: {periodStart} → {periodEnd} (current month)
        </p>

        {/* P1: Stage Metrics — الدليل القابل للقياس */}
        {metrics && (
          <div className="mb-10 p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold mb-1">Stage Metrics (P1) — التعلم الحقيقي بالأرقام</h2>
            <p className="text-xs text-muted-foreground mb-4">
              {String(metrics.totalRequests)} طلب خلال {String(metrics.windowDays)} يوم —
              نسبة الحل بدون LLM: <b className="text-emerald-600">{String((metrics.learning as Record<string, unknown>).zeroCostRate)}%</b>
              (كلما ارتفعت = المنصة تتعلم وتوفر أكثر)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
              {((metrics.stages as Array<Record<string, unknown>>) || []).map((st) => (
                <div key={String(st.stage)} className="p-3 rounded-lg bg-gray-50 border text-center">
                  <div className="text-[11px] font-bold text-gray-500 uppercase">{String(st.stage)}</div>
                  <div className="text-xl font-black text-gray-900">{String(st.count)}</div>
                  <div className="text-[10px] text-gray-400">{String(st.share)}% • {String(st.avgLatencyMs)}ms</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500">
              تكلفة كل 1000 طلب: <b>${String((metrics.learning as Record<string, unknown>).costPer1kRequests)}</b>
              {" • "}إجمالي الشهر: <b>${String((metrics.learning as Record<string, unknown>).totalCostUsd)}</b>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Companies */}
          <MetricCard
            label="Companies"
            value={String(data.companiesCount)}
            detail="total platform tenants"
          />

          {/* Workers Active */}
          <MetricCard
            label="Workers Active"
            value={data.workersActive > 0 ? String(data.workersActive) : "N/A"}
            detail={`${data.activeRuntimeCount} active runtimes`}
          />

          {/* Queue Delay */}
          <MetricCard
            label="Queue Delay (AI avg)"
            value={data.queueDelay !== null ? `${data.queueDelay}ms` : "N/A"}
            detail="avg latency for AI-resolved requests"
          />

          {/* AI Saved */}
          <MetricCard
            label="AI Saved (cascade)"
            value={data.platformSavings ? fmt(data.platformSavings.savedUsd) : "N/A"}
            detail={
              data.platformSavings
                ? `${fmtPct(data.platformSavings.savingsPct)} savings rate`
                : "no request data"
            }
          />

          {/* Gross AI Margin */}
          <MetricCard
            label="Gross AI Margin"
            value={data.totalCascadeRequests > 0 ? fmt(data.grossAiMargin) : "N/A"}
            detail={data.totalCascadeRequests > 0 ? `revenue ${fmt(data.totalRevenue)} − AI cost ${fmt(data.totalAiCost)}` : "no profit snapshots"}
          />

          {/* Cascade Breakdown */}
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Cascade Breakdown
            </div>
            <div className="text-lg font-semibold text-gray-900 mb-3">
              {data.totalCascadeRequests > 0 ? `${data.totalCascadeRequests} requests` : "N/A"}
            </div>
            <div className="space-y-1 text-sm text-gray-700">
              <Row label="Cache" pct={data.cascadeBreakdown["cache"]} />
              <Row label="Pattern" pct={data.cascadeBreakdown["pattern"]} />
              <Row label="Rule" pct={data.cascadeBreakdown["rule"]} />
              <Row label="Memory" pct={data.cascadeBreakdown["memory"]} />
              <Row label="LLM Usage" pct={data.cascadeBreakdown["ai"]} />
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          Every number sourced from real DB queries. &quot;N/A&quot; = no data available for this period.
        </p>
      </div>
    </main>
  );
}
