"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Loader2, FileText, Download, Calendar, TrendingUp, DollarSign,
  AlertCircle, Receipt, Wallet, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ReportType = "sales" | "profit" | "cashflow" | "tax";

interface ReportSummary {
  // sales
  totalInvoices?: number;
  totalRevenue?: number;
  totalPaid?: number;
  totalOutstanding?: number;
  totalTax?: number;
  totalDiscount?: number;
  // profit
  totalCogs?: number;
  grossProfit?: number;
  grossMargin?: string;
  netProfit?: number;
  // cashflow
  inflow?: number;
  outflow?: number;
  netCashFlow?: number;
  // tax
  totalSubtotal?: number;
  totalWithTax?: number;
  invoiceCount?: number;
}

interface ReportResponse {
  type: ReportType;
  companySlug: string;
  dateRange: { from: string; to: string };
  summary: ReportSummary;
  rows: Array<Record<string, unknown>>;
  count: number;
}

const REPORT_TYPES: Array<{ key: ReportType; label: string; icon: React.ReactNode; desc: string }> = [
  { key: "sales", label: "المبيعات", icon: <TrendingUp size={16} />, desc: "تفصيل الفواتير والإيرادات والمستحقات" },
  { key: "profit", label: "الأرباح", icon: <DollarSign size={16} />, desc: "الإيرادات مطروحاً منها تكلفة البضاعة المباعة" },
  { key: "cashflow", label: "التدفق النقدي", icon: <Wallet size={16} />, desc: "التدفقات الداخلة والخارجة وصافي التدفق" },
  { key: "tax", label: "الضريبة", icon: <Receipt size={16} />, desc: "ضريبة القيمة المضافة لكل فاتورة" },
];

const inputStyle = "w-full py-[9px] px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none [direction:ltr] text-end max-md:min-h-[44px]";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-[5px]";

