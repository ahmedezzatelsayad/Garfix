"use client";

import { useState } from "react";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import {
  useLettersOfCredit, useCreateLetterOfCredit,
  useFXRevaluation, useCreateFXRevaluation,
} from "@/hooks/queries";
import {
  Plus, X, Landmark, ArrowRightLeft,
  TrendingUp, TrendingDown, Clock, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface _LetterOfCredit {
  id: number; lcNumber: string; supplier: string; bank: string;
  amount: number; currency: string; issueDate: string; expiryDate: string; status: string;
}
interface _FXRevaluation {
  id: number; fromCurrency: string; toCurrency: string; rate: number;
  period: string; realizedGain: number; realizedLoss: number;
  unrealizedGain: number; unrealizedLoss: number; netEffect: number;
}

type Tab = "lc" | "fx";

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

const LC_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  issued:    { label: "مصدرة",       badge: "bg-mutedackgroundlue-500/15 text-blue-500" },
  amended:   { label: "معدّلة",      badge: "bg-cardmber-500/15 text-amber-500" },
  utilized:  { label: "مستخدمة",     badge: "bg-mutedmerald-500/15 text-emerald-500" },
  expired:   { label: "منتهية",      badge: "bg-red-500/15 text-red-500" },
};

/* ─── Main Component ────────────────────────────────────────────────────────── */
export function TradeFinanceView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("lc");

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

  // TanStack Query hooks for data fetching
  const lcQuery = useLettersOfCredit(slug);
  const fxQuery = useFXRevaluation(slug);

  const lcs = lcQuery.data?.lettersOfCredit ?? [];
  const fxEntries = fxQuery.data?.revaluations ?? [];
  const loading = tab === "lc" ? lcQuery.isLoading : tab === "fx" ? fxQuery.isLoading : false;

  const switchTab = (t: Tab) => { setTab(t); setShowLcForm(false); setShowFxForm(false); };

  /* ── Create LC ──────────────────────────────────────────────────────────── */
  const createLcMutation = useCreateLetterOfCredit();

  const handleCreateLc = () => {
    if (!activeCompany) return;
    if (!lcNumber || !lcSupplier || !lcBank || !lcAmount) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    createLcMutation.mutate(
      {
        companySlug: activeCompany.slug,
        lcNumber, supplier: lcSupplier, bank: lcBank,
        amount: parseFloat(lcAmount), currency: lcCurrency,
        issueDate: lcIssueDate, expiryDate: lcExpiryDate, status: "issued",
      },
      {
        onSuccess: () => { toast.success("تم إنشاء الاعتماد المستندي"); setShowLcForm(false); resetLcForm(); },
        onError: (err) => { toast.error(err.message || "تعذّر إنشاء الاعتماد"); },
      },
    );
  };

  const resetLcForm = () => { setLcNumber(""); setLcSupplier(""); setLcBank(""); setLcAmount(""); setLcCurrency("KWD"); setLcIssueDate(""); setLcExpiryDate(""); };

  /* ── Create FX Revaluation ─────────────────────────────────────────────── */
  const createFxMutation = useCreateFXRevaluation();

  const handleCreateFx = () => {
    if (!activeCompany) return;
    if (!fxRate) { toast.error("يرجى إدخال سعر الصرف"); return; }
    createFxMutation.mutate(
      {
        companySlug: activeCompany.slug,
        fromCurrency: fxFrom, toCurrency: fxTo,
        rate: parseFloat(fxRate), period: fxPeriod,
      },
      {
        onSuccess: () => { toast.success("تم حساب تقييم العملات"); setShowFxForm(false); resetFxForm(); },
        onError: (err) => { toast.error(err.message || "تعذّر حساب تقييم العملات"); },
      },
    );
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
      {/* Header - DS v4.0: Emerald accent color */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          {/* DS v4.0: Section header with emerald accent */}
          <h1 className="text-2xl font-extrabold flex items-center gap-2 text-[#047857]"><ShieldCheck size={20} /> التمويل التجاري</h1>
          <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {/* DS v4.0: Action button with active-press */}
        <button onClick={() => tab === "lc" ? setShowLcForm(true) : setShowFxForm(true)} className="inline-flex items-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer active-press duration-150"><Plus size={16} /> {tab === "lc" ? "اعتماد جديد" : "حساب تقييم"}</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => switchTab(t.key)} className={cn(
              "py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-white dark:bg-gray-900 text-muted-foreground",
            )}>
              {Icon && <Icon size={14} />} {t.label}
            </button>
          );
        })}
      </div>

      {/* DS v4.0: KPI Cards Section */}
      {tab === "lc" && !showLcForm && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total LCs - Standard KPI Card */}
          <div className="kpi-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#047857]/15 flex items-center justify-center">
                <Landmark size={20} className="text-[#047857]" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">إجمالي الاعتمادات</p>
                <p className="text-xl font-bold text-[#047857]">{lcs.length}</p>
              </div>
            </div>
          </div>
          {/* Active LCs - GOLD KPI Card (Premium!) */}
          <div className="kpi-card-gold">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#d4a574]/15 flex items-center justify-center">
                <ShieldCheck size={20} className="text-[#d4a574]" />
              </div>
              <div>
                <p className="text-[11px] opacity-80 font-medium">الاعتمادات النشطة</p>
                <p className="text-xl font-bold">{lcs.filter(lc => lc.status === 'issued' || lc.status === 'amended').length}</p>
              </div>
            </div>
          </div>
          {/* Pending Approval - Standard KPI */}
          <div className="kpi-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cardmber-500/15 flex items-center justify-center">
                <Clock size={20} className="text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">قيد الموافقة</p>
                <p className="text-xl font-bold text-amber-500">{lcs.filter(lc => lc.status === 'issued').length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "lc" ? (
        showLcForm ? (
          <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-border p-5 hover-lift duration-120">
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
            {/* DS v4.0: Action buttons with active-press */}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setShowLcForm(false); resetLcForm(); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer active-press duration-150">إلغاء</button>
              <button onClick={handleCreateLc} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5 active-press duration-150"><Landmark size={14} /> إنشاء</button>
            </div>
          </div>
        ) : lcs.length === 0 ? <Empty label="اعتمادات مستندية" /> : (
          <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-border overflow-hidden hover-lift duration-120">
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse table-enterprise">
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
        showFxForm ? (
          <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-border p-5 hover-lift duration-120">
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
            {/* DS v4.0: Action buttons with active-press */}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setShowFxForm(false); resetFxForm(); }} className="px-4 py-2 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold cursor-pointer active-press duration-150">إلغاء</button>
              <button onClick={handleCreateFx} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-1.5 active-press duration-150"><ArrowRightLeft size={14} /> حساب</button>
            </div>
          </div>
        ) : fxEntries.length === 0 ? <Empty label="تقييمات عملات" /> : (
          <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-border overflow-hidden hover-lift duration-120">
            {/* Summary cards - DS v4.0: Using kpi-card classes */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-border">
              {(() => {
                const totalRealizedGain = fxEntries.reduce((s, f) => s + f.realizedGain, 0);
                const totalRealizedLoss = fxEntries.reduce((s, f) => s + f.realizedLoss, 0);
                const totalUnrealizedGain = fxEntries.reduce((s, f) => s + f.unrealizedGain, 0);
                const totalUnrealizedLoss = fxEntries.reduce((s, f) => s + f.unrealizedLoss, 0);
                return [
                  // DS v4.0: Emerald for gains
                  { label: "أرباح محققة", value: totalRealizedGain, badgeClass: "bg-[#047857]/20 text-[#047857]", textClass: "text-[#047857]", icon: <TrendingUp size={16} />, cardClass: "kpi-card" },
                  { label: "خسائر محققة", value: totalRealizedLoss, badgeClass: "bg-red-500/20 text-red-500", textClass: "text-red-500", icon: <TrendingDown size={16} />, cardClass: "kpi-card" },
                  // DS v4.0: GOLD for unrealized gains (Premium financial data!)
                  { label: "أرباح غير محققة", value: totalUnrealizedGain, badgeClass: "bg-[#d4a574]/20 text-[#d4a574]", textClass: "text-[#d4a574]", icon: <TrendingUp size={16} />, cardClass: "kpi-card-gold" },
                  { label: "خسائر غير محققة", value: totalUnrealizedLoss, badgeClass: "bg-cardmber-500/20 text-amber-500", textClass: "text-amber-500", icon: <TrendingDown size={16} />, cardClass: "kpi-card" },
                ].map((m, i) => (
                  <div key={i} className={cn(m.cardClass, "p-3 flex items-center gap-2")}>
                    <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", m.badgeClass)}>{m.icon}</div>
                    <div><p className="text-[11px] text-muted-foreground">{m.label}</p><p className={cn("text-[15px] font-bold", m.textClass)}>{fmt(m.value)}</p></div>
                  </div>
                ));
              })()}
            </div>
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse table-enterprise">
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
                      <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-emerald-500")}>{fmt(fx.realizedGain)}</td>
                      <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-red-500")}>{fmt(fx.realizedLoss)}</td>
                      <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-blue-500")}>{fmt(fx.unrealizedGain)}</td>
                      <td className={cn(cn(tdStyle, "[direction:ltr] text-end font-bold"), "text-amber-500")}>{fmt(fx.unrealizedLoss)}</td>
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
