/**
 * /founder-panel/mission-control — AI Mission Control Dashboard
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL CHANGE (v12.1):
 *
 * This is now a CLIENT COMPONENT that fetches data from the API route:
 *   GET /api/founder-panel/mission-control
 *
 * WHY: The previous Server Component version executed Prisma queries at
 * module level, causing Next.js to attempt database connections during
 * `next build`. This failed in CI/CD with "Error code 14: Unable to open
 * the database file" because no database exists during build.
 *
 * BENEFITS:
 * ✅ No Prisma imports in this file (build-safe)
 * ✅ Data fetched at runtime only (client-side fetch)
 * ✅ Can implement real-time polling without full page refresh
 * ✅ Build succeeds even without database available
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA SOURCES (now via API):
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
 * ═══════════════════════════════════════════════════════════════════════════
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MissionControlData {
  companiesOnline: number;
  totalWorkers: number;
  workerMap: Record<string, number>;
  queueDepths: Record<string, number>;
  totalQueueDepth: number;
  avgLatencyMs: number | null;
  aiCallsPerSec: number;
  callsPerMinute5m: number;
  cascadePcts: Record<string, number>;
  savingsToday: { savedUsd: number; savingsPct: number } | null;
  savingsMonthly: { savedUsd: number; savingsPct: number } | null;
  grossMarginPct: number | null;
  providerHealthCount: number;
  tokenRateLastHour: number | null;
  timestamp: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PLAN_REVENUE_MONTHLY_USD: Record<string, number> = {
  trial: 0,
  starter: 29,
  business: 99,
  enterprise: 299,
};

const POLLING_INTERVAL_MS = 10000; // Refresh every 10 seconds

// ─── Helper Components ─────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  unit,
  subtitle,
  trend,
  status,
}: {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  trend?: "up" | "down" | "stable";
  status?: "healthy" | "warning" | "critical";
}) {
  const statusColors = {
    healthy: "text-green-400",
    warning: "text-yellow-400",
    critical: "text-red-400",
  };

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-mono font-bold ${status ? statusColors[status] : "text-white"}`}>
            {value}
          </span>
          {unit && <span className="text-sm text-gray-500">{unit}</span>}
        </div>
        {(subtitle || trend) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            {trend === "up" && <span>↑</span>}
            {trend === "down" && <span>↓</span>}
            {trend === "stable" && <span>→</span>}
            {subtitle && <span>{subtitle}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "online" | "offline" | "degraded" }) {
  const variants = {
    online: "bg-green-500/20 text-green-400 border-green-500/30",
    offline: "bg-red-500/20 text-red-400 border-red-500/30",
    degraded: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };

  return (
    <Badge variant="outline" className={variants[status]}>
      {status === "online" && "● Online"}
      {status === "offline" && "● Offline"}
      {status === "degraded" && "● Degraded"}
    </Badge>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default function MissionControlPage() {
  const [data, setData] = useState<MissionControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch data from API (returns data without setting state — pure function)
  const fetchMissionData = useCallback(async (): Promise<MissionControlData> => {
    const response = await fetch("/api/founder-panel/mission-control");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }, []);

  // State updater (can be called from anywhere)
  const updateData = useCallback((result: MissionControlData) => {
    setData(result);
    setLastUpdated(new Date(result.timestamp));
    setLoading(false);
    setError(null);
  }, []);

  const handleError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[mission-control] Failed to fetch data:", err);
    setError(message);
    setLoading(false);
  }, []);

  // Polling effect — subscribes to external system, calls setState in callback
  useEffect(() => {
    const poll = async () => {
      try {
        const result = await fetchMissionData();
        updateData(result); // setState in async callback, not sync in effect body
      } catch (err) {
        handleError(err);
      }
    };

    // Initial fetch + set up interval
    poll();
    const intervalId = setInterval(poll, POLLING_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [fetchMissionData, updateData, handleError]);

  // Manual refresh handler (for button click)
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMissionData();
      updateData(result);
    } catch (err) {
      handleError(err);
    }
  }, [fetchMissionData, updateData, handleError]);

  // Format helpers
  const formatNumber = (n: number | null | undefined): string => {
    if (n == null) return "N/A";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
  };

  const formatCurrency = (n: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  };

  // Loading state
  if (loading && !data) {
    return (
      <main className="min-h-screen bg-gray-950 p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400 font-mono">Initializing Mission Control...</p>
        </div>
      </main>
    );
  }

  // Error state (with retry)
  if (error && !data) {
    return (
      <main className="min-h-screen bg-gray-950 p-4 md:p-8 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-6xl mb-4">⚠</div>
          <h1 className="text-xl font-bold text-white mb-2">Connection Error</h1>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              handleRefresh();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </main>
    );
  }

  // Main dashboard render
  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8" dir="ltr">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white font-mono tracking-tight">
              ⚡ Mission Control
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              GarfiX EOS v12.0 — Real-time Platform Health
            </p>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge status={data?.companiesOnline ?? 0 > 0 ? "online" : "offline"} />
            {lastUpdated && (
              <span className="text-xs text-gray-500 font-mono">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title="Companies Online"
            value={data?.companiesOnline ?? 0}
            status={(data?.companiesOnline ?? 0) > 0 ? "healthy" : "critical"}
            subtitle="Active tenants"
          />
          <MetricCard
            title="Active Workers"
            value={data?.totalWorkers ?? 0}
            subtitle={`${Object.keys(data?.workerMap ?? {}).length} pools`}
          />
          <MetricCard
            title="Queue Depth"
            value={data?.totalQueueDepth ?? 0}
            unit="jobs"
            status={
              (data?.totalQueueDepth ?? 0) > 100
                ? "warning"
                : (data?.totalQueueDepth ?? 0) > 500
                  ? "critical"
                  : "healthy"
            }
            subtitle={`Pending: ${data?.queueDepths["pending"] ?? 0} | Running: ${data?.queueDepths["running"] ?? 0}`}
          />
          <MetricCard
            title="AI Latency"
            value={formatNumber(data?.avgLatencyMs)}
            unit="ms"
            status={
              (data?.avgLatencyMs ?? 0) < 500
                ? "healthy"
                : (data?.avgLatencyMs ?? 0) < 2000
                  ? "warning"
                  : "critical"
            }
            subtitle="Average (MTD)"
          />
        </div>

        {/* Throughput Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <MetricCard
            title="AI Calls/sec"
            value={formatNumber(data?.aiCallsPerSec)}
            unit="calls/s"
            subtitle="Last 60 seconds"
          />
          <MetricCard
            title="Throughput"
            value={formatNumber(data?.callsPerMinute5m)}
            unit="calls/min"
            subtitle="Last 5 minutes"
          />
          <MetricCard
            title="Token Rate"
            value={formatNumber(data?.tokenRateLastHour)}
            unit="tokens/min"
            subtitle="Last hour average"
          />
        </div>

        {/* Financial & Savings Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title="Savings Today"
            value={data?.savingsToday ? formatCurrency(data.savingsToday.savedUsd) : "N/A"}
            subtitle={data?.savingsToday ? `${data.savingsToday.savingsPct.toFixed(1)}% saved` : "No data"}
          />
          <MetricCard
            title="Savings (MTD)"
            value={data?.savingsMonthly ? formatCurrency(data.savingsMonthly.savedUsd) : "N/A"}
            subtitle={data?.savingsMonthly ? `${data.savingsMonthly.savingsPct.toFixed(1)}% saved` : "No data"}
          />
          <MetricCard
            title="Gross Margin"
            value={data?.grossMarginPct != null ? `${data.grossMarginPct}%` : "N/A"}
            unit="%"
            status={
              (data?.grossMarginPct ?? 0) > 50
                ? "healthy"
                : (data?.grossMarginPct ?? 0) > 20
                  ? "warning"
                  : "critical"
            }
            subtitle="Revenue vs costs"
          />
          <MetricCard
            title="AI Providers"
            value={data?.providerHealthCount ?? 0}
            unit="active"
            subtitle="Enabled models"
          />
        </div>

        {/* Cascade Resolution */}
        <Card className="bg-gray-900 border-gray-800 mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Cascade Resolution Distribution (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.cascadePcts && Object.keys(data.cascadePcts).length > 0 ? (
                Object.entries(data.cascadePcts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([resolver, pct]) => (
                    <div key={resolver} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-32 truncate">{resolver}</span>
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-mono text-gray-300 w-12 text-right">{pct}%</span>
                    </div>
                  ))
              ) : (
                <p className="text-gray-500 text-sm">No cascade data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Worker Pools Detail */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Active Worker Pools
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.workerMap && Object.keys(data.workerMap).length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(data.workerMap).map(([company, count]) => (
                  <div
                    key={company}
                    className="bg-gray-800 rounded-lg p-3 text-center"
                  >
                    <div className="text-lg font-mono font-bold text-blue-400">
                      {count}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-1">{company}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No active worker pools</p>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-gray-800 text-center">
          <p className="text-xs text-gray-600 font-mono">
            GarfiX EOS v12.0 — Mission Control Dashboard • Auto-refreshes every {POLLING_INTERVAL_MS / 1000}s
          </p>
        </footer>
      </div>
    </main>
  );
}
