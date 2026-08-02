"use client";

import { useState, useMemo, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { useReportsFiltered, useDownloadReportCsv, type ReportFilterParams } from "@/hooks/queries";
import { toast } from "sonner";
import {
  Loader2, FileText, Download, Calendar, TrendingUp, DollarSign,
  AlertCircle, Receipt, Wallet, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GarfixLoadingState,
  GarfixEmptyState,
  GarfixEnterpriseTable,
  type EnterpriseColumn,
} from "@/components/ui/index-garfix-ds";

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

interface ReportData {
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

const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-[5px]";

export function ReportsView() {
  const { activeCompany } = useBrand();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const firstOfMonth = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    [],
  );

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [type, setType] = useState<ReportType>("sales");
  const [generateClicked, setGenerateClicked] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Only query when the user clicks "generate" and company exists
  const reportParams: ReportFilterParams | null = generateClicked && activeCompany
    ? { companySlug: activeCompany.slug, type, from, to }
    : null;

  const { data: reportData, isLoading: loading } = useReportsFiltered(reportParams || { companySlug: "", type: "", from: "", to: "" });

  // Only show report data after user has clicked generate
  const data: ReportData | null = generateClicked ? (reportData as ReportData | null) ?? null : null;

  const generate = useCallback(() => {
    if (!activeCompany) {
      toast.error("اختر شركة أولاً");
      return;
    }
    setGenerateClicked(true);
  }, [activeCompany]);

  const downloadCsvMutation = useDownloadReportCsv();

  // CSV export uses the TanStack Query mutation hook which returns a Blob
  const exportCsv = useCallback(async () => {
    if (!activeCompany) {
      toast.error("اختر شركة أولاً");
      return;
    }
    setExporting(true);
    try {
      const blob = await downloadCsvMutation.mutateAsync({
        companySlug: activeCompany.slug, type, from, to,
      });
      const filename = `garfix-${type}-report-${from}-to-${to}.csv`;
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = filename;
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
  }, [activeCompany, from, to, type, downloadCsvMutation]);

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

      {/* Report Type Cards - New DS v4.0 Design */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.key}
            onClick={() => setType(rt.key)}
            className={cn(
              "kpi-card text-right transition-all duration-120",
              type === rt.key 
                ? "state-selected ring-2 ring-primary" 
                : "hover-lift cursor-pointer"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                type === rt.key ? "bg-primary text-white" : "bg-primary/10 text-primary"
              )}>
                {rt.icon}
              </div>
              <span className="font-bold text-sm">{rt.label}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{rt.desc}</p>
          </button>
        ))}
      </div>

      {/* Date Range Picker - New DS v4.0 Design */}
      <div className="chart-container">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-primary" />
          نطاق التاريخ
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelStyle}>من تاريخ</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="focus-ring w-full py-2.5 px-3 rounded-lg border border-border bg-background text-foreground [direction:ltr]"
            />
          </div>
          <div>
            <label className={labelStyle}>إلى تاريخ</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="focus-ring w-full py-2.5 px-3 rounded-lg border border-border bg-background text-foreground [direction:ltr]"
            />
          </div>
        </div>
        
        <button
          onClick={generate}
          disabled={loading}
          className="mt-4 w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm hover-scale active-press disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          إنشاء التقرير
        </button>
      </div>

      {/* Loading State - Using GarfixLoadingState */}
      {loading && (
        <div className="chart-container">
          <GarfixLoadingState message="جارٍ إنشاء التقرير..." size="lg" variant="dots" />
        </div>
      )}

      {/* Empty State - Before Generate Clicked */}
      {!data && !loading && !generateClicked && (
        <div className="state-empty min-h-[300px]">
          <BarChart3 size={64} />
          <h3>اختر نوع التقرير</h3>
          <p>حدد نوع التقرير ونطاق التاريخ ثم اضغط "إنشاء التقرير"</p>
        </div>
      )}

      {/* Report Data Display */}
      {data && !loading && (
        <>
          {/* Summary KPIs based on report type */}
          <div className="grid-kpi">
            {type === 'sales' && (
              <>
                <div className="kpi-card">
                  <div className="kpi-value">{formatCurrency(data.summary.totalRevenue, currency)}</div>
                  <div className="kpi-label">إجمالي الإيرادات</div>
                </div>
                <div className="kpi-card-gold">
                  <div className="kpi-value">{formatCurrency(data.summary.totalPaid, currency)}</div>
                  <div className="kpi-label">المدفوع</div>
                  <div className="kpi-badge">✦ محصّل</div>
                </div>
                <div className="kpi-card state-error-component">
                  <div className="kpi-value">{formatCurrency(data.summary.totalOutstanding, currency)}</div>
                  <div className="kpi-label">المستحقات</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-value">{formatNumber(data.summary.totalInvoices)}</div>
                  <div className="kpi-label">عدد الفواتير</div>
                </div>
              </>
            )}
            
            {type === 'profit' && (
              <>
                <div className="kpi-card">
                  <div className="kpi-value">{formatCurrency(data.summary.grossProfit, currency)}</div>
                  <div className="kpi-label">إجمالي الربح</div>
                </div>
                <div className="kpi-card-gold">
                  <div className="kpi-value">{data.summary.grossMargin || '0%'}</div>
                  <div className="kpi-label">هامش الربح</div>
                  <div className="kpi-badge">✦ مالي</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-value">{formatCurrency(data.summary.totalCogs, currency)}</div>
                  <div className="kpi-label">تكلفة البضاعة</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-value">{formatCurrency(data.summary.netProfit, currency)}</div>
                  <div className="kpi-label">صافي الربح</div>
                </div>
              </>
            )}

            {type === 'cashflow' && (
              <>
                <div className="kpi-card">
                  <div className="kpi-value">{formatCurrency(data.summary.inflow, currency)}</div>
                  <div className="kpi-label">التدفق الداخل</div>
                </div>
                <div className="kpi-card state-error-component">
                  <div className="kpi-value">{formatCurrency(data.summary.outflow, currency)}</div>
                  <div className="kpi-label">التدفق الخارج</div>
                </div>
                <div className="kpi-card-gold">
                  <div className="kpi-value">{formatCurrency(data.summary.netCashFlow, currency)}</div>
                  <div className="kpi-label">صافي التدفق النقدي</div>
                  <div className="kpi-badge">✦ مالي</div>
                </div>
              </>
            )}

            {type === 'tax' && (
              <>
                <div className="kpi-card">
                  <div className="kpi-value">{formatNumber(data.summary.invoiceCount)}</div>
                  <div className="kpi-label">عدد الفواتير</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-value">{formatCurrency(data.summary.totalSubtotal, currency)}</div>
                  <div className="kpi-label">الإجمالي قبل الضريبة</div>
                </div>
                <div className="kpi-card-gold">
                  <div className="kpi-value">{formatCurrency(data.summary.totalTax, currency)}</div>
                  <div className="kpi-label">إجمالي الضريبة</div>
                  <div className="kpi-badge">✦ ضريبي</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-value">{formatCurrency(data.summary.totalWithTax, currency)}</div>
                  <div className="kpi-label">شامل الضريبة</div>
                </div>
              </>
            )}
          </div>

          {/* Chart Container for Data Table */}
          <div className="chart-container">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <BarChart3 size={16} className="text-primary" />
                تفاصيل التقرير
                <span className="text-xs text-muted-foreground font-normal">({data.count} صف)</span>
              </h3>
              <button
                onClick={exportCsv}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-bold hover-scale active-press disabled:opacity-50"
              >
                <Download size={14} />
                تصدير CSV
                <span className="ai-badge text-[9px]">AI</span>
              </button>
            </div>

            {/* Data Table using Enterprise Table */}
            <ReportTable rows={data.rows} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Helper Functions ──────────────────────────────────────────────

function formatNumber(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}

function formatCurrency(value: unknown, currency: string): string {
  if (value === null || value === undefined) return "—";
  const formatted = Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
  return `${formatted} ${currency}`;
}

// ── Report Table Component ───────────────────────────────────────

function ReportTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return (
      <GarfixEmptyState
        icon={<FileText size={32} />}
        title="لا توجد بيانات"
        description="لا توجد سجلات في هذا النطاق الزمني"
      />
    );
  }

  // Build dynamic columns from row data
  const headers = Object.keys(rows[0]);
  
  const columns: EnterpriseColumn[] = headers.map((header) => ({
    key: header,
    label: header,
    sortable: true,
    render: (value: unknown) => {
      if (value === null || value === undefined) return "—";
      if (typeof value === "number") {
        return (
          <span className="[direction:ltr]" dir="ltr">
            {value.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}
          </span>
        );
      }
      return String(value);
    },
  }));

  return (
    <GarfixEnterpriseTable
      data={rows}
      columns={columns}
      density="comfortable"
      emptyMessage="لا توجد بيانات"
      emptyDescription="لم يتم العثور على أي سجلات"
    />
  );
}

export default ReportsView;
