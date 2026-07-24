"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Activity, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { KpiCard } from "./shared-helpers";

/**
 * Admin P2 — AI Usage tab.
 * Wires the previously-orphaned /api/platform-admin/ai-usage endpoint into
 * a founder-facing dashboard. Shows totals, 30-day trend, per-company /
 * per-endpoint / per-model breakdowns, and recent errors.
 */
export function AiUsageTab() {
  const [data, setData] = useState<null | {
    totals: {
      totalCalls: number; totalCost: number; totalTokensIn: number;
      totalTokensOut: number; totalTokens: number; successCount: number; failureCount: number;
      callsToday: number; successRate: number | null;
    };
    last30Days: Array<{ date: string; calls: number; cost: number }>;
    perCompany: Array<{ companySlug: string; calls: number; cost: number; tokens: number }>;
    perEndpoint: Array<{
      endpoint: string; calls: number; cost: number; tokens: number;
      successCount: number; failureCount: number; successRate: number | null;
      p50Ms: number | null; p95Ms: number | null; minMs: number | null;
      maxMs: number | null; avgMs: number | null;
    }>;
    perModel: Array<{ model: string; calls: number; cost: number; tokens: number }>;
    perCompanyMonthly: Array<{ companySlug: string; month: string; calls: number; tokens: number; cost: number }>;
    recentErrors: Array<{
      id: number; companySlug: string | null; provider: string; model: string;
      endpoint: string; errorMessage: string | null; createdAt: string;
    }>;
  }>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/platform-admin/ai-usage");
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>;
  if (!data) return <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">تعذّر تحميل البيانات</div>;

  // P0.3: helper to format ms nicely (e.g. "1.2s" or "340ms")
  const fmtMs = (ms: number | null): string => {
    if (ms === null || ms === undefined) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <KpiCard label="نداءات اليوم" value={data.totals.callsToday} color="#7c3aed" />
        <KpiCard label="إجمالي النداءات" value={data.totals.totalCalls} color="#7c3aed" />
        <KpiCard label="معدل النجاح" value={data.totals.successRate !== null ? `${data.totals.successRate}%` : "—"} color="#10b981" />
        <KpiCard label="التكلفة ($)" value={data.totals.totalCost.toFixed(4)} color="#10b981" />
        <KpiCard label="إجمالي الرموز" value={data.totals.totalTokens} color="#3b82f6" />
        <KpiCard label="فشل" value={data.totals.failureCount} color="#ef4444" />
      </div>

      {/* P0.3 (AI Effectiveness prompt): per-endpoint latency + effectiveness table.
          This is the "فعالية العقل والوقت المستغرق" view — calls, success rate,
          p50/p95 latency, and cost broken down by endpoint, so the founder can
          see at a glance which AI paths are fast/reliable and which aren't. */}
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-b-[var(--border)]">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Activity className="text-violet-600" size={16} />
            فعالية وزمن كل Endpoint ({data.perEndpoint.length})
          </h3>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
            معدل النجاح + توزيع الزمن (p50/p95) لكل مسار ذكاء اصطناعي — هذا هو&quot;فعالية العقل والوقت المستغرق&quot;
          </p>
        </div>
        {data.perEndpoint.length === 0 ? (
          <div className="p-6 text-center text-[var(--muted-foreground)] text-xs">لا توجد بيانات استهلاك AI بعد — استخدم المساعد الذكي أو رفع فاتورة لبدء التسجيل</div>
        ) : (
          <div className="garfix-scroll overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead><tr className="bg-[var(--muted)]">
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">Endpoint</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">النداءات</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">معدل النجاح</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">p50</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">p95</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">min</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">max</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">avg</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">التكلفة</th>
              </tr></thead>
              <tbody>
                {data.perEndpoint.map((e) => (
                  <tr className="border-b border-b-[var(--border)]" key={e.endpoint}>
                    <td className="px-3 py-2.5 font-mono text-[11px] [direction:ltr] text-right font-bold">{e.endpoint}</td>
                    <td className="px-3 py-2.5 text-[13px]">{e.calls}</td>
                    <td className="px-3 py-2.5 text-[13px] font-bold" /* TAILWINDBREAK: dynamic color */ style={{ color: e.successRate === null ? "var(--muted-foreground)" : (e.successRate >= 95 ? "#10b981" : e.successRate >= 80 ? "#f59e0b" : "#ef4444") }}>
                      {e.successRate !== null ? `${e.successRate}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">{fmtMs(e.p50Ms)}</td>
                    <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right font-bold" /* TAILWINDBREAK: dynamic color */ style={{ color: (e.p95Ms ?? 0) > 5000 ? "#ef4444" : (e.p95Ms ?? 0) > 2000 ? "#f59e0b" : "var(--foreground)" }}>{fmtMs(e.p95Ms)}</td>
                    <td className="px-3 py-2.5 text-[11px] [direction:ltr] text-right text-[var(--muted-foreground)]">{fmtMs(e.minMs)}</td>
                    <td className="px-3 py-2.5 text-[11px] [direction:ltr] text-right text-[var(--muted-foreground)]">{fmtMs(e.maxMs)}</td>
                    <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">{fmtMs(e.avgMs)}</td>
                    <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">${e.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Activity className="text-violet-600" size={16} />
          استهلاك آخر ٣٠ يوماً ({data.last30Days.length} يوم)
        </h3>
        {data.last30Days.length === 0 ? (
          <div className="p-6 text-center text-[var(--muted-foreground)] text-xs">لا توجد بيانات</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.last30Days}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px" }} />
              <Bar dataKey="calls" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <UsageTable title="حسب الشركة" rows={data.perCompany.map((c) => ({ col1: c.companySlug, col2: String(c.calls), col3: `$${c.cost.toFixed(4)}`, col4: String(c.tokens) }))} headers={["الشركة", "النداءات", "التكلفة", "الرموز"]} />
        <UsageTable title="حسب الموديل" rows={data.perModel.map((m) => ({ col1: m.model, col2: String(m.calls), col3: `$${m.cost.toFixed(4)}`, col4: String(m.tokens) }))} headers={["الموديل", "النداءات", "التكلفة", "الرموز"]} />
      </div>

      {/*
        GATE 4 Task 3 — per-tenant × per-month AI usage ledger.
        Shows: tenant | month | AI calls | tokens | cost — the exact shape
        requested in the spec. Renders above the recent-errors card.
      */}
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-b-[var(--border)]">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Activity className="text-violet-600" size={16} />
            استهلاك AI لكل شركة × شهر ({data.perCompanyMonthly.length} صف)
          </h3>
        </div>
        {data.perCompanyMonthly.length === 0 ? (
          <div className="p-6 text-center text-[var(--muted-foreground)] text-xs">لا توجد بيانات استهلاك AI بعد</div>
        ) : (
          <div className="garfix-scroll overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead><tr className="bg-[var(--muted)]">
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الشركة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الشهر</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">نداءات AI</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الرموز</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">التكلفة</th>
              </tr></thead>
              <tbody>
                {data.perCompanyMonthly.slice(0, 200).map((row, i) => (
                  <tr className="border-b border-b-[var(--border)]" key={`${row.companySlug}-${row.month}-${i}`}>
                    <td className="px-3 py-2.5 font-mono text-[11px] [direction:ltr] text-right">{row.companySlug}</td>
                    <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">{row.month}</td>
                    <td className="px-3 py-2.5 text-[13px]">{row.calls}</td>
                    <td className="px-3 py-2.5 text-[13px]">{row.tokens.toLocaleString("en-US")}</td>
                    <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right font-bold">${row.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.recentErrors.length > 0 && (
        <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-b-[var(--border)]">
            <h3 className="text-sm font-bold flex items-center gap-2 text-red-500">
              <AlertTriangle size={16} /> أخطاء حديثة ({data.recentErrors.length})
            </h3>
          </div>
          <div className="garfix-scroll overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead><tr className="bg-[var(--muted)]">
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الوقت</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">المزود</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الموديل</th>
                <th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الشركة</th><th scope="col" className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">الخطأ</th>
              </tr></thead>
              <tbody>
                {data.recentErrors.map((e) => (
                  <tr className="border-b border-b-[var(--border)]" key={e.id}>
                    <td className="px-3 py-2.5 text-[13px]">{new Date(e.createdAt).toLocaleString("ar-EG")}</td>
                    <td className="px-3 py-2.5 text-[13px]">{e.provider}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">{e.model}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">{e.companySlug || "—"}</td>
                    <td className="px-3 py-2.5 text-[11px] [direction:ltr] text-right" /* TAILWINDBREAK: dynamic color */ style={{ color: "#fca5a5" }}>{(e.errorMessage || "").slice(0, 200)}</td>
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

function UsageTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<{ col1: string; col2: string; col3: string; col4: string }> }) {
  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-3 py-2.5 border-b border-b-[var(--border)]">
        <h4 className="text-xs font-bold">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <div className="p-4 text-center text-[var(--muted-foreground)] text-[11px]">لا توجد بيانات</div>
      ) : (
        <div className="garfix-scroll overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead><tr className="bg-[var(--muted)]">
              {headers.map((h) => <th scope="col" key={h} className="text-right px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr className="border-b border-b-[var(--border)]" key={i}>
                  <td className="px-3 py-2.5 font-bold font-mono text-[11px] [direction:ltr] text-right">{r.col1}</td>
                  <td className="px-3 py-2.5 text-[13px]">{r.col2}</td>
                  <td className="px-3 py-2.5 text-[13px] [direction:ltr] text-right">{r.col3}</td>
                  <td className="px-3 py-2.5 text-[13px]">{r.col4}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
