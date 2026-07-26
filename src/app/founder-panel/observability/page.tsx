/**
 * /founder-panel/observability — Monitoring Dashboard
 *
 * Real-time observability dashboard showing:
 *   1. Circuit Breaker health for all 8 external services
 *   2. Event Bus Audit Trail (tamper-evident log)
 *   3. System Health (DB, Valkey, Queues, Memory)
 *
 * Uses TanStack Query hooks with auto-refresh polling.
 * Arabic-first with RTL layout.
 */

"use client";

import { useCircuitBreakerDashboard, useAuditTrail, useAuditStats, useAuditChainVerification, useSystemHealth, useCircuitBreakerAction } from "@/hooks/queries/observability";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";

// ─── Helper Components ─────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  unit,
  subtitle,
  status,
}: {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  status?: "healthy" | "warning" | "critical";
}) {
  const statusColors = {
    healthy: "text-emerald-400",
    warning: "text-amber-400",
    critical: "text-red-400",
  };
  const borderColors = {
    healthy: "border-emerald-500/20",
    warning: "border-amber-500/20",
    critical: "border-red-500/20",
  };

  return (
    <Card className={`bg-gray-900 ${status ? borderColors[status] : "border-gray-800"} border`}>
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
        {subtitle && (
          <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}

function StateBadge({ state }: { state: "closed" | "open" | "half-open" }) {
  const variants = {
    closed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    open: "bg-red-500/20 text-red-400 border-red-500/30",
    "half-open": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };
  const labels = {
    closed: "سليم",
    open: "مفتوح",
    "half-open": "اختبار",
  };

  return (
    <Badge variant="outline" className={`${variants[state]} font-mono`}>
      {labels[state]}
    </Badge>
  );
}

// ─── Circuit Breaker Section ───────────────────────────────────────────────

function CircuitBreakerPanel() {
  const { data, isLoading, error, refetch } = useCircuitBreakerDashboard();
  const actionMutation = useCircuitBreakerAction();
  const queryClient = useQueryClient();

  const handleAction = async (breakerName: string, action: "reset" | "trip") => {
    await actionMutation.mutateAsync({ action, breaker: breakerName });
    queryClient.invalidateQueries({ queryKey: ["observability", "circuit-breakers"] });
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-400 font-mono">جاري تحميل Circuit Breakers...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center p-8">
        <div className="text-red-400 text-4xl mb-2">⚠</div>
        <p className="text-gray-400">خطأ في الاتصال: {error?.message ?? "غير معروف"}</p>
        <Button variant="outline" onClick={() => refetch()} className="mt-3">إعادة الاتصال</Button>
      </div>
    );
  }

  const summary = data?.summary;
  const breakers = data?.breakers ?? [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="معدل الصحة"
          value={summary?.avgHealthScore ?? 0}
          unit="/ 100"
          status={(summary?.avgHealthScore ?? 0) >= 80 ? "healthy" : (summary?.avgHealthScore ?? 0) >= 50 ? "warning" : "critical"}
          subtitle="نسبة Circuit Breakers السليمة"
        />
        <MetricCard
          title="سليم"
          value={summary?.closed ?? 0}
          subtitle="Circuit Breakers مغلقة (عامل)"
        />
        <MetricCard
          title="مفتوح"
          value={summary?.open ?? 0}
          status={(summary?.open ?? 0) > 0 ? "critical" : "healthy"}
          subtitle="Circuit Breakers مفتوحة (فاصل)"
        />
        <MetricCard
          title="طلب مرفوض"
          value={summary?.totalRejected ?? 0}
          status={(summary?.totalRejected ?? 0) > 10 ? "warning" : "healthy"}
          subtitle="طلبات مرفوضة بسبب Open Breakers"
        />
      </div>

      {/* Breaker Detail Table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            تفاصيل Circuit Breakers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {breakers.map((breaker) => (
              <div
                key={breaker.name}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 hover:bg-gray-800 transition-colors"
              >
                <div className="shrink-0">
                  <StateBadge state={breaker.state} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-white truncate">{breaker.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {breaker.totalRequests} طلب | {breaker.failures} فشل | {breaker.successes} نجاح | {breaker.avgResponseTimeMs.toFixed(0)}ms avg
                  </div>
                </div>
                <div className="shrink-0 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/10"
                    onClick={() => handleAction(breaker.name, "reset")}
                    disabled={actionMutation.isPending || breaker.state === "closed"}
                  >
                    إعادة تعيين
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-red-600/30 text-red-400 hover:bg-red-600/10"
                    onClick={() => handleAction(breaker.name, "trip")}
                    disabled={actionMutation.isPending || breaker.state === "open"}
                  >
                    فصل
                  </Button>
                </div>
              </div>
            ))}
            {breakers.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">لا توجد Circuit Breakers مسجلة</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Audit Trail Section ────────────────────────────────────────────────────

function AuditTrailPanel() {
  const [channelFilter, setChannelFilter] = useState<string | undefined>();
  const { data, isLoading, error, refetch } = useAuditTrail({
    channel: channelFilter,
    limit: 50,
  });
  const statsQuery = useAuditStats();
  const verifyQuery = useAuditChainVerification();

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-400 font-mono">جاري تحميل Audit Trail...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center p-8">
        <div className="text-red-400 text-4xl mb-2">⚠</div>
        <p className="text-gray-400">خطأ: {error?.message ?? "غير معروف"}</p>
        <Button variant="outline" onClick={() => refetch()} className="mt-3">إعادة المحاولة</Button>
      </div>
    );
  }

  const stats = statsQuery.data;
  const verify = verifyQuery.data;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="إجمالي الأحداث"
          value={stats?.totalEvents ?? 0}
          subtitle="أحداث مسجلة في Audit Trail"
        />
        <MetricCard
          title="القنوات"
          value={stats?.channels ? Object.keys(stats.channels).length : 0}
          subtitle="قنوات Event Bus نشطة"
        />
        <MetricCard
          title="سلسلة متسقة"
          value={verify ? `${verify.verified}/${verify.total}` : "—"}
          status={verify && verify.breaches.length === 0 ? "healthy" : verify && verify.breaches.length > 0 ? "critical" : undefined}
          subtitle="أحداث مُحققة / إجمالي"
        />
        <MetricCard
          title="الناشرون"
          value={stats?.publishers ? Object.keys(stats.publishers).length : 0}
          subtitle="ناشرون Event Bus"
        />
      </div>

      {/* Channel Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={channelFilter === undefined ? "default" : "outline"}
          size="sm"
          onClick={() => setChannelFilter(undefined)}
          className="text-xs"
        >
          الكل
        </Button>
        {stats?.channels && Object.entries(stats.channels).sort(([,a],[,b]) => b - a).map(([channel]) => (
          <Button
            key={channel}
            variant={channelFilter === channel ? "default" : "outline"}
            size="sm"
            onClick={() => setChannelFilter(channel)}
            className="text-xs"
          >
            {channel}
          </Button>
        ))}
      </div>

      {/* Events Table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            سجل Audit Trail — آخر {data?.events.length ?? 0} حدث
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {data?.events.map((event) => (
              <div
                key={event.id}
                className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/30 font-mono text-xs shrink-0">
                    {event.channel}
                  </Badge>
                  <span className="font-mono text-gray-300 text-xs">{event.correlationId}</span>
                  <span className="text-gray-500 text-xs ml-auto">
                    {new Date(event.timestamp).toLocaleString("ar-KW", { timeZone: "Asia/Kuwait" })}
                  </span>
                </div>
                <div className="mt-1 text-gray-400 text-xs">
                  الناشر: <span className="text-gray-300 font-mono">{event.publisher}</span>
                  {event.hash && (
                    <span className="ml-2 text-gray-500">
                      hash: <span className="font-mono">{event.hash.slice(0, 12)}...</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            {(data?.events.length ?? 0) === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">لا توجد أحداث في Audit Trail</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── System Health Section ────────────────────────────────────────────────────

function SystemHealthPanel() {
  const { data, isLoading, error, refetch } = useSystemHealth();

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-400 font-mono">جاري تحميل System Health...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center p-8">
        <div className="text-red-400 text-4xl mb-2">⚠</div>
        <p className="text-gray-400">خطأ: {error?.message ?? "غير معروف"}</p>
        <Button variant="outline" onClick={() => refetch()} className="mt-3">إعادة المحاولة</Button>
      </div>
    );
  }

  const checks = data?.checks as Record<string, { ok?: boolean; error?: string; [k: string]: unknown }>;
  const memory = checks?.memory as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className={`rounded-xl p-4 text-center border ${
        data?.status === "ok"
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : "bg-red-500/10 border-red-500/20 text-red-400"
      }`}>
        <div className="text-lg font-bold font-mono">
          {data?.status === "ok" ? "● جميع الأنظمة تعمل" : "● حالة متدهورة"}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          GarfiX EOS v{data?.version ?? "?"} | Uptime: {data?.uptime ? `${Math.round(data.uptime / 60)}min` : "—"} | Latency: {data?.latencyMs ?? "—"}ms
        </div>
      </div>

      {/* Service Health Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {checks && Object.entries(checks).map(([key, value]) => {
          const isOk = value?.ok === true;
          const isCritical = key === "db" || key === "valkey";
          return (
            <MetricCard
              key={key}
              title={key === "db" ? "PostgreSQL" : key === "valkey" ? "Valkey" : key === "queues" ? "BullMQ" : key === "cache" ? "Cache" : key === "memory" ? "Memory" : key === "disk" ? "Disk" : key}
              value={isOk ? "سليم" : value?.error ? "خطأ" : "—"}
              status={isOk ? "healthy" : isCritical ? "critical" : "warning"}
              subtitle={typeof value === "object" && value !== null ? 
                (key === "memory" ? `RSS: ${(value as Record<string, unknown>).rssMB}MB | Heap: ${(value as Record<string, unknown>).heapMB}MB` : 
                 value?.error ? String(value.error) : undefined) : undefined}
            />
          );
        })}
      </div>

      {/* Memory Detail */}
      {memory && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              تفاصيل الذاكرة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              {[
                { label: "RSS", value: `${memory.rssMB}MB` },
                { label: "Heap Used", value: `${memory.heapMB}MB` },
                { label: "Heap Total", value: `${memory.heapTotalMB}MB` },
                { label: "System Total", value: `${memory.systemTotalMB}MB` },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg bg-gray-800/50">
                  <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                  <div className="text-lg font-mono text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ObservabilityDashboard() {
  const healthQuery = useSystemHealth();

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white font-mono tracking-tight">
              📡 لوحة المراقبة
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              GarfiX EOS v12.0 — Circuit Breakers, Audit Trail, System Health
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={
              healthQuery.data?.status === "ok"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/20 text-red-400 border-red-500/30"
            }>
              {healthQuery.data?.status === "ok" ? "● سليم" : "● متدهور"}
            </Badge>
            {healthQuery.data?.timestamp && (
              <span className="text-xs text-gray-500 font-mono">
                آخر تحديث: {new Date(healthQuery.data.timestamp).toLocaleTimeString("ar-KW")}
              </span>
            )}
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="circuit-breakers" className="space-y-6">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="circuit-breakers" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white">
              Circuit Breakers
            </TabsTrigger>
            <TabsTrigger value="audit-trail" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white">
              Audit Trail
            </TabsTrigger>
            <TabsTrigger value="system-health" className="data-[state=active]:bg-gray-800 data-[state=active]:text-white">
              System Health
            </TabsTrigger>
          </TabsList>

          <TabsContent value="circuit-breakers">
            <CircuitBreakerPanel />
          </TabsContent>

          <TabsContent value="audit-trail">
            <AuditTrailPanel />
          </TabsContent>

          <TabsContent value="system-health">
            <SystemHealthPanel />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-gray-800 text-center">
          <p className="text-xs text-gray-600 font-mono">
            GarfiX EOS v12.0 — Monitoring Dashboard • تحديث تلقائي كل 5–10 ثوان
          </p>
        </footer>
      </div>
    </main>
  );
}
