"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Banknote, FileText, Plus, X, Download, Send, Clock,
  CheckCircle2, Users, Calculator, RefreshCw, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Interfaces ───────────────────────────────────────────────────────────── */
interface EmployeeSalary { id: number; employeeName: string; baseSalary: number; allowances: number; socialInsurance: number; deductions: number; netSalary: number; currency: string; status: string; }
interface WPSFile { id: number; month: string; country: string; status: string; fileUrl?: string; employeeCount: number; totalAmount: number; submittedAt?: string; generatedAt?: string; }

type Tab = "payroll" | "wps";

/* ─── Shared Styles ────────────────────────────────────────────────────────── */
const thStyle = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
const tdStyle = "py-2.5 px-3 text-[13px]";
const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
function fmt(n: number) { return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 }); }
function Empty({ label }: { label: string }) { return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>; }

/* ─── Main Component ───────────────────────────────────────────────────────── */
export function PayrollWpsView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("payroll");
  const [salaries, setSalaries] = useState<EmployeeSalary[]>([]);
  const [wpsFiles, setWpsFiles] = useState<WPSFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  const slug = activeCompany ? encodeURIComponent(activeCompany.slug) : "";

  const loadPayroll = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/payroll?companySlug=${slug}&month=${selectedMonth}`);
      if (res.ok) { const d = await res.json(); setSalaries(d.salaries || []); }
      else setSalaries([]);
    } catch { setSalaries([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug, selectedMonth]);

  const loadWPS = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/accounting/wps?companySlug=${slug}`);
      if (res.ok) { const d = await res.json(); setWpsFiles(d.files || []); }
      else setWpsFiles([]);
    } catch { setWpsFiles([]); }
    finally { setLoading(false); }
  }, [activeCompany, slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "payroll") loadPayroll();
    if (tab === "wps") loadWPS();
  }, [tab, loadPayroll, loadWPS]);

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: "payroll", label: "الرواتب", icon: Banknote },
    { key: "wps", label: "WPS", icon: FileText },
  ];

  const totalBase = salaries.reduce((s, e) => s + e.baseSalary, 0);
  const totalAllowances = salaries.reduce((s, e) => s + e.allowances, 0);
  const totalSocialInsurance = salaries.reduce((s, e) => s + e.socialInsurance, 0);
  const totalDeductions = salaries.reduce((s, e) => s + e.deductions, 0);
  const totalNet = salaries.reduce((s, e) => s + e.netSalary, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><Banknote size={20} /> الرواتب & WPS</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("py-2 px-4 rounded-[10px] border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5", tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
            <Icon size={14} /> {t.label}
          </button>
        ); })}
      </div>

      {loading && salaries.length === 0 && wpsFiles.length === 0 ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : tab === "payroll" ? (
        <PayrollView
          salaries={salaries}
          totalBase={totalBase}
          totalAllowances={totalAllowances}
          totalSocialInsurance={totalSocialInsurance}
          totalDeductions={totalDeductions}
          totalNet={totalNet}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          company={activeCompany}
          calculating={calculating}
          onCalculate={loadPayroll}
        />
      ) : (
        <WPSView wpsFiles={wpsFiles} company={activeCompany} selectedMonth={selectedMonth} onRefresh={loadWPS} />
      )}
    </div>
  );
}

