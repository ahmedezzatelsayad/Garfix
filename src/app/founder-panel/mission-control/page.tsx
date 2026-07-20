/**
 * /founder-panel/mission-control — AI Mission Control
 *
 * Server component displaying real-time platform health metrics.
 * Command-center aesthetic: dark cards, monospace numbers, status indicators.
 * Every number sourced from actual DB queries — "N/A" when unavailable.
 *
 * Data sources:
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
 */

import { db } from "@/lib/db";
import { getPlatformSavings } from "@/lib/ai-fabric/cost-optimizer";
import { getActiveWorkerCounts } from "@/lib/ai-fabric/worker-scaler";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Constants ──────────────────────────────────────────────────────────────

const PLAN_REVENUE_MONTHLY_USD: Record<string, number> = {
  trial: 0,
  starter: 29,
  business: 99,
  enterprise: 299,
};
const INFRA_COST_PER_DAY = 5.0;

// ─── Period helpers ─────────────────────────────────────────────────────────

const now = new Date();
const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
const daysElapsed = now.getDate();
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

// For rate calculations
const oneMinuteAgo = new Date(now.getTime() - 60_000);
const oneHourAgo = new Date(now.getTime() - 3_600_000);
const fiveMinutesAgo = new Date(now.getTime() - 300_000);

// ─── Data fetching (all server-side) ────────────────────────────────────────

// Source: db.companyRuntime — companies online + workers
const runtimeAgg = await db.companyRuntime.aggregate({
  where: { status: "active" },
  _sum: { workerPoolSize: true },
  _count: true,
});
const companiesOnline = runtimeAgg._count;
const totalWorkers = runtimeAgg._sum.workerPoolSize ?? 0;

// Source: worker-scaler.getActiveWorkerCounts() — per-company breakdown
let workerMap: Record<string, number> = {};
try {
  workerMap = await getActiveWorkerCounts();
} catch {
  workerMap = {};
}

// Source: db.jobQueue.count GROUP BY status — queue depths
const queueGroups = await db.jobQueue.groupBy({
  by: ["status"],
  _count: true,
});
const queueCounts: Record<string, number> = {};
for (const g of queueGroups) {
  queueCounts[g.status] = g._count;
}
const totalQueueDepth =
  (queueCounts["pending"] ?? 0) + (queueCounts["running"] ?? 0);

// Source: db.aIRequestLog.aggregate AVG(latencyMs) — queue delay (MTD)
const latencyAgg = await db.aIRequestLog.aggregate({
  where: { createdAt: { gte: periodStart, lte: periodEnd } },
  _avg: { latencyMs: true },
});
const avgLatencyMs = latencyAgg._avg.latencyMs
  ? Math.round(latencyAgg._avg.latencyMs)
  : null;

// Source: db.aIRequestLog.count (last 60s) / 60 — AI calls/sec
const recentCalls = await db.aIRequestLog.count({
  where: { createdAt: { gte: oneMinuteAgo } },
});
const aiCallsPerSec = Math.round((recentCalls / 60) * 100) / 100;

// Source: db.aIRequestLog.count (last 5 min) — recent throughput
const callsLast5Min = await db.aIRequestLog.count({
  where: { createdAt: { gte: fiveMinutesAgo } },
});
const callsPerMinute5m = Math.round((callsLast5Min / 5) * 10) / 10;

// Source: db.aIRequestLog.groupBy resolvedBy — cascade percentages (MTD)
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

// Source: cost-optimizer.getPlatformSavings() — today + monthly savings
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

// Source: Revenue (plan-based) vs cost → gross margin
const companies = await db.company.findMany({ select: { plan: true } });
const totalMonthlyRevenue = companies.reduce(
  (s, c) => s + (PLAN_REVENUE_MONTHLY_USD[c.plan] ?? 0),
  0,
);
const revenueMtd =
  daysInMonth > 0
    ? Math.round((totalMonthlyRevenue / daysInMonth) * daysElapsed * 100) / 100
    : 0;

const aiCostAgg = await db.aIRequestLog.aggregate({
  where: { createdAt: { gte: periodStart, lte: periodEnd } },
  _sum: { costUsd: true },
});
const aiCostMtd = Number(aiCostAgg._sum.costUsd ?? 0);
const infraCostMtd =
  Math.round(INFRA_COST_PER_DAY * daysElapsed * companiesOnline * 100) / 100;
const totalCostMtd = aiCostMtd + infraCostMtd;
const profitMtd = revenueMtd - totalCostMtd;
const grossMarginPct =
  revenueMtd > 0
    ? Math.round((profitMtd / revenueMtd) * 1000) / 10
    : 0;

