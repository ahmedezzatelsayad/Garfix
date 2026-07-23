"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, X, PieChart, BarChart3, TrendingUp, TrendingDown,
  CheckCircle2, RotateCcw, DollarSign, Calendar, ArrowRightLeft,
  FileBarChart,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface BudgetEntry {
  id: number; accountId: number; accountCode: string; accountNameAr: string;
  plannedAmount: number; actualAmount?: number; status: string;
}
interface BudgetVsActualRow {
  id: number; accountCode: string; accountNameAr: string;
  planned: number; actual: number; variance: number; variancePercent: number;
}
interface PeriodComparison {
  id: number; periodName: string; revenue: number; expenses: number; profit: number; cash: number;
}

type Tab = "budgets" | "vs-actual" | "comparison";

/* ─── Shared Styles ─────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const selectStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none cursor-pointer";

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

/* ─── Main Component ────────────────────────────────────────────────────────── */
export function BudgetsView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("budgets");
  const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
  const [vsActual, setVsActual] = useState<BudgetVsActualRow[]>([]);
  const [comparisons, setComparisons] = useState<PeriodComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  /* Filters */
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear));
  const [periodName, setPeriodName] = useState("Q1");
  const [compPeriods, setCompPeriods] = useState("Q1,Q2,Q3,Q4");

  /* Budget form state */
  const [budgetAccountId, setBudgetAccountId] = useState("");
  const [budgetPlanned, setBudgetPlanned] = useState("");

  const slug = activeCompany ? `companySlug=${encodeURIComponent(activeCompany.slug)}` : "";

  const loadBudgets = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/budgets?${slug}&fiscalYear=${fiscalYear}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل الموازنات"); }
      const d = await res.json();
      setBudgets(d.budgets || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحميل الموازنات");
      setBudgets([]);
    } finally { setLoading(false); }
  }, [activeCompany, slug, fiscalYear]);

  const loadVsActual = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/budget-vs-actual?${slug}&fiscalYear=${fiscalYear}&periodName=${periodName}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل المقارنة"); }
      const d = await res.json();
      setVsActual(d.rows || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحليل الموازنة مقابل الفعلي");
      setVsActual([]);
    } finally { setLoading(false); }
  }, [activeCompany, slug, fiscalYear, periodName]);

  const loadComparison = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/period-comparison?${slug}&periods=${encodeURIComponent(compPeriods)}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل تحميل المقارنة"); }
      const d = await res.json();
      setComparisons(d.comparisons || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر مقارنة الفترات");
      setComparisons([]);
    } finally { setLoading(false); }
  }, [activeCompany, slug, compPeriods]);

  useEffect(() => {
    if (tab === "budgets" && activeCompany) loadBudgets();
    if (tab === "vs-actual" && activeCompany) loadVsActual();
    if (tab === "comparison" && activeCompany) loadComparison();
  }, [tab, activeCompany, loadBudgets, loadVsActual, loadComparison]);

  const switchTab = (t: Tab) => { setTab(t); setShowForm(false); };

  /* ── Create Budget ──────────────────────────────────────────────────────── */
  const handleCreateBudget = async () => {
    if (!activeCompany) return;
    if (!budgetAccountId || !budgetPlanned) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    try {
      const res = await authedFetch("/api/accounting/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: activeCompany.slug,
          accountId: parseInt(budgetAccountId),
          plannedAmount: parseFloat(budgetPlanned),
          fiscalYear: parseInt(fiscalYear),
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل إنشاء الموازنة"); }
      toast.success("تم إنشاء بند الموازنة");
      setShowForm(false); setBudgetAccountId(""); setBudgetPlanned(""); loadBudgets();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر إنشاء الموازنة"); }
  };

  /* ── Approve Budget ─────────────────────────────────────────────────────── */
  const handleApprove = async (id: number) => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/budgets/${id}/approve?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل اعتماد الموازنة"); }
      toast.success("تم اعتماد الموازنة");
      loadBudgets();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر اعتماد الموازنة"); }
  };

  /* ── Revise Budget ──────────────────────────────────────────────────────── */
  const handleRevise = async (id: number) => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/budgets/${id}/revise?${slug}`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل مراجعة الموازنة"); }
      toast.success("تم إرجاع الموازنة للمراجعة");
      loadBudgets();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر مراجعة الموازنة"); }
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
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><PieChart size={20} /> الموازنات</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {tab === "budgets" && !showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> بند موازنة</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => switchTab(t.key)} className={cn(
              "py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
            )}>
              {Icon && <Icon size={14} />} {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      {(tab === "budgets" || tab === "vs-actual") && (
        <div className="flex gap-3 items-end bg-card rounded-[10px] border border-border p-3">
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
        <div className="flex gap-3 items-end bg-card rounded-[10px] border border-border p-3">
          <div><label className={labelStyle}>الفترات (مفصولة بفاصلة)</label><input value={compPeriods} onChange={(e) => setCompPeriods(e.target.value)} className={cn(inputStyle, "w-48")} placeholder="Q1,Q2,Q3,Q4" /></div>
        </div>
      )}

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "budgets" ? (
        /* ── Budgets Tab ──────────────────────────────────────────────────────── */
        showForm ? (
          <div className="bg-card rounded-[14px] border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">بند موازنة جديد</h2>
              <button onClick={() => { setShowForm(false); setBudgetAccountId(""); setBudgetPlanned(""); }} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelStyle}>رقم الحساب *</label><input value={budgetAccountId} onChange={(e) => setBudgetAccountId(e.target.value)} className={inputStyle} type="number" placeholder="1" /></div>
              <div><label className={labelStyle}>المبلغ المخطط *</label><input value={budgetPlanned} onChange={(e) => setBudgetPlanned(e.target.value)} className={inputStyle} type="number" placeholder="0.000" /></div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setShowForm(false); setBudgetAccountId(""); setBudgetPlanned(""); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer">إلغاء</button>
              <button onClick={handleCreateBudget} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"><Plus size={14} /> إنشاء</button>
            </div>
          </div>
        ) : budgets.length === 0 ? <Empty label="بنود موازنة" /> : (
          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>كود الحساب</th><th className={thStyle}>اسم الحساب</th>
                  <th className={thStyle}>المبلغ المخطط</th><th className={thStyle}>الفعلي</th><th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
                </tr></thead>
                <tbody>
                  {budgets.map((b) => {
                    const statusMap: Record<string, { label: string; color: string }> = {
                      draft: { label: "مسودة", color: "#f59e0b" },
                      approved: { label: "معتمد", color: "#10b981" },
                      revised: { label: "قيد المراجعة", color: "#3b82f6" },
                    };
                    const st = statusMap[b.status] || { label: b.status, color: "#999" };
                    return (
                      <tr key={b.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-mono font-bold")}>{b.accountCode}</td>
                        <td className={tdStyle}>{b.accountNameAr}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(b.plannedAmount)}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end")}>{b.actualAmount ? fmt(b.actualAmount) : "—"}</td>
                        <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: `${st.color}20`, color: st.color }}>{st.label}</span></td>
                        <td className={tdStyle}>
                          <div className="flex items-center gap-1">
                            {b.status !== "approved" && (
                              <button onClick={() => handleApprove(b.id)} title="اعتماد" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:text-emerald-600"><CheckCircle2 size={13} /></button>
                            )}
                            {b.status === "approved" && (
                              <button onClick={() => handleRevise(b.id)} title="مراجعة" className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-600"><RotateCcw size={13} /></button>
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
          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse">
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
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: r.variance >= 0 ? "#10b981" : "#ef4444" }}>{fmt(r.variance)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: r.variancePercent >= 0 ? "#10b981" : "#ef4444" }}>{r.variancePercent.toFixed(1)}%</td>
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
          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>الفترة</th><th className={thStyle}>الإيرادات</th>
                  <th className={thStyle}>المصروفات</th><th className={thStyle}>صافي الربح</th><th className={thStyle}>النقدية</th>
                </tr></thead>
                <tbody>
                  {comparisons.map((c) => (
                    <tr key={c.id} className="border-b border-border">
                      <td className={cn(tdStyle, "font-bold")}>{c.periodName}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: "#10b981" }}>{fmt(c.revenue)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: "#ef4444" }}>{fmt(c.expenses)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: c.profit >= 0 ? "#10b981" : "#ef4444" }}>{fmt(c.profit)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: "#3b82f6" }}>{fmt(c.cash)}</td>
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
