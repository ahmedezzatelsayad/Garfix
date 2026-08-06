"use client";

import { useEInvoicingDashboard, type EInvoicingReceipt } from "@/hooks/queries/founder-panel";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState } from "react";

// Country flag emoji (ISO-2 → flag)
function flagEmoji(country: string): string {
  if (!country || country.length !== 2) return "🌍";
  const A = 0x1f1e6;
  const a = "A".charCodeAt(0);
  return String.fromCodePoint(
    A + (country.charCodeAt(0) - a),
    A + (country.charCodeAt(1) - a),
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sublabel, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sublabel?: string;
  accent: "emerald" | "amber" | "blue" | "red";
}) {
  const colorMap = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
  };
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1.5 truncate">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {sublabel && <p className="text-[11px] text-muted-foreground mt-1">{sublabel}</p>}
        </div>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center border flex-shrink-0", colorMap[accent])}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Country progress bar ─────────────────────────────────────────────────

function CountryRow({ country, stats }: { country: string; stats: { total: number; configured: number; pending: number } }) {
  const flag = flagEmoji(country);
  const names: Record<string, string> = {
    SA: "السعودية — ZATCA",
    EG: "مصر — ETA",
    AE: "الإمارات — FTA",
    KW: "الكويت — Decree 10/2026",
    BH: "البحرين — NBR",
    OM: "عُمان — TA",
    QA: "قطر — GTA",
  };
  const pct = stats.total > 0 ? Math.round((stats.configured / stats.total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-2xl flex-shrink-0">{flag}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-foreground truncate">{names[country] || country}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {stats.configured}/{stats.total} ({pct}%)
          </span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-500", pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-blue-500" : "bg-white/[0.06]")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 size={11} />
      مفعّل
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Clock size={11} />
      معلّق
    </span>
  );
}

// ─── Receipt status icon ──────────────────────────────────────────────────

