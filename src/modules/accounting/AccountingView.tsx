"use client";

import { useEffect, useState, useCallback, Suspense, lazy } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, Calculator, X, Trash2, Scale, FileBarChart,
  TrendingUp, TrendingDown, Wallet, Download, RotateCcw,
  LayoutDashboard, Clock, Building, BarChart3, Landmark,
  ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle,
  Calendar, DollarSign, ArrowUpDown,
  FileText, Receipt, Globe, CreditCard, Building2, Package, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Lazy-loaded sub-view imports ──────────────────────────────────────── */
const LazyArApView = lazy(() => import("@/modules/accounting/ArApView"));
const LazyBankingView = lazy(() => import("@/modules/accounting/BankingView"));
const LazyPayrollWpsView = lazy(() => import("@/modules/accounting/PayrollWpsView"));
const LazyFixedAssetsView = lazy(() => import("@/modules/accounting/FixedAssetsView"));
const LazyInventoryCostingView = lazy(() => import("@/modules/accounting/InventoryCostingView"));
const LazyVouchersDetailView = lazy(() => import("@/modules/accounting/VouchersDetailView").then((m) => ({ default: m.VouchersDetailView })));
const LazyTaxComplianceView = lazy(() => import("@/modules/accounting/TaxComplianceView"));
const LazyTradeFinanceView = lazy(() => import("@/modules/accounting/TradeFinanceView").then((m) => ({ default: m.TradeFinanceView })));
const LazyBudgetsView = lazy(() => import("@/modules/accounting/BudgetsView").then((m) => ({ default: m.BudgetsView })));
const LazyAccountantCollabView = lazy(() => import("@/modules/accounting/AccountantCollabView").then((m) => ({ default: m.AccountantCollabView })));
const LazyPaymentRailsView = lazy(() => import("@/modules/accounting/PaymentRailsView").then((m) => ({ default: m.PaymentRailsView })));
const LazyMultiCompanyView = lazy(() => import("@/modules/accounting/MultiCompanyView"));

/* ─── Types ────────────────────────────────────────────────────────────────── */
type ModuleTab =
  | "core"          // existing monolithic content (accounts, journal, trial, statements, fiscal-periods, cost-centers, aging, banking, dashboard)
  | "dashboard"     // Financial dashboard (calls /api/accounting/financial-dashboard)
  | "ar-ap"         // ArApView
  | "banking"       // BankingView
  | "payroll"       // PayrollWpsView
  | "fixed-assets"  // FixedAssetsView
  | "inventory"     // InventoryCostingView
  | "vouchers"      // VouchersDetailView
  | "tax"           // TaxComplianceView
  | "trade"         // TradeFinanceView
  | "budgets"       // BudgetsView
  | "collab"        // AccountantCollabView
  | "payments"      // PaymentRailsView
  | "multi-company"; // MultiCompanyView

type Tab = "dashboard" | "accounts" | "journal" | "trial" | "statements" | "fiscal-periods" | "cost-centers" | "aging" | "banking";
type StatementType = "profit-loss" | "balance-sheet" | "cash-flow";

interface Account { id: number; code: string; nameAr: string; nameEn?: string; type: string; balance: number; currency: string; }
interface JournalLine { id: number; accountId: number; debit: number; credit: number; description?: string; }
interface JournalEntry { id: number; date: string; description?: string; reference?: string; status: string; lines: JournalLine[]; }
interface TrialRow {
  id: number; code: string; nameAr: string; type: string;
  totalDebit: number; totalCredit: number; balance: number;
}
interface FiscalPeriod { id: number; name: string; startDate: string; endDate: string; status: string; closedAt?: string; }
interface CostCenter { id: number; code: string; nameAr: string; parentId?: number | null; type: string; budget?: number; actual?: number; }
interface AgingBucket { range: string; receivable: number; payable: number; count: number; }
interface BankAccount { id: number; name: string; bankName: string; accountNumber: string; currency: string; balance: number; iban?: string; }

/* ─── Module Tab Definitions ───────────────────────────────────────────────── */
const MODULE_TABS: Array<{ key: ModuleTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "core", label: "المحاسبة الأساسية", icon: Calculator },
  { key: "dashboard", label: "لوحة التحكم المالية", icon: LayoutDashboard },
  { key: "ar-ap", label: "الذمم المدينة/الدائنة", icon: ArrowUpDown },
  { key: "banking", label: "البنوك والتسوية", icon: Landmark },
  { key: "payroll", label: "الرواتب/WPS", icon: DollarSign },
  { key: "fixed-assets", label: "الأصول الثابتة", icon: Building },
  { key: "inventory", label: "تكلفة المخزون", icon: Package },
  { key: "vouchers", label: "السندات والعروض", icon: FileText },
  { key: "tax", label: "الضرائب والامتثال", icon: Receipt },
  { key: "trade", label: "التمويل التجاري", icon: Globe },
  { key: "budgets", label: "الموازنات", icon: BarChart3 },
  { key: "collab", label: "المحاسب الخارجي", icon: Users },
  { key: "payments", label: "طرق الدفع المحلية", icon: CreditCard },
  { key: "multi-company", label: "الشركات المتعددة", icon: Building2 },
];

const PAGE_SIZE = 20;

