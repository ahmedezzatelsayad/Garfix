// Responsive: sm/md/lg breakpoints added
"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Scale, FileText, Clock, Shield, Plus, Download, Send,
  CheckCircle2, AlertTriangle, Calculator, MapPin, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VATReturn {
  id: number; country: string; periodFrom: string; periodTo: string;
  totalSales: number; totalPurchases: number;
  vatOnSales: number; vatOnPurchases: number; vatDue: number; status: string;
}
interface ZakatRecord {
  id: number; year: string; zakatBase: number; zakatRate: number;
  zakatAmount: number; totalAssets: number; totalLiabilities: number;
  nonZakatAssets: number; breakdown: Record<string, number>; status: string;
}
interface FilingReminder {
  id: number; title: string; country: string; nextDeadline: string;
  daysUntil: number; type: string; status: string;
}
interface RetentionCheck {
  id: number; country: string; category: string;
  requiredYears: number; actualYears: number; recordsAtRisk: number; compliant: boolean;
}

type Tab = "vat-return" | "zakat" | "reminders" | "retention";

const COUNTRIES = [
  { value: "KW", label: "الكويت" }, { value: "SA", label: "السعودية" },
  { value: "AE", label: "الإمارات" }, { value: "BH", label: "البحرين" },
  { value: "OM", label: "عُمان" }, { value: "EG", label: "مصر" },
];

const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2 px-2.5 sm:py-2.5 sm:px-3 text-[12px] sm:text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[12px] sm:text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
function fmt(n: number) { return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 }); }
function Empty({ label }: { label: string }) { return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>; }

export function TaxComplianceView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("vat-return");
  const [vatReturns, setVatReturns] = useState<VATReturn[]>([]);
  const [zakatRecords, setZakatRecords] = useState<ZakatRecord[]>([]);
  const [reminders, setReminders] = useState<FilingReminder[]>([]);
  const [retentionChecks, setRetentionChecks] = useState<RetentionCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [vatResult, setVatResult] = useState<VATReturn | null>(null);
  const [zakatResult, setZakatResult] = useState<ZakatRecord | null>(null);

  const slug = activeCompany ? encodeURIComponent(activeCompany.slug) : "";

  const loadVAT = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/tax-filing?companySlug=${slug}&type=vat`);
      if (res.ok) { const d = await res.json(); setVatReturns(d.returns || []); }
      else setVatReturns([]);
    } catch { setVatReturns([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  const loadZakat = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/tax-filing?companySlug=${slug}&type=zakat`);
      if (res.ok) { const d = await res.json(); setZakatRecords(d.records || []); }
      else setZakatRecords([]);
    } catch { setZakatRecords([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  const loadReminders = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/filing-reminders?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setReminders(d.reminders || []); }
      else setReminders([]);
    } catch { setReminders([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  const loadRetention = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/retention-check?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setRetentionChecks(d.checks || []); }
      else setRetentionChecks([]);
    } catch { setRetentionChecks([]); }
    finally { setLoading(false); }
  }, [slug, activeCompany]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "vat-return") loadVAT();
    if (tab === "zakat") loadZakat();
    if (tab === "reminders") loadReminders();
    if (tab === "retention") loadRetention();
  }, [tab, loadVAT, loadZakat, loadReminders, loadRetention]);

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "vat-return", label: "إقرار VAT", icon: FileText },
    { key: "zakat", label: "الزكاة", icon: Scale },
    { key: "reminders", label: "تذكيرات", icon: Clock },
    { key: "retention", label: "الاحتفاظ", icon: Shield },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><Scale size={20} /> الضرائب & الامتثال</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => { setTab(t.key); setVatResult(null); setZakatResult(null); }} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5", tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
            <Icon size={14} /> {t.label}
          </button>
        ); })}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "vat-return" ? (
        <VATReturnView returns={vatReturns} result={vatResult} setResult={setVatResult} company={activeCompany} onRefresh={loadVAT} />
      ) : tab === "zakat" ? (
        <ZakatView records={zakatRecords} result={zakatResult} setResult={setZakatResult} company={activeCompany} onRefresh={loadZakat} />
      ) : tab === "reminders" ? (
        <RemindersView reminders={reminders} />
      ) : (
        <RetentionView checks={retentionChecks} />
      )}
    </div>
  );
}

