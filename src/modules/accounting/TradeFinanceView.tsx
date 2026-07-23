"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, X, Landmark, DollarSign, Calendar, ArrowRightLeft,
  TrendingUp, TrendingDown, FileText, Clock, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface LetterOfCredit {
  id: number; lcNumber: string; supplier: string; bank: string;
  amount: number; currency: string; issueDate: string; expiryDate: string; status: string;
}
interface FXRevaluation {
  id: number; fromCurrency: string; toCurrency: string; rate: number;
  period: string; realizedGain: number; realizedLoss: number;
  unrealizedGain: number; unrealizedLoss: number; netEffect: number;
}

type Tab = "lc" | "fx";

/* ─── Shared Styles ─────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const selectStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none cursor-pointer";

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

const LC_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  issued:    { label: "مصدرة",       badge: "bg-blue-500/15 text-blue-500" },
  amended:   { label: "معدّلة",      badge: "bg-amber-500/15 text-amber-500" },
  utilized:  { label: "مستخدمة",     badge: "bg-emerald-500/15 text-emerald-500" },
  expired:   { label: "منتهية",      badge: "bg-red-500/15 text-red-500" },
};

/* ─── Main Component ────────────────────────────────────────────────────────── */
export function TradeFinanceView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("lc");
  const [lcs, setLcs] = useState<LetterOfCredit[]>([]);
  const [fxEntries, setFxEntries] = useState<FXRevaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLcForm, setShowLcForm] = useState(false);
  const [showFxForm, setShowFxForm] = useState(false);

  /* LC form state */
  const [lcNumber, setLcNumber] = useState("");
  const [lcSupplier, setLcSupplier] = useState("");
  const [lcBank, setLcBank] = useState("");
  const [lcAmount, setLcAmount] = useState("");
  const [lcCurrency, setLcCurrency] = useState("KWD");
  const [lcIssueDate, setLcIssueDate] = useState("");
  const [lcExpiryDate, setLcExpiryDate] = useState("");

  /* FX form state */
  const [fxFrom, setFxFrom] = useState("USD");
  const [fxTo, setFxTo] = useState("KWD");
  const [fxRate, setFxRate] = useState("");
  const [fxPeriod, setFxPeriod] = useState("Q1");

  const slug = activeCompany ? `companySlug=${encodeURIComponent(activeCompany.slug)}` : "";

  const loadLcs = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/letters-of-credit?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `فشل تحميل الاعتمادات (${res.status})`); }
      const d = await res.json();
      setLcs(d.lettersOfCredit || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحميل اعتمادات مستندية");
      setLcs([]);
    } finally { setLoading(false); }
  }, [activeCompany, slug]);

  const loadFx = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/fx-revaluation?${slug}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `فشل تحميل تقييم FX (${res.status})`); }
      const d = await res.json();
      setFxEntries(d.revaluations || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحميل تقييم العملات");
      setFxEntries([]);
    } finally { setLoading(false); }
  }, [activeCompany, slug]);

  useEffect(() => { if (tab === "lc") loadLcs(); else loadFx(); }, [tab, loadLcs, loadFx]);

  const switchTab = (t: Tab) => { setTab(t); setShowLcForm(false); setShowFxForm(false); };

  /* ── Create LC ──────────────────────────────────────────────────────────── */
  const handleCreateLc = async () => {
    if (!activeCompany) return;
    if (!lcNumber || !lcSupplier || !lcBank || !lcAmount) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    try {
      const res = await authedFetch("/api/accounting/letters-of-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: activeCompany.slug,
          lcNumber, supplier: lcSupplier, bank: lcBank,
          amount: parseFloat(lcAmount), currency: lcCurrency,
          issueDate: lcIssueDate, expiryDate: lcExpiryDate, status: "issued",
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل إنشاء الاعتماد"); }
      toast.success("تم إنشاء الاعتماد المستندي");
      setShowLcForm(false); resetLcForm(); loadLcs();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر إنشاء الاعتماد"); }
  };

  const resetLcForm = () => { setLcNumber(""); setLcSupplier(""); setLcBank(""); setLcAmount(""); setLcCurrency("KWD"); setLcIssueDate(""); setLcExpiryDate(""); };

  /* ── Create FX Revaluation ─────────────────────────────────────────────── */
  const handleCreateFx = async () => {
    if (!activeCompany) return;
    if (!fxRate) { toast.error("يرجى إدخال سعر الصرف"); return; }
    try {
      const res = await authedFetch("/api/accounting/fx-revaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug: activeCompany.slug,
          fromCurrency: fxFrom, toCurrency: fxTo,
          rate: parseFloat(fxRate), period: fxPeriod,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "فشل حساب تقييم العملات"); }
      toast.success("تم حساب تقييم العملات");
      setShowFxForm(false); resetFxForm(); loadFx();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذّر حساب تقييم العملات"); }
  };

  const resetFxForm = () => { setFxFrom("USD"); setFxTo("KWD"); setFxRate(""); setFxPeriod("Q1"); };

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "lc", label: "اعتمادات مستندية", icon: Landmark },
    { key: "fx", label: "تقييم العملات", icon: ArrowRightLeft },
  ];

  const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><ShieldCheck size={20} /> التمويل التجاري</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        <button onClick={() => tab === "lc" ? setShowLcForm(true) : setShowFxForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer"><Plus size={16} /> {tab === "lc" ? "اعتماد جديد" : "حساب تقييم"}</button>
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

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "lc" ? (
        /* ── LC Tab ──────────────────────────────────────────────────────────── */
        showLcForm ? (
          <div className="bg-card rounded-[14px] border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">اعتماد مستندي جديد</h2>
              <button onClick={() => { setShowLcForm(false); resetLcForm(); }} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelStyle}>رقم الاعتماد *</label><input value={lcNumber} onChange={(e) => setLcNumber(e.target.value)} className={inputStyle} placeholder="LC-2025-001" /></div>
              <div><label className={labelStyle}>المورد *</label><input value={lcSupplier} onChange={(e) => setLcSupplier(e.target.value)} className={inputStyle} placeholder="اسم المورد" /></div>
              <div><label className={labelStyle}>البنك *</label><input value={lcBank} onChange={(e) => setLcBank(e.target.value)} className={inputStyle} placeholder="اسم البنك" /></div>
              <div><label className={labelStyle}>المبلغ *</label><input value={lcAmount} onChange={(e) => setLcAmount(e.target.value)} className={inputStyle} type="number" placeholder="0.000" /></div>
              <div><label className={labelStyle}>العملة</label>
                <select value={lcCurrency} onChange={(e) => setLcCurrency(e.target.value)} className={selectStyle}>
                  <option value="KWD">KWD — دينار كويتي</option>
                  <option value="USD">USD — دولار أمريكي</option>
                  <option value="EUR">EUR — يورو</option>
                  <option value="GBP">GBP — جنيه بريطاني</option>
                  <option value="SAR">SAR — ريال سعودي</option>
                </select>
              </div>
              <div><label className={labelStyle}>تاريخ الإصدار</label><input value={lcIssueDate} onChange={(e) => setLcIssueDate(e.target.value)} className={inputStyle} type="date" /></div>
              <div><label className={labelStyle}>تاريخ الانتهاء</label><input value={lcExpiryDate} onChange={(e) => setLcExpiryDate(e.target.value)} className={inputStyle} type="date" /></div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setShowLcForm(false); resetLcForm(); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer">إلغاء</button>
              <button onClick={handleCreateLc} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"><Landmark size={14} /> إنشاء</button>
            </div>
          </div>
        ) : lcs.length === 0 ? <Empty label="اعتمادات مستندية" /> : (
          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>رقم الاعتماد</th><th className={thStyle}>المورد</th>
                  <th className={thStyle}>البنك</th><th className={thStyle}>المبلغ</th>
                  <th className={thStyle}>العملة</th><th className={thStyle}>تاريخ الإصدار</th>
                  <th className={thStyle}>الانتهاء</th><th className={thStyle}>الحالة</th>
                </tr></thead>
                <tbody>
                  {lcs.map((lc) => {
                    const st = LC_STATUS_MAP[lc.status] || { label: lc.status, badge: "bg-gray-500/15 text-gray-500" };
                    return (
                      <tr key={lc.id} className="border-b border-border">
                        <td className={cn(tdStyle, "font-mono font-bold")}>{lc.lcNumber}</td>
                        <td className={tdStyle}>{lc.supplier}</td>
                        <td className={tdStyle}>{lc.bank}</td>
                        <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(lc.amount)}</td>
                        <td className={tdStyle}>{lc.currency}</td>
                        <td className={tdStyle}>{lc.issueDate}</td>
                        <td className={tdStyle}>{lc.expiryDate}</td>
                        <td className={tdStyle}>
                          <span className={cn("py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold", st.badge)}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{lcs.length} اعتماد</div>
          </div>
        )
      ) : (
        /* ── FX Tab ──────────────────────────────────────────────────────────── */
        showFxForm ? (
          <div className="bg-card rounded-[14px] border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">حساب تقييم العملات</h2>
              <button onClick={() => { setShowFxForm(false); resetFxForm(); }} className="w-7 h-7 rounded-md border border-border flex items-center justify-center cursor-pointer"><X size={14} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelStyle}>من عملة</label>
                <select value={fxFrom} onChange={(e) => setFxFrom(e.target.value)} className={selectStyle}>
                  <option value="USD">USD — دولار أمريكي</option>
                  <option value="EUR">EUR — يورو</option>
                  <option value="GBP">GBP — جنيه بريطاني</option>
                  <option value="SAR">SAR — ريال سعودي</option>
                  <option value="AED">AED — درهم إماراتي</option>
                </select>
              </div>
              <div><label className={labelStyle}>إلى عملة</label>
                <select value={fxTo} onChange={(e) => setFxTo(e.target.value)} className={selectStyle}>
                  <option value="KWD">KWD — دينار كويتي</option>
                  <option value="USD">USD — دولار أمريكي</option>
                  <option value="EUR">EUR — يورو</option>
                </select>
              </div>
              <div><label className={labelStyle}>سعر الصرف *</label><input value={fxRate} onChange={(e) => setFxRate(e.target.value)} className={inputStyle} type="number" step="0.0001" placeholder="0.3057" /></div>
              <div><label className={labelStyle}>الفترة</label>
                <select value={fxPeriod} onChange={(e) => setFxPeriod(e.target.value)} className={selectStyle}>
                  <option value="Q1">Q1 — الربع الأول</option>
                  <option value="Q2">Q2 — الربع الثاني</option>
                  <option value="Q3">Q3 — الربع الثالث</option>
                  <option value="Q4">Q4 — الربع الرابع</option>
                  <option value="YTD">YTD — منذ بداية السنة</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setShowFxForm(false); resetFxForm(); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer">إلغاء</button>
              <button onClick={handleCreateFx} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"><ArrowRightLeft size={14} /> حساب</button>
            </div>
          </div>
        ) : fxEntries.length === 0 ? <Empty label="تقييمات عملات" /> : (
          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-border">
              {(() => {
                const totalRealizedGain = fxEntries.reduce((s, f) => s + f.realizedGain, 0);
                const totalRealizedLoss = fxEntries.reduce((s, f) => s + f.realizedLoss, 0);
                const totalUnrealizedGain = fxEntries.reduce((s, f) => s + f.unrealizedGain, 0);
                const totalUnrealizedLoss = fxEntries.reduce((s, f) => s + f.unrealizedLoss, 0);
                return [
                  { label: "أرباح محققة", value: totalRealizedGain, badgeClass: "bg-emerald-500/20 text-emerald-500", textClass: "text-emerald-500", icon: <TrendingUp size={16} /> },
                  { label: "خسائر محققة", value: totalRealizedLoss, badgeClass: "bg-red-500/20 text-red-500", textClass: "text-red-500", icon: <TrendingDown size={16} /> },
                  { label: "أرباح غير محققة", value: totalUnrealizedGain, badgeClass: "bg-blue-500/20 text-blue-500", textClass: "text-blue-500", icon: <TrendingUp size={16} /> },
                  { label: "خسائر غير محققة", value: totalUnrealizedLoss, badgeClass: "bg-amber-500/20 text-amber-500", textClass: "text-amber-500", icon: <TrendingDown size={16} /> },
                ].map((m, i) => (
                  <div key={i} className="bg-background rounded-[10px] border border-border p-3 flex items-center gap-2">
                    <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", m.badgeClass)}>{m.icon}</div>
                    <div><p className="text-[11px] text-muted-foreground">{m.label}</p><p className={cn("text-[15px] font-bold", m.textClass)}>{fmt(m.value)}</p></div>
                  </div>
                ));
              })()}
            </div>
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>من</th><th className={thStyle}>إلى</th>
                  <th className={thStyle}>السعر</th><th className={thStyle}>الفترة</th>
                  <th className={thStyle}>أرباح محققة</th><th className={thStyle}>خسائر محققة</th>
                  <th className={thStyle}>أرباح غير محققة</th><th className={thStyle}>خسائر غير محققة</th>
                  <th className={thStyle}>صافي الأثر</th>
                </tr></thead>
                <tbody>
                  {fxEntries.map((fx) => (
                    <tr key={fx.id} className="border-b border-border">
                      <td className={tdStyle}>{fx.fromCurrency}</td>
                      <td className={tdStyle}>{fx.toCurrency}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-mono")}>{fx.rate}</td>
                      <td className={tdStyle}>{fx.period}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} className="text-emerald-500">{fmt(fx.realizedGain)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} className="text-red-500">{fmt(fx.realizedLoss)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} className="text-blue-500">{fmt(fx.unrealizedGain)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} className="text-amber-500">{fmt(fx.unrealizedLoss)}</td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end font-bold", fx.netEffect >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(fx.netEffect)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="py-3 px-4 border-t border-border text-[12px] text-muted-foreground">{fxEntries.length} تقييم</div>
          </div>
        )
      )}
    </div>
  );
}
