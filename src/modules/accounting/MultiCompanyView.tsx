// Responsive: sm/md/lg breakpoints added
"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Building2, ArrowRightLeft, Plus, X, CheckCircle2, Scale,
  Calendar, FileText, DollarSign, TrendingUp, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConsolidationLine {
  id: number; accountCode: string; accountName: string;
  section: string; companyA: number; companyB: number;
  adjustments: number; consolidated: number;
}
interface ConsolidationResult {
  lines: ConsolidationLine[];
  totalAssets: number; totalLiabilities: number;
  totalRevenue: number; totalExpenses: number; netIncome: number;
}
interface InterCompanyTx {
  id: number; date: string; fromCompany: string; toCompany: string;
  amount: number; currency: string; description: string;
  status: string; type: string;
}

type Tab = "consolidation" | "inter-company";

const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2 px-2.5 sm:py-2.5 sm:px-3 text-[12px] sm:text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[12px] sm:text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
function fmt(n: number) { return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 }); }
function Empty({ label }: { label: string }) { return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>; }

const TX_TYPE_LABELS: Record<string, string> = { loan: "سلفة", sale: "بيع", service: "خدمة", expense: "مصروف", transfer: "تحويل" };
const STATUS_BADGES: Record<string, string> = {
  settled: "bg-emerald-500/15 text-emerald-500",
  pending: "bg-amber-500/15 text-amber-500",
  disputed: "bg-red-500/15 text-red-500",
  cancelled: "bg-gray-400/15 text-gray-400",
};
const STATUS_LABELS: Record<string, string> = { settled: "مسوى", pending: "معلّق", disputed: "مختلف", cancelled: "ملغى" };

export function MultiCompanyView() {
  const { activeCompany, companies } = useBrand();
  const [tab, setTab] = useState<Tab>("consolidation");
  const [interCompanyTxs, setInterCompanyTxs] = useState<InterCompanyTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [consResult, setConsResult] = useState<ConsolidationResult | null>(null);

  const slug = activeCompany ? encodeURIComponent(activeCompany.slug) : "";

  const loadInterCompany = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/inter-company?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setInterCompanyTxs(d.transactions || []); }
      else setInterCompanyTxs([]);
    } catch { setInterCompanyTxs([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "inter-company") loadInterCompany();
  }, [tab, loadInterCompany]);

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "consolidation", label: "التوحيد", icon: Building2 },
    { key: "inter-company", label: "بين الشركات", icon: ArrowRightLeft },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><Building2 size={20} /> الشركات المتعددة</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
        {tab === "inter-company" && !showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> تسوية جديدة</button>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5", tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
            <Icon size={14} /> {t.label}
          </button>
        ); })}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "consolidation" ? (
        <ConsolidationView companies={companies} result={consResult} setResult={setConsResult} activeCompany={activeCompany} />
      ) : tab === "inter-company" ? (
        showForm ? <InterCompanyForm companies={companies} company={activeCompany} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadInterCompany(); }} /> : <InterCompanyView transactions={interCompanyTxs} company={activeCompany} onRefresh={loadInterCompany} />
      ) : null}
    </div>
  );
}