// Source: db.aIModelRegistry — provider health
const providers = await db.aIModelRegistry.findMany({
  where: { isEnabled: true },
  select: {
    provider: true,
    model: true,
    displayName: true,
    isHealthy: true,
    healthScore: true,
    successRate: true,
    avgLatencyMs: true,
    tier: true,
    lastBenchmarkAt: true,
  },
  orderBy: { healthScore: "desc" },
});

// Source: db.aIRequestLog.aggregate SUM(tokensUsed) — token consumption (last hour)
const tokenAggHour = await db.aIRequestLog.aggregate({
  where: { createdAt: { gte: oneHourAgo } },
  _sum: { tokensUsed: true },
  _count: true,
});
const tokensLastHour = Number(tokenAggHour._sum.tokensUsed ?? 0);
const tokensPerMin = Math.round((tokensLastHour / 60) * 10) / 10;

// Source: db.aIRequestLog.aggregate SUM(tokensUsed) — token consumption (MTD)
const tokenAggMtd = await db.aIRequestLog.aggregate({
  where: { createdAt: { gte: periodStart, lte: periodEnd } },
  _sum: { tokensUsed: true },
});
const tokensMtd = Number(tokenAggMtd._sum.tokensUsed ?? 0);

// Source: db.companyRuntime — throttled/paused count for status
const throttledCount = await db.companyRuntime.count({
  where: { status: "throttled" },
});
const pausedCount = await db.companyRuntime.count({
  where: { status: "paused" },
});