/* ─── VAT Return ─────────────────────────────────────── */
function VATReturnView({ returns, result, setResult, company, onRefresh }: {
  returns: VATReturn[]; result: VATReturn | null; setResult: (r: VATReturn | null) => void;
  company: { slug: string }; onRefresh: () => void;
}) {
  const [country, setCountry] = useState("KW");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!periodFrom || !periodTo) { toast.error("حدد الفترة"); return; }
    setGenerating(true);
    try {
      const res = await authedFetch("/api/accounting/tax-filing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "vat", country, periodFrom, periodTo, companySlug: company.slug }),
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d.return as VATReturn);
        toast.success("تم إنشاء الإقرار"); onRefresh();
      } else { const e = await res.json().catch(() => ({})); toast.error((e as Record<string, unknown>)?.error as string || "تعذّر إنشاء الإقرار"); }
    } catch { toast.error("خطأ"); }
    finally { setGenerating(false); }
  };

  const countryLabel = (c: string) => COUNTRIES.find(x => x.value === c)?.label || c;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">الدولة</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputStyle} style={{ width: "auto" }}>
            {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">من</label>
          <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">إلى</label>
          <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <button onClick={handleGenerate} disabled={generating} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
          <Calculator size={14} /> {generating ? "جارٍ…" : "إنشاء إقرار"}
        </button>
      </div>

      {result && (
        <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3">
          <h3 className="text-[15px] font-bold flex items-center gap-2"><FileText size={16} /> نتائج الإقرار — {countryLabel(result.country)}</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">إجمالي المبيعات</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(result.totalSales)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">إجمالي المشتريات</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(result.totalPurchases)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">VAT على المبيعات</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: "#ef4444" }}>{fmt(result.vatOnSales)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">VAT على المشتريات</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: "#10b981" }}>{fmt(result.vatOnPurchases)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">VAT المستحق</div><div className="text-xl font-extrabold [direction:ltr] text-end" style={{ color: result.vatDue >= 0 ? "#ef4444" : "#10b981" }}>{fmt(result.vatDue)}</div></div>
          </div>
          <span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: result.status === "submitted" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: result.status === "submitted" ? "#10b981" : "#f59e0b" }}>{result.status === "submitted" ? "مُرسل" : "مُنشأ"}</span>
        </div>
      )}

      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {returns.length === 0 ? <Empty label="إقرارات VAT" /> : (
          <div className="overflow-x-auto garfix-scroll max-h-[400px]">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>الدولة</th><th className={thStyle}>من</th><th className={thStyle}>إلى</th>
                <th className={cn(thStyle, "text-end")}>VAT مبيعات</th><th className={cn(thStyle, "text-end")}>VAT مشتريات</th>
                <th className={cn(thStyle, "text-end")}>VAT مستحق</th><th className={thStyle}>الحالة</th>
              </tr></thead>
              <tbody>{returns.map(r => (
                <tr key={r.id} className="border-b border-border">
                  <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: "rgba(124,58,237,0.15)", color: "#7c3aed" }}>{countryLabel(r.country)}</span></td>
                  <td className={tdStyle} dir="ltr">{r.periodFrom}</td><td className={tdStyle} dir="ltr">{r.periodTo}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end")} style={{ color: "#ef4444" }}>{fmt(r.vatOnSales)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end")} style={{ color: "#10b981" }}>{fmt(r.vatOnPurchases)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: r.vatDue >= 0 ? "#ef4444" : "#10b981" }}>{fmt(r.vatDue)}</td>
                  <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: r.status === "submitted" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: r.status === "submitted" ? "#10b981" : "#f59e0b" }}>{r.status === "submitted" ? "مُرسل" : "مُنشأ"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Zakat ──────────────────────────────────────────── */
function ZakatView({ records, result, setResult, company, onRefresh }: {
  records: ZakatRecord[]; result: ZakatRecord | null; setResult: (r: ZakatRecord | null) => void;
  company: { slug: string }; onRefresh: () => void;
}) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [calculating, setCalculating] = useState(false);

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const res = await authedFetch("/api/accounting/tax-filing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "zakat", year, companySlug: company.slug }),
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d.record as ZakatRecord);
        toast.success("تم حساب الزكاة"); onRefresh();
      } else { const e = await res.json().catch(() => ({})); toast.error((e as Record<string, unknown>)?.error as string || "تعذّر حساب الزكاة"); }
    } catch { toast.error("خطأ"); }
    finally { setCalculating(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">السنة</label>
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <button onClick={handleCalculate} disabled={calculating} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
          <Scale size={14} /> {calculating ? "جارٍ…" : "حساب الزكاة"}
        </button>
        <span className="text-[11px] text-muted-foreground">نسبة الزكاة: 2.5%</span>
      </div>

      {result && (
        <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3">
          <h3 className="text-[15px] font-bold flex items-center gap-2"><Scale size={16} /> نتائج الزكاة — {result.year}</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">إجمالي الأصول</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(result.totalAssets)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">إجمالي الخصوم</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: "#ef4444" }}>{fmt(result.totalLiabilities)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">أصول غير زكوية</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: "#f59e0b" }}>{fmt(result.nonZakatAssets)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">أساس الزكاة</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(result.zakatBase)}</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">نسبة الزكاة</div><div className="text-lg font-extrabold [direction:ltr] text-end">{result.zakatRate}%</div></div>
            <div className="bg-muted rounded-md p-3"><div className="text-[11px] text-muted-foreground">مبلغ الزكاة</div><div className="text-xl font-extrabold [direction:ltr] text-end" style={{ color: "#7c3aed" }}>{fmt(result.zakatAmount)}</div></div>
          </div>
          {result.breakdown && Object.keys(result.breakdown).length > 0 && (
            <div className="bg-muted rounded-md p-3 text-[12px]">
              <div className="text-[11px] font-bold mb-2">تفصيل أساس الزكاة:</div>
              {Object.entries(result.breakdown).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-bold [direction:ltr] text-end">{fmt(v)}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {records.length === 0 ? <Empty label="حسابات الزكاة" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>السنة</th><th className={cn(thStyle, "text-end")}>أساس الزكاة</th>
                <th className={cn(thStyle, "text-end")}>النسبة</th><th className={cn(thStyle, "text-end")}>مبلغ الزكاة</th><th className={thStyle}>الحالة</th>
              </tr></thead>
              <tbody>{records.map(r => (
                <tr key={r.id} className="border-b border-border">
                  <td className={tdStyle} dir="ltr">{r.year}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(r.zakatBase)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end")}>{r.zakatRate}%</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: "#7c3aed" }}>{fmt(r.zakatAmount)}</td>
                  <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: r.status === "paid" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: r.status === "paid" ? "#10b981" : "#f59e0b" }}>{r.status === "paid" ? "مُسدد" : "مُحسب"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Filing Reminders ──────────────────────────────── */
function RemindersView({ reminders }: { reminders: FilingReminder[] }) {
  const grouped = reminders.reduce<Record<string, FilingReminder[]>>((acc, r) => {
    const key = r.country;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {reminders.length === 0 ? <Empty label="تذكيرات" /> : (
        Object.entries(grouped).map(([country, items]) => (
          <div key={country} className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MapPin size={16} style={{ color: "#7c3aed" }} />
              <h3 className="text-[14px] font-bold">{COUNTRIES.find(c => c.value === country)?.label || country}</h3>
            </div>
            <div className="flex flex-col gap-2.5">
              {items.map(r => {
                const isOverdue = r.daysUntil < 0;
                const isUrgent = r.daysUntil <= 7 && r.daysUntil >= 0;
                return (
                  <div key={r.id} className="flex items-start gap-3 bg-muted rounded-md p-3">
                    <div className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0" style={{ background: isOverdue ? "rgba(239,68,68,0.20)" : isUrgent ? "rgba(245,158,11,0.20)" : "rgba(16,185,129,0.20)", color: isOverdue ? "#ef4444" : isUrgent ? "#f59e0b" : "#10b981" }}>
                      {isOverdue ? <AlertTriangle size={16} /> : <Clock size={16} />}
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <div className="text-[13px] font-bold">{r.title}</div>
                        <div className="flex gap-2">
                          {isOverdue && <span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>متأخر!</span>}
                          <span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: r.status === "done" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: r.status === "done" ? "#10b981" : "#f59e0b" }}>{r.status === "done" ? "مكتمل ✓" : "قيد التنفيذ"}</span>
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{r.type} — الموعد: <span dir="ltr" className="font-mono">{r.nextDeadline}</span></div>
                      <div className="text-[11px]"><span className="font-bold" style={{ color: isOverdue ? "#ef4444" : isUrgent ? "#f59e0b" : "#10b981" }}>{r.daysUntil} يوم</span> متبقي</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── Retention ─────────────────────────────────────── */
function RetentionView({ checks }: { checks: RetentionCheck[] }) {
  const compliantCount = checks.filter(c => c.compliant).length;
  const totalRisk = checks.reduce((s, c) => s + c.recordsAtRisk, 0);
  const grouped = checks.reduce<Record<string, RetentionCheck[]>>((acc, c) => {
    if (!acc[c.country]) acc[c.country] = [];
    acc[c.country].push(c);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><CheckCircle2 size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">متوافق</div><div className="text-lg font-extrabold">{compliantCount}/{checks.length}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(239,68,68,0.20)", color: "#ef4444" }}><AlertTriangle size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">سجلات في خطر</div><div className="text-lg font-extrabold">{totalRisk}</div></div>
        </div>
      </div>

      {checks.length === 0 ? <Empty label="فحوصات الاحتفاظ" /> : (
        Object.entries(grouped).map(([country, items]) => (
          <div key={country} className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MapPin size={16} style={{ color: "#7c3aed" }} />
              <h3 className="text-[14px] font-bold">{COUNTRIES.find(c => c.value === country)?.label || country}</h3>
            </div>
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-border bg-muted">
                  <th className={thStyle}>التصنيف</th><th className={thStyle}>سنوات مطلوبة</th>
                  <th className={thStyle}>سنوات فعلية</th><th className={cn(thStyle, "text-end")}>سجلات في خطر</th><th className={thStyle}>الامتثال</th>
                </tr></thead>
                <tbody>{items.map(c => (
                  <tr key={c.id} className="border-b border-border">
                    <td className={cn(tdStyle, "font-bold")}>{c.category}</td>
                    <td className={tdStyle}>{c.requiredYears} سنوات</td>
                    <td className={tdStyle}>{c.actualYears} سنوات</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")} style={{ color: c.recordsAtRisk > 0 ? "#ef4444" : "#10b981" }}>{c.recordsAtRisk}</td>
                    <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: c.compliant ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: c.compliant ? "#10b981" : "#ef4444" }}>{c.compliant ? "متوافق ✓" : "غير متوافق ✗"}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default TaxComplianceView;