/* ─── Payroll ──────────────────────────────────────────────────────────────── */
function PayrollView({ salaries, totalBase, totalAllowances, totalSocialInsurance, totalDeductions, totalNet, selectedMonth, onMonthChange, company, calculating, onCalculate }: {
  salaries: EmployeeSalary[]; totalBase: number; totalAllowances: number; totalSocialInsurance: number;
  totalDeductions: number; totalNet: number; selectedMonth: string;
  onMonthChange: (m: string) => void; company: { slug: string }; calculating: boolean; onCalculate: () => void;
}) {
  const [calcLoading, setCalcLoading] = useState(false);

  const handleCalculate = async () => {
    setCalcLoading(true);
    try {
      const res = await authedFetch("/api/accounting/payroll", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth, companySlug: company.slug }),
      });
      if (res.ok) { toast.success("تم حساب الرواتب"); onCalculate(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر حساب الرواتب"); }
    } catch { toast.error("خطأ في الاتصال"); }
    finally { setCalcLoading(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Month selector + calculate button */}
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">الشهر</label>
          <input type="month" value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <button onClick={handleCalculate} disabled={calcLoading} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
          <Calculator size={14} /> {calcLoading ? "جارٍ الحساب…" : "حساب الرواتب"}
        </button>
        <button onClick={onCalculate} className="py-2 px-4 rounded-sm bg-accent text-accent-foreground border border-border text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5">
          <RefreshCw size={12} /> تحديث
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><Banknote size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">إجمالي الأساسي</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalBase)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(59,130,246,0.20)", color: "#3b82f6" }}><Users size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">البدلات</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalAllowances)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(245,158,11,0.20)", color: "#f59e0b" }}><AlertTriangle size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">التأمينات الاجتماعية</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalSocialInsurance)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(239,68,68,0.20)", color: "#ef4444" }}><Calculator size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">الاستقطاعات</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: "#ef4444" }}>{fmt(totalDeductions)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: totalNet >= 0 ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)", color: totalNet >= 0 ? "#10b981" : "#ef4444" }}><CheckCircle2 size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">صافي الرواتب</div><div className="text-lg font-extrabold [direction:ltr] text-end" style={{ color: totalNet >= 0 ? "#10b981" : "#ef4444" }}>{fmt(totalNet)}</div></div>
        </div>
      </div>

      {/* Employee list table */}
      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {salaries.length === 0 ? <Empty label="رواتب" /> : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted">
                <th className={thStyle}>الموظف</th>
                <th className={cn(thStyle, "text-end")}>الأساسي</th>
                <th className={cn(thStyle, "text-end")}>البدلات</th>
                <th className={cn(thStyle, "text-end")}>التأمينات</th>
                <th className={cn(thStyle, "text-end")}>الاستقطاعات</th>
                <th className={cn(thStyle, "text-end")}>الصافي</th>
                <th className={thStyle}>العملة</th>
                <th className={thStyle}>الحالة</th>
              </tr></thead>
              <tbody>
                {salaries.map((s) => (
                  <tr key={s.id} className="border-b border-border">
                    <td className={cn(tdStyle, "font-bold")}>{s.employeeName}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")}>{fmt(s.baseSalary)}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")} style={{ color: "#3b82f6" }}>{fmt(s.allowances)}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")} style={{ color: "#f59e0b" }}>{fmt(s.socialInsurance)}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end")} style={{ color: "#ef4444" }}>{fmt(s.deductions)}</td>
                    <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")} style={{ color: s.netSalary >= 0 ? "#10b981" : "#ef4444" }}>{fmt(s.netSalary)}</td>
                    <td className={tdStyle}>{s.currency}</td>
                    <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: s.status === "paid" ? "rgba(16,185,129,0.15)" : s.status === "pending" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)", color: s.status === "paid" ? "#10b981" : s.status === "pending" ? "#f59e0b" : "#ef4444" }}>{s.status === "paid" ? "مسدّد" : s.status === "pending" ? "معلّق" : "متأخر"}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-extrabold">
                  <td className={cn(tdStyle, "font-extrabold")}>الإجمالي ({salaries.length} موظف)</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")}>{fmt(totalBase)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: "#3b82f6" }}>{fmt(totalAllowances)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: "#f59e0b" }}>{fmt(totalSocialInsurance)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: "#ef4444" }}>{fmt(totalDeductions)}</td>
                  <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")} style={{ color: totalNet >= 0 ? "#10b981" : "#ef4444" }}>{fmt(totalNet)}</td>
                  <td className={cn(tdStyle, "font-extrabold")} colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── WPS ──────────────────────────────────────────────────────────────────── */
function WPSView({ wpsFiles, company, selectedMonth, onRefresh }: { wpsFiles: WPSFile[]; company: { slug: string }; selectedMonth: string; onRefresh: () => void }) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [activeCountry, setActiveCountry] = useState<string>("KW");
  const [localMonth, setLocalMonth] = useState(selectedMonth);

  const countryLabels: Record<string, string> = { KW: "الكويت", SA: "السعودية", AE: "الإمارات" };
  const countryCodes = ["KW", "SA", "AE"];

  const handleGenerate = async (country: string) => {
    setGenerating(country);
    try {
      const res = await authedFetch("/api/accounting/wps", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, month: localMonth, companySlug: company.slug }),
      });
      if (res.ok) { toast.success(`تم إنشاء ملف WPS ل${countryLabels[country]}`); onRefresh(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر إنشاء الملف"); }
    } catch { toast.error("خطأ"); }
    finally { setGenerating(null); }
  };

  const handleSubmit = async (fileId: number) => {
    try {
      const res = await authedFetch(`/api/accounting/wps/${fileId}/submit?companySlug=${encodeURIComponent(company.slug)}`, { method: "POST" });
      if (res.ok) { toast.success("تم إرسال الملف"); onRefresh(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || "تعذّر الإرسال"); }
    } catch { toast.error("خطأ"); }
  };

  const handleDownload = async (fileId: number, country: string, month: string) => {
    try {
      const res = await authedFetch(`/api/accounting/wps/${fileId}/download?companySlug=${encodeURIComponent(company.slug)}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `wps_${country}_${month}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("تم تحميل الملف");
      } else { toast.error("تعذّر التحميل"); }
    } catch { toast.error("خطأ"); }
  };

  // Group files by country
  const filesByCountry: Record<string, WPSFile[]> = {};
  for (const f of wpsFiles) {
    if (!filesByCountry[f.country]) filesByCountry[f.country] = [];
    filesByCountry[f.country].push(f);
  }

  const statusBadge = (status: string) => {
    if (status === "submitted") return { bg: "rgba(16,185,129,0.15)", fg: "#10b981", label: "مُرسل" };
    if (status === "generated") return { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b", label: "مُنشأ" };
    return { bg: "rgba(239,68,68,0.15)", fg: "#ef4444", label: "خطأ" };
  };

  const totalByCountry = (country: string) => (filesByCountry[country] || []).reduce((s, f) => s + f.totalAmount, 0);
  const totalAll = wpsFiles.reduce((s, f) => s + f.totalAmount, 0);
  const totalEmployees = wpsFiles.reduce((s, f) => s + f.employeeCount, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">الدولة</label>
          <select value={activeCountry} onChange={(e) => setActiveCountry(e.target.value)} className={cn(inputStyle, "w-auto")}>
            {countryCodes.map(c => <option key={c} value={c}>{countryLabels[c]} ({c})</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-muted-foreground">الشهر</label>
          <input type="month" value={localMonth} onChange={(e) => setLocalMonth(e.target.value)} className={cn(inputStyle, "w-auto")} dir="ltr" />
        </div>
        <button onClick={() => handleGenerate(activeCountry)} disabled={generating !== null} className="py-2 px-4 rounded-sm bg-primary text-primary-foreground border-none text-[12px] font-bold cursor-pointer disabled:opacity-70 inline-flex items-center gap-1.5">
          <FileText size={14} /> {generating === activeCountry ? "جارٍ…" : `إنشاء ملف ${countryLabels[activeCountry]}`}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(124,58,237,0.20)", color: "#7c3aed" }}><FileText size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">إجمالي الملفات</div><div className="text-lg font-extrabold [direction:ltr] text-end">{wpsFiles.length}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}><Banknote size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">إجمالي المبالغ</div><div className="text-lg font-extrabold [direction:ltr] text-end">{fmt(totalAll)}</div></div>
        </div>
        <div className="bg-card rounded-[14px] border border-border py-3.5 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm flex items-center justify-center" style={{ background: "rgba(59,130,246,0.20)", color: "#3b82f6" }}><Users size={18} /></div>
          <div><div className="text-[11px] text-muted-foreground">عدد الموظفين</div><div className="text-lg font-extrabold [direction:ltr] text-end">{totalEmployees}</div></div>
        </div>
      </div>

      {/* Per-country sections */}
      {countryCodes.map((country) => {
        const files = filesByCountry[country] || [];
        const countryTotal = totalByCountry(country);
        if (files.length === 0 && country !== activeCountry) return null;
        return (
          <div key={country} className="bg-card rounded-[14px] border border-border overflow-hidden">
            <div className="py-2.5 px-3.5 border-b border-border font-extrabold text-[14px] flex justify-between items-center" style={{ background: "rgba(124,58,237,0.10)", color: "#7c3aed" }}>
              <span className="flex items-center gap-2">
                <span className="py-0.5 px-2 rounded-[8px] text-[10px] font-bold" style={{ background: "rgba(124,58,237,0.20)", color: "#7c3aed" }}>{country}</span>
                {countryLabels[country]}
              </span>
              <span className="[direction:ltr] text-end text-[13px]" style={{ color: countryTotal >= 0 ? "#10b981" : "#ef4444" }}>{fmt(countryTotal)}</span>
            </div>
            {files.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-[13px]">
                لا توجد ملفات WPS ل{countryLabels[country]} — اضغط "إنشاء ملف" لبدء
              </div>
            ) : (
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border bg-muted">
                    <th className={thStyle}>الشهر</th>
                    <th className={thStyle}>عدد الموظفين</th>
                    <th className={cn(thStyle, "text-end")}>المبلغ</th>
                    <th className={thStyle}>تاريخ الإنشاء</th>
                    <th className={thStyle}>الحالة</th>
                    <th className={thStyle}>إجراء</th>
                  </tr></thead>
                  <tbody>
                    {files.map((f) => {
                      const sb = statusBadge(f.status);
                      return (
                        <tr key={f.id} className="border-b border-border">
                          <td className={tdStyle} dir="ltr">{f.month}</td>
                          <td className={tdStyle}>{f.employeeCount}</td>
                          <td className={cn(tdStyle, "[direction:ltr] text-end font-bold")}>{fmt(f.totalAmount)}</td>
                          <td className={tdStyle} dir="ltr">{f.generatedAt || f.submittedAt || "—"}</td>
                          <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-[12px] text-[11px] font-bold" style={{ background: sb.bg, color: sb.fg }}>{sb.label}</span></td>
                          <td className={tdStyle}>
                            <div className="flex items-center gap-1">
                              {f.status === "generated" && <button onClick={() => handleSubmit(f.id)} className="py-1 px-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[10px] font-bold cursor-pointer inline-flex items-center gap-1"><Send size={10} /> إرسال</button>}
                              {(f.status === "generated" || f.status === "submitted") && <button onClick={() => handleDownload(f.id, f.country, f.month)} className="py-1 px-2.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-600 text-[10px] font-bold cursor-pointer inline-flex items-center gap-1"><Download size={10} /> تحميل</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default PayrollWpsView;
