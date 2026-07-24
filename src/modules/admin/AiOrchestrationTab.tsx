"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Network, RefreshCw, Zap, Gauge, Activity } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { KpiCard } from "./shared-helpers";

/**
 * AI Orchestration Layer — Model Registry + Smart Router + Health Score +
 * Cost Optimizer dashboard.
 *
 * Surfaces the self-tuning AI model fleet: each model's live health score
 * (success + latency + cost + quality), the capability→primary-model routing
 * matrix, the cost-optimizer decision counts (pattern/cache hits = savings),
 * and a "Run Benchmark Now" button that re-tests every enabled model.
 */
export function AiOrchestrationTab() {
  const [data, setData] = useState<null | {
    registry: Array<{
      id: number; provider: string; model: string; displayName: string;
      capabilities: string[]; tier: string; costPer1kIn: number; costPer1kOut: number;
      maxTokens: number; contextWindow: number; isEnabled: boolean; isHealthy: boolean;
      healthScore: number; successRate: number; avgLatencyMs: number; p95LatencyMs: number;
      avgQualityScore: number; totalBenchmarks: number;
      lastBenchmarkAt: string | null; lastError: string | null;
    }>;
    routingMatrix: Array<{
      capability: string;
      primary: { provider: string; model: string; displayName: string; healthScore: number; tier: string } | null;
      candidateCount: number;
    }>;
    optimizerStats: {
      counts: { "use-pattern": number; "use-cache": number; "route-free": number; "route-best": number };
      callsAvoided: number;
      estSavingsUsd: number;
    };
    recentBenchmarks: Array<{
      id: number; modelRegistryId: number; capability: string; success: boolean;
      latencyMs: number; tokensIn: number; tokensOut: number; responseQuality: number;
      errorMessage: string | null; createdAt: string;
    }>;
  }>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/ai-orchestration");
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const runBenchmark = useCallback(async () => {
    setRunning(true);
    try {
      const res = await authedFetch("/api/platform-admin/ai-orchestration/run-benchmark", { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        toast.success(`اكتمل الاختبار: ${d.passed}/${d.totalTests} اختبار ناجح`);
        await load();
      } else {
        toast.error(d.error || "فشل تشغيل الاختبار");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الاتصال");
    } finally {
      setRunning(false);
    }
  }, [load]);

  const toggleModel = useCallback(async (provider: string, model: string, isEnabled: boolean) => {
    try {
      const res = await authedFetch("/api/platform-admin/ai-orchestration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, isEnabled }),
      });
      if (res.ok) {
        toast.success(isEnabled ? "تم تفعيل النموذج" : "تم تعطيل النموذج");
        await load();
      } else {
        toast.error("فشل التحديث");
      }
    } catch {
      toast.error("فشل الاتصال");
    }
  }, [load]);

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;
  if (!data) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">تعذّر تحميل البيانات</div>;

  const fmtMs = (ms: number | null): string => {
    if (!ms) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };
  const healthColor = (s: number) => s >= 7 ? "#10b981" : s >= 4 ? "#f59e0b" : "#ef4444";
  const tierBadge = (tier: string) => tier === "free"
    ? { bg: "#dcfce7", fg: "#16a34a", label: "مجاني" }
    : { bg: "#fef3c7", fg: "#d97706", label: "مدفوع" };
  const capLabel: Record<string, string> = {
    chat: "محادثة", "invoice-extraction": "استخراج الفواتير", reasoning: "استدلال", vision: "رؤية",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header + Run Benchmark button */}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-extrabold flex items-center gap-2">
            <Network className="text-violet-600" size={18} /> طبقة تنسيق الذكاء الاصطناعي
          </h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            سجل النماذج + درجة الصحة + التوجيه الذكي + مُحسّن التكلفة — اختيار النموذج آلي بناءً على بيانات الأداء الحية
          </p>
        </div>
        <button
          onClick={runBenchmark}
          disabled={running}
          className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-[10px] border border-[var(--border)] font-inherit text-[13px] font-bold" /* TAILWINDBREAK: dynamic bg/color/opacity/cursor */ style={{ background: running ? "var(--muted)" : "#7c3aed", color: running ? "var(--muted-foreground)" : "#fff", cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1 }}
        >
          {running ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} />}
          {running ? "جارٍ الاختبار…" : "تشغيل الاختبار الآن"}
        </button>
      </div>

      {/* KPI row: optimizer impact */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <KpiCard label="نداءات وُفّرت (Pattern)" value={data.optimizerStats.counts["use-pattern"]} color="#10b981" />
        <KpiCard label="نداءات وُفّرت (Cache)" value={data.optimizerStats.counts["use-cache"]} color="#3b82f6" />
        <KpiCard label="تُوجّه لمجاني" value={data.optimizerStats.counts["route-free"]} color="#7c3aed" />
        <KpiCard label="تُوجّه للأفضل" value={data.optimizerStats.counts["route-best"]} color="#f59e0b" />
        <KpiCard label="إجمالي NDاءات متجنّبة" value={data.optimizerStats.callsAvoided} color="#10b981" />
        <KpiCard label="توفير تقديري ($)" value={data.optimizerStats.estSavingsUsd.toFixed(4)} color="#10b981" />
      </div>

      {/* Routing matrix — primary model per capability */}
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-b-[var(--border)]">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Gauge className="text-violet-600" size={16} /> مصفوفة التوجيه (النموذج الأساسي لكل قدرة)
          </h3>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
            لكل قدرة، يختار النظام تلقائيًا النموذج الأعلى صحةً والمتاح — لا ربط دائم باسم نموذج
          </p>
        </div>
        <div className="garfix-scroll overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead><tr className="bg-[var(--muted)]">
              <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">القدرة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النموذج الأساسي</th>
              <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المزوّد</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">درجة الصحة</th>
              <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الطبقة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">عدد المرشحين</th>
            </tr></thead>
            <tbody>
              {data.routingMatrix.map((r) => {
                const tb = r.primary ? tierBadge(r.primary.tier) : null;
                return (
                  <tr className="border-b border-b-[var(--border)]" key={r.capability}>
                    <td className="px-3 py-2.5 text-[13px] font-bold">{capLabel[r.capability] || r.capability}</td>
                    <td className="px-3 py-2.5 font-mono text-[12px] [direction:ltr] text-right">
                      {r.primary ? r.primary.displayName : <span className="text-[var(--muted-foreground)]">— لا يوجد مرشح سليم —</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">{r.primary?.provider || "—"}</td>
                    <td className="px-3 py-2.5 text-[13px] font-bold">
                      {r.primary ? (
                        <span /* TAILWINDBREAK: dynamic color */ style={{ color: healthColor(r.primary.healthScore) }}>{r.primary.healthScore.toFixed(1)} / 10</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      {tb ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold" /* TAILWINDBREAK: dynamic bg/color */ style={{ background: tb.bg, color: tb.fg }}>{tb.label}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">{r.candidateCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Registry table */}
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-b-[var(--border)]">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Network className="text-violet-600" size={16} /> سجل النماذج ({data.registry.length})
          </h3>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
            كل نموذج + قدراته + طبقته + تكلفته + مقاييس الصحة الحية (تُحدّث تلقائيًا بعد كل اختبار)
          </p>
        </div>
        {data.registry.length === 0 ? (
          <div className="p-6 text-center text-[var(--muted-foreground)] text-xs">
            السجل فارغ — شغّل <code className="bg-[var(--muted)] px-1.5 py-0.5 rounded">bun run scripts/seed-model-registry.ts</code> لملئه
          </div>
        ) : (
          <div className="max-h-[420px] garfix-scroll overflow-x-auto overflow-y-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead><tr className="bg-[var(--muted)] sticky top-0 z-[1]">
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النموذج</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">القدرات</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الطبقة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">درجة الصحة</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النجاح</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">p50</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">p95</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الجودة</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">التكلفة/1k</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الاختبارات</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">آخر اختبار</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الحالة</th>
              </tr></thead>
              <tbody>
                {data.registry.map((m) => {
                  const tb = tierBadge(m.tier);
                  const costStr = m.tier === "free" ? "$0" : `$${m.costPer1kIn.toFixed(4)}/${m.costPer1kOut.toFixed(4)}`;
                  const last = m.lastBenchmarkAt ? new Date(m.lastBenchmarkAt).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";
                  return (
                    <tr className="border-b border-b-[var(--border)]" key={m.id}>
                      <td className="px-3 py-2.5 font-mono text-[11px] [direction:ltr] text-right font-bold">
                        {m.provider}/{m.model}
                      </td>
                      <td className="px-3 py-2.5 text-[13px]">
                        <div className="flex gap-1 flex-wrap">
                          {m.capabilities.map((c) => (
                            <span key={c} className="bg-[var(--muted)] px-1.5 py-px rounded text-[10px] font-semibold">{capLabel[c] || c}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px]"><span className="px-2 py-0.5 rounded-md text-[11px] font-bold" /* TAILWINDBREAK: dynamic bg/color */ style={{ background: tb.bg, color: tb.fg }}>{tb.label}</span></td>
                      <td className="px-3 py-2.5 text-[13px] font-extrabold" /* TAILWINDBREAK: dynamic color */ style={{ color: healthColor(m.healthScore) }}>{m.healthScore.toFixed(1)}</td>
                      <td className="px-3 py-2.5 text-[13px] font-bold" /* TAILWINDBREAK: dynamic color */ style={{ color: m.successRate >= 95 ? "#10b981" : m.successRate >= 80 ? "#f59e0b" : "#ef4444" }}>
                        {m.totalBenchmarks > 0 ? `${m.successRate.toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">{fmtMs(m.avgLatencyMs)}</td>
                      <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right font-bold" /* TAILWINDBREAK: dynamic color */ style={{ color: (m.p95LatencyMs ?? 0) > 5000 ? "#ef4444" : (m.p95LatencyMs ?? 0) > 2000 ? "#f59e0b" : "var(--foreground)" }}>{fmtMs(m.p95LatencyMs)}</td>
                      <td className="px-3 py-2.5 text-[13px] font-bold">{m.totalBenchmarks > 0 ? m.avgQualityScore.toFixed(1) : "—"}</td>
                      <td className="px-3 py-2.5 text-[11px] [direction:ltr] text-right">{costStr}</td>
                      <td className="px-3 py-2.5 text-[13px]">{m.totalBenchmarks}</td>
                      <td className="px-3 py-2.5 text-[11px] text-[var(--muted-foreground)]">{last}</td>
                      <td className="px-3 py-2.5 text-[13px]">
                        <div className="flex items-center gap-1.5">
                          {!m.isHealthy && m.isEnabled && (
                            <span className="bg-red-100 text-red-600 px-1.5 py-px rounded text-[10px] font-bold">غير صحي</span>
                          )}
                          <Switch checked={m.isEnabled} onCheckedChange={(v) => toggleModel(m.provider, m.model, v)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent benchmark results */}
      {data.recentBenchmarks.length > 0 && (
        <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-b-[var(--border)]">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Activity className="text-violet-600" size={16} /> آخر نتائج الاختبارات ({data.recentBenchmarks.length})
            </h3>
          </div>
          <div className="max-h-[260px] garfix-scroll overflow-x-auto overflow-y-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead><tr className="bg-[var(--muted)] sticky top-0 z-[1]">
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">القدرة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الحالة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الزمن</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الرموز</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الجودة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الوقت</th>
              </tr></thead>
              <tbody>
                {data.recentBenchmarks.slice(0, 20).map((b) => (
                  <tr className="border-b border-b-[var(--border)]" key={b.id}>
                    <td className="px-3 py-2.5 text-[13px] font-bold">{capLabel[b.capability] || b.capability}</td>
                    <td className="px-3 py-2.5 text-[13px] font-bold" /* TAILWINDBREAK: dynamic color */ style={{ color: b.success ? "#10b981" : "#ef4444" }}>{b.success ? "✓ نجاح" : "✗ فشل"}</td>
                    <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">{fmtMs(b.latencyMs)}</td>
                    <td className="px-3 py-2.5 text-[11px] [direction:ltr] text-right">{b.tokensIn}/{b.tokensOut}</td>
                    <td className="px-3 py-2.5 text-[13px] font-bold">{b.responseQuality.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-[11px] text-[var(--muted-foreground)]">{new Date(b.createdAt).toLocaleTimeString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