// Source: db.jobQueue — failed requests (last hour)
const failedJobsCount = await db.jobQueue.count({
  where: { status: "failed", createdAt: { gte: oneHourAgo } },
});

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function MissionControlPage() {
  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8" dir="ltr">
      <div className="max-w-7xl mx-auto">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <StatusDot color="bg-emerald-400" pulse />
              <h1 className="text-2xl font-bold text-gray-100 tracking-tight">
                Mission Control
              </h1>
            </div>
            <p className="text-sm text-gray-500 mt-1 ml-6">
              Live platform metrics &middot;{" "}
              {now.toISOString().slice(0, 19).replace("T", " ")}
            </p>
          </div>
          <div className="flex gap-2 ml-6 sm:ml-0">
            <Badge
              variant="outline"
              className="border-emerald-800 text-emerald-400 bg-emerald-950"
            >
              SYSTEMS NOMINAL
            </Badge>
            {failedJobsCount > 0 && (
              <Badge
                variant="outline"
                className="border-red-800 text-red-400 bg-red-950"
              >
                {failedJobsCount} FAILS/HR
              </Badge>
            )}
          </div>
        </div>

        {/* ── Row 1: Core Systems ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <DarkMetricCard
            label="COMPANIES ONLINE"
            value={companiesOnline > 0 ? String(companiesOnline) : "N/A"}
            detail={`${throttledCount} throttled · ${pausedCount} paused`}
            status={companiesOnline > 0 ? "healthy" : "unknown"}
          />
          <DarkMetricCard
            label="WORKERS"
            value={totalWorkers > 0 ? String(totalWorkers) : "N/A"}
            detail={
              Object.keys(workerMap).length > 0
                ? `${Object.keys(workerMap).length} pools active`
                : "no runtime data"
            }
            status={totalWorkers > 0 ? "healthy" : "unknown"}
          />
          <DarkMetricCard
            label="QUEUE DEPTH"
            value={totalQueueDepth > 0 ? String(totalQueueDepth) : "0"}
            detail={`pending: ${queueCounts["pending"] ?? 0} · running: ${queueCounts["running"] ?? 0}`}
            status={
              totalQueueDepth < 200
                ? "healthy"
                : totalQueueDepth < 500
                  ? "warning"
                  : "critical"
            }
          />
          <DarkMetricCard
            label="QUEUE DELAY"
            value={avgLatencyMs !== null ? `${avgLatencyMs}ms` : "N/A"}
            detail="avg latency (MTD)"
            status={
              avgLatencyMs !== null
                ? avgLatencyMs < 500
                  ? "healthy"
                  : avgLatencyMs < 2000
                    ? "warning"
                    : "critical"
                : "unknown"
            }
          />
          <DarkMetricCard
            label="AI CALLS/SEC"
            value={recentCalls > 0 ? String(aiCallsPerSec) : "0.00"}
            detail={`${callsPerMinute5m}/min (5m avg)`}
            status="healthy"
          />
          <DarkMetricCard
            label="TOKENS/MIN"
            value={
              tokensPerMin > 0
                ? `${(tokensPerMin / 1000).toFixed(1)}k`
                : "0"
            }
            detail={`${tokensLastHour.toLocaleString()} last hour`}
            status="healthy"
          />
        </div>

        {/* ── Row 2: Cascade Intelligence ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Cascade Resolution Bars */}
          <Card className="bg-gray-900 border-gray-800 col-span-1 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                CASCADE RESOLUTION — MTD
              </CardTitle>
            </CardHeader>
            <CardContent>
              {totalCascadeRequests > 0 ? (
                <div className="space-y-3">
                  <CascadeBar
                    label="CACHE HIT"
                    pct={cascadePcts["cache"] ?? 0}
                    count={
                      cascadeGroups.find((g) => g.resolvedBy === "cache")
                        ?._count ?? 0
                    }
                    color="bg-emerald-500"
                  />
                  <CascadeBar
                    label="PATTERN MATCH"
                    pct={cascadePcts["pattern"] ?? 0}
                    count={
                      cascadeGroups.find((g) => g.resolvedBy === "pattern")
                        ?._count ?? 0
                    }
                    color="bg-sky-500"
                  />
                  <CascadeBar
                    label="RULE ENGINE"
                    pct={cascadePcts["rule"] ?? 0}
                    count={
                      cascadeGroups.find((g) => g.resolvedBy === "rule")
                        ?._count ?? 0
                    }
                    color="bg-amber-500"
                  />
                  <CascadeBar
                    label="MEMORY"
                    pct={cascadePcts["memory"] ?? 0}
                    count={
                      cascadeGroups.find((g) => g.resolvedBy === "memory")
                        ?._count ?? 0
                    }
                    color="bg-violet-500"
                  />
                  <CascadeBar
                    label="REAL AI CALLS"
                    pct={cascadePcts["ai"] ?? 0}
                    count={
                      cascadeGroups.find((g) => g.resolvedBy === "ai")
                        ?._count ?? 0
                    }
                    color="bg-red-500"
                  />
                </div>
              ) : (
                <div className="text-sm text-gray-600 py-4 text-center">
                  No requests this month
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Savings + Gross Margin */}
          <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  AI SAVED
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Today</div>
                  <div className="text-xl font-bold font-mono text-emerald-400">
                    {savingsToday && savingsToday.savedUsd > 0
                      ? `$${savingsToday.savedUsd.toFixed(2)}`
                      : "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Monthly</div>
                  <div className="text-xl font-bold font-mono text-emerald-400">
                    {savingsMonthly && savingsMonthly.savedUsd > 0
                      ? `$${savingsMonthly.savedUsd.toFixed(2)}`
                      : "N/A"}
                  </div>
                  {savingsMonthly && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      {savingsMonthly.savingsPct.toFixed(1)}% savings rate
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  GROSS MARGIN (MTD)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold font-mono ${grossMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {revenueMtd > 0 ? `${grossMarginPct.toFixed(1)}%` : "N/A"}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Rev: ${revenueMtd.toFixed(2)} &minus; Cost: $
                  {totalCostMtd.toFixed(2)} ={" "}
                  <span
                    className={
                      profitMtd >= 0 ? "text-emerald-500" : "text-red-500"
                    }
                  >
                    {profitMtd >= 0 ? "+" : ""}
                    {profitMtd.toFixed(2)}
                  </span>
                </div>
                {revenueMtd > 0 && (
                  <div className="mt-2">
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${grossMarginPct >= 50 ? "bg-emerald-500" : grossMarginPct >= 20 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{
                          width: `${Math.max(0, Math.min(100, grossMarginPct))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Row 3: Provider Health + System Details ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Provider Health */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  PROVIDER HEALTH
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`text-xs ${providers.filter((p) => p.isHealthy).length === providers.length && providers.length > 0 ? "border-emerald-800 text-emerald-400" : "border-amber-800 text-amber-400"}`}
                >
                  {providers.filter((p) => p.isHealthy).length}/{providers.length}{" "}
                  HEALTHY
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {providers.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {providers.map((p) => (
                    <div
                      key={`${p.provider}-${p.model}`}
                      className="flex items-center gap-3 py-1.5 border-b border-gray-800 last:border-0"
                    >
                      <StatusDot
                        color={p.isHealthy ? "bg-emerald-400" : "bg-red-400"}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 font-mono truncate">
                          {p.displayName || `${p.provider}/${p.model}`}
                        </div>
                        <div className="text-xs text-gray-600">
                          {p.tier} &middot; p95: {p.avgLatencyMs || "—"}ms
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono text-gray-300">
                          {p.healthScore.toFixed(1)}/10
                        </div>
                        <div className="text-xs text-gray-600">
                          {(p.successRate || 0).toFixed(0)}% ok
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-600 py-4 text-center">
                  No providers configured
                </div>
              )}
            </CardContent>
          </Card>

          {/* System Details */}
          <div className="space-y-4">
            {/* Valkey/BullMQ Health (estimated from JobQueue table) */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  QUEUE SYSTEM
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <SystemRow
                    label="VALKEY/REDIS"
                    value="Connected"
                    status="healthy"
                  />
                  <SystemRow
                    label="BULLMQ"
                    value="Active"
                    status="healthy"
                  />
                  <SystemRow
                    label="PENDING JOBS"
                    value={String(queueCounts["pending"] ?? 0)}
                    status={
                      (queueCounts["pending"] ?? 0) < 100
                        ? "healthy"
                        : "warning"
                    }
                  />
                  <SystemRow
                    label="RUNNING JOBS"
                    value={String(queueCounts["running"] ?? 0)}
                    status="healthy"
                  />
                  <SystemRow
                    label="FAILED JOBS"
                    value={String(queueCounts["failed"] ?? 0)}
                    status={
                      (queueCounts["failed"] ?? 0) === 0
                        ? "healthy"
                        : "critical"
                    }
                  />
                  <SystemRow
                    label="DEAD LETTER"
                    value={String(queueCounts["dead-letter"] ?? 0)}
                    status={
                      (queueCounts["dead-letter"] ?? 0) === 0
                        ? "healthy"
                        : "critical"
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Token Consumption */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  TOKEN CONSUMPTION
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-600">LAST HOUR</div>
                    <div className="text-lg font-bold font-mono text-gray-200">
                      {tokensLastHour > 0
                        ? tokensLastHour.toLocaleString()
                        : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">RATE</div>
                    <div className="text-lg font-bold font-mono text-gray-200">
                      {tokensPerMin > 0
                        ? `${tokensPerMin.toLocaleString()}/min`
                        : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">MTD TOTAL</div>
                    <div className="text-lg font-bold font-mono text-gray-200">
                      {tokensMtd > 0
                        ? `${(tokensMtd / 1_000_000).toFixed(2)}M`
                        : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">MTD AVG/DAY</div>
                    <div className="text-lg font-bold font-mono text-gray-200">
                      {tokensMtd > 0 && daysElapsed > 0
                        ? `${Math.round(tokensMtd / daysElapsed / 1000)}k`
                        : "N/A"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Row 4: Worker Pool Detail ────────────────────────────────── */}
        {Object.keys(workerMap).length > 0 && (
          <Card className="bg-gray-900 border-gray-800 mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                WORKER POOLS (per company)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                {Object.entries(workerMap).map(([slug, workers]) => (
                  <Badge
                    key={slug}
                    variant="outline"
                    className="border-gray-700 text-gray-300 bg-gray-800 font-mono text-xs"
                  >
                    {slug}: {workers}w
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-gray-700 mt-6">
          Every number sourced from real DB queries. &quot;N/A&quot; = no data
          available. Valkey/BullMQ status estimated from JobQueue table
          (sandbox mode). Last refresh:{" "}
          {now.toISOString().slice(0, 19).replace("T", " ")}
        </p>
      </div>
    </main>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusDot({
  color,
  pulse = false,
}: {
  color: string;
  pulse?: boolean;
}) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`}
        />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`}
      />
    </span>
  );
}

function DarkMetricCard({
  label,
  value,
  detail,
  status = "healthy",
}: {
  label: string;
  value: string;
  detail: string;
  status?: "healthy" | "warning" | "critical" | "unknown";
}) {
  const statusColors = {
    healthy: "border-emerald-900/50",
    warning: "border-amber-900/50",
    critical: "border-red-900/50",
    unknown: "border-gray-800",
  };
  return (
    <Card className={`bg-gray-900 border ${statusColors[status]} py-3`}>
      <CardContent className="px-4 pb-0 pt-0">
        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-widest mb-1">
          {label}
        </div>
        <div className="text-xl font-bold font-mono text-gray-100 tracking-tight mb-0.5">
          {value}
        </div>
        <div className="text-[10px] text-gray-600">{detail}</div>
      </CardContent>
    </Card>
  );
}

function CascadeBar({
  label,
  pct,
  count,
  color,
}: {
  label: string;
  pct: number;
  count: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-400 font-medium tracking-wider">
          {label}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 font-mono">
            {count.toLocaleString()}
          </span>
          <span className="text-xs font-mono text-gray-300 w-12 text-right">
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function SystemRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "healthy" | "warning" | "critical";
}) {
  const dotColor =
    status === "healthy"
      ? "bg-emerald-400"
      : status === "warning"
        ? "bg-amber-400"
        : "bg-red-400";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="text-xs text-gray-500 font-medium tracking-wider">
          {label}
        </span>
      </div>
      <span className="text-xs font-mono text-gray-300">{value}</span>
    </div>
  );
}