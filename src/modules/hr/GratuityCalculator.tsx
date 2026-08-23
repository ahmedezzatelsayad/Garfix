"use client";

import { useState } from "react";
import { toast } from "sonner";
import { 
  Loader2, Calculator, Calendar, AlertTriangle, Info, Coins, 
  TrendingUp, Lightbulb, Sparkles 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGratuity } from "@/hooks/queries";

import type { Employee } from "./types";

interface GratuityBreakdownRow {
  period: string;
  rate: string;
  days: number;
  amount: number;
}

interface GratuityResult {
  yearsOfService: number;
  totalDays: number;
  dailyWage: number;
  gratuityAmount: number;
  cappedAmount: number | null;
  formula: string;
  breakdown: GratuityBreakdownRow[];
}

interface GratuityResponse {
  ok: boolean;
  eligible: boolean;
  message?: string;
  employee?: {
    id: number;
    name: string;
    joinDate: string;
    endDate: string;
    monthlySalary: string;
    baseSalary: string;
    allowances: string;
  };
  gratuity?: GratuityResult;
  countryCode?: string;
}

const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none [direction:ltr] text-end max-md:min-h-[44px] focus-ring";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";

const fmt = (n: number, dp = 3) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-EG", { maximumFractionDigits: dp });

// ─── AI Suggestions for Gratuity (DS v4.0) ──────────────────────────────

function AISuggestion({ type }: { type: 'eligible' | 'high' | 'medium' | 'low' }) {
  const suggestions: Record<string, { icon: React.ReactNode; title: string; text: string; color: string }> = {
    eligible: {
      icon: <Sparkles size={16} className="text-primary" />,
      title: "نصيحة ذكية",
      text: "الموظف مؤهل للحصول على مكافأة نهاية الخدمة كاملة. يُنصح بالتحقق من أيام الإجازات غير المدفوعة التي قد تؤثر على الحساب.",
      color: "border-primary/30 bg-primary/5"
    },
    high: {
      icon: <TrendingUp size={16} className="text-emerald-500" />,
      title: "مكافأة مرتفعة",
      text: "مدة خدمة الموظف طويلة مما يعني مكافأة مجزية. راجع سياسة الشركة بشأن الحد الأقصى للمكافآت.",
      color: "border-emerald-500/30 bg-emerald-500/5"
    },
    medium: {
      icon: <Lightbulb size={16} className="text-amber-500" />,
      title: "ملاحظة",
      text: "المكافأة في النطاق المتوسط. يمكن تحسينها بمراجعة البدلات والمكافآت الإضافية المشمولة.",
      color: "border-amber-500/30 bg-amber-500/5"
    },
    low: {
      icon: <Info size={16} className="text-blue-500" />,
      title: "فترة قصيرة",
      text: "مدة الخدمة أقل من 5 سنوات، المكافأة تحسب بنصف الراتب. كل سنة إضافية تزيد المبلغ بشكل ملحوظ.",
      color: "border-blue-500/30 bg-blue-500/5"
    }
  };

  const suggestion = suggestions[type] || suggestions.medium;

  return (
    <div className={cn("ai-suggestion p-4 rounded-xl border flex items-start gap-3", suggestion.color)}>
      <div className="shrink-0 mt-0.5">{suggestion.icon}</div>
      <div>
        <div className="text-xs font-bold mb-1 flex items-center gap-1.5">
          {suggestion.title}
          <Sparkles size={12} className="text-[#d4a574]" />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.text}</p>
      </div>
    </div>
  );
}