export function ReportsView() {
  const { activeCompany } = useBrand();

  // Default date range: start of current month → today
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const firstOfMonth = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    [],
  );

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [type, setType] = useState<ReportType>("sales");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const generate = useCallback(async () => {
    if (!activeCompany) {
      toast.error("اختر شركة أولاً");
      return;
    }
    setLoading(true);
    try {
      const url =
        `/api/reports?companySlug=${encodeURIComponent(activeCompany.slug)}` +
        `&type=${type}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await authedFetch(url);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as Record<string, unknown>)?.error as string || "تعذّر توليد التقرير");
      }
      const json = (await res.json()) as ReportResponse;
      setData(json);
      toast.success(`تم توليد تقرير ${REPORT_TYPES.find((t) => t.key === json.type)?.label || json.type} (${json.count} صف)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ غير معروف");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeCompany, from, to, type]);

  const exportCsv = useCallback(async () => {
    if (!activeCompany) {
      toast.error("اختر شركة أولاً");
      return;
    }
    setExporting(true);
    try {
      const url =
        `/api/reports?companySlug=${encodeURIComponent(activeCompany.slug)}` +
        `&type=${type}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=csv`;
      const res = await authedFetch(url);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as Record<string, unknown>)?.error as string || "تعذّر تصدير CSV");
      }
      const blob = await res.blob();
      const filename = `garfix-${type}-report-${from}-to-${to}.csv`;
      const disp = res.headers.get("content-disposition");
      const match = disp?.match(/filename="?([^";]+)"?/i);
      const finalName = match?.[1] || filename;
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlObj);
      toast.success("تم تصدير ملف CSV");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في التصدير");
    } finally {
      setExporting(false);
    }
  }, [activeCompany, from, to, type]);

  if (!activeCompany) {
    return (
      <div className="p-8 md:p-12 text-center text-muted-foreground">
        اختر شركة لعرض التقارير
      </div>
    );
  }

  const currency = activeCompany.currency || "";

  return (
    <div className="flex flex-col gap-5">
      {/* Page title */}
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold mb-1 flex items-center gap-2">
          <BarChart3 size={22} className="text-primary" />
          التقارير
        </h1>
        <p className="text-[13px] text-muted-foreground">
          {activeCompany.nameAr || activeCompany.name} — تحليل المبيعات والأرباح والتدفق النقدي والضرائب
        </p>
      </div>

      {/* Controls card */}
      <div className="p-3 md:p-[18px] rounded-[14px] bg-card border border-border flex flex-col gap-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelStyle}>من تاريخ</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputStyle} />
          </div>
          <div>
            <label className={labelStyle}>إلى تاريخ</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputStyle} />
          </div>
        </div>

        {/* Report type selector */}
        <div>
          <label className={labelStyle}>نوع التقرير</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {REPORT_TYPES.map((rt) => {
              const active = type === rt.key;
              return (
                <button
                  key={rt.key}
                  type="button"
                  onClick={() => setType(rt.key)}
                  className={cn(
                    "flex flex-col items-start py-3 px-3.5 rounded-[10px] cursor-pointer font-inherit text-right transition-all duration-150 border max-md:min-h-[44px]",
                    active
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]"
                      : "bg-[var(--background)] text-[var(--foreground)] border-[var(--border)]"
                  )}
                >
                  <div className={cn("flex items-center gap-1.5 font-extrabold text-[13px]")}>
                    {rt.icon}
                    {rt.label}
                  </div>
                  <div className="text-[11px] mt-1 opacity-80">{rt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2.5 justify-end flex-wrap">
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || loading || !data}
            className="inline-flex items-center gap-1.5 px-[18px] py-2.5 rounded-md bg-card text-foreground border border-border font-bold text-[13px] cursor-pointer disabled:opacity-60 max-md:min-h-[44px]"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            تصدير CSV
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-[22px] py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {loading ? "جارٍ التوليد…" : "توليد التقرير"}
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-6 md:p-[60px] rounded-[14px] text-center bg-card border border-border text-muted-foreground flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-primary" />
          <div className="text-[13px]">جارٍ حساب التقرير…</div>
        </div>
      ) : !data ? (
        <div className="p-6 md:p-[60px] rounded-[14px] text-center bg-card border border-border text-muted-foreground flex flex-col items-center gap-3">
          <BarChart3 size={36} className="opacity-40" />
          <div className="text-sm font-bold">لا يوجد تقرير بعد</div>
          <div className="text-xs max-w-[360px]">
            اختر النطاق الزمني ونوع التقرير ثم اضغط &laquo;توليد التقرير&raquo; لعرض البيانات.
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <SummaryCards data={data} currency={currency} />

          {/* Data table */}
          <div className="p-3 md:p-[18px] rounded-[14px] bg-card border border-border">
            <div className="flex flex-wrap justify-between items-center mb-3.5 gap-2">
              <h3 className="text-[15px] font-bold">
                {REPORT_TYPES.find((t) => t.key === data.type)?.label || data.type} — تفاصيل ({data.count} صف)
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Calendar size={12} />
                <span dir="ltr">{data.dateRange.from} ← {data.dateRange.to}</span>
              </div>
            </div>
            <ReportTable rows={data.rows} />
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCards({ data, currency }: { data: ReportResponse; currency: string }) {
  const cards: Array<{ label: string; value: string; color: string; icon: React.ReactNode }> = [];

  const fmt = (n: unknown) => Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });

  if (data.type === "sales") {
    const s = data.summary;
    cards.push(
      { label: "عدد الفواتير", value: fmt(s.totalInvoices), color: "#7c3aed", icon: <FileText size={18} /> },
      { label: "إجمالي الإيرادات", value: `${fmt(s.totalRevenue)} ${currency}`, color: "#10b981", icon: <DollarSign size={18} /> },
      { label: "المحصّل", value: `${fmt(s.totalPaid)} ${currency}`, color: "#3b82f6", icon: <TrendingUp size={18} /> },
      { label: "المستحقات", value: `${fmt(s.totalOutstanding)} ${currency}`, color: "#ef4444", icon: <AlertCircle size={18} /> },
      { label: "إجمالي الضريبة", value: `${fmt(s.totalTax)} ${currency}`, color: "#f59e0b", icon: <Receipt size={18} /> },
    );
  } else if (data.type === "profit") {
    const s = data.summary;
    cards.push(
      { label: "الإيرادات", value: `${fmt(s.totalRevenue)} ${currency}`, color: "#10b981", icon: <DollarSign size={18} /> },
      { label: "تكلفة البضاعة (COGS)", value: `${fmt(s.totalCogs)} ${currency}`, color: "#ef4444", icon: <AlertCircle size={18} /> },
      { label: "إجمالي الربح", value: `${fmt(s.grossProfit)} ${currency}`, color: "#3b82f6", icon: <TrendingUp size={18} /> },
      { label: "هامش الربح", value: String(s.grossMargin || "0%"), color: "#7c3aed", icon: <BarChart3 size={18} /> },
      { label: "صافي الربح", value: `${fmt(s.netProfit)} ${currency}`, color: "#16a34a", icon: <Wallet size={18} /> },
    );
  } else if (data.type === "cashflow") {
    const s = data.summary;
    cards.push(
      { label: "التدفق الداخل", value: `${fmt(s.inflow)} ${currency}`, color: "#10b981", icon: <TrendingUp size={18} /> },
      { label: "التدفق الخارج", value: `${fmt(s.outflow)} ${currency}`, color: "#ef4444", icon: <DollarSign size={18} /> },
      { label: "صافي التدفق النقدي", value: `${fmt(s.netCashFlow)} ${currency}`, color: "#3b82f6", icon: <Wallet size={18} /> },
    );
  } else if (data.type === "tax") {
    const s = data.summary;
    cards.push(
      { label: "عدد الفواتير", value: fmt(s.invoiceCount), color: "#7c3aed", icon: <FileText size={18} /> },
      { label: "الإجمالي قبل الضريبة", value: `${fmt(s.totalSubtotal)} ${currency}`, color: "#3b82f6", icon: <DollarSign size={18} /> },
      { label: "إجمالي الضريبة", value: `${fmt(s.totalTax)} ${currency}`, color: "#f59e0b", icon: <Receipt size={18} /> },
      { label: "الإجمالي شامل الضريبة", value: `${fmt(s.totalWithTax)} ${currency}`, color: "#10b981", icon: <Wallet size={18} /> },
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
      {cards.map((c, i) => (
        <div
          key={i}
          className="p-3 md:p-4 rounded-[14px] bg-card border border-border flex flex-col gap-2 relative overflow-hidden"
        >
          <div
            className="absolute -top-4 -left-4 w-16 h-16 rounded-full opacity-[0.08]"
            style={{ background: c.color }} /* TAILWINDBREAK: dynamic summary card color */
          />
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: `${c.color}20`, color: c.color,
              }} /* TAILWINDBREAK: dynamic summary card color */
            >
              {c.icon}
            </div>
            <div className="text-[11px] text-muted-foreground font-semibold">{c.label}</div>
          </div>
          <div className="text-xl font-black [direction:ltr] text-end">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return (
      <div className="p-6 md:p-12 text-center text-muted-foreground">
        <FileText size={32} className="opacity-30 mb-2" />
        <div>لا توجد صفوف في هذا النطاق الزمني</div>
      </div>
    );
  }

  const headers = Object.keys(rows[0]);
  const thStyle = "text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold whitespace-nowrap";
  const tdStyle = "px-3 py-2.5 text-xs whitespace-nowrap";

  const formatCell = (val: unknown): string => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "number") {
      return val.toLocaleString("ar-EG", { maximumFractionDigits: 3 });
    }
    return String(val);
  };

  const isNumeric = (val: unknown) => typeof val === "number";

  // Table: overflow-x-auto + vertical scroll with sticky header (card conversion deferred — dynamic columns vary per report type).
  return (
    <div className="overflow-auto max-h-[480px] garfix-scroll">
      <table className="w-full border-collapse text-xs min-w-[640px]">
        <thead className="sticky top-0 z-[1]">
          <tr className="border-b border-border bg-muted">
            {headers.map((h) => (
              <th key={h} className={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border">
              {headers.map((h) => {
                const v = row[h];
                const numeric = isNumeric(v);
                return (
                  <td
                    key={h}
                    className={cn(
                      tdStyle,
                      h === "invoiceNumber" || h === "metric" ? "font-bold" : "font-normal",
                      numeric ? "[direction:ltr] text-end" : ""
                    )}
                  >
                    {formatCell(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ReportsView;
