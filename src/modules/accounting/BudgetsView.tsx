"use client";

import { useState } from "react";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import {
  useBudgets, useCreateBudget, useApproveBudget, useReviseBudget,
  useBudgetVsActual, usePeriodComparison,
} from "@/hooks/queries";
import {
  Plus, X, PieChart, BarChart3, TrendingUp,
  CheckCircle2, RotateCcw, DollarSign, ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface _BudgetEntry {
  id: number; accountId: number; accountCode: string; accountNameAr: string;
  plannedAmount: number; actualAmount?: number; status: string;
}
interface _BudgetVsActualRow {
  id: number; accountCode: string; accountNameAr: string;
  planned: number; actual: number; variance: number; variancePercent: number;
}
interface _PeriodComparison {
  id: number; periodName: string; revenue: number; expenses: number; profit: number; cash: number;
}

type Tab = "budgets" | "vs-actual" | "comparison";

/* ─── Shared Styles (DS v4.0) ──────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
// DS v4.0: Added focus-ring for form inputs
const inputStyle = "w-full py-2 px-3 rounded-sm bg-mutedackgroundackground border border-border text-foreground text-[13px] outline-none focus-ring";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
// DS v4.0: Added focus-ring for selects
const selectStyle = "w-full py-2 px-3 rounded-sm bg-mutedackgroundackground border border-border text-foreground text-[13px] outline-none cursor-pointer focus-ring";

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

/* ─── Main Component ────────────────────────────────────────────────────────── */
export function BudgetsView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("budgets");
  const [showForm, setShowForm] = useState(false);

  /* Filters */
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear));
  const [periodName, setPeriodName] = useState("Q1");
  const [compPeriods, setCompPeriods] = useState("Q1,Q2,Q3,Q4");

  /* Budget form state */
  const [budgetAccountId, setBudgetAccountId] = useState("");
  const [budgetPlanned, setBudgetPlanned] = useState("");

  const slug = activeCompany ? activeCompany.slug : "";

  // TanStack Query hooks for data fetching
  const budgetsQuery = useBudgets(slug, fiscalYear);
  const vsActualQuery = useBudgetVsActual(slug, fiscalYear, periodName);
  const comparisonQuery = usePeriodComparison(slug, compPeriods);

  const budgets = budgetsQuery.data?.budgets ?? [];
  const vsActual = vsActualQuery.data?.rows ?? [];
  const comparisons = comparisonQuery.data?.comparisons ?? [];
  const loading = (tab === "budgets" && budgetsQuery.isLoading) || (tab === "vs-actual" && vsActualQuery.isLoading) || (tab === "comparison" && comparisonQuery.isLoading);

  // Error toasts for failed queries
  if (tab === "budgets" && budgetsQuery.error) toast.error(budgetsQuery.error.message || "تعذّر تحميل الموازنات");
  if (tab === "vs-actual" && vsActualQuery.error) toast.error(vsActualQuery.error.message || "تعذّر تحليل الموازنة مقابل الفعلي");
  if (tab === "comparison" && comparisonQuery.error) toast.error(comparisonQuery.error.message || "تعذّر مقارنة الفترات");

  const createBudgetMutation = useCreateBudget();
  const approveBudgetMutation = useApproveBudget();
  const reviseBudgetMutation = useReviseBudget();

  const switchTab = (t: Tab) => { setTab(t); setShowForm(false); };

  /* ── Create Budget ──────────────────────────────────────────────────────── */
  const handleCreateBudget = () => {
    if (!activeCompany) return;
    if (!budgetAccountId || !budgetPlanned) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    createBudgetMutation.mutate(
      {
        companySlug: activeCompany.slug,
        accountId: parseInt(budgetAccountId),
        plannedAmount: parseFloat(budgetPlanned),
        fiscalYear: parseInt(fiscalYear),
      },
      {
        onSuccess: () => {
          toast.success("تم إنشاء بند الموازنة");
          setShowForm(false); setBudgetAccountId(""); setBudgetPlanned("");
        },
        onError: (err) => { toast.error(err.message || "تعذّر إنشاء الموازنة"); },
      },
    );
  };

  /* ── Approve Budget ─────────────────────────────────────────────────────── */
  const handleApprove = (id: number) => {
    if (!activeCompany) return;
    approveBudgetMutation.mutate(
      { id, companySlug: activeCompany.slug },
      {
        onSuccess: () => { toast.success("تم اعتماد الموازنة"); },
        onError: (err) => { toast.error(err.message || "تعذّر اعتماد الموازنة"); },
      },
    );
  };

  /* ── Revise Budget ──────────────────────────────────────────────────────── */
  const handleRevise = (id: number) => {
    if (!activeCompany) return;
    reviseBudgetMutation.mutate(
      { id, companySlug: activeCompany.slug },
      {
        onSuccess: () => { toast.success("تم إرجاع الموازنة للمراجعة"); },
        onError: (err) => { toast.error(err.message || "تعذّر مراجعة الموازنة"); },
      },
    );
  };

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "budgets", label: "الموازنات", icon: PieChart },
    { key: "vs-actual", label: "الموازنة مقابل الفعلي", icon: BarChart3 },
    { key: "comparison", label: "مقارنة الفترات", icon: ArrowRightLeft },
  ];

  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });

  return (
    <div className="flex flex-col gap-4">
      {/* Header - DS v4.0: Emerald accent color */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2 text-[#047857]"><PieChart size={20} /> الموازنات</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {tab === "budgets" && !showForm && (
          // DS v4.0: Action button with active-press
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer active-press duration-150"><Plus size={16} /> بند موازنة</button>
        )}
      </div>

      {/* Tabs - DS v4.0: Filter buttons with active-press */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => switchTab(t.key)} className={cn(
              "py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5 active-press duration-150",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
            )}>
              {Icon && <Icon size={14} />} {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters - DS v4.0: Panel with hover-lift */}
      {(tab === "budgets" || tab === "vs-actual") && (
        <div className="flex gap-3 items-end bg-card rounded-[10px] border border-border p-3 hover-lift duration-120">
          <div><label className={labelStyle}>السنة المالية</label><input value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className={cn(inputStyle, "w-24")} type="number" /></div>
          {tab === "vs-actual" && (
            <div><label className={labelStyle}>الفترة</label>
              <select value={periodName} onChange={(e) => setPeriodName(e.target.value)} className={cn(selectStyle, "w-28")}>
                <option value="Q1">Q1</option><option value="Q2">Q2</option>
                <option value="Q3">Q3</option><option value="Q4">Q4</option>
                <option value="YTD">YTD</option>
              </select>
            </div>
          )}
        </div>
      )}
      {tab === "comparison" && (
        // DS v4.0: Comparison filter panel with hover-lift
        <div className="flex gap-3 items-end bg-card rounded-[10px] border border-border p-3 hover-lift duration-120">
          <div><label className={labelStyle}>الفترات (مفصولة بفاصلة)</label><input value={compPeriods} onChange={(e) => setCompPeriods(e.target.value)} className={cn(inputStyle, "w-48")} placeholder="Q1,Q2,Q3,Q4" /></div>
        </div>
      )}

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "budgets" ? (
        /* ── Budgets Tab ──────────────────────────────────────────────────────── */
        showForm ? (
          // DS v4.0: Form card with hover-lift
          <div className="bg-card rounded-[14px] border border-border p-5 hover-lift duration-120">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">بند موازنة جديد</h2>
              <button onClick={() => { setShowForm(false); setBudgetAccountId(""); setBudgetPlanned(""); }} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelStyle}>رقم الحساب *</label><input value={budgetAccountId} onChange={(e) => setBudgetAccountId(e.target.value)} className={inputStyle} type="number" placeholder="1" /></div>
              <div><label className={labelStyle}>المبلغ المخطط *</label><input value={budgetPlanned} onChange={(e) => setBudgetPlanned(e.target.value)} className={inputStyle} type="number" placeholder="0.000" /></div>
            </div>
            {/* DS v4.0: Action buttons with active-press */}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setShowForm(false); setBudgetAccountId(""); setBudgetPlanned(""); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer active-press duration-150">إلغاء</button>
              <button onClick={handleCreateBudget} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5 active-press duration-150"><Plus size={14} /> إنشاء</button>
            </div>
          </div>
        ) : budgets.length === 0 ? <Empty label="بنود موازنة" /> : (
          // DS v4.0: Budget table container with kpi-card styling and enterprise table
          <div className="bg-card rounded-[14px] border border-border overflow-hidden hover-lift duration-120">
            {/* DS v4.0: KPI Summary Cards for Budget Overview */}
            {budgets.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-border">
                {/* Total Planned - kpi-card */}
                <div className="kpi-card">
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-[#047857]" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">إجمالي المخطط</p>
                      <p className="text-sm font-bold text-[#047857]">{fmt(budgets.reduce((sum, b) => sum + b.plannedAmount, 0))}</p>
                    </div>
                  </div>
                </div>
                {/* Actual Spent - kpi-card-gold (Premium!) */}
                <div className="kpi-card-gold">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#d4a574]" />
                    <div>
                      <p className="text-[10px] opacity-80">المُنفَق فعلياً</p>
                      <p className="text-sm font-bold">{fmt(budgets.reduce((sum, b) => sum + (b.actualAmount || 0), 0))}</p>
                    </div>
                  </div>
                </div>
                {/* Variance - kpi-card */}
                <div className="kpi-card">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} className={budgets.reduce((sum, b) => sum + b.plannedAmount, 0) - budgets.reduce((sum, b) => sum + (b.actualAmount || 0), 0) >= 0 ? "text-[#047857]" : "text-red-500"} />
                    <div>
                      <p className="text-[10px] text-muted-foreground">الفرق المتبقي</p>
                      <p className={cn("text-sm font-bold", budgets.reduce((sum, b) => sum + b.plannedAmount, 0) - budgets.reduce((sum, b) => sum + (b.actualAmount || 0), 0) >= 0 ? "text-[#047857]" : "text-red-500")}>{fmt(budgets.reduce((sum, b) => sum + b.plannedAmount, 0) - budgets.reduce((sum, b) => sum + (b.actualAmount || 0), 0))}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse table-enterprise">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>كود الحساب</th><th className={thStyle}>اسم الحساب</th>
                  <th className={thStyle}>المبلغ المخطط</th><th className={thStyle}>الفعلي</th><th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
                </tr></thead>
                <tbody>
                  {budgets.map((b) => {
                    const statusMap: Record<string, { label: string; badge: string }> = {
                      draft: { label: "مسودة", badge: "bg-cardmber-500/15 text-amber-500" },
                      approved: { label: "معتمد", badge: "bg-mutedmerald-500/15 text-emerald-500" },
                      revised: { label: "قيد المراجعة", badge: "bg-mutedackgroundlue-500/15 text-blue-500" },
                    };
                    const st = statusMap[b.status] || { label: b.status, badge: "bg-gray-500/15 text-gray-500" };
                    return (
                      <tr key={b.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-mono font-bold")}>{b.accountCode}</td>
                        <td className={tdStyle}>{b.accountNameAr}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(b.plannedAmount)}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end")}>{b.actualAmount ? fmt(b.actualAmount) : "—"}</td>
                        <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", st.badge)}>{st.label}</span></td>
                        <td className={tdStyle}>
                          <div className="flex items-center gap-1">
                            {/* DS v4.0: Action buttons with active-press */}
                            {b.status !== "approved" && (
                              <button onClick={() => handleApprove(b.id)} title="اعتماد" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-mutedmerald-500/10 hover:border-emerald-500/40 hover:text-emerald-600 active-press duration-150"><CheckCircle2 size={13} /></button>
                            )}
                            {b.status === "approved" && (
                              <button onClick={() => handleRevise(b.id)} title="مراجعة" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-cardmber-500/10 hover:border-amber-500/40 hover:text-amber-600 active-press duration-150"><RotateCcw size={13} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{budgets.length} بند موازنة</div>
          </div>
        )
      ) : tab === "vs-actual" ? (
        /* ── vs-actual Tab ────────────────────────────────────────────────────── */
        vsActual.length === 0 ? <Empty label="بيانات مقارنة" /> : (
          // DS v4.0: VS Actual card with chart-container and enterprise table
          <div className="bg-card rounded-[14px] border border-border overflow-hidden hover-lift duration-120 chart-container">
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse table-enterprise">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>كود الحساب</th><th className={thStyle}>اسم الحساب</th>
                  <th className={thStyle}>المخطط</th><th className={thStyle}>الفعلي</th>
                  <th className={thStyle}>الفرق</th><th className={thStyle}>نسبة الفرق %</th>
                </tr></thead>
                <tbody>
                  {vsActual.map((r) => (
                    <tr key={r.id} className="border-b border-border">
                      <td className={cn(tdStyle, "font-mono font-bold")}>{r.accountCode}</td>
                      <td className={tdStyle}>{r.accountNameAr}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(r.planned)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(r.actual)}</td>
                      {/* DS v4.0: Variance indicators - emerald positive, red negative */}
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold", r.variance >= 0 ? "text-[#047857]" : "text-red-500")}>{fmt(r.variance)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold", r.variancePercent >= 0 ? "text-[#047857]" : "text-red-500")}>{r.variancePercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{vsActual.length} حساب</div>
          </div>
        )
      ) : (
        /* ── Comparison Tab ────────────────────────────────────────────────────── */
        comparisons.length === 0 ? <Empty label="مقارنات فترات" /> : (
          // DS v4.0: Comparison card with chart-container and enterprise table
          <div className="bg-card rounded-[14px] border border-border overflow-hidden hover-lift duration-120 chart-container">
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse table-enterprise">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>الفترة</th><th className={thStyle}>الإيرادات</th>
                  <th className={thStyle}>المصروفات</th><th className={thStyle}>صافي الربح</th><th className={thStyle}>النقدية</th>
                </tr></thead>
                <tbody>
                  {comparisons.map((c) => (
                    <tr key={c.id} className="border-b border-border">
                      <td className={cn(tdStyle, "font-bold")}>{c.periodName}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold text-emerald-500")}>{fmt(c.revenue)}</td>
                      <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-red-500")}>{fmt(c.expenses)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold", c.profit >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(c.profit)}</td>
                      <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-blue-500")}>{fmt(c.cash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{comparisons.length} فترة</div>
          </div>
        )
      )}
    </div>
  );
}
