"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Landmark, Plus, X, Upload, ArrowRightLeft, CheckCircle2,
  FileText, Download, Trash2, RefreshCw, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ───────────────────────────────────────────────────────────── */
interface BankAccount { id: number; name: string; bankName: string; accountName: string; accountNumber: string; iban?: string; currency: string; accountType?: string; balance: number; glAccountId?: number; }
interface ReconciliationItem { id: number; date: string; description: string; bankAmount: number; bookAmount: number; difference: number; status: string; }
interface Transfer { id: number; fromAccount: string; toAccount: string; amount: number; currency: string; date: string; description?: string; status: string; reference: string; }

type Tab = "accounts" | "reconciliation" | "import" | "transfer";

/* ─── Shared Styles ────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
function fmt(n: number) { return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 }); }
function Empty({ label }: { label: string }) { return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>; }

/* ─── Main Component ───────────────────────────────────────────────────────── */
export function BankingView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("accounts");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationItem[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const slug = activeCompany ? encodeURIComponent(activeCompany.slug) : "";

  const loadAccounts = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/bank-accounts?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setBankAccounts(d.accounts || []); }
      else setBankAccounts([]);
    } catch { setBankAccounts([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  const loadTransfers = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/bank-transfer?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setTransfers(d.transfers || []); }
      else setTransfers([]);
    } catch { setTransfers([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "accounts") loadAccounts();
    if (tab === "transfer") loadTransfers();
  }, [tab, loadAccounts, loadTransfers]);

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "accounts", label: "الحسابات البنكية", icon: Landmark },
    { key: "reconciliation", label: "المطابقة البنكية", icon: CheckCircle2 },
    { key: "import", label: "استيراد CSV", icon: Upload },
    { key: "transfer", label: "التحويلات", icon: ArrowRightLeft },
  ];

  const totalCash = bankAccounts.reduce((s, ba) => s + ba.balance, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><Landmark size={20} /> البنوك</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
        {(tab === "accounts" || tab === "transfer") && !showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> إضافة</button>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5", tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
            <Icon size={14} /> {t.label}
          </button>
        ); })}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "accounts" ? (
        showForm ? <BankAccountFormView company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadAccounts(); }} /> : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><Landmark size={18} /></div>
                <div><div className="text-[11px] text-muted-foreground">إجمالي النقدية</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: totalCash >= 0 ? "#10b981" : "#ef4444" }}>{fmt(totalCash)}</div></div>
              </div>
              <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(124,58,237,0.20)", color: "#7c3aed" }}><FileText size={18} /></div>
                <div><div className="text-[11px] text-muted-foreground">عدد الحسابات</div><div className="text-lg font-extrabold [direction:ltr] text-end">{bankAccounts.length}</div></div>
              </div>
            </div>
            <div className="bg-card rounded-[14px] border border-border overflow-hidden">
              {bankAccounts.length === 0 ? <Empty label="حسابات بنكية" /> : (
                <div className="overflow-x-auto garfix-scroll">
                  <table className="w-full border-collapse">
                    <thead><tr className="border-b border-border bg-muted">
                      <th className={thStyle}>البنك</th><th className={thStyle}>اسم الحساب</th><th className={thStyle}>رقم الحساب</th>
                      <th className={thStyle}>IBAN</th><th className={thStyle}>العملة</th><th className={thStyle}>النوع</th><th className={cn(thStyle, "text-end")}>الرصيد</th>
                    </tr></thead>
                    <tbody>
                      {bankAccounts.map((ba) => (
                        <tr key={ba.id} className="border-b border-border">
                          <td className={cn(tdStyle, "font-bold")}><Landmark size={14} className="inline me-1 opacity-50" />{ba.bankName}</td>
                          <td className={tdStyle}>{ba.accountName || ba.name}</td>
                          <td className={cn(tdStyle, "font-mono")} dir="ltr">{ba.accountNumber}</td>
                          <td className={cn(tdStyle, "font-mono text-[11px]")} dir="ltr">{ba.iban || "—"}</td>
                          <td className={tdStyle}>{ba.currency}</td>
                          <td className={tdStyle}>{ba.accountType || "—"}</td>
                          <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: ba.balance >= 0 ? "#10b981" : "#ef4444" }}>{fmt(ba.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted font-extrabold">
                        <td className={cn(tdStyle, "font-extrabold")} colSpan={6}>إجمالي النقدية</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: totalCash >= 0 ? "#10b981" : "#ef4444" }}>{fmt(totalCash)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      ) : tab === "reconciliation" ? (
        <ReconciliationView company={activeCompany} />
      ) : tab === "import" ? (
        <CSVImportView company={activeCompany} />
      ) : tab === "transfer" ? (
        showForm ? <TransferFormView accounts={bankAccounts} company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadTransfers(); }} /> : (
          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            {transfers.length === 0 ? <Empty label="تحويلات" /> : (
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>المرجع</th><th className={thStyle}>من حساب</th><th className={thStyle}>إلى حساب</th>
                    <th className={cn(thStyle, "text-end")}>المبلغ</th><th className={thStyle}>العملة</th><th className={thStyle}>التاريخ</th><th className={thStyle}>الوصف</th><th className={thStyle}>الحالة</th>
                  </tr></thead>
                  <tbody>
                    {transfers.map((t) => (
                      <tr key={t.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-mono")}>{t.reference}</td>
                        <td className={tdStyle}>{t.fromAccount}</td>
                        <td className={tdStyle}>{t.toAccount}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(t.amount)}</td>
                        <td className={tdStyle}>{t.currency}</td>
                        <td className={tdStyle} dir="ltr">{t.date}</td>
                        <td className={tdStyle}>{t.description || "—"}</td>
                        <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: t.status === "completed" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: t.status === "completed" ? "#10b981" : "#f59e0b" }}>{t.status === "completed" ? "مكتمل" : "قيد التنفيذ"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

/* ─── Bank Account Form ────────────────────────────────────────────────────── */
function BankAccountFormView({ company, onClose, onSaved }: { company: { slug: string; currency?: string }; onClose: () => void; onSaved: () => void }) {
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [currency, setCurrency] = useState(company.currency || "KWD");
  const [accountType, setAccountType] = useState("checking");
  const [glAccountId, setGlAccountId] = useState<number | null>(null);
  const [balance, setBalance] = useState(0);
  const [saving, setSaving] = useState(false);
  const [glAccounts, setGlAccounts] = useState<Array<{ id: number; code: string; nameAr: string }>>([]);

  useEffect(() => {
    authedFetch(`/api/accounting/accounts?companySlug=${encodeURIComponent(company.slug)}`)
      .then(r => r.ok ? r.json() : { accounts: [] })
      .then(d => setGlAccounts(d.accounts || []))
      .catch(() => setGlAccounts([]));
  }, [company.slug]);

  const submit = async () => {
    if (!bankName || !accountName || !accountNumber) { toast.error("البنك واسم الحساب ورقم الحساب مطلوبة"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/bank-accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: accountName, bankName, accountName, accountNumber, iban, currency, accountType, glAccountId, balance, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء الحساب البنكي"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold flex items-center gap-2"><Landmark size={16} /> حساب بنكي جديد</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>البنك *</label><input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputStyle} /></div>
        <div><label className={labelStyle}>اسم الحساب *</label><input value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputStyle} /></div>
        <div><label className={labelStyle}>رقم الحساب *</label><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>IBAN</label><input value={iban} onChange={(e) => setIban(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>العملة</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputStyle}>
            <option value="KWD">KWD</option><option value="SAR">SAR</option><option value="AED">AED</option><option value="USD">USD</option><option value="EUR">EUR</option>
          </select>
        </div>
        <div><label className={labelStyle}>نوع الحساب</label>
          <select value={accountType} onChange={(e) => setAccountType(e.target.value)} className={inputStyle}>
            <option value="checking">جاري</option><option value="savings">توفير</option><option value="overdraft">سحب على المكشوف</option><option value="loan">قرض</option>
          </select>
        </div>
        <div><label className={labelStyle}>الحساب المالي (GL)</label>
          <select value={glAccountId ?? ""} onChange={(e) => setGlAccountId(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
            <option value="">— اختر —</option>
            {glAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>)}
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

/* ─── Reconciliation ─────────────────────────────────────────────────────────── */
function ReconciliationView({ company }: { company: { slug: string } }) {
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);

  const slug = encodeURIComponent(company.slug);

  useEffect(() => {
    authedFetch(`/api/accounting/bank-accounts?companySlug=${slug}`)
      .then(r => r.ok ? r.json() : { accounts: [] })
      .then(d => setBankAccounts(d.accounts || []))
      .catch(() => setBankAccounts([]));
  }, [slug]);

  const loadItems = useCallback(async () => {
    if (!selectedAccountId) { setItems([]); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/bank-reconciliation?companySlug=${slug}&bankAccountId=${selectedAccountId}`);
      if (res.ok) { const d = await res.json(); setItems(d.items || []); }
      else setItems([]);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [selectedAccountId, slug]);

  useEffect(() => { // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems(); }, [loadItems]);

  const totalBank = items.reduce((s, i) => s + i.bankAmount, 0);
  const totalBook = items.reduce((s, i) => s + i.bookAmount, 0);
  const totalDiff = totalBank - totalBook;
  const matchedCount = items.filter(i => i.status === "matched").length;
  const unmatchedCount = items.filter(i => i.status !== "matched").length;

  const handleMatch = async (id: number) => {
    setActionId(id);
    try {
      const res = await authedFetch(`/api/accounting/bank-reconciliation/${id}/match?companySlug=${slug}&bankAccountId=${selectedAccountId}`, { method: "POST" });
      if (res.ok) { toast.success("تم المطابقة"); loadItems(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر المطابقة"); }
    } catch { toast.error("خطأ"); }
    finally { setActionId(null); }
  };

  const handleComplete = async () => {
    if (!selectedAccountId) return;
    if (unmatchedCount > 0 && !confirm(`هناك ${unmatchedCount} عنصر غير مطابق. إتمام المطابقة؟`)) return;
    setCompleting(true);
    try {
      const res = await authedFetch(`/api/accounting/bank-reconciliation/complete?companySlug=${slug}&bankAccountId=${selectedAccountId}`, { method: "POST" });
      if (res.ok) { toast.success("تم إتمام المطابقة البنكية"); loadItems(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر إتمام المطابقة"); }
    } catch { toast.error("خطأ"); }
    finally { setCompleting(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">الحساب البنكي</label>
          <select value={selectedAccountId ?? ""} onChange={(e) => setSelectedAccountId(e.target.value ? Number(e.target.value) : null)} className={cn(inputStyle, "w-auto min-w-[200px]")}>
            <option value="">— اختر حساب —</option>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} — {a.accountNumber}</option>)}
          </select>
        </div>
        <button onClick={loadItems} disabled={!selectedAccountId || loading} className="py-2 px-4 rounded-sm bg-accent text-accent-foreground border border-border text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> {loading ? "جارٍ…" : "عرض"}
        </button>
        {selectedAccountId && unmatchedCount === 0 && items.length > 0 && (
          <button onClick={handleComplete} disabled={completing} className="py-2 px-4 rounded-sm bg-emerald-600 text-white border-none text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
            <CheckCircle2 size={12} /> {completing ? "جارٍ…" : "إتمام المطابقة"}
          </button>
        )}
      </div>

      {selectedAccountId && items.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><Landmark size={18} /></div>
            <div><div className="text-[11px] text-muted-foreground">إجمالي البنك</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalBank)}</div></div>
          </div>
          <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(59,130,246,0.20)", color: "#3b82f6" }}><FileText size={18} /></div>
            <div><div className="text-[11px] text-muted-foreground">إجمالي الكتب</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalBook)}</div></div>
          </div>
          <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: totalDiff === 0 ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)", color: totalDiff === 0 ? "#10b981" : "#ef4444" }}>
              {totalDiff === 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            </div>
            <div><div className="text-[11px] text-muted-foreground">الفرق</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: totalDiff === 0 ? "#10b981" : "#ef4444" }}>{fmt(totalDiff)}</div></div>
          </div>
          <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(124,58,237,0.20)", color: "#7c3aed" }}><CheckCircle2 size={18} /></div>
            <div><div className="text-[11px] text-muted-foreground">مطابق / غير مطابق</div><div className="text-lg font-extrabold [direction:ltr] text-end"><span style={{ color: "#10b981" }}>{matchedCount}</span> / <span style={{ color: "#f59e0b" }}>{unmatchedCount}</span></div></div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {!selectedAccountId ? <div className="p-12 text-center text-muted-foreground">اختر حساب بنكي لعرض عناصر المطابقة</div> : items.length === 0 ? <Empty label="عناصر المطابقة" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>التاريخ</th><th className={thStyle}>الوصف</th>
                <th className={cn(thStyle, "text-end")}>البنك</th><th className={cn(thStyle, "text-end")}>الكتب</th><th className={cn(thStyle, "text-end")}>الفرق</th>
                <th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
              </tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={cn("border-b border-border", item.status === "matched" ? "bg-emerald-500/5" : "bg-transparent")}>
                    <td className={tdStyle} dir="ltr">{item.date}</td>
                    <td className={cn(tdStyle, "font-bold")}>{item.description}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{fmt(item.bankAmount)}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{fmt(item.bookAmount)}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: item.difference === 0 ? "#10b981" : "#ef4444" }}>{fmt(item.difference)}</td>
                    <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: item.status === "matched" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: item.status === "matched" ? "#10b981" : "#f59e0b" }}>{item.status === "matched" ? "مطابق" : "غير مطابق"}</span></td>
                    <td className={tdStyle}>{item.status !== "matched" && <button onClick={() => handleMatch(item.id)} disabled={actionId === item.id} className="py-1 px-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[10px] font-bold cursor-pointer disabled:opacity-50">{actionId === item.id ? "جارٍ…" : "مطابقة"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CSV Import ────────────────────────────────────────────────────────────── */
function CSVImportView({ company }: { company: { slug: string } }) {
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [csvContent, setCsvContent] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const slug = encodeURIComponent(company.slug);

  useEffect(() => {
    authedFetch(`/api/accounting/bank-accounts?companySlug=${slug}`)
      .then(r => r.ok ? r.json() : { accounts: [] })
      .then(d => setAccounts(d.accounts || []))
      .catch(() => setAccounts([]));
  }, [slug]);

  const handleImport = async () => {
    if (!accountId) { toast.error("اختر حساب بنكي"); return; }
    if (!csvContent.trim()) { toast.error("أدخل محتوى CSV"); return; }
    setImporting(true); setResult(null);
    try {
      const res = await authedFetch("/api/accounting/bank-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, csvContent, companySlug: company.slug }),
      });
      if (res.ok) { const d = await res.json(); setResult(d); toast.success(`تم استيراد ${d.imported} حركة`); setCsvContent(""); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر الاستيراد"); }
    } catch { toast.error("خطأ في الاتصال"); }
    finally { setImporting(false); }
  };

  const sampleCSV = `Date,Description,Amount
2025-01-15,Customer Payment,5000
2025-01-16,Supplier Invoice,-1200
2025-01-18,Bank Charges,-50`;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold flex items-center gap-2"><Upload size={16} /> استيراد كشف بنكي CSV</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <div><label className={labelStyle}>الحساب البنكي *</label>
            <select value={accountId ?? ""} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
              <option value="">— اختر حساب —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} — {a.accountNumber}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelStyle}>محتوى CSV *</label>
          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            rows={8}
            className={cn(inputStyle, "min-h-[160px] resize-y font-mono text-[12px]")}
            dir="ltr"
            placeholder={sampleCSV}
          />
        </div>
        <div className="bg-muted rounded-md p-3 text-[12px] text-muted-foreground leading-relaxed">
          تنسيق CSV المطلوب: <strong dir="ltr">Date, Description, Amount</strong> — الحقول مفصولة بفواصل، المبلغ يمكن أن يكون سالب للمسحوبات.
          <br />يمكنك لصق محتوى الكشف البنكي مباشرة أو نسخه من ملف CSV.
        </div>
        <button onClick={handleImport} disabled={importing || !accountId || !csvContent.trim()} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
          <Upload size={14} /> {importing ? "جارٍ الاستيراد…" : "استيراد"}
        </button>
      </div>
      {result && (
        <div className="bg-card rounded-[14px] border border-border p-5">
          <h4 className="font-bold text-[14px] mb-3">نتيجة الاستيراد</h4>
          <div className="flex gap-3 mb-3">
            <div className="py-2 px-4 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[13px] font-bold">مستورد: {result.imported}</div>
            <div className="py-2 px-4 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 text-[13px] font-bold">متجاوز: {result.skipped}</div>
          </div>
          {result.errors.length > 0 && (
            <div className="bg-red-500/5 rounded-md p-3 text-[12px] max-h-48 overflow-y-auto garfix-scroll">
              <div className="font-bold text-red-600 mb-1">أخطاء ({result.errors.length}):</div>
              {result.errors.map((e, i) => <div key={i} className="text-muted-foreground">{e}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Transfer Form ────────────────────────────────────────────────────────── */
function TransferFormView({ accounts, company, onClose, onSaved }: { accounts: BankAccount[]; company: { slug: string }; onClose: () => void; onSaved: () => void }) {
  const [fromAccountId, setFromAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState("KWD");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const fromAccount = accounts.find(a => a.id === fromAccountId);
  const toAccount = accounts.find(a => a.id === toAccountId);

  // Auto-set currency when selecting source account
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromAccount) setCurrency(fromAccount.currency);
  }, [fromAccount]);

  const submit = async () => {
    if (!fromAccountId || !toAccountId || amount <= 0) { toast.error("اختر الحسابات والمبلغ"); return; }
    if (fromAccountId === toAccountId) { toast.error("لا يمكن التحويل إلى نفس الحساب"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/bank-transfer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAccountId, toAccountId, amount, currency, date, description, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast.success("تم إنشاء التحويل"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold flex items-center gap-2"><ArrowRightLeft size={16} /> تحويل جديد</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>من حساب *</label>
          <select value={fromAccountId ?? ""} onChange={(e) => setFromAccountId(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
            <option value="">— اختر —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} — {a.accountNumber} ({a.currency})</option>)}
          </select>
          {fromAccount && <div className="text-[11px] text-muted-foreground mt-1">الرصيد: <span className="font-bold" style={{ color: fromAccount.balance >= 0 ? "#10b981" : "#ef4444" }}>{fmt(fromAccount.balance)} {fromAccount.currency}</span></div>}
        </div>
        <div><label className={labelStyle}>إلى حساب *</label>
          <select value={toAccountId ?? ""} onChange={(e) => setToAccountId(e.target.value ? Number(e.target.value) : null)} className={inputStyle}>
            <option value="">— اختر —</option>
            {accounts.filter(a => a.id !== fromAccountId).map((a) => <option key={a.id} value={a.id}>{a.bankName} — {a.accountNumber} ({a.currency})</option>)}
          </select>
          {toAccount && <div className="text-[11px] text-muted-foreground mt-1">الرصيد: <span className="font-bold" style={{ color: toAccount.balance >= 0 ? "#10b981" : "#ef4444" }}>{fmt(toAccount.balance)} {toAccount.currency}</span></div>}
        </div>
        <div><label className={labelStyle}>المبلغ *</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputStyle} dir="ltr" min={0} /></div>
        <div><label className={labelStyle}>العملة</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputStyle}>
            <option value="KWD">KWD</option><option value="SAR">SAR</option><option value="AED">AED</option><option value="USD">USD</option><option value="EUR">EUR</option>
          </select>
        </div>
        <div><label className={labelStyle}>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>الوصف</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputStyle} placeholder="وصف التحويل" /></div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default BankingView;
