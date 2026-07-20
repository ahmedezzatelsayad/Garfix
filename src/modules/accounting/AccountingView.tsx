"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, Calculator, X, Trash2, Scale, FileBarChart,
  TrendingUp, TrendingDown, Wallet, Download, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Account { id: number; code: string; nameAr: string; nameEn?: string; type: string; balance: number; currency: string; }
interface JournalLine { id: number; accountId: number; debit: number; credit: number; description?: string; }
interface JournalEntry { id: number; date: string; description?: string; reference?: string; status: string; lines: JournalLine[]; }
interface TrialRow {
  id: number; code: string; nameAr: string; type: string;
  totalDebit: number; totalCredit: number; balance: number;
}

type Tab = "accounts" | "journal" | "trial" | "statements";
type StatementType = "profit-loss" | "balance-sheet" | "cash-flow";

const PAGE_SIZE = 20;

export function AccountingView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [trial, setTrial] = useState<{ accounts: TrialRow[]; grandDebit: number; grandCredit: number; isBalanced: boolean } | null>(null);
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

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  // setState runs inside async .then() callback in loadTrial (after await authedFetch) — not synchronous in effect body; no cascading render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "trial" && activeCompany) loadTrial();
  }, [tab, activeCompany, loadTrial]);

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
        else {
          const e = await res.json().catch(() => ({}));
          toast.error(e.error || `تعذّر حذف العنصر #${id}`);
          failCount++;
        }
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
    else {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error || "تعذّر الحذف");
    }
  };

  // ─── Item 2: Reverse a posted journal entry ─────────────────────────
  // Calls POST /api/accounting/journal-entries/[id]/reverse?companySlug=X
  // The backend creates a swapped debit/credit reversal entry marked as
  // posted, updates account balances, and marks the original as "reversed".
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
    } finally {
      setReversingId(null);
    }
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

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "accounts", label: `الحسابات (${accounts.length})` },
    { key: "journal", label: `القيود (${entries.length})` },
    { key: "trial", label: "ميزان المراجعة" },
    { key: "statements", label: "القوائم المالية" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><Calculator size={20} /> المحاسبة</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
        {tab !== "trial" && tab !== "statements" && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> إضافة</button>
        )}
      </div>
      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => switchTab(t.key)} className={cn(
            "py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5",
            tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
          )}>
            {t.key === "trial" && <Scale size={14} />}
            {t.key === "statements" && <FileBarChart size={14} />}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "trial" ? (
        <TrialBalanceTable data={trial} loading={loading} />
      ) : tab === "statements" ? (
        <FinancialStatements company={activeCompany} />
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
                                    <button
                                      onClick={() => handleReverse(e)}
                                      disabled={!canReverse || reversingId === e.id}
                                      title={canReverse ? "عكس القيد" : "لا يمكن العكس — القيد ليس مُرحّلًا"}
                                      className={cn(
                                        "inline-flex items-center justify-center w-7 h-7 rounded-md border border-border transition-colors",
                                        canReverse
                                          ? "hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-600 cursor-pointer"
                                          : "opacity-30 cursor-not-allowed",
                                      )}
                                    >
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

      {/* ─── Reverse confirmation dialog (Item 2) ──────────────────────── */}
      {reverseConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => reversingId === null && setReverseConfirm(null)}>
          <div
            className="bg-card border border-border rounded-[14px] shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                <RotateCcw size={18} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base">عكس القيد #{reverseConfirm.id}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {reverseConfirm.description || "بدون وصف"} • {reverseConfirm.date} • {reverseConfirm.lines?.length || 0} بند
                </p>
              </div>
            </div>
            <div className="bg-muted rounded-md p-3 text-xs leading-relaxed mb-4">
              سيتم إنشاء <strong>قيد عكسي جديد</strong> بنفس البنود ولكن مع <strong>تبديل المدين/الدائن</strong>،
              وترحيله فورًا (تحديث أرصدة الحسابات)، ووضع علامة "معكوس" على القيد الأصلي.
              <br />
              <span className="text-amber-600 font-semibold mt-1 block">
                ⚠️ هذا إجراء مالي حساس — لا يمكن التراجع عنه.
              </span>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReverseConfirm(null)}
                disabled={reversingId !== null}
                className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={confirmReverse}
                disabled={reversingId !== null}
                className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <RotateCcw size={14} className={reversingId !== null ? "animate-spin" : ""} />
                {reversingId !== null ? "جارٍ العكس…" : "تأكيد العكس"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrialBalanceTable({ data, loading }: { data: { accounts: TrialRow[]; grandDebit: number; grandCredit: number; isBalanced: boolean } | null; loading: boolean }) {
  if (loading && !data) return <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>;
  if (!data || data.accounts.length === 0) {
    return (
      <div className="bg-card rounded-[14px] border border-border p-12 text-center text-muted-foreground">
        <Scale size={36} className="opacity-30 mb-2" />
        <div>لا توجد بيانات لميزان المراجعة. أنشئ حسابات وقيوداً أولاً.</div>
      </div>
    );
  }
  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      <div className="overflow-x-auto garfix-scroll">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border bg-muted">
            <th className={thStyle}>الكود</th><th className={thStyle}>الحساب</th><th className={thStyle}>النوع</th>
            <th className={cn(thStyle, "text-end")}>مدين</th>
            <th className={cn(thStyle, "text-end")}>دائن</th>
            <th className={cn(thStyle, "text-end")}>الرصيد</th>
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

// ────────────────────────────────────────────────────────────────────────────
// Financial Statements (ACC-1/2/3) — P&L, Balance Sheet, Cash Flow
// ────────────────────────────────────────────────────────────────────────────

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
    setLoading(true);
    setData(null);
    try {
      let url = "";
      if (statementType === "profit-loss") {
        url = `/api/accounting/profit-loss?companySlug=${encodeURIComponent(company.slug)}&from=${from}&to=${to}`;
      } else if (statementType === "balance-sheet") {
        url = `/api/accounting/balance-sheet?companySlug=${encodeURIComponent(company.slug)}&asOf=${asOf}`;
      } else {
        url = `/api/accounting/cash-flow?companySlug=${encodeURIComponent(company.slug)}&from=${from}&to=${to}`;
      }
      const res = await authedFetch(url);
      if (res.ok) setData(await res.json());
      else {
        const e = await res.json().catch(() => ({}));
        toast.error((e as Record<string, unknown>)?.error as string || "تعذّر تحميل القائمة");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الاتصال بالخادم");
    } finally { setLoading(false); }
  }, [company.slug, statementType, from, to, asOf]);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
      rows = [
        ["البند", "الكود", "النوع", "المبلغ"],
        ...pl.accounts.map((a) => [a.nameAr, a.code, a.type, String(a.amount)]),
        [],
        ["إجمالي الإيرادات", "", "", String(pl.revenue.total)],
        ["الإيرادات المقابلة", "", "", String(pl.revenue.contra)],
        ["صافي الإيرادات", "", "", String(pl.revenue.net)],
        ["إجمالي المصروفات", "", "", String(pl.expenses.total)],
        ["صافي الربح", "", "", String(pl.netProfit)],
        ["هامش الربح", "", "", pl.margin],
      ];
    } else if (statementType === "balance-sheet" && data) {
      const bs = data as BalanceSheetData;
      filename = `balance-sheet_${bs.asOf}.csv`;
      rows = [["القسم", "الكود", "الحساب", "الرصيد"]];
      bs.assets.accounts.forEach((a) => rows.push(["الأصول", a.code, a.nameAr, String(a.balance)]));
      rows.push(["إجمالي الأصول", "", "", String(bs.assets.total)]);
      rows.push([]);
      bs.liabilities.accounts.forEach((a) => rows.push(["الخصوم", a.code, a.nameAr, String(a.balance)]));
      rows.push(["إجمالي الخصوم", "", "", String(bs.liabilities.total)]);
      rows.push([]);
      bs.equity.accounts.forEach((a) => rows.push(["حقوق الملكية", a.code, a.nameAr, String(a.balance)]));
      rows.push(["إجمالي حقوق الملكية", "", "", String(bs.equity.total)]);
      rows.push([]);
      rows.push(["إجمالي الخصوم وحقوق الملكية", "", "", String(bs.totalLiabilitiesAndEquity)]);
      rows.push(["متوازنة؟", "", "", bs.isBalanced ? "نعم" : "لا"]);
    } else if (statementType === "cash-flow" && data) {
      const cf = data as CashFlowData;
      filename = `cash-flow_${cf.dateRange.from}_${cf.dateRange.to}.csv`;
      rows = [["القسم", "الكود", "الحساب", "المبلغ"]];
      cf.operating.details.forEach((a) => rows.push(["العمليات", a.code, a.nameAr, String(a.amount)]));
      rows.push(["صافي التدفقات التشغيلية", "", "", String(cf.operating.net)]);
      rows.push([]);
      cf.investing.details.forEach((a) => rows.push(["الاستثمار", a.code, a.nameAr, String(a.amount)]));
      rows.push(["صافي التدفقات الاستثمارية", "", "", String(cf.investing.net)]);
      rows.push([]);
      cf.financing.details.forEach((a) => rows.push(["التمويل", a.code, a.nameAr, String(a.amount)]));
      rows.push(["صافي التدفقات التمويلية", "", "", String(cf.financing.net)]);
      rows.push([]);
      rows.push(["صافي التدفق النقدي", "", "", String(cf.netCashFlow)]);
      rows.push(["التغير في النقد", "", "", String(cf.cashChange)]);
    }
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير CSV");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {statementTabs.map((t) => {
          const Icon = t.icon;
          const active = statementType === t.key;
          return (
            <button key={t.key} onClick={() => setStatementType(t.key)} className={cn(
              "py-2 px-3.5 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5",
              active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
            )}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Date range + export */}
      <div className="bg-card rounded-lg border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        {statementType === "balance-sheet" ? (
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-bold text-muted-foreground">كما في تاريخ</label>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-bold text-muted-foreground">من</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-bold text-muted-foreground">إلى</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
            </div>
          </>
        )}
        <button onClick={load} disabled={loading} className="mr-auto py-2 px-4 rounded-sm bg-accent text-accent-foreground border border-border text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70">
          {loading ? "جارٍ…" : "تحديث"}
        </button>
        <button onClick={exportCsv} disabled={!data || loading} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center gap-1.5">
          <Download size={14} /> تصدير CSV
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !data ? (
        <div className="p-12 text-center text-muted-foreground">لا توجد بيانات</div>
      ) : statementType === "profit-loss" ? (
        <ProfitLossView data={data as ProfitLossData} />
      ) : statementType === "balance-sheet" ? (
        <BalanceSheetView data={data as BalanceSheetData} />
      ) : (
        <CashFlowView data={data as CashFlowData} />
      )}
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });
}

function StatementCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card rounded-lg border border-border py-3.5 px-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-sm flex items-center justify-center" style={{ background: `${color}20`, color }}>{icon}</div>
      <div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(value)}</div>
      </div>
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
      <div className="bg-card rounded-lg border border-border py-3 px-4 flex justify-between items-center flex-wrap gap-2">
        <span className="text-[12px] text-muted-foreground">الفترة: {data.dateRange.from} ← {data.dateRange.to}</span>
        <span className="text-[13px] font-bold">هامش الربح: <span style={{ color: parseFloat(data.margin) >= 10 ? "#10b981" : parseFloat(data.margin) >= 0 ? "#f59e0b" : "#ef4444" }}>{data.margin}</span></span>
      </div>
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        <div className="overflow-x-auto garfix-scroll">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-border bg-muted">
              <th className={thStyle}>الكود</th><th className={thStyle}>الحساب</th><th className={thStyle}>النوع</th>
              <th className={cn(thStyle, "text-end")}>المبلغ</th>
            </tr></thead>
            <tbody>
              {data.accounts.length === 0 ? (
                <tr><td colSpan={4} className={cn(tdStyle, "text-center p-8 text-muted-foreground")}>لا توجد قيود مُرحّلة في هذه الفترة</td></tr>
              ) : data.accounts.map((a) => (
                <tr key={a.code} className="border-b border-border">
                  <td className={cn(tdStyle, "font-mono")}>{a.code}</td>
                  <td className={cn(tdStyle, "font-bold")}>{a.nameAr}</td>
                  <td className={tdStyle}>{a.type}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-start font-bold")} style={{ color: a.amount >= 0 ? "#10b981" : "#ef4444" }}>{fmt(a.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted font-extrabold">
                <td className={cn(tdStyle, "font-extrabold")} colSpan={3}>صافي الربح</td>
                <td className={cn(tdStyle, "[direction:ltr] text-start font-extrabold")} style={{ color: data.netProfit >= 0 ? "#10b981" : "#ef4444" }}>{fmt(data.netProfit)}</td>
              </tr>
            </tfoot>
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
      <div className="bg-card rounded-lg border border-border py-3 px-4 flex justify-between items-center flex-wrap gap-2">
        <span className="text-[12px] text-muted-foreground">كما في: {data.asOf}</span>
        <span
          className="py-[3px] px-2.5 rounded-lg text-[11px] font-bold"
          style={{
            background: data.isBalanced ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
            color: data.isBalanced ? "#10b981" : "#ef4444",
          }}
        >{data.isBalanced ? "متوازنة ✓" : "غير متوازنة ✗"}</span>
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
            {accounts.length === 0 ? (
              <tr><td className={cn(tdStyle, "text-center p-5 text-muted-foreground")}>لا توجد حسابات</td></tr>
            ) : accounts.map((a) => (
              <tr key={a.code} className="border-b border-border">
                <td className={cn(tdStyle, "font-mono text-[11px]")}>{a.code}</td>
                <td className={cn(tdStyle, "font-semibold")}>{a.nameAr}</td>
                <td className={cn(tdStyle, "[direction:ltr] text-start font-bold")} style={{ color }}>{fmt(a.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted font-extrabold">
              <td className={cn(tdStyle, "font-extrabold")} colSpan={2}>الإجمالي</td>
              <td className={cn(tdStyle, "[direction:ltr] text-start font-extrabold")} style={{ color }}>{fmt(total)}</td>
            </tr>
          </tfoot>
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
      <div className="bg-card rounded-lg border border-border py-3 px-4 flex justify-between items-center flex-wrap gap-2">
        <span className="text-[12px] text-muted-foreground">الفترة: {data.dateRange.from} ← {data.dateRange.to}</span>
        <span className="text-[13px] font-bold">التغير الفعلي في النقد: <span className="[direction:ltr]" style={{ color: data.cashChange >= 0 ? "#10b981" : "#ef4444" }}>{fmt(data.cashChange)}</span></span>
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
        <span>{title}</span>
        <span className="[direction:ltr]" style={{ color: net >= 0 ? "#10b981" : "#ef4444" }}>{fmt(net)}</span>
      </div>
      <div className="overflow-x-auto garfix-scroll">
        <table className="w-full border-collapse">
          <tbody>
            {details.length === 0 ? (
              <tr><td className={cn(tdStyle, "text-center p-5 text-muted-foreground")}>لا توجد حركات</td></tr>
            ) : details.map((d, i) => (
              <tr key={`${d.code}-${i}`} className="border-b border-border">
                <td className={cn(tdStyle, "font-mono text-[11px]")}>{d.code}</td>
                <td className={cn(tdStyle, "font-semibold")}>{d.nameAr}</td>
                <td className={cn(tdStyle, "[direction:ltr] text-start font-bold")} style={{ color: d.amount >= 0 ? "#10b981" : "#ef4444" }}>{fmt(d.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
      toast.success("تم إنشاء الحساب");
      onSaved();
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
              <option value="asset">أصول</option><option value="liability">خصوم</option>
              <option value="equity">حقوق ملكية</option><option value="revenue">إيرادات</option>
              <option value="expense">مصروفات</option><option value="contra_revenue">مقابل إيرادات</option>
              <option value="contra_asset">مقابل أصول</option>
            </select>
          </div>
          <div><label className={labelStyle}>الحساب الأب</label>
            <select value={parentId ?? ""} onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>)}
            </select>
          </div>
          <div><label className={labelStyle}>الرصيد الافتتاحي</label><input type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

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

  const updateLine = (i: number, field: string, value: number | string) => {
    setLines((arr) => arr.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };
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
      toast.success("تم إنشاء القيد");
      onSaved();
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
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputStyle}>
              <option value="draft">مسودة</option><option value="posted">مُرحّل</option>
            </select>
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
                <select value={l.accountId ?? ""} onChange={(e) => updateLine(i, "accountId", Number(e.target.value))} className={inputStyle}>
                  <option value="">— اختر حساب —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>)}
                </select>
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
        <button onClick={submit} disabled={saving || !isBalanced} className={cn(
          "py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold",
          saving ? "cursor-not-allowed" : "cursor-pointer",
          (saving || !isBalanced) && "opacity-70"
        )}>{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default AccountingView;