export function AccountingView() {
  const { activeCompany } = useBrand();
  const [moduleTab, setModuleTab] = useState<ModuleTab>("core");

  /* ─── Core sub-module state (preserved exactly as-is) ────────────────── */
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [trial, setTrial] = useState<{ accounts: TrialRow[]; grandDebit: number; grandCredit: number; isBalanced: boolean } | null>(null);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [reversingId, setReversingId] = useState<number | null>(null);
  const [reverseConfirm, setReverseConfirm] = useState<JournalEntry | null>(null);

  const load = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    const slug = `companySlug=${encodeURIComponent(activeCompany.slug)}`;
    try {
      const [a, j] = await Promise.all([
        authedFetch(`/api/accounting/accounts?${slug}`),
        authedFetch(`/api/accounting/journal-entries?${slug}`),
      ]);
      if (!a.ok || !j.ok) {
        const failed = !a.ok ? a : j;
        const e = await failed.json().catch(() => ({}));
        throw new Error((e as Record<string, unknown>)?.error as string || `فشل تحميل البيانات (${failed.status})`);
      }
      const [aD, jD] = await Promise.all([a.json(), j.json()]);
      setAccounts((aD as { accounts?: Account[] }).accounts || []);
      setEntries((jD as { entries?: JournalEntry[] }).entries || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحميل بيانات المحاسبة");
    } finally { setLoading(false); }
  }, [activeCompany]);

  const loadTrial = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/trial-balance?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error((e as Record<string, unknown>)?.error as string || "تعذّر تحميل ميزان المراجعة");
        setTrial(null);
        return;
      }
      setTrial(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحميل ميزان المراجعة");
      setTrial(null);
    }
  }, [activeCompany]);

  const loadFiscalPeriods = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/fiscal-periods?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (res.ok) { const d = await res.json(); setFiscalPeriods(d.periods || []); }
      else { setFiscalPeriods([]); }
    } catch { setFiscalPeriods([]); }
  }, [activeCompany]);

  const loadCostCenters = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/cost-centers?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (res.ok) { const d = await res.json(); setCostCenters(d.costCenters || []); }
      else { setCostCenters([]); }
    } catch { setCostCenters([]); }
  }, [activeCompany]);

  const loadAging = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/aging?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (res.ok) { const d = await res.json(); setAgingData(d.buckets || []); }
      else { setAgingData([]); }
    } catch { setAgingData([]); }
  }, [activeCompany]);

  const loadBankAccounts = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/accounting/bank-accounts?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (res.ok) { const d = await res.json(); setBankAccounts(d.accounts || []); }
      else { setBankAccounts([]); }
    } catch { setBankAccounts([]); }
  }, [activeCompany]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === "trial" && activeCompany) loadTrial();
    if (tab === "fiscal-periods" && activeCompany) loadFiscalPeriods();
    if (tab === "cost-centers" && activeCompany) loadCostCenters();
    if (tab === "aging" && activeCompany) loadAging();
    if (tab === "banking" && activeCompany) loadBankAccounts();
    if (tab === "dashboard" && activeCompany) { load(); loadAging(); loadBankAccounts(); }
  }, [tab, activeCompany, loadTrial, loadFiscalPeriods, loadCostCenters, loadAging, loadBankAccounts, load]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setShowForm(false);
    setSelectedIds(new Set());
    setCurrentPage(1);
  };

  const itemsForTab = (): Array<{ id: number }> => (tab === "accounts" ? accounts : entries);

  const allItems = itemsForTab();
  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const pageItems = allItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const safePage = Math.min(currentPage, totalPages);

  const toggleSelectAll = () => {
    if (selectedIds.size === pageItems.length && pageItems.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(pageItems.map((i) => i.id)));
  };
  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`حذف ${selectedIds.size} عنصر؟`)) return;
    const endpoint = tab === "accounts" ? "/api/accounting/accounts" : "/api/accounting/journal-entries";
    setBulkDeleting(true);
    let okCount = 0, failCount = 0;
    for (const id of selectedIds) {
      try {
        const res = await authedFetch(`${endpoint}/${id}`, { method: "DELETE" });
        if (res.ok) okCount++;
        else { failCount++; }
      } catch { failCount++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تم حذف ${okCount} عنصر`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} عنصر`);
    load();
  };
  const handleDelete = async (id: number) => {
    if (!confirm("حذف هذا العنصر؟")) return;
    const endpoint = tab === "accounts" ? "/api/accounting/accounts" : "/api/accounting/journal-entries";
    const res = await authedFetch(`${endpoint}/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("تم الحذف"); load(); }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر الحذف"); }
  };

  const handleReverse = async (entry: JournalEntry) => {
    if (!activeCompany) return;
    setReverseConfirm(entry);
  };

  const confirmReverse = async () => {
    if (!reverseConfirm || !activeCompany) return;
    const entry = reverseConfirm;
    setReversingId(entry.id);
    try {
      const url = `/api/accounting/journal-entries/${entry.id}/reverse?companySlug=${encodeURIComponent(activeCompany.slug)}`;
      const res = await authedFetch(url, { method: "POST" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "تعذّر العكس");
      }
      const data = await res.json().catch(() => ({}));
      const reversalId = data?.reversal?.id;
      toast.success(reversalId ? `تم إنشاء قيد عكسي #${reversalId}` : "تم عكس القيد");
      setReverseConfirm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ أثناء العكس");
    } finally { setReversingId(null); }
  };

  const pageBtnStyle = (disabled: boolean): string =>
    disabled
      ? "py-1.5 px-3 rounded-md bg-transparent text-muted-foreground border border-border text-[12px] font-bold cursor-not-allowed opacity-50"
      : "py-1.5 px-3 rounded-md bg-card text-foreground border border-border text-[12px] font-bold cursor-pointer";

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const ACCOUNT_TYPES: Record<string, { label: string; color: string }> = {
    asset: { label: "أصول", color: "#10b981" },
    liability: { label: "خصوم", color: "#ef4444" },
    equity: { label: "حقوق ملكية", color: "#7c3aed" },
    revenue: { label: "إيرادات", color: "#3b82f6" },
    expense: { label: "مصروفات", color: "#f59e0b" },
    contra_revenue: { label: "مقابل إيرادات", color: "#9ca3af" },
    contra_asset: { label: "مقابل أصول", color: "#9ca3af" },
  };

  const tabs: Array<{ key: Tab; label: string; icon?: React.ComponentType<{ size?: number }> }> = [
    { key: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
    { key: "accounts", label: `الحسابات (${accounts.length})` },
    { key: "journal", label: `القيود (${entries.length})` },
    { key: "trial", label: "ميزان المراجعة", icon: Scale },
    { key: "statements", label: "القوائم المالية", icon: FileBarChart },
    { key: "fiscal-periods", label: "الفترات المالية", icon: Clock },
    { key: "cost-centers", label: "مراكز التكلفة", icon: Building },
    { key: "aging", label: "تقادم الذمم", icon: BarChart3 },
    { key: "banking", label: "البنوك", icon: Landmark },
  ];

  // Dashboard metrics
  const totalRevenue = accounts.filter(a => a.type === "revenue").reduce((s, a) => s + a.balance, 0);
  const totalExpenses = accounts.filter(a => a.type === "expense").reduce((s, a) => s + a.balance, 0);
  const totalAssets = accounts.filter(a => a.type === "asset").reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = accounts.filter(a => a.type === "liability").reduce((s, a) => s + a.balance, 0);
  const netProfit = totalRevenue - totalExpenses;
  const totalAR = agingData.reduce((s, b) => s + b.receivable, 0);
  const totalAP = agingData.reduce((s, b) => s + b.payable, 0);
  const totalCash = bankAccounts.reduce((s, b) => s + b.balance, 0);
  const currentPeriod = fiscalPeriods.find(p => p.status === "open");

  /* ─── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4">
      {/* Module-level header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><Calculator size={20} /> المحاسبة</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
      </div>

      {/* Module-level navigation tabs (top row, visually distinct) */}
      <div className="flex gap-1.5 flex-wrap bg-muted/50 rounded-[12px] p-2">
        {MODULE_TABS.map((mt) => {
          const Icon = mt.icon;
          const active = moduleTab === mt.key;
          return (
            <button
              key={mt.key}
              onClick={() => setModuleTab(mt.key)}
              className={cn(
                "py-2.5 px-4 rounded-[10px] text-[13px] font-bold cursor-pointer inline-flex items-center gap-2 transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground border border-border hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon size={16} />
              {mt.label}
            </button>
          );
        })}
      </div>

      {/* ─── Module content ─────────────────────────────────────────────── */}
      {moduleTab === "core" ? (
        /* ─── Core sub-module: exact original inner content ───────────── */
        <>
          <div className="flex flex-wrap justify-between items-center gap-3">
            {(tab === "accounts" || tab === "journal" || tab === "fiscal-periods" || tab === "cost-centers" || tab === "banking") && (
              <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> إضافة</button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => switchTab(t.key)} className={cn(
                  "py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5",
                  tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                )}>
                  {Icon && <Icon size={14} />}
                  {t.label}
                </button>
              );
            })}
          </div>

          {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "dashboard" ? (
            <FinancialDashboard
              totalRevenue={totalRevenue}
              totalExpenses={totalExpenses}
              netProfit={netProfit}
              totalAssets={totalAssets}
              totalLiabilities={totalLiabilities}
              totalAR={totalAR}
              totalAP={totalAP}
              totalCash={totalCash}
              currentPeriod={currentPeriod}
              entriesCount={entries.length}
              accountsCount={accounts.length}
            />
          ) : tab === "trial" ? (
            <TrialBalanceTable data={trial} loading={loading} />
          ) : tab === "statements" ? (
            <FinancialStatements company={activeCompany} />
          ) : tab === "fiscal-periods" ? (
            showForm ? <FiscalPeriodForm company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadFiscalPeriods(); }} /> : (
              <FiscalPeriodsTable periods={fiscalPeriods} company={activeCompany} onRefresh={loadFiscalPeriods} />
            )
          ) : tab === "cost-centers" ? (
            showForm ? <CostCenterForm company={activeCompany} costCenters={costCenters} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadCostCenters(); }} /> : (
              <CostCentersTable costCenters={costCenters} />
            )
          ) : tab === "aging" ? (
            <AgingReport data={agingData} totalAR={totalAR} totalAP={totalAP} />
          ) : tab === "banking" ? (
            showForm ? <BankAccountForm company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadBankAccounts(); }} /> : (
              <BankAccountsList accounts={bankAccounts} company={activeCompany} onRefresh={loadBankAccounts} />
            )
          ) : showForm ? (
            tab === "accounts" ? (
              <AccountForm company={activeCompany} accounts={accounts} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
            ) : (
              <JournalForm company={activeCompany} accounts={accounts} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
            )
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="py-2.5 px-4 bg-destructive text-white rounded-[10px] flex flex-wrap justify-between items-center gap-2">
                  <span className="font-bold text-[13px]">{selectedIds.size} عنصر محدد</span>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting} className="bg-white/15 text-white border-none rounded-md py-1.5 px-3.5 text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed">إلغاء التحديد</button>
                    <button onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-white/25 text-white border-none rounded-md py-1.5 px-3.5 text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70">{bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد"}</button>
                  </div>
                </div>
              )}

              <div className="bg-card rounded-[14px] border border-border overflow-hidden">
                {allItems.length === 0 ? <Empty label={tab === "accounts" ? "حسابات" : "قيود يومية"} /> : (
                  <>
                    <div className="overflow-x-auto garfix-scroll">
                      {tab === "accounts" ? (
                        <table className="w-full border-collapse">
                          <thead><tr className="border-b border-border bg-muted">
                            <th className={thCheck}><input type="checkbox" checked={selectedIds.size === pageItems.length && pageItems.length > 0} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" /></th>
                            <th className={thStyle}>الكود</th><th className={thStyle}>الاسم</th><th className={thStyle}>النوع</th>
                            <th className={thStyle}>الرصيد</th><th className={thStyle}>العملة</th><th className={thStyle}>إجراء</th>
                          </tr></thead>
                          <tbody>
                            {(pageItems as Account[]).map((a) => {
                              const t = ACCOUNT_TYPES[a.type] || { label: a.type, color: "#999" };
                              const checked = selectedIds.has(a.id);
                              return (
                                <tr key={a.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
                                  <td className={tdCheck(checked)}><input type="checkbox" checked={checked} onChange={() => toggleRow(a.id)} className="cursor-pointer w-4 h-4" aria-label={`تحديد ${a.nameAr}`} /></td>
                                  <td className={cn(tdStyle, "font-mono")}>{a.code}</td>
                                  <td className={cn(tdStyle, "font-bold")}>{a.nameAr}</td>
                                  <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: `${t.color}20`, color: t.color }}>{t.label}</span></td>
                                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{a.balance.toLocaleString("ar-EG")}</td>
                                  <td className={tdStyle}>{a.currency}</td>
                                  <td className={tdStyle}><button onClick={() => handleDelete(a.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full border-collapse">
                          <thead><tr className="border-b border-border bg-muted">
                            <th className={thCheck}><input type="checkbox" checked={selectedIds.size === pageItems.length && pageItems.length > 0} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" /></th>
                            <th className={thStyle}>التاريخ</th><th className={thStyle}>الوصف</th>
                            <th className={thStyle}>المرجع</th><th className={thStyle}>الحالة</th><th className={thStyle}>البنود</th><th className={thStyle}>إجراء</th>
                          </tr></thead>
                          <tbody>
                            {(pageItems as JournalEntry[]).map((e) => {
                              const checked = selectedIds.has(e.id);
                              const canReverse = e.status === "posted";
                              return (
                                <tr key={e.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
                                  <td className={tdCheck(checked)}><input type="checkbox" checked={checked} onChange={() => toggleRow(e.id)} className="cursor-pointer w-4 h-4" aria-label="تحديد قيد" /></td>
                                  <td className={tdStyle}>{e.date}</td>
                                  <td className={cn(tdStyle, "font-bold")}>{e.description || "—"}</td>
                                  <td className={cn(tdStyle, "font-mono")}>{e.reference || "—"}</td>
                                  <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: e.status === "posted" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: e.status === "posted" ? "#10b981" : "#f59e0b" }}>{e.status === "posted" ? "مُرحّل" : e.status === "draft" ? "مسودة" : "معكوس"}</span></td>
                                  <td className={tdStyle}>{e.lines?.length || 0}</td>
                                  <td className={tdStyle}>
                                    <div className="flex items-center gap-1.5">
                                      {tab === "journal" && (
                                        <button onClick={() => handleReverse(e)} disabled={!canReverse || reversingId === e.id} title={canReverse ? "عكس القيد" : "لا يمكن العكس"} className={cn("inline-flex items-center justify-center w-7 h-7 rounded-md border border-border transition-colors", canReverse ? "hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-600 cursor-pointer" : "opacity-30 cursor-not-allowed")}>
                                          <RotateCcw size={13} className={reversingId === e.id ? "animate-spin" : ""} />
                                        </button>
                                      )}
                                      <button onClick={() => handleDelete(e.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-between items-center py-3 px-4 border-t border-border gap-2">
                      <span className="text-[12px] text-muted-foreground">صفحة {safePage} من {totalPages} ({allItems.length} عنصر)</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className={pageBtnStyle(safePage === 1)}>السابق</button>
                        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={pageBtnStyle(safePage === totalPages)}>التالي</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Reverse confirmation dialog */}
          {reverseConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => reversingId === null && setReverseConfirm(null)}>
              <div className="bg-card border border-border rounded-[14px] shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0"><RotateCcw size={18} /></div>
                  <div className="flex-1">
                    <h3 className="font-bold text-base">عكس القيد #{reverseConfirm.id}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{reverseConfirm.description || "بدون وصف"} • {reverseConfirm.date} • {reverseConfirm.lines?.length || 0} بند</p>
                  </div>
                </div>
                <div className="bg-muted rounded-md p-3 text-xs leading-relaxed mb-4">
                  سيتم إنشاء <strong>قيد عكسي جديد</strong> بنفس البنود ولكن مع <strong>تبديل المدين/الدائن</strong>، وترحيله فورًا.
                  <br /><span className="text-amber-600 font-semibold mt-1 block">⚠️ هذا إجراء مالي حساس — لا يمكن التراجع عنه.</span>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setReverseConfirm(null)} disabled={reversingId !== null} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer disabled:opacity-50">إلغاء</button>
                  <button onClick={confirmReverse} disabled={reversingId !== null} className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"><RotateCcw size={14} className={reversingId !== null ? "animate-spin" : ""} />{reversingId !== null ? "جارٍ العكس…" : "تأكيد العكس"}</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : moduleTab === "dashboard" ? (
        /* ─── Financial Dashboard (API-backed) ──────────────────────────── */
        <FinancialDashboardApiView />
      ) : (
        /* ─── Other sub-modules: lazy-loaded ────────────────────────────── */
        <Suspense fallback={<div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>}>
          {moduleTab === "ar-ap" && <LazyArApView />}
          {moduleTab === "banking" && <LazyBankingView />}
          {moduleTab === "payroll" && <LazyPayrollWpsView />}
          {moduleTab === "fixed-assets" && <LazyFixedAssetsView />}
          {moduleTab === "inventory" && <LazyInventoryCostingView />}
          {moduleTab === "vouchers" && <LazyVouchersDetailView />}
          {moduleTab === "tax" && <LazyTaxComplianceView />}
          {moduleTab === "trade" && <LazyTradeFinanceView />}
          {moduleTab === "budgets" && <LazyBudgetsView />}
          {moduleTab === "collab" && <LazyAccountantCollabView />}
          {moduleTab === "payments" && <LazyPaymentRailsView />}
          {moduleTab === "multi-company" && <LazyMultiCompanyView />}
        </Suspense>
      )}
    </div>
  );
}

/* ─── Financial Dashboard (API-backed) ──────────────────────────────────── */
interface DashboardMetrics {
  revenue: number;
  expenses: number;
  netProfit: number;
  cashPosition: number;
  accountsReceivable: number;
  accountsPayable: number;
  inventoryValue: number;
  trends: {
    revenueChange: number | null;
    expenseChange: number | null;
    profitChange: number | null;
    cashChange: number | null;
  };
}

function FinancialDashboardApiView() {
  const { activeCompany } = useBrand();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const loadDashboard = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/financial-dashboard?companySlug=${encodeURIComponent(activeCompany.slug)}&from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setPeriod(data.period);
      } else {
        const e = await res.json().catch(() => ({}));
        toast.error((e as Record<string, unknown>)?.error as string || "تعذّر تحميل لوحة التحكم المالية");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحميل لوحة التحكم المالية");
    } finally { setLoading(false); }
  }, [activeCompany, from, to]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });
  const fmtPct = (n: number | null) => {
    if (n === null) return "—";
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  };

  if (loading && !metrics) return <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>;
  if (!metrics) return <div className="p-12 text-center text-muted-foreground">لا توجد بيانات</div>;

  const kpiCards = [
    { label: "الإيرادات", value: metrics.revenue, color: "#10b981", icon: <TrendingUp size={18} />, trend: metrics.trends.revenueChange },
    { label: "المصروفات", value: metrics.expenses, color: "#f59e0b", icon: <TrendingDown size={18} />, trend: metrics.trends.expenseChange },
    { label: "صافي الربح", value: metrics.netProfit, color: metrics.netProfit >= 0 ? "#10b981" : "#ef4444", icon: <DollarSign size={18} />, trend: metrics.trends.profitChange },
    { label: "النقدية", value: metrics.cashPosition, color: "#10b981", icon: <Wallet size={18} />, trend: metrics.trends.cashChange },
    { label: "الذمم المدينة", value: metrics.accountsReceivable, color: "#7c3aed", icon: <ArrowUpDown size={18} />, trend: null },
    { label: "الذمم الدائنة", value: metrics.accountsPayable, color: "#f59e0b", icon: <ArrowUpDown size={18} />, trend: null },
    { label: "قيمة المخزون", value: metrics.inventoryValue, color: "#3b82f6", icon: <Package size={18} />, trend: null },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Period filter */}
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">من</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">إلى</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <button onClick={loadDashboard} disabled={loading} className="mr-auto py-2 px-4 rounded-sm bg-accent text-accent-foreground border border-border text-[12px] font-bold cursor-pointer disabled:opacity-70">
          {loading ? "جارٍ…" : "تحديث"}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {kpiCards.map((kpi) => (
          <DashboardCard
            key={kpi.label}
            label={kpi.label}
            value={fmt(kpi.value)}
            color={kpi.color}
            icon={kpi.icon}
            trend={kpi.trend !== null ? fmtPct(kpi.trend) : undefined}
          />
        ))}
      </div>

      {/* Period info */}
      {period && (
        <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-2">
          <h3 className="font-bold text-[14px] flex items-center gap-2"><Calendar size={16} /> الفترة المالية</h3>
          <div className="text-[13px] font-bold">{period.from} ← {period.to}</div>
          <div className="text-[12px] text-muted-foreground">هامش الربح: <span className="font-bold" style={{ color: metrics.revenue > 0 ? (metrics.netProfit / metrics.revenue * 100 >= 10 ? "#10b981" : "#f59e0b") : "#ef4444" }}>{metrics.revenue > 0 ? `${(metrics.netProfit / metrics.revenue * 100).toFixed(1)}%` : "—"}</span></div>
        </div>
      )}

      {/* Trends summary */}
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-2">
        <h3 className="font-bold text-[14px] flex items-center gap-2"><LayoutDashboard size={16} /> التغيرات عن الفترة السابقة</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 text-[13px]">
          <div className="flex justify-between"><span className="text-muted-foreground">الإيرادات</span><span className="font-bold" style={{ color: metrics.trends.revenueChange !== null ? (metrics.trends.revenueChange >= 0 ? "#10b981" : "#ef4444") : undefined }}>{fmtPct(metrics.trends.revenueChange)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">المصروفات</span><span className="font-bold" style={{ color: metrics.trends.expenseChange !== null ? (metrics.trends.expenseChange <= 0 ? "#10b981" : "#ef4444") : undefined }}>{fmtPct(metrics.trends.expenseChange)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">صافي الربح</span><span className="font-bold" style={{ color: metrics.trends.profitChange !== null ? (metrics.trends.profitChange >= 0 ? "#10b981" : "#ef4444") : undefined }}>{fmtPct(metrics.trends.profitChange)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">النقدية</span><span className="font-bold" style={{ color: metrics.trends.cashChange !== null ? (metrics.trends.cashChange >= 0 ? "#10b981" : "#ef4444") : undefined }}>{fmtPct(metrics.trends.cashChange)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ─── Financial Dashboard (core inner) ────────────────────────────────── */
function FinancialDashboard({ totalRevenue, totalExpenses, netProfit, totalAssets, totalLiabilities, totalAR, totalAP, totalCash, currentPeriod, entriesCount, accountsCount }: {
  totalRevenue: number; totalExpenses: number; netProfit: number; totalAssets: number;
  totalLiabilities: number; totalAR: number; totalAP: number; totalCash: number;
  currentPeriod?: FiscalPeriod; entriesCount: number; accountsCount: number;
}) {
  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });
  const metrics = [
    { label: "الإيرادات", value: totalRevenue, color: "#10b981", icon: <TrendingUp size={18} /> },
    { label: "المصروفات", value: totalExpenses, color: "#f59e0b", icon: <TrendingDown size={18} /> },
    { label: "صافي الربح", value: netProfit, color: netProfit >= 0 ? "#10b981" : "#ef4444", icon: <DollarSign size={18} /> },
    { label: "إجمالي الأصول", value: totalAssets, color: "#3b82f6", icon: <Scale size={18} /> },
    { label: "الخصوم", value: totalLiabilities, color: "#ef4444", icon: <TrendingDown size={18} /> },
    { label: "النقدية", value: totalCash, color: "#10b981", icon: <Wallet size={18} /> },
    { label: "الذمم المدينة", value: totalAR, color: "#7c3aed", icon: <ArrowUpDown size={18} /> },
    { label: "الذمم الدائنة", value: totalAP, color: "#f59e0b", icon: <ArrowUpDown size={18} /> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {metrics.map((m) => (
          <DashboardCard key={m.label} label={m.label} value={fmt(m.value)} color={m.color} icon={m.icon} />
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3">
          <h3 className="font-bold text-[14px] flex items-center gap-2"><Clock size={16} /> الفترة المالية الحالية</h3>
          {currentPeriod ? (
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] font-bold">{currentPeriod.name}</div>
              <div className="text-[12px] text-muted-foreground">{currentPeriod.startDate} ← {currentPeriod.endDate}</div>
              <span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: currentPeriod.status === "open" ? "rgba(16,185,129,0.15)" : currentPeriod.status === "closed" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)", color: currentPeriod.status === "open" ? "#10b981" : currentPeriod.status === "closed" ? "#ef4444" : "#f59e0b" }}>{currentPeriod.status === "open" ? "مفتوحة" : currentPeriod.status === "closed" ? "مقفلة" : "مؤقتة"}</span>
            </div>
          ) : (
            <div className="text-[12px] text-muted-foreground">لا توجد فترة مالية مفتوحة</div>
          )}
        </div>
        <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3">
          <h3 className="font-bold text-[14px] flex items-center gap-2"><Calculator size={16} /> ملخص</h3>
          <div className="flex flex-col gap-1.5 text-[13px]">
            <div className="flex justify-between"><span className="text-muted-foreground">الحسابات</span><span className="font-bold">{accountsCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">القيود</span><span className="font-bold">{entriesCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">هامش الربح</span><span className="font-bold" style={{ color: totalRevenue > 0 ? (netProfit / totalRevenue * 100 >= 10 ? "#10b981" : "#f59e0b") : "#ef4444" }}>{totalRevenue > 0 ? `${(netProfit / totalRevenue * 100).toFixed(1)}%` : "—"}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ label, value, color, icon, trend }: { label: string; value: string; color: string; icon: React.ReactNode; trend?: string }) {
  return (
    <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-sm flex items-center justify-center shrink-0" style={{ background: `${color}20`, color }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-lg font-extrabold [direction:ltr] text-end truncate">{value}</div>
        {trend && <div className="text-[10px] font-bold mt-0.5" style={{ color: trend.startsWith("+") ? "#10b981" : trend.startsWith("-") ? "#ef4444" : "#9ca3af" }}>{trend} vs السابق</div>}
      </div>
    </div>
  );
}

/* ─── Fiscal Periods ──────────────────────────────────────────────────────── */
function FiscalPeriodsTable({ periods, company, onRefresh }: { periods: FiscalPeriod[]; company: { slug: string }; onRefresh: () => void }) {
  const [closingId, setClosingId] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);

  const handleClose = async (p: FiscalPeriod) => {
    if (!confirm(`قفل الفترة "${p.name}"؟ لا يمكن التراجع.`)) return;
    setClosingId(p.id);
    try {
      const res = await authedFetch(`/api/accounting/fiscal-periods/${p.id}/close?companySlug=${encodeURIComponent(company.slug)}`, { method: "POST" });
      if (res.ok) { toast.success("تم قفل الفترة"); onRefresh(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر قفل الفترة"); }
    } catch { toast.error("خطأ في الاتصال"); }
    finally { setClosingId(null); }
  };

  const handleReopen = async (p: FiscalPeriod) => {
    if (!confirm(`إعادة فتح الفترة "${p.name}"؟`)) return;
    setOpeningId(p.id);
    try {
      const res = await authedFetch(`/api/accounting/fiscal-periods/${p.id}/reopen?companySlug=${encodeURIComponent(company.slug)}`, { method: "POST" });
      if (res.ok) { toast.success("تم إعادة الفتح"); onRefresh(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر إعادة الفتح"); }
    } catch { toast.error("خطأ في الاتصال"); }
    finally { setOpeningId(null); }
  };

  const statusIcon = (status: string) => {
    if (status === "open") return <CheckCircle2 size={14} style={{ color: "#10b981" }} />;
    if (status === "closed") return <XCircle size={14} style={{ color: "#ef4444" }} />;
    return <AlertTriangle size={14} style={{ color: "#f59e0b" }} />;
  };

  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      {periods.length === 0 ? <Empty label="فترات مالية" /> : (
        <div className="overflow-x-auto garfix-scroll">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-border bg-muted">
              <th className={thStyle}>الاسم</th><th className={thStyle}>البداية</th><th className={thStyle}>النهاية</th>
              <th className={thStyle}>الحالة</th><th className={thStyle}>تاريخ القفل</th><th className={thStyle}>إجراء</th>
            </tr></thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-border">
                  <td className={cn(tdStyle, "font-bold flex items-center gap-1.5")}>{statusIcon(p.status)} {p.name}</td>
                  <td className={tdStyle} dir="ltr">{p.startDate}</td>
                  <td className={tdStyle} dir="ltr">{p.endDate}</td>
                  <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: p.status === "open" ? "rgba(16,185,129,0.15)" : p.status === "closed" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)", color: p.status === "open" ? "#10b981" : p.status === "closed" ? "#ef4444" : "#f59e0b" }}>{p.status === "open" ? "مفتوحة" : p.status === "closed" ? "مقفلة" : "مؤقتة"}</span></td>
                  <td className={tdStyle}>{p.closedAt || "—"}</td>
                  <td className={tdStyle}>
                    <div className="flex items-center gap-1.5">
                      {p.status === "open" && <button onClick={() => handleClose(p)} disabled={closingId === p.id} className="py-1 px-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-600 text-[11px] font-bold cursor-pointer disabled:opacity-50">{closingId === p.id ? "جارٍ…" : "قفل"}</button>}
                      {p.status === "closed" && <button onClick={() => handleReopen(p)} disabled={openingId === p.id} className="py-1 px-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[11px] font-bold cursor-pointer disabled:opacity-50">{openingId === p.id ? "جارٍ…" : "إعادة فتح"}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FiscalPeriodForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name || !startDate || !endDate) { toast.error("جميع الحقول مطلوبة"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/fiscal-periods", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startDate, endDate, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء الفترة المالية");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold">فترة مالية جديدة</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>الاسم *</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputStyle} placeholder="مثال: 2025-Q1" /></div>
        <div><label className={labelStyle}>تاريخ البداية *</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>تاريخ النهاية *</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

/* ─── Cost Centers ─────────────────────────────────────────────────────────── */
function CostCentersTable({ costCenters }: { costCenters: CostCenter[] }) {
  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      {costCenters.length === 0 ? <Empty label="مراكز التكلفة" /> : (
        <div className="overflow-x-auto garfix-scroll">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-border bg-muted">
              <th className={thStyle}>الكود</th><th className={thStyle}>الاسم</th><th className={thStyle}>النوع</th>
              <th className={cn(thStyle, "text-end")}>الموازنة</th><th className={cn(thStyle, "text-end")}>الفعلي</th><th className={cn(thStyle, "text-end")}>الفرق</th>
            </tr></thead>
            <tbody>
              {costCenters.map((cc) => {
                const diff = (cc.budget || 0) - (cc.actual || 0);
                return (
                  <tr key={cc.id} className="border-b border-border">
                    <td className={cn(tdStyle, "font-mono")}>{cc.code}</td>
                    <td className={cn(tdStyle, "font-bold")}>{cc.nameAr}</td>
                    <td className={tdStyle}>{cc.type}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{(cc.budget || 0).toLocaleString("ar-EG")}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{(cc.actual || 0).toLocaleString("ar-EG")}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: diff >= 0 ? "#10b981" : "#ef4444" }}>{diff.toLocaleString("ar-EG")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CostCenterForm({ company, costCenters, onClose, onSaved }: { company: { slug: string }; costCenters: CostCenter[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [type, setType] = useState("department");
  const [parentId, setParentId] = useState<number | null>(null);
  const [budget, setBudget] = useState(0);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code || !nameAr) { toast.error("الكود والاسم مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/cost-centers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, nameAr, type, parentId, budget, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء مركز التكلفة");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold">مركز تكلفة جديد</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>الكود *</label><input value={code} onChange={(e) => setCode(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>الاسم (عربي) *</label><input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputStyle} /></div>
        <div><label className={labelStyle}>النوع</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputStyle}>
            <option value="department">قسم</option><option value="project">مشروع</option><option value="branch">فرع</option><option value="product">منتج</option>
          </select>
        </div>
        <div><label className={labelStyle}>الأب</label>
          <select value={parentId ?? ""} onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
            <option value="">—</option>
            {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} — {cc.nameAr}</option>)}
          </select>
        </div>
        <div><label className={labelStyle}>الموازنة</label><input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

/* ─── Aging Report ─────────────────────────────────────────────────────────── */
function AgingReport({ data, totalAR, totalAP }: { data: AgingBucket[]; totalAR: number; totalAP: number }) {
  const [mode, setMode] = useState<"receivable" | "payable">("receivable");
  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        <button onClick={() => setMode("receivable")} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer", mode === "receivable" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>ذمم مدينة (مستحقات)</button>
        <button onClick={() => setMode("payable")} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer", mode === "payable" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>ذمم دائنة (التزامات)</button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <DashboardCard label={mode === "receivable" ? "إجمالي الذمم المدينة" : "إجمالي الذمم الدائنة"} value={fmt(mode === "receivable" ? totalAR : totalAP)} color={mode === "receivable" ? "#7c3aed" : "#f59e0b"} icon={<ArrowUpDown size={18} />} />
      </div>
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {data.length === 0 ? <Empty label="بيانات التقادم" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>الفترة</th><th className={cn(thStyle, "text-end")}>المبلغ</th><th className={thStyle}>عدد الحركات</th><th className={cn(thStyle, "text-end")}>النسبة</th>
              </tr></thead>
              <tbody>
                {data.map((b, i) => {
                  const val = mode === "receivable" ? b.receivable : b.payable;
                  const total = mode === "receivable" ? totalAR : totalAP;
                  const pct = total > 0 ? (val / total * 100).toFixed(1) : "0";
                  return (
                    <tr key={i} className="border-b border-border">
                      <td className={cn(tdStyle, "font-bold")}>{b.range}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: val > 0 ? (mode === "receivable" ? "#7c3aed" : "#f59e0b") : "#10b981" }}>{fmt(val)}</td>
                      <td className={tdStyle}>{b.count}</td>
                      <td className={cn(tdStyle, "text-end")}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-extrabold">
                  <td className={cn(tdStyle, "font-extrabold")}>الإجمالي</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: mode === "receivable" ? "#7c3aed" : "#f59e0b" }}>{fmt(mode === "receivable" ? totalAR : totalAP)}</td>
                  <td className={cn(tdStyle, "font-extrabold")}>{data.reduce((s, b) => s + b.count, 0)}</td>
                  <td className={cn(tdStyle, "font-extrabold text-end")}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Bank Accounts ─────────────────────────────────────────────────────────── */
function BankAccountsList({ accounts, company, onRefresh }: { accounts: BankAccount[]; company: { slug: string }; onRefresh: () => void }) {
  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });

  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      {accounts.length === 0 ? <Empty label="حسابات بنكية" /> : (
        <div className="overflow-x-auto garfix-scroll">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-border bg-muted">
              <th className={thStyle}>البنك</th><th className={thStyle}>اسم الحساب</th><th className={thStyle}>رقم الحساب</th>
              <th className={thStyle}>IBAN</th><th className={thStyle}>العملة</th><th className={cn(thStyle, "text-end")}>الرصيد</th>
            </tr></thead>
            <tbody>
              {accounts.map((ba) => (
                <tr key={ba.id} className="border-b border-border">
                  <td className={cn(tdStyle, "font-bold")}><Landmark size={14} className="inline me-1 opacity-50" />{ba.bankName}</td>
                  <td className={tdStyle}>{ba.name}</td>
                  <td className={cn(tdStyle, "font-mono")} dir="ltr">{ba.accountNumber}</td>
                  <td className={cn(tdStyle, "font-mono text-[11px]")} dir="ltr">{ba.iban || "—"}</td>
                  <td className={tdStyle}>{ba.currency}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: ba.balance >= 0 ? "#10b981" : "#ef4444" }}>{fmt(ba.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted font-extrabold">
                <td className={cn(tdStyle, "font-extrabold")} colSpan={5}>إجمالي النقدية</td>
                <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: "#10b981" }}>{fmt(accounts.reduce((s, ba) => s + ba.balance, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function BankAccountForm({ company, onClose, onSaved }: { company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [currency, setCurrency] = useState(company.slug.includes("kw") ? "KWD" : company.slug.includes("sa") ? "SAR" : "AED");
  const [balance, setBalance] = useState(0);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name || !bankName || !accountNumber) { toast.error("الاسم والبنك ورقم الحساب مطلوبة"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/bank-accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bankName, accountNumber, iban, currency, balance, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء الحساب البنكي");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold">حساب بنكي جديد</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>اسم الحساب *</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputStyle} /></div>
        <div><label className={labelStyle}>البنك *</label><input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputStyle} /></div>
        <div><label className={labelStyle}>رقم الحساب *</label><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>IBAN</label><input value={iban} onChange={(e) => setIban(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>العملة</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputStyle}>
            <option value="KWD">KWD</option><option value="SAR">SAR</option><option value="AED">AED</option><option value="USD">USD</option><option value="EUR">EUR</option>
          </select>
        </div>
        <div><label className={labelStyle}>الرصيد الافتتاحي</label><input type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

/* ─── Trial Balance Table ──────────────────────────────────────────────────── */
function TrialBalanceTable({ data, loading }: { data: { accounts: TrialRow[]; grandDebit: number; grandCredit: number; isBalanced: boolean } | null; loading: boolean }) {
  if (loading && !data) return <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>;
  if (!data || data.accounts.length === 0) return (
    <div className="bg-card rounded-[14px] border border-border p-12 text-center text-muted-foreground">
      <Scale size={36} className="opacity-30 mb-2" /><div>لا توجد بيانات لميزان المراجعة</div>
    </div>
  );
  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      <div className="overflow-x-auto garfix-scroll">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border bg-muted">
            <th className={thStyle}>الكود</th><th className={thStyle}>الحساب</th><th className={thStyle}>النوع</th>
            <th className={cn(thStyle, "text-end")}>مدين</th><th className={cn(thStyle, "text-end")}>دائن</th><th className={cn(thStyle, "text-end")}>الرصيد</th>
          </tr></thead>
          <tbody>
            {data.accounts.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className={cn(tdStyle, "font-mono")}>{r.code}</td>
                <td className={cn(tdStyle, "font-bold")}>{r.nameAr}</td>
                <td className={tdStyle}>{r.type}</td>
                <td className={cn(tdStyle, "[direction:ltr] text-start")}>{r.totalDebit.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</td>
                <td className={cn(tdStyle, "[direction:ltr] text-start")}>{r.totalCredit.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</td>
                <td className={cn(tdStyle, "[direction:ltr] text-start font-bold text-muted-foreground")} style={{ color: r.balance > 0 ? "#10b981" : r.balance < 0 ? "#ef4444" : undefined }}>{r.balance.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted font-extrabold">
              <td className={cn(tdStyle, "font-extrabold")} colSpan={3}>الإجمالي</td>
              <td className={cn(tdStyle, "[direction:ltr] text-start font-extrabold")}>{data.grandDebit.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-start font-extrabold")}>{data.grandCredit.toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</td>
              <td className={cn(tdStyle, "font-extrabold")}>
                <span className="inline-flex items-center gap-1 py-[3px] px-2.5 rounded-lg text-[11px] font-bold" style={{ background: data.isBalanced ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: data.isBalanced ? "#10b981" : "#ef4444" }}>
                  {data.isBalanced ? "متوازن ✓" : "غير متوازن ✗"}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─── Shared Styles ─────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const thCheck = "w-10 text-center py-2.5 px-2 text-[11px] text-muted-foreground font-bold";
const tdCheck = (checked: boolean): string => `py-2.5 px-2 text-center ${checked ? "bg-accent" : "bg-transparent"}`;
const iconBtnStyle = "w-7 h-7 rounded-[6px] bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

/* ─── Financial Statements ────────────────────────────────────────────────── */
interface ProfitLossData {
  dateRange: { from: string; to: string };
  revenue: { total: number; contra: number; net: number };
  expenses: { total: number };
  netProfit: number;
  margin: string;
  accounts: Array<{ code: string; nameAr: string; type: string; amount: number }>;
}

interface BalanceSheetData {
  asOf: string;
  assets: { accounts: Array<{ code: string; nameAr: string; balance: number }>; total: number };
  liabilities: { accounts: Array<{ code: string; nameAr: string; balance: number }>; total: number };
  equity: { accounts: Array<{ code: string; nameAr: string; balance: number }>; total: number };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

interface CashFlowData {
  dateRange: { from: string; to: string };
  operating: { revenue: number; expenses: number; net: number; details: Array<{ code: string; nameAr: string; amount: number }> };
  investing: { net: number; details: Array<{ code: string; nameAr: string; amount: number }> };
  financing: { net: number; details: Array<{ code: string; nameAr: string; amount: number }> };
  netCashFlow: number;
  cashChange: number;
}

function FinancialStatements({ company }: { company: { slug: string } }) {
  const [statementType, setStatementType] = useState<StatementType>("profit-loss");
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<ProfitLossData | BalanceSheetData | CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      let url = "";
      if (statementType === "profit-loss") url = `/api/accounting/profit-loss?companySlug=${encodeURIComponent(company.slug)}&from=${from}&to=${to}`;
      else if (statementType === "balance-sheet") url = `/api/accounting/balance-sheet?companySlug=${encodeURIComponent(company.slug)}&asOf=${asOf}`;
      else url = `/api/accounting/cash-flow?companySlug=${encodeURIComponent(company.slug)}&from=${from}&to=${to}`;
      const res = await authedFetch(url);
      if (res.ok) setData(await res.json());
      else { const e = await res.json().catch(() => ({})); toast.error((e as Record<string, unknown>)?.error as string || "تعذّر تحميل القائمة"); }
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر الاتصال بالخادم"); }
    finally { setLoading(false); }
  }, [company.slug, statementType, from, to, asOf]);

  useEffect(() => { load(); }, [load]);

  const statementTabs: Array<{ key: StatementType; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "profit-loss", label: "قائمة الدخل", icon: TrendingUp },
    { key: "balance-sheet", label: "الميزانية العمومية", icon: Scale },
    { key: "cash-flow", label: "التدفقات النقدية", icon: Wallet },
  ];

  const exportCsv = () => {
    if (!data) return;
    let rows: string[][] = [];
    let filename = "";
    if (statementType === "profit-loss" && data) {
      const pl = data as ProfitLossData;
      filename = `profit-loss_${pl.dateRange.from}_${pl.dateRange.to}.csv`;
      rows = [["البند", "الكود", "النوع", "المبلغ"], ...pl.accounts.map((a) => [a.nameAr, a.code, a.type, String(a.amount)]), [], ["إجمالي الإيرادات", "", "", String(pl.revenue.total)], ["صافي الربح", "", "", String(pl.netProfit)], ["هامش الربح", "", "", pl.margin]];
    } else if (statementType === "balance-sheet" && data) {
      const bs = data as BalanceSheetData;
      filename = `balance-sheet_${bs.asOf}.csv`;
      rows = [["القسم", "الكود", "الحساب", "الرصيد"]];
      bs.assets.accounts.forEach((a) => rows.push(["الأصول", a.code, a.nameAr, String(a.balance)]));
      rows.push(["إجمالي الأصول", "", "", String(bs.assets.total)]);
      bs.liabilities.accounts.forEach((a) => rows.push(["الخصوم", a.code, a.nameAr, String(a.balance)]));
      rows.push(["إجمالي الخصوم", "", "", String(bs.liabilities.total)]);
      bs.equity.accounts.forEach((a) => rows.push(["حقوق الملكية", a.code, a.nameAr, String(a.balance)]));
      rows.push(["إجمالي حقوق الملكية", "", "", String(bs.equity.total)]);
    } else if (statementType === "cash-flow" && data) {
      const cf = data as CashFlowData;
      filename = `cash-flow_${cf.dateRange.from}_${cf.dateRange.to}.csv`;
      rows = [["القسم", "الكود", "الحساب", "المبلغ"]];
      cf.operating.details.forEach((a) => rows.push(["العمليات", a.code, a.nameAr, String(a.amount)]));
      cf.investing.details.forEach((a) => rows.push(["الاستثمار", a.code, a.nameAr, String(a.amount)]));
      cf.financing.details.forEach((a) => rows.push(["التمويل", a.code, a.nameAr, String(a.amount)]));
    }
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير CSV");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 flex-wrap">
        {statementTabs.map((t) => {
          const Icon = t.icon;
          const active = statementType === t.key;
          return <button key={t.key} onClick={() => setStatementType(t.key)} className={cn("py-2 px-3.5 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5", active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}><Icon size={14} /> {t.label}</button>;
        })}
      </div>
      <div className="bg-card rounded-lg border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        {statementType === "balance-sheet" ? (
          <div className="flex items-center gap-1.5"><label className="text-[11px] font-bold text-muted-foreground">كما في تاريخ</label><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" /></div>
        ) : (
          <>
            <div className="flex items-center gap-1.5"><label className="text-[11px] font-bold text-muted-foreground">من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" /></div>
            <div className="flex items-center gap-1.5"><label className="text-[11px] font-bold text-muted-foreground">إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" /></div>
          </>
        )}
        <button onClick={load} disabled={loading} className="mr-auto py-2 px-4 rounded-sm bg-accent text-accent-foreground border border-border text-[12px] font-bold cursor-pointer disabled:opacity-70">{loading ? "جارٍ…" : "تحديث"}</button>
        <button onClick={exportCsv} disabled={!data || loading} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"><Download size={14} /> تصدير CSV</button>
      </div>
      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : !data ? <div className="p-12 text-center text-muted-foreground">لا توجد بيانات</div> :
        statementType === "profit-loss" ? <ProfitLossView data={data as ProfitLossData} /> :
        statementType === "balance-sheet" ? <BalanceSheetView data={data as BalanceSheetData} /> :
        <CashFlowView data={data as CashFlowData} />}
    </div>
  );
}

function fmt(n: number): string { return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 }); }

function StatementCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card rounded-lg border border-border py-3.5 px-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-sm flex items-center justify-center" style={{ background: `${color}20`, color }}>{icon}</div>
      <div><div className="text-[11px] text-muted-foreground">{label}</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(value)}</div></div>
    </div>
  );
}

function ProfitLossView({ data }: { data: ProfitLossData }) {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatementCard label="إجمالي الإيرادات" value={data.revenue.total} color="#10b981" icon={<TrendingUp size={16} />} />
        <StatementCard label="صافي الإيرادات" value={data.revenue.net} color="#3b82f6" icon={<TrendingUp size={16} />} />
        <StatementCard label="إجمالي المصروفات" value={data.expenses.total} color="#f59e0b" icon={<TrendingDown size={16} />} />
        <StatementCard label="صافي الربح" value={data.netProfit} color={data.netProfit >= 0 ? "#10b981" : "#ef4444"} icon={<TrendingUp size={16} />} />
      </div>
      <div className="bg-card rounded-lg border border-border py-3 px-4 flex justify-between items-center gap-2">
        <span className="text-[12px] text-muted-foreground">الفترة: {data.dateRange.from} ← {data.dateRange.to}</span>
        <span className="text-[13px] font-bold">هامش الربح: <span style={{ color: parseFloat(data.margin) >= 10 ? "#10b981" : parseFloat(data.margin) >= 0 ? "#f59e0b" : "#ef4444" }}>{data.margin}</span></span>
      </div>
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        <div className="overflow-x-auto garfix-scroll">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-border bg-muted"><th className={thStyle}>الكود</th><th className={thStyle}>الحساب</th><th className={thStyle}>النوع</th><th className={cn(thStyle, "text-end")}>المبلغ</th></tr></thead>
            <tbody>
              {data.accounts.length === 0 ? <tr><td colSpan={4} className={cn(tdStyle, "text-center p-8 text-muted-foreground")}>لا توجد قيود مُرحّلة في هذه الفترة</td></tr> : data.accounts.map((a) => (
                <tr key={a.code} className="border-b border-border">
                  <td className={cn(tdStyle, "font-mono")}>{a.code}</td><td className={cn(tdStyle, "font-bold")}>{a.nameAr}</td><td className={tdStyle}>{a.type}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-start font-bold")} style={{ color: a.amount >= 0 ? "#10b981" : "#ef4444" }}>{fmt(a.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-border bg-muted font-extrabold"><td className={cn(tdStyle, "font-extrabold")} colSpan={3}>صافي الربح</td><td className={cn(tdStyle, "[direction:ltr] text-start font-extrabold")} style={{ color: data.netProfit >= 0 ? "#10b981" : "#ef4444" }}>{fmt(data.netProfit)}</td></tr></tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

function BalanceSheetView({ data }: { data: BalanceSheetData }) {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatementCard label="إجمالي الأصول" value={data.assets.total} color="#10b981" icon={<TrendingUp size={16} />} />
        <StatementCard label="إجمالي الخصوم" value={data.liabilities.total} color="#f59e0b" icon={<TrendingDown size={16} />} />
        <StatementCard label="حقوق الملكية" value={data.equity.total} color="#7c3aed" icon={<Scale size={16} />} />
        <StatementCard label="الخصوم + الملكية" value={data.totalLiabilitiesAndEquity} color={data.isBalanced ? "#10b981" : "#ef4444"} icon={<Scale size={16} />} />
      </div>
      <div className="bg-card rounded-lg border border-border py-3 px-4 flex justify-between items-center gap-2">
        <span className="text-[12px] text-muted-foreground">كما في: {data.asOf}</span>
        <span className="py-[3px] px-2.5 rounded-lg text-[11px] font-bold" style={{ background: data.isBalanced ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: data.isBalanced ? "#10b981" : "#ef4444" }}>{data.isBalanced ? "متوازنة ✓" : "غير متوازنة ✗"}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
        <BalanceSheetSection title="الأصول" accounts={data.assets.accounts} total={data.assets.total} color="#10b981" />
        <BalanceSheetSection title="الخصوم" accounts={data.liabilities.accounts} total={data.liabilities.total} color="#f59e0b" />
        <BalanceSheetSection title="حقوق الملكية" accounts={data.equity.accounts} total={data.equity.total} color="#7c3aed" />
      </div>
    </>
  );
}

function BalanceSheetSection({ title, accounts, total, color }: { title: string; accounts: Array<{ code: string; nameAr: string; balance: number }>; total: number; color: string }) {
  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      <div className="py-2.5 px-3.5 border-b border-border font-extrabold text-[13px]" style={{ background: `${color}10`, color }}>{title}</div>
      <div className="overflow-x-auto garfix-scroll">
        <table className="w-full border-collapse">
          <tbody>
            {accounts.length === 0 ? <tr><td className={cn(tdStyle, "text-center p-5 text-muted-foreground")}>لا توجد حسابات</td></tr> : accounts.map((a) => (
              <tr key={a.code} className="border-b border-border"><td className={cn(tdStyle, "font-mono text-[11px]")}>{a.code}</td><td className={cn(tdStyle, "font-semibold")}>{a.nameAr}</td><td className={cn(tdStyle, "[direction:ltr] text-start font-bold")} style={{ color }}>{fmt(a.balance)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-border bg-muted font-extrabold"><td className={cn(tdStyle, "font-extrabold")} colSpan={2}>الإجمالي</td><td className={cn(tdStyle, "[direction:ltr] text-start font-extrabold")} style={{ color }}>{fmt(total)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

function CashFlowView({ data }: { data: CashFlowData }) {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatementCard label="صافي العمليات" value={data.operating.net} color={data.operating.net >= 0 ? "#10b981" : "#ef4444"} icon={<Wallet size={16} />} />
        <StatementCard label="صافي الاستثمار" value={data.investing.net} color={data.investing.net >= 0 ? "#10b981" : "#ef4444"} icon={<TrendingDown size={16} />} />
        <StatementCard label="صافي التمويل" value={data.financing.net} color={data.financing.net >= 0 ? "#10b981" : "#ef4444"} icon={<TrendingUp size={16} />} />
        <StatementCard label="صافي التدفق النقدي" value={data.netCashFlow} color={data.netCashFlow >= 0 ? "#10b981" : "#ef4444"} icon={<Wallet size={16} />} />
      </div>
      <div className="bg-card rounded-lg border border-border py-3 px-4 flex justify-between items-center gap-2">
        <span className="text-[12px] text-muted-foreground">الفترة: {data.dateRange.from} ← {data.dateRange.to}</span>
        <span className="text-[13px] font-bold">التغير في النقد: <span className="[direction:ltr]" style={{ color: data.cashChange >= 0 ? "#10b981" : "#ef4444" }}>{fmt(data.cashChange)}</span></span>
      </div>
      <CashFlowSection title="الأنشطة التشغيلية" details={data.operating.details} net={data.operating.net} color="#10b981" />
      <CashFlowSection title="الأنشطة الاستثمارية" details={data.investing.details} net={data.investing.net} color="#3b82f6" />
      <CashFlowSection title="الأنشطة التمويلية" details={data.financing.details} net={data.financing.net} color="#7c3aed" />
    </>
  );
}

function CashFlowSection({ title, details, net, color }: { title: string; details: Array<{ code: string; nameAr: string; amount: number }>; net: number; color: string }) {
  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      <div className="py-2.5 px-3.5 border-b border-border font-extrabold text-[13px] flex justify-between" style={{ background: `${color}10`, color }}>
        <span>{title}</span><span className="[direction:ltr]" style={{ color: net >= 0 ? "#10b981" : "#ef4444" }}>{fmt(net)}</span>
      </div>
      <div className="overflow-x-auto garfix-scroll">
        <table className="w-full border-collapse">
          <tbody>
            {details.length === 0 ? <tr><td className={cn(tdStyle, "text-center p-5 text-muted-foreground")}>لا توجد حركات</td></tr> : details.map((d, i) => (
              <tr key={`${d.code}-${i}`} className="border-b border-border"><td className={cn(tdStyle, "font-mono text-[11px]")}>{d.code}</td><td className={cn(tdStyle, "font-semibold")}>{d.nameAr}</td><td className={cn(tdStyle, "[direction:ltr] text-start font-bold")} style={{ color: d.amount >= 0 ? "#10b981" : "#ef4444" }}>{fmt(d.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Account Form ─────────────────────────────────────────────────────────── */
function AccountForm({ company, accounts, onClose, onSaved }: { company: { slug: string }; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [type, setType] = useState("asset");
  const [parentId, setParentId] = useState<number | null>(null);
  const [balance, setBalance] = useState(0);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code || !nameAr) { toast.error("الكود والاسم مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, nameAr, nameEn, type, parentId, balance, currency: "KWD", companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء الحساب"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold">حساب جديد</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <div><label className={labelStyle}>الكود *</label><input value={code} onChange={(e) => setCode(e.target.value)} className={inputStyle} dir="ltr" /></div>
          <div><label className={labelStyle}>الاسم (عربي) *</label><input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputStyle} /></div>
          <div><label className={labelStyle}>الاسم (إنجليزي)</label><input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputStyle} dir="ltr" /></div>
          <div><label className={labelStyle}>النوع</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputStyle}>
              <option value="asset">أصول</option><option value="liability">خصوم</option><option value="equity">حقوق ملكية</option><option value="revenue">إيرادات</option><option value="expense">مصروفات</option><option value="contra_revenue">مقابل إيرادات</option><option value="contra_asset">مقابل أصول</option>
            </select>
          </div>
          <div><label className={labelStyle}>الحساب الأب</label>
            <select value={parentId ?? ""} onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
              <option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>)}
            </select>
          </div>
          <div><label className={labelStyle}>الرصيد الافتتاحي</label><input type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

/* ─── Journal Form ─────────────────────────────────────────────────────────── */
function JournalForm({ company, accounts, onClose, onSaved }: { company: { slug: string }; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState("draft");
  const [lines, setLines] = useState<Array<{ accountId: number | null; debit: number; credit: number; description?: string }>>([{ accountId: null, debit: 0, credit: 0 }]);
  const [saving, setSaving] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

  const updateLine = (i: number, field: string, value: number | string) => { setLines((arr) => arr.map((l, idx) => idx === i ? { ...l, [field]: value } : l)); };
  const addLine = () => setLines((arr) => [...arr, { accountId: null, debit: 0, credit: 0 }]);
  const removeLine = (i: number) => setLines((arr) => arr.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (lines.length === 0) { toast.error("أضف بنداً واحداً على الأقل"); return; }
    if (!isBalanced) { toast.error("القيد غير متوازن — المدين ≠ الدائن"); return; }
    if (lines.some((l) => !l.accountId)) { toast.error("كل بند يجب أن يحدد حساباً"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/journal-entries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, description, reference, status, lines, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء القيد"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold">قيد يومية جديد</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <div><label className={labelStyle}>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
          <div><label className={labelStyle}>المرجع</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={inputStyle} dir="ltr" /></div>
          <div><label className={labelStyle}>الحالة</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputStyle}><option value="draft">مسودة</option><option value="posted">مُرحّل</option></select>
          </div>
        </div>
        <div><label className={labelStyle}>الوصف</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputStyle} /></div>
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className={cn(labelStyle, "mb-0")}>البنود</label>
            <button onClick={addLine} className="bg-accent text-accent-foreground border border-border rounded-[6px] py-1 px-2.5 text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"><Plus size={12} /> إضافة</button>
          </div>
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_100px_32px] gap-2 items-center">
                <select value={l.accountId ?? ""} onChange={(e) => updateLine(i, "accountId", Number(e.target.value))} className={inputStyle}><option value="">— اختر حساب —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>)}</select>
                <input type="number" placeholder="مدين" value={l.debit} onChange={(e) => updateLine(i, "debit", Number(e.target.value))} className={inputStyle} dir="ltr" />
                <input type="number" placeholder="دائن" value={l.credit} onChange={(e) => updateLine(i, "credit", Number(e.target.value))} className={inputStyle} dir="ltr" />
                <button onClick={() => removeLine(i)} className="bg-transparent border border-border text-destructive rounded-[6px] cursor-pointer flex items-center justify-center h-8"><X size={12} /></button>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 py-2 px-3 rounded-sm text-[12px] font-bold" style={{ background: isBalanced ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }}>
            <span>مدين: <span className="[direction:ltr]">{totalDebit.toLocaleString("ar-EG")}</span></span>
            <span>دائن: <span className="[direction:ltr]">{totalCredit.toLocaleString("ar-EG")}</span></span>
            <span style={{ color: isBalanced ? "#10b981" : "#ef4444" }}>{isBalanced ? "متوازن ✓" : "غير متوازن ✗"}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving || !isBalanced} className={cn("py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold", saving ? "cursor-not-allowed" : "cursor-pointer", (saving || !isBalanced) && "opacity-70")}>{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default AccountingView;
