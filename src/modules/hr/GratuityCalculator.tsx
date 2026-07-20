"use client";

import { useState } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, Calculator, Calendar, AlertTriangle, Info, Coins, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Employee {
  id: number;
  name: string;
  nameEn?: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  baseSalary: number;
  currency: string;
  joinDate?: string;
  isActive: boolean;
}

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

const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none [direction:ltr] text-end max-md:min-h-[44px]";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";

const fmt = (n: number, dp = 3) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-EG", { maximumFractionDigits: dp });

export function GratuityCalculator({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [endDate, setEndDate] = useState(today);
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<GratuityResponse | null>(null);

  const selectedEmployee = employees.find((e) => e.id === employeeId) || null;

  const calculate = async () => {
    if (!employeeId) {
      toast.error("اختر موظفاً أولاً");
      return;
    }
    setCalculating(true);
    try {
      const res = await authedFetch("/api/hr/gratuity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, endDate }),
      });
      const json = (await res.json()) as GratuityResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "تعذّر حساب المكافأة");
      }
      setResult(json);
      if (!json.eligible) {
        toast.warning(json.message || "الموظف غير مؤهل");
      } else {
        toast.success(`مكافأة نهاية الخدمة: ${fmt(json.gratuity?.gratuityAmount || 0)}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
      setResult(null);
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Form card */}
      <div className="p-5 rounded-[14px] bg-card border border-border flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold flex items-center gap-1.5">
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
                الراتب الأساسي: {fmt(selectedEmployee.baseSalary)} {selectedEmployee.currency}
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
        <div className="flex justify-end">
          <button
            type="button"
            onClick={calculate}
            disabled={calculating || !employeeId}
            className="inline-flex items-center gap-1.5 px-[22px] py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 max-md:min-h-[44px]"
          >
            {calculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
            {calculating ? "جارٍ الحساب…" : "احسب المكافأة"}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && !result.eligible && (
        <div
          style={{
            padding: "20px", borderRadius: "14px",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.4)",
            display: "flex", alignItems: "flex-start", gap: "12px",
          }}
        >
          <AlertTriangle size={20} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div className="text-sm font-extrabold text-[#f59e0b] mb-1">
              غير مؤهل لمكافأة نهاية الخدمة
            </div>
            <div className="text-xs text-muted-foreground">
              {result.message || "مدة الخدمة أقل من سنة واحدة"}
            </div>
          </div>
        </div>
      )}

      {result && result.eligible && result.employee && result.gratuity && (
        <>
          {/* Big highlighted amount */}
          <div className="p-6 rounded-[14px] bg-[linear-gradient(135deg,rgba(124,58,237,0.12),rgba(16,185,129,0.10))] border border-border flex flex-col gap-2 relative overflow-hidden">
            <div
              style={{
                position: "absolute", top: "-30px", left: "-30px",
                width: "140px", height: "140px", borderRadius: "50%",
                background: "var(--primary)", opacity: 0.08,
              }}
            />
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
              <Coins size={14} className="text-primary" />
              مكافأة نهاية الخدمة المستحقة
            </div>
            <div className="text-4xl font-black [direction:ltr] text-end text-primary">
              {fmt(result.gratuity.gratuityAmount)} {selectedEmployee?.currency || ""}
            </div>
            {result.gratuity.cappedAmount !== null && (
              <div className="text-[11px] text-muted-foreground">
                تم تطبيق الحد الأقصى ({fmt(result.gratuity.cappedAmount)} {selectedEmployee?.currency || ""})
              </div>
            )}
          </div>

          {/* Employee info + summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <InfoCard label="الموظف" value={result.employee.name} icon={<Calculator size={16} />} color="#7c3aed" />
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
              color="#f59e0b"
              ltr
            />
          </div>

          {/* Breakdown table */}
          <div className="p-[18px] rounded-[14px] bg-card border border-border">
            <h4 className="text-[13px] font-bold mb-3">
              تفصيل الحساب
            </h4>
            {/* Small 4-col table — overflow-x-auto on mobile (card conversion deferred — minimal cols). */}
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse text-xs min-w-[480px]">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold">الفترة</th>
                    <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold">المعدل</th>
                    <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold">الأيام</th>
                    <th className="text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.gratuity.breakdown.map((b, i) => (
                    <tr key={i} className="border-b border-border">
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
          <div className="p-4 rounded-[14px] bg-muted border border-border flex items-start gap-2.5">
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
        </>
      )}

      {!result && !calculating && (
        <div className="p-[60px] rounded-[14px] text-center bg-card border border-border text-muted-foreground flex flex-col items-center gap-3">
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
    <div className="p-3.5 rounded-lg bg-card border border-border flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div
          style={{
            width: "26px", height: "26px", borderRadius: "6px",
            background: `${color}20`, color,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
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