function receiptStatusMeta(r: EInvoicingReceipt): { icon: React.ReactNode; color: string; label: string } {
  if (r.status === "accepted") return { icon: <CheckCircle2 size={14} />, color: "text-emerald-400", label: "مقبول" };
  if (r.status === "rejected") return { icon: <XCircle size={14} />, color: "text-red-400", label: "مرفوض" };
  if (r.status === "pending") return { icon: <Clock size={14} />, color: "text-amber-400", label: "معلّق" };
  if (r.status === "cancelled") return { icon: <XCircle size={14} />, color: "text-muted-foreground", label: "ملغى" };
  return { icon: <Activity size={14} />, color: "text-muted-foreground", label: r.status };
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function EInvoicingDashboardPage() {
  const { data, isLoading, isError, refetch, isFetching } = useEInvoicingDashboard();
  const [filter, setFilter] = useState<"all" | "configured" | "pending">("all");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <p className="text-muted-foreground">فشل تحميل لوحة الفوترة الإلكترونية</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const filteredCompanies = data.perCompany.filter((c) => {
    if (filter === "configured") return c.isConfigured;
    if (filter === "pending") return !c.isConfigured && c.integrationType;
    return true;
  });

  const totalCompanies = data.stats.totalCompanies;
  const configuredPct = totalCompanies > 0 ? Math.round((data.stats.configured / totalCompanies) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-emerald-400" />
            لوحة الفوترة الإلكترونية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            حالة الربط مع الهيئات الضريبية لجميع الشركات — 7 دول (SA / EG / AE / KW / BH / OM / QA)
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="تحديث"
        >
          <RefreshCw className={cn("h-5 w-5", isFetching && "animate-spin")} />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<ShieldCheck size={18} />}
          label="شركات مفعّلة"
          value={data.stats.configured}
          sublabel={`من إجمالي ${totalCompanies}`}
          accent="emerald"
        />
        <StatCard
          icon={<Clock size={18} />}
          label="شركات معلّقة"
          value={data.stats.pending}
          sublabel={totalCompanies > 0 ? `${100 - configuredPct}% من الإجمالي` : ""}
          accent="amber"
        />
        <StatCard
          icon={<FileText size={18} />}
          label="إيصالات آخر 7 أيام"
          value={data.stats.receiptsLast7d}
          sublabel="webhooks واردة"
          accent="blue"
        />
        <StatCard
          icon={<Globe2 size={18} />}
          label="دول غير مدعومة"
          value={data.stats.unsupported}
          sublabel="شركات بدولة بدون تكامل"
          accent="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Country breakdown */}
        <div className="lg:col-span-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Globe2 size={16} className="text-emerald-400" />
            التوزيع حسب الدولة
          </h2>
          <div className="space-y-1">
            {Object.keys(data.byCountry).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">لا توجد شركات مسجّلة بعد</p>
            )}
            {Object.entries(data.byCountry)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([country, stats]) => (
                <CountryRow key={country} country={country} stats={stats} />
              ))}
          </div>
        </div>

        {/* Per-company table */}
        <div className="lg:col-span-2 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="p-5 border-b border-white/[0.08] flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText size={16} className="text-emerald-400" />
              الشركات ({filteredCompanies.length})
            </h2>
            <div className="flex gap-1 text-xs">
              {(["all", "configured", "pending"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-colors",
                    filter === f
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "text-muted-foreground hover:text-foreground border border-transparent",
                  )}
                >
                  {f === "all" ? "الكل" : f === "configured" ? "مفعّل" : "معلّق"}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-white/[0.04] max-h-[640px] overflow-y-auto scrollbar-thin">
            {filteredCompanies.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-12">لا توجد شركات مطابقة</p>
            )}
            {filteredCompanies.map((c) => (
              <Link
                key={c.id}
                href={`/founder-panel/e-invoicing/${c.slug}`}
                className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors group"
              >
                <span className="text-xl flex-shrink-0">{c.emoji || flagEmoji(c.country)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-emerald-400 transition-colors">
                      {c.nameAr || c.name}
                    </p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-muted-foreground">{c.plan}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {c.countryName} {c.vatNumber && `• VAT: ${c.vatNumber}`}
                    {c.lastUpdatedAt && ` • آخر تحديث: ${new Date(c.lastUpdatedAt).toLocaleDateString("ar-EG")}`}
                  </p>
                </div>
                <StatusBadge configured={c.isConfigured} />
                <ChevronLeft size={14} className="text-muted-foreground/40 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent receipts */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Zap size={16} className="text-emerald-400" />
            آخر الإيصالات الواردة (Webhooks)
          </h2>
          <span className="text-[11px] text-muted-foreground">{data.recentReceipts.length} الأحدث</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {data.recentReceipts.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-12">
              لا توجد إيصالات واردة بعد — ستظهر هنا تلقائياً عند استدعاء هيئة الضرائب لـ webhooks
            </p>
          )}
          {data.recentReceipts.map((r) => {
            const meta = receiptStatusMeta(r);
            return (
              <div key={r.id} className="px-5 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors">
                <span className={cn("mt-0.5 flex-shrink-0", meta.color)}>{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{r.authority}</span>
                    <span className="text-[10px] text-muted-foreground">/ {r.eventType}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", meta.color, "bg-white/[0.06]")}>
                      {meta.label}
                    </span>
                    {r.signatureValid === false && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertCircle size={10} />
                        توقيع غير صالح
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">
                    شركة: {r.companySlug} {r.invoiceId && `• فاتورة #${r.invoiceId}`}
                    {r.externalUuid && ` • UUID: ${r.externalUuid.slice(0, 13)}…`}
                    {r.rejectionReason && ` • سبب الرفض: ${r.rejectionReason}`}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground flex-shrink-0">
                  {new Date(r.receivedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer help */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 text-sm">
        <p className="font-bold text-emerald-400 mb-2 flex items-center gap-2">
          <ShieldCheck size={16} />
          تكاملات الفوترة الإلكترونية المتاحة
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
          {data.availableIntegrations.map((i) => (
            <div key={i.type} className="flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />
              <span className="truncate">{i.name}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
          لتفعيل الفوترة الإلكترونية لشركة: انتقل إلى{" "}
          <Link href="/settings" className="text-emerald-400 underline">الإعدادات</Link>
          {" "}← الفوترة الإلكترونية، وأدخل بيانات الاعتماد من بوابة الهيئة المعنية. يتم تخزين كل البيانات مشفّرة (AES-256-GCM).
        </p>
      </div>
    </div>
  );
}