export function GratuityCalculator({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [endDate, setEndDate] = useState(today);
  const gratuityMutation = useGratuity();
  const [result, setResult] = useState<GratuityResponse | null>(null);

  const selectedEmployee = employees.find((e) => e.id === employeeId) || null;

  // Calculate progress percentage
  const calculationProgress = gratuityMutation.isPending ? 75 : result ? 100 : 0;

  const calculate = async () => {
    if (!employeeId) {
      toast.error("اختر موظفاً أولاً");
      return;
    }
    try {
      const data = (await gratuityMutation.mutateAsync({
        employeeId,
        endDate,
        companySlug: "", // companySlug handled by mutation context
      })) as unknown as GratuityResponse;
      setResult(data);
      if (!data.eligible) {
        toast.warning(data.message || "الموظف غير مؤهل");
      } else {
        toast.success(`مكافأة نهاية الخدمة: ${fmt(data.gratuity?.gratuityAmount || 0)}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
      setResult(null);
    }
  };

  const calculating = gratuityMutation.isPending;

  // Determine AI suggestion type based on years of service
  const getSuggestionType = (): 'eligible' | 'high' | 'medium' | 'low' => {
    if (!result?.gratuity) return 'eligible';
    const years = result.gratuity.yearsOfService;
    if (years >= 10) return 'high';
    if (years >= 5) return 'medium';
    return 'low';
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in-up">
      {/* Form card - DS v4.0 styling */}
      <div className="p-5 rounded-xl bg-card border border-border flex flex-col gap-3.5 shadow-brand-sm hover-lift">
        <h3 className="text-[15px] font-bold flex items-center gap-2">
          <Calculator size={16} className="text-primary" />
          حاسبة مكافأة نهاية الخدمة
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelStyle}>الموظف *</label>
            <select
              value={employeeId ?? ""}
              onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
              className={inputStyle}
            >
              <option value="">— اختر موظفاً —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}{emp.position ? ` — ${emp.position}` : ""}
                </option>
              ))}
            </select>
            {selectedEmployee && (
              <div className="text-[10px] text-muted-foreground mt-1">
                الراتب الأساسي: {fmt(selectedEmployee.baseSalary ?? 0)} {selectedEmployee.currency}
                {selectedEmployee.joinDate ? ` • تاريخ الالتحاق: ${selectedEmployee.joinDate}` : ""}
              </div>
            )}
          </div>
          <div>
            <label className={labelStyle}>تاريخ نهاية الخدمة (اختياري)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              max={today}
              className={inputStyle}
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              الافتراضي: تاريخ اليوم
            </div>
          </div>
        </div>
        
        {/* Progress bar - Gold theme for financial calculations */}
        {(calculating || result) && (
          <div className="progress-gold mt-2">
            <div 
              className="progress-bar transition-all duration-300 ease-out"
              style={{ width: `${calculationProgress}%` }}
            />
          </div>
        )}
        
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={calculate}
            disabled={calculating || !employeeId}
            className={cn(
              "inline-flex items-center gap-1.5 px-[22px] py-2.5 rounded-md",
              "bg-primary text-primary-foreground border-none font-extrabold text-[13px]",
              "cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
              "hover-lift active-press shadow-brand-sm max-md:min-h-[44px]"
            )}
          >
            {calculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
            {calculating ? "جارٍ الحساب…" : "احسب المكافأة"}
          </button>
        </div>
      </div>

      {/* Result - Not eligible */}
      {result && !result.eligible && (
        <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-start gap-3 animate-fade-in-up">
          <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-extrabold text-amber-500 mb-1">
              غير مؤهل لمكافأة نهاية الخدمة
            </div>
            <div className="text-xs text-muted-foreground">
              {result.message || "مدة الخدمة أقل من سنة واحدة"}
            </div>
          </div>
        </div>
      )}

      {/* Result - Eligible with GOLD KPI Card */}
      {result && result.eligible && result.employee && result.gratuity && (
        <>
          {/* ⚠️ GOLD KPI CARD - Final Amount (Financial importance!) */}
          <div className="kpi-card-gold hover-lift animate-fade-in-up">
            <div className="flex items-center gap-2 text-[#d4a574] text-xs font-semibold mb-2">
              <Coins size={14} />
              مكافأة نهاية الخدمة المستحقة
              <span className="kpi-badge">✦ مالي</span>
            </div>
            <div className="text-4xl font-black [direction:ltr] text-end text-[#d4a574]">
              {fmt(result.gratuity.gratuityAmount)} {selectedEmployee?.currency || ""}
            </div>
            {result.gratuity.cappedAmount !== null && (
              <div className="text-[11px] text-muted-foreground mt-1">
                تم تطبيق الحد الأقصى ({fmt(result.gratuity.cappedAmount)} {selectedEmployee?.currency || ""})
              </div>
            )}
            {/* Mini sparkline for visual appeal */}
            <div className="sparkline-container mt-3">
              <div className="flex items-end gap-0.5 h-6">
                {[30, 50, 40, 70, 55, 85, 65, 90].map((h) => (
                  <div 
                    key={h} 
                    className="flex-1 bg-[#d4a574]/30 rounded-sm min-w-[3px]" 
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Employee info + summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
            <InfoCard label="الموظف" value={result.employee.name} icon={<Calculator size={16} />} color="#047857" />
            <InfoCard
              label="تاريخ الالتحاق"
              value={result.employee.joinDate}
              icon={<Calendar size={16} />}
              color="#3b82f6"
              ltr
            />
            <InfoCard
              label="سنوات الخدمة"
              value={`${fmt(result.gratuity.yearsOfService, 2)} سنة`}
              icon={<TrendingUp size={16} />}
              color="#10b981"
            />
            <InfoCard
              label="الأجر اليومي"
              value={`${fmt(result.gratuity.dailyWage)} ${selectedEmployee?.currency || ""}`}
              icon={<Coins size={16} />}
              color="#d4a574"
              ltr
            />
          </div>

          {/* Breakdown table - DS v4.0 table styling */}
          <div className="p-[18px] rounded-xl bg-card border border-border shadow-brand-sm">
            <h4 className="text-[13px] font-bold mb-3 flex items-center gap-2">
              <Calculator size={14} className="text-primary" />
              تفصيل الحساب
            </h4>
            {/* Small 4-col table — overflow-x-auto on mobile (card conversion deferred — minimal cols). */}
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse text-xs min-w-[480px] table-enterprise table-comfortable">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold">الفترة</th>
                    <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold">المعدل</th>
                    <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold">الأيام</th>
                    <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.gratuity.breakdown.map((b) => (
                    <tr key={b.period} className="border-b border-border hover:bg-accent/50 transition-colors duration-120">
                      <td className="px-3 py-2.5 font-bold">{b.period}</td>
                      <td className="px-3 py-2.5">{b.rate}</td>
                      <td className="px-3 py-2.5 [direction:ltr] text-end">{fmt(b.days, 1)}</td>
                      <td className={cn("px-3 py-2.5 [direction:ltr] text-end font-bold text-[#10b981]")}>
                        {fmt(b.amount)} {selectedEmployee?.currency || ""}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-accent font-extrabold">
                    <td className="p-3 text-xs" colSpan={3}>الإجمالي</td>
                    <td className="p-3 text-[13px] [direction:ltr] text-end text-primary">
                      {fmt(result.gratuity.gratuityAmount)} {selectedEmployee?.currency || ""}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Formula explanation */}
          <div className="p-4 rounded-xl bg-muted border border-border flex items-start gap-2.5 hover-lift">
            <Info size={16} className="text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold mb-1">معادلة الحساب</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {result.gratuity.formula}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1.5">
                الراتب الشهري المعتمد: {fmt(Number(result.employee.monthlySalary))} {selectedEmployee?.currency || ""}
                {" "} (= أساسي {fmt(Number(result.employee.baseSalary))} + بدلات {fmt(Number(result.employee.allowances))})
                {" • "}دولة التطبيق: {result.countryCode}
              </div>
            </div>
          </div>

          {/* ⚠️ AI Suggestion (DS v4.0 Feature) */}
          <AISuggestion type={getSuggestionType()} />
        </>
      )}

      {!result && !calculating && (
        <div className="p-[60px] rounded-xl text-center bg-card border border-border text-muted-foreground flex flex-col items-center gap-3 animate-fade-in-up">
          <Coins size={36} className="opacity-40" />
          <div className="text-sm font-bold">لا يوجد حساب بعد</div>
          <div className="text-xs max-w-[360px]">
            اختر موظفاً وتاريخ نهاية الخدمة ثم اضغط &laquo;احسب المكافأة&raquo; لعرض التفاصيل وفق قانون العمل الخليجي.
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, icon, color, ltr }: {
  label: string; value: string; icon: React.ReactNode; color: string; ltr?: boolean;
}) {
  return (
    <div className="kpi-card p-3.5 flex flex-col gap-1.5 hover-lift">
      <div className="flex items-center gap-1.5">
        <div
          className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center shrink-0"
          style={{ background: `${color}20`, color }} /* TAILWINDBREAK: dynamic InfoCard color */
        >
          {icon}
        </div>
        <div className="text-[10px] text-muted-foreground font-semibold">{label}</div>
      </div>
      <div className={cn("text-sm font-extrabold text-end", ltr && "[direction:ltr]")}>
        {value}
      </div>
    </div>
  );
}

export default GratuityCalculator;