/* ─── Consolidation ─────────────────────────────────── */
function ConsolidationView({ companies, result, setResult, activeCompany }: {
  companies: Array<{ slug: string; name: string; nameAr?: string | null }>;
  result: ConsolidationResult | null; setResult: (r: ConsolidationResult | null) => void;
  activeCompany: { slug: string };
}) {
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set([activeCompany.slug]));
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [running, setRunning] = useState(false);

  const toggleCompany = (slug: string) => {
    setSelectedSlugs(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleConsolidate = async () => {
    if (selectedSlugs.size < 2) { toast.error("اختر至少 2 شركات"); return; }
    setRunning(true);
    try {
      const res = await authedFetch("/api/accounting/consolidation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlugs: Array.from(selectedSlugs), asOfDate, companySlug: activeCompany.slug }),
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d as ConsolidationResult);
        toast.success("تم التوحيد");
      } else { const e = await res.json().catch(() => ({})); toast.error((e as Record<string, unknown>)?.error as string || "تعذّر التوحيد"); }
    } catch { toast.error("خطأ"); }
    finally { setRunning(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold flex items-center gap-2"><Scale size={16} /> توحيد المجموعة</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <div className="flex flex-col gap-2">
            <label className={labelStyle}>الشركات في المجموعة</label>
            <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto garfix-scroll">
              {companies.map(c => (
                <button key={c.slug} onClick={() => toggleCompany(c.slug)} className={cn("py-2 px-3 rounded-md border border-border text-[12px] font-bold cursor-pointer text-start", selectedSlugs.has(c.slug) ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
                  {selectedSlugs.has(c.slug) ? "✓ " : ""} {c.nameAr || c.name}
                </button>
              ))}
            </div>
          </div>
          <div><label className={labelStyle}>كحدود تاريخ</label><input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
        </div>
        <button onClick={handleConsolidate} disabled={running || selectedSlugs.size < 2} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5 self-start">
          <Scale size={14} /> {running ? "جارٍ…" : "تشغيل التوحيد"}
        </button>
      </div>

      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-emerald-500/20 text-emerald-500"><DollarSign size={18} /></div>
              <div><div className="text-[11px] text-muted-foreground">إجمالي الأصول</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(result.totalAssets)}</div></div>
            </div>
            <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-red-500/20 text-red-500"><DollarSign size={18} /></div>
              <div><div className="text-[11px] text-muted-foreground">إجمالي الخصوم</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(result.totalLiabilities)}</div></div>
            </div>
            <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-amber-500/20 text-amber-500"><TrendingUp size={18} /></div>
              <div><div className="text-[11px] text-muted-foreground">إجمالي الإيرادات</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(result.totalRevenue)}</div></div>
            </div>
            <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-violet-500/20 text-violet-500"><FileText size={18} /></div>
              <div><div className="text-[11px] text-muted-foreground">صافي الدخل</div><div className={cn("text-lg font-extrabold [direction:ltr] text-end", result.netIncome >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(result.netIncome)}</div></div>
            </div>
          </div>

          {/* Consolidation Table */}
          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            <div className="overflow-x-auto garfix-scroll max-h-[500px]">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>الكود</th><th className={thStyle}>الحساب</th><th className={thStyle}>القسم</th>
                  <th className={cn(thStyle, "text-end")}>الشركة A</th><th className={cn(thStyle, "text-end")}>الشركة B</th>
                  <th className={cn(thStyle, "text-end")}>التسويات</th><th className={cn(thStyle, "text-end")}>الموحد</th>
                </tr></thead>
                <tbody>{result.lines.map(l => (
                  <tr key={l.id} className="border-b border-border">
                    <td className={cn(tdStyle, "font-mono")}>{l.accountCode}</td>
                    <td className={cn(tdStyle, "font-bold")}>{l.accountName}</td>
                    <td className={tdStyle}><span className={cn("py-0.5 px-2 rounded-[8px] text-[10px] font-bold", l.section === "assets" ? "bg-emerald-500/15 text-emerald-500" : l.section === "liabilities" ? "bg-red-500/15 text-red-500" : l.section === "revenue" ? "bg-amber-500/15 text-amber-500" : "bg-violet-500/15 text-violet-500")}>{l.section === "assets" ? "أصول" : l.section === "liabilities" ? "خصوم" : l.section === "revenue" ? "إيرادات" : "مصروفات"}</span></td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{fmt(l.companyA)}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{fmt(l.companyB)}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end", l.adjustments !== 0 ? "text-amber-500" : "text-gray-400")}>{fmt(l.adjustments)}</td>
                    <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-violet-500")}>{fmt(l.consolidated)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Inter-Company ─────────────────────────────────── */
function InterCompanyView({ transactions, company, onRefresh }: { transactions: InterCompanyTx[]; company: { slug: string }; onRefresh: () => void }) {
  const [settlingId, setSettlingId] = useState<number | null>(null);

  const handleSettle = async (id: number) => {
    setSettlingId(id);
    try {
      const res = await authedFetch(`/api/accounting/inter-company/${id}/settle?companySlug=${encodeURIComponent(company.slug)}`, { method: "POST" });
      if (res.ok) { toast.success("تم التسوية"); onRefresh(); }
      else { const e = await res.json().catch(() => ({})); toast.error((e as Record<string, unknown>)?.error as string || "تعذّر التسوية"); }
    } catch { toast.error("خطأ"); }
    finally { setSettlingId(null); }
  };

  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      {transactions.length === 0 ? <Empty label="حركات بين الشركات" /> : (
        <div className="overflow-x-auto garfix-scroll">
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-border bg-muted">
              <th className={thStyle}>التاريخ</th><th className={thStyle}>من</th><th className={thStyle}>إلى</th>
              <th className={cn(thStyle, "text-end")}>المبلغ</th><th className={thStyle}>العملة</th>
              <th className={thStyle}>النوع</th><th className={thStyle}>الوصف</th><th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
            </tr></thead>
            <tbody>{transactions.map(t => {
              const scBadge = STATUS_BADGES[t.status] || STATUS_BADGES.pending;
              return (
                <tr key={t.id} className="border-b border-border">
                  <td className={tdStyle} dir="ltr">{t.date}</td>
                  <td className={cn(tdStyle, "font-bold")}>{t.fromCompany}</td>
                  <td className={tdStyle}>{t.toCompany}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(t.amount)}</td>
                  <td className={cn(tdStyle, "font-mono")}>{t.currency}</td>
                  <td className={tdStyle}><span className={cn("py-0.5 px-2 rounded-[8px] text-[10px] font-bold", t.type === "loan" ? "bg-blue-500/15 text-blue-500" : t.type === "sale" ? "bg-emerald-500/15 text-emerald-500" : "bg-violet-500/15 text-violet-500")}>{TX_TYPE_LABELS[t.type] || t.type}</span></td>
                  <td className={tdStyle}>{t.description}</td>
                  <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", scBadge)}>{STATUS_LABELS[t.status] || t.status}</span></td>
                  <td className={tdStyle}>
                    {t.status === "pending" && <button onClick={() => handleSettle(t.id)} disabled={settlingId === t.id} className="py-1 px-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[10px] font-bold cursor-pointer disabled:opacity-50">{settlingId === t.id ? "جارٍ…" : "تسوية"}</button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Inter-Company Settlement Form ─────────────────── */
function InterCompanyForm({ companies, company, onClose, onSaved }: {
  companies: Array<{ slug: string; name: string; nameAr?: string | null; currency: string }>;
  company: { slug: string }; onClose: () => void; onSaved: () => void;
}) {
  const [fromCompany, setFromCompany] = useState(company.slug);
  const [toCompany, setToCompany] = useState("");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState("KWD");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("loan");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!fromCompany || !toCompany || amount <= 0) { toast.error("جميع الحقول مطلوبة"); return; }
    if (fromCompany === toCompany) { toast.error("الشركات يجب أن تكون مختلفة"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/accounting/inter-company", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCompany, toCompany, amount, currency, description, type, date, companySlug: company.slug }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as Record<string, unknown>)?.error as string || "Failed"); }
      toast.success("تم إنشاء التسوية"); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  const companyLabel = (slug: string) => {
    const c = companies.find(x => x.slug === slug);
    return c ? (c.nameAr || c.name) : slug;
  };

  return (
    <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
      <h3 className="text-[15px] font-bold flex items-center gap-2"><ArrowRightLeft size={16} /> تسوية بين شركات جديدة</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div><label className={labelStyle}>من شركة *</label>
          <select value={fromCompany} onChange={(e) => setFromCompany(e.target.value)} className={inputStyle}>
            {companies.map(c => <option key={c.slug} value={c.slug}>{c.nameAr || c.name}</option>)}
          </select>
        </div>
        <div><label className={labelStyle}>إلى شركة *</label>
          <select value={toCompany} onChange={(e) => setToCompany(e.target.value)} className={inputStyle}>
            <option value="">— اختر —</option>
            {companies.filter(c => c.slug !== fromCompany).map(c => <option key={c.slug} value={c.slug}>{c.nameAr || c.name}</option>)}
          </select>
        </div>
        <div><label className={labelStyle}>المبلغ *</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
        <div><label className={labelStyle}>العملة</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputStyle}>
            <option value="KWD">KWD</option><option value="SAR">SAR</option><option value="AED">AED</option><option value="BHD">BHD</option><option value="OMR">OMR</option><option value="EGP">EGP</option>
          </select>
        </div>
        <div><label className={labelStyle}>النوع</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputStyle}>
            {Object.entries(TX_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className={labelStyle}>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
      </div>
      <div><label className={labelStyle}>الوصف</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputStyle} placeholder="وصف الحركة…" /></div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-md bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-md bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer disabled:opacity-70">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default MultiCompanyView;
