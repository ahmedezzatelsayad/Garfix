"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, UserCog } from "lucide-react";
import { GratuityCalculator } from "./GratuityCalculator";
import { cn } from "@/lib/utils";

interface Employee { id: number; name: string; nameEn?: string; phone?: string; email?: string; position?: string; department?: string; baseSalary: number; currency: string; joinDate?: string; isActive: boolean; }
interface Attendance { id: number; employeeId: number; date: string; status: string; checkIn?: string; checkOut?: string; }
interface Salary { id: number; employeeId: number; month: string; baseSalary: number; allowances: number; deductions: number; bonus: number; netSalary: number; isPaid: boolean; }
interface Commission { id: number; employeeId: number; date: string; type: string; description?: string; amount: number; isPaid: boolean; }
interface Leave { id: number; employeeId: number; type: string; startDate: string; endDate: string; days: number; status: string; }
interface Performance { id: number; employeeId: number; period: string; kpiScore?: number; overallScore?: number; rating?: string; }

type Tab = "employees" | "attendance" | "salaries" | "commissions" | "leaves" | "performance" | "gratuity";

const PAGE_SIZE = 20;

const DELETE_PATH: Record<Tab, string> = {
  employees: "/api/hr/employees",
  attendance: "/api/hr/attendance",
  salaries: "/api/hr/salaries",
  commissions: "/api/hr/commissions",
  leaves: "/api/hr/leaves",
  performance: "/api/hr/performance",
  gratuity: "",
};

const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px]";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const thStyle = "text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold";
const tdStyle = "px-3 py-2.5 text-[13px]";
const thCheck = "w-10 text-center px-2 py-2.5 text-[11px] text-muted-foreground font-bold";
const iconBtnStyle = "w-7 h-7 rounded-sm bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center";

export function HRView() {
  const { activeCompany } = useBrand();
  const [tab, setTab] = useState<Tab>("employees");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    const slug = `companySlug=${encodeURIComponent(activeCompany.slug)}`;
    try {
      const responses = await Promise.all([
        authedFetch(`/api/hr/employees?${slug}`),
        authedFetch(`/api/hr/attendance?${slug}`),
        authedFetch(`/api/hr/salaries?${slug}`),
        authedFetch(`/api/hr/commissions?${slug}`),
        authedFetch(`/api/hr/leaves?${slug}`),
        authedFetch(`/api/hr/performance?${slug}`),
      ]);
      // Check each response; surface first error to user but still parse the rest.
      const bodies: Array<Record<string, unknown>> = [];
      for (const r of responses) {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error((e as Record<string, unknown>)?.error as string || `فشل تحميل البيانات (${r.status})`);
        }
        bodies.push(await r.json());
      }
      const [empD, attD, salD, comD, leaD, perfD] = bodies;
      setEmployees((empD as { employees?: Employee[] }).employees || []);
      setAttendance((attD as { attendance?: Attendance[] }).attendance || []);
      setSalaries((salD as { salaries?: Salary[] }).salaries || []);
      setCommissions((comD as { commissions?: Commission[] }).commissions || []);
      setLeaves((leaD as { leaves?: Leave[] }).leaves || []);
      setPerformances((perfD as { performance?: Performance[] }).performance || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تحميل بيانات الموارد البشرية");
    } finally { setLoading(false); }
  }, [activeCompany]);

  // setState runs inside async .then() callback in loadAll (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAll(); }, [loadAll]);

  // Reset pagination/selection when tab changes
  const switchTab = (t: Tab) => {
    setTab(t);
    setShowForm(false);
    setSelectedIds(new Set());
    setCurrentPage(1);
  };

  const itemsForTab = (): Array<{ id: number }> => {
    switch (tab) {
      case "employees": return employees;
      case "attendance": return attendance;
      case "salaries": return salaries;
      case "commissions": return commissions;
      case "leaves": return leaves;
      case "performance": return performances;
      default: return [];
    }
  };

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
    if (selectedIds.size === 0 || tab === "gratuity") return;
    if (!confirm(`حذف ${selectedIds.size} عنصر؟`)) return;
    setBulkDeleting(true);
    let okCount = 0, failCount = 0;
    const endpoint = DELETE_PATH[tab];
    for (const id of selectedIds) {
      try {
        const res = await authedFetch(`${endpoint}/${id}`, { method: "DELETE" });
        if (res.ok) okCount++; else failCount++;
      } catch { failCount++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تم حذف ${okCount} عنصر`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} عنصر`);
    loadAll();
  };

  const handleDelete = async (id: number) => {
    if (tab === "gratuity") return;
    if (!confirm("حذف هذا العنصر؟")) return;
    try {
      const res = await authedFetch(`${DELETE_PATH[tab]}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error((e as Record<string, unknown>)?.error as string || "تعذّر الحذف");
        return;
      }
      toast.success("تم الحذف");
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الاتصال بالخادم");
    }
  };

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "employees", label: "الموظفون", count: employees.length },
    { key: "attendance", label: "الحضور", count: attendance.length },
    { key: "salaries", label: "الرواتب", count: salaries.length },
    { key: "commissions", label: "العمولات", count: commissions.length },
    { key: "leaves", label: "الإجازات", count: leaves.length },
    { key: "performance", label: "الأداء", count: performances.length },
    { key: "gratuity", label: "مكافأة نهاية الخدمة", count: 0 },
  ];

  const tableProps = {
    selectedIds, toggleRow, handleDelete,
    pageItems, employees,
    selectAllChecked: selectedIds.size === pageItems.length && pageItems.length > 0,
    toggleSelectAll,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><UserCog size={20} /> الموارد البشرية</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
        {tab !== "gratuity" && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-[18px] py-2.5 rounded-md bg-primary text-primary-foreground border-none font-bold text-[13px] cursor-pointer max-md:min-h-[44px]"><Plus size={16} /> إضافة</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 overflow-x-auto garfix-scroll">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={cn(
              "px-4 py-2 rounded-md border border-border font-bold text-xs cursor-pointer whitespace-nowrap max-md:min-h-[44px]",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            )}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : tab === "gratuity" ? (
        <GratuityCalculator employees={employees} />
      ) : showForm ? (
        <HRForm tab={tab} company={activeCompany} employees={employees} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadAll(); }} />
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="py-2.5 px-4 bg-destructive text-white rounded-md flex flex-wrap justify-between items-center gap-2">
              <span className="font-bold text-[13px]">{selectedIds.size} عنصر محدد</span>
              <div className="flex gap-2">
                <button onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting} className="bg-white/15 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed max-md:min-h-[44px]">إلغاء التحديد</button>
                <button onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-white/25 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد"}</button>
              </div>
            </div>
          )}

          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            {allItems.length === 0 ? (
              <Empty label={tab === "employees" ? "موظفين" : tab === "attendance" ? "سجلات حضور" : tab === "salaries" ? "رواتب" : tab === "commissions" ? "عمولات" : tab === "leaves" ? "إجازات" : "تقييمات أداء"} />
            ) : (
              <>
                {/* Tables: overflow-x-auto on mobile (card conversion deferred — 6 distinct tables with 7+ cols each). */}
                <div className="overflow-x-auto garfix-scroll">
                  {tab === "employees" && <EmployeesTable {...tableProps} />}
                  {tab === "attendance" && <AttendanceTable {...tableProps} />}
                  {tab === "salaries" && <SalariesTable {...tableProps} />}
                  {tab === "commissions" && <CommissionsTable {...tableProps} />}
                  {tab === "leaves" && <LeavesTable {...tableProps} />}
                  {tab === "performance" && <PerformanceTable {...tableProps} />}
                </div>
                <div className="flex flex-wrap justify-between items-center px-4 py-3 border-t border-border gap-2">
                  <span className="text-xs text-muted-foreground">صفحة {safePage} من {totalPages} ({allItems.length} عنصر)</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className={cn("px-3 py-1.5 rounded-sm border border-border font-bold text-xs max-md:min-h-[44px]", safePage === 1 ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" : "bg-card text-foreground cursor-pointer")}>السابق</button>
                    <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={cn("px-3 py-1.5 rounded-sm border border-border font-bold text-xs max-md:min-h-[44px]", safePage === totalPages ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" : "bg-card text-foreground cursor-pointer")}>التالي</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const empName = (employees: Employee[], id: number) => employees.find((e) => e.id === id)?.name || `#${id}`;

interface TableShared {
  selectedIds: Set<number>;
  toggleRow: (id: number) => void;
  handleDelete: (id: number) => void;
  pageItems: Array<{ id: number }>;
  employees: Employee[];
  selectAllChecked: boolean;
  toggleSelectAll: () => void;
}

function EmployeesTable({ selectedIds, toggleRow, handleDelete, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
  return (
    <table className="w-full border-collapse min-w-[640px]">
      <thead><tr className="border-b border-border bg-muted">
        <th className={thCheck}><input type="checkbox" checked={selectAllChecked} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" /></th>
        <th className={thStyle}>الاسم</th><th className={thStyle}>المسمى</th><th className={thStyle}>القسم</th>
        <th className={thStyle}>الراتب</th><th className={thStyle}>الهاتف</th><th className={thStyle}>الحالة</th><th className={thStyle}>إجراء</th>
      </tr></thead>
      <tbody>
        {(pageItems as Employee[]).map((e) => {
          const checked = selectedIds.has(e.id);
          return (
            <tr key={e.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
              <td className={cn(tdStyle, "text-center", checked ? "bg-accent" : "bg-transparent")}><Check checked={checked} onChange={() => toggleRow(e.id)} ariaLabel={`تحديد ${e.name}`} /></td>
              <td className={cn(tdStyle, "font-bold")}>{e.name}</td>
              <td className={tdStyle}>{e.position || "—"}</td>
              <td className={tdStyle}>{e.department || "—"}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end")}>{e.baseSalary.toLocaleString("ar-EG")} {e.currency}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end")}>{e.phone || "—"}</td>
              <td className={tdStyle}><span style={{ padding: "2px 10px", borderRadius: "12px", background: e.isActive ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: e.isActive ? "#10b981" : "#ef4444", fontSize: "11px", fontWeight: 700 }}>{e.isActive ? "نشط" : "موقوف"}</span></td>
              <td className={tdStyle}><button onClick={() => handleDelete(e.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AttendanceTable({ selectedIds, toggleRow, handleDelete, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
  const STATUS: Record<string, { label: string; color: string }> = {
    present: { label: "حاضر", color: "#10b981" }, absent: { label: "غائب", color: "#ef4444" },
    late: { label: "متأخر", color: "#f59e0b" }, half: { label: "نص يوم", color: "#3b82f6" },
    remote: { label: "عن بُعد", color: "#7c3aed" },
  };
  return (
    <table className="w-full border-collapse min-w-[640px]">
      <thead><tr className="border-b border-border bg-muted">
        <th className={thCheck}><input type="checkbox" checked={selectAllChecked} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" /></th>
        <th className={thStyle}>الموظف</th><th className={thStyle}>التاريخ</th><th className={thStyle}>الحالة</th>
        <th className={thStyle}>حضور</th><th className={thStyle}>انصراف</th><th className={thStyle}>إجراء</th>
      </tr></thead>
      <tbody>
        {(pageItems as Attendance[]).map((a) => {
          const st = STATUS[a.status] || { label: a.status, color: "#999" };
          const checked = selectedIds.has(a.id);
          return (
            <tr key={a.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
              <td className={cn(tdStyle, "text-center", checked ? "bg-accent" : "bg-transparent")}><Check checked={checked} onChange={() => toggleRow(a.id)} ariaLabel="تحديد" /></td>
              <td className={cn(tdStyle, "font-bold")}>{empName(employees, a.employeeId)}</td>
              <td className={tdStyle}>{a.date}</td>
              <td className={tdStyle}><span style={{ padding: "2px 10px", borderRadius: "12px", background: `${st.color}20`, color: st.color, fontSize: "11px", fontWeight: 700 }}>{st.label}</span></td>
              <td className={cn(tdStyle, "[direction:ltr] text-end")}>{a.checkIn || "—"}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end")}>{a.checkOut || "—"}</td>
              <td className={tdStyle}><button onClick={() => handleDelete(a.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SalariesTable({ selectedIds, toggleRow, handleDelete, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
  return (
    <table className="w-full border-collapse min-w-[800px]">
      <thead><tr className="border-b border-border bg-muted">
        <th className={thCheck}><input type="checkbox" checked={selectAllChecked} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" /></th>
        <th className={thStyle}>الموظف</th><th className={thStyle}>الشهر</th><th className={thStyle}>الأساسي</th>
        <th className={thStyle}>بدلات</th><th className={thStyle}>خصومات</th><th className={thStyle}>مكافأة</th>
        <th className={thStyle}>الصافي</th><th className={thStyle}>حالة</th><th className={thStyle}>إجراء</th>
      </tr></thead>
      <tbody>
        {(pageItems as Salary[]).map((s) => {
          const checked = selectedIds.has(s.id);
          return (
            <tr key={s.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
              <td className={cn(tdStyle, "text-center", checked ? "bg-accent" : "bg-transparent")}><Check checked={checked} onChange={() => toggleRow(s.id)} ariaLabel="تحديد" /></td>
              <td className={cn(tdStyle, "font-bold")}>{empName(employees, s.employeeId)}</td>
              <td className={tdStyle}>{s.month}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end")}>{s.baseSalary.toLocaleString("ar-EG")}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end text-[#10b981]")}>+{s.allowances.toLocaleString("ar-EG")}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end text-[#ef4444]")}>-{s.deductions.toLocaleString("ar-EG")}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end text-[#10b981]")}>+{s.bonus.toLocaleString("ar-EG")}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end font-extrabold")}>{s.netSalary.toLocaleString("ar-EG")}</td>
              <td className={tdStyle}><span style={{ padding: "2px 10px", borderRadius: "12px", background: s.isPaid ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: s.isPaid ? "#10b981" : "#f59e0b", fontSize: "11px", fontWeight: 700 }}>{s.isPaid ? "مدفوع" : "معلّق"}</span></td>
              <td className={tdStyle}><button onClick={() => handleDelete(s.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CommissionsTable({ selectedIds, toggleRow, handleDelete, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
  return (
    <table className="w-full border-collapse min-w-[720px]">
      <thead><tr className="border-b border-border bg-muted">
        <th className={thCheck}><input type="checkbox" checked={selectAllChecked} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" /></th>
        <th className={thStyle}>الموظف</th><th className={thStyle}>التاريخ</th><th className={thStyle}>النوع</th>
        <th className={thStyle}>الوصف</th><th className={thStyle}>المبلغ</th><th className={thStyle}>حالة</th><th className={thStyle}>إجراء</th>
      </tr></thead>
      <tbody>
        {(pageItems as Commission[]).map((c) => {
          const checked = selectedIds.has(c.id);
          return (
            <tr key={c.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
              <td className={cn(tdStyle, "text-center", checked ? "bg-accent" : "bg-transparent")}><Check checked={checked} onChange={() => toggleRow(c.id)} ariaLabel="تحديد" /></td>
              <td className={cn(tdStyle, "font-bold")}>{empName(employees, c.employeeId)}</td>
              <td className={tdStyle}>{c.date}</td>
              <td className={tdStyle}>{c.type}</td>
              <td className={tdStyle}>{c.description || "—"}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end font-bold text-[#10b981]")}>{c.amount.toLocaleString("ar-EG")}</td>
              <td className={tdStyle}><span style={{ padding: "2px 10px", borderRadius: "12px", background: c.isPaid ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: c.isPaid ? "#10b981" : "#f59e0b", fontSize: "11px", fontWeight: 700 }}>{c.isPaid ? "مدفوع" : "معلّق"}</span></td>
              <td className={tdStyle}><button onClick={() => handleDelete(c.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LeavesTable({ selectedIds, toggleRow, handleDelete, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
  const STATUS: Record<string, { label: string; color: string }> = {
    pending: { label: "معلّق", color: "#f59e0b" }, approved: { label: "موافق", color: "#10b981" },
    rejected: { label: "مرفوض", color: "#ef4444" },
  };
  return (
    <table className="w-full border-collapse min-w-[720px]">
      <thead><tr className="border-b border-border bg-muted">
        <th className={thCheck}><input type="checkbox" checked={selectAllChecked} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" /></th>
        <th className={thStyle}>الموظف</th><th className={thStyle}>النوع</th><th className={thStyle}>من</th>
        <th className={thStyle}>إلى</th><th className={thStyle}>أيام</th><th className={thStyle}>حالة</th><th className={thStyle}>إجراء</th>
      </tr></thead>
      <tbody>
        {(pageItems as Leave[]).map((l) => {
          const st = STATUS[l.status] || { label: l.status, color: "#999" };
          const checked = selectedIds.has(l.id);
          return (
            <tr key={l.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
              <td className={cn(tdStyle, "text-center", checked ? "bg-accent" : "bg-transparent")}><Check checked={checked} onChange={() => toggleRow(l.id)} ariaLabel="تحديد" /></td>
              <td className={cn(tdStyle, "font-bold")}>{empName(employees, l.employeeId)}</td>
              <td className={tdStyle}>{l.type}</td>
              <td className={tdStyle}>{l.startDate}</td>
              <td className={tdStyle}>{l.endDate}</td>
              <td className={tdStyle}>{l.days}</td>
              <td className={tdStyle}><span style={{ padding: "2px 10px", borderRadius: "12px", background: `${st.color}20`, color: st.color, fontSize: "11px", fontWeight: 700 }}>{st.label}</span></td>
              <td className={tdStyle}><button onClick={() => handleDelete(l.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PerformanceTable({ selectedIds, toggleRow, handleDelete, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
  return (
    <table className="w-full border-collapse min-w-[640px]">
      <thead><tr className="border-b border-border bg-muted">
        <th className={thCheck}><input type="checkbox" checked={selectAllChecked} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" /></th>
        <th className={thStyle}>الموظف</th><th className={thStyle}>الفترة</th><th className={thStyle}>KPI</th>
        <th className={thStyle}>الإجمالي</th><th className={thStyle}>التقييم</th><th className={thStyle}>إجراء</th>
      </tr></thead>
      <tbody>
        {(pageItems as Performance[]).map((p) => {
          const checked = selectedIds.has(p.id);
          return (
            <tr key={p.id} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
              <td className={cn(tdStyle, "text-center", checked ? "bg-accent" : "bg-transparent")}><Check checked={checked} onChange={() => toggleRow(p.id)} ariaLabel="تحديد" /></td>
              <td className={cn(tdStyle, "font-bold")}>{empName(employees, p.employeeId)}</td>
              <td className={tdStyle}>{p.period}</td>
              <td className={tdStyle}>{p.kpiScore ?? "—"}</td>
              <td className={cn(tdStyle, "font-bold")}>{p.overallScore ?? "—"}</td>
              <td className={tdStyle}>{p.rating || "—"}</td>
              <td className={tdStyle}><button onClick={() => handleDelete(p.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Check({ checked, onChange, ariaLabel }: { checked: boolean; onChange?: () => void; ariaLabel: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="cursor-pointer w-4 h-4"
      aria-label={ariaLabel}
    />
  );
}

function Empty({ label }: { label: string }) {
  return <div className="p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

// ─── HR Form (single form adapted per tab) ──────────────────────────────────

function HRForm({ tab, company, employees, onClose, onSaved }: {
  tab: Tab; company: { slug: string }; employees: Employee[];
  onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  // Employee fields
  const [empName_, setEmpName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [baseSalary, setBaseSalary] = useState(0);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Other tab fields
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("present");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [allowances, setAllowances] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [commissionType, setCommissionType] = useState("sales");
  const [commissionAmount, setCommissionAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);
  const [days, setDays] = useState(1);
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`);
  const [kpiScore, setKpiScore] = useState(80);
  const [overallScore, setOverallScore] = useState(80);
  const [rating, setRating] = useState("جيد");

  const submit = async () => {
    setSaving(true);
    try {
      let endpoint = "";
      let payload: Record<string, unknown> = { companySlug: company.slug };
      if (tab === "employees") {
        endpoint = "/api/hr/employees";
        payload = { ...payload, name: empName_, position, department, baseSalary, phone, email, currency: "KWD" };
      } else if (tab === "attendance") {
        endpoint = "/api/hr/attendance";
        payload = { ...payload, employeeId, date, status, checkIn, checkOut };
      } else if (tab === "salaries") {
        endpoint = "/api/hr/salaries";
        payload = { ...payload, employeeId, month, baseSalary, allowances, deductions, bonus };
      } else if (tab === "commissions") {
        endpoint = "/api/hr/commissions";
        payload = { ...payload, employeeId, date, type: commissionType, description, amount: commissionAmount };
      } else if (tab === "leaves") {
        endpoint = "/api/hr/leaves";
        payload = { ...payload, employeeId, type: leaveType, startDate, endDate, days };
      } else if (tab === "performance") {
        endpoint = "/api/hr/performance";
        payload = { ...payload, employeeId, period, kpiScore, overallScore, rating };
      }
      if ((tab !== "employees") && !employeeId) {
        toast.error("اختر موظفاً");
        setSaving(false);
        return;
      }
      const res = await authedFetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      toast.success("تم الحفظ بنجاح");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold">إضافة {tab === "employees" ? "موظف" : tab === "attendance" ? "سجل حضور" : tab === "salaries" ? "راتب" : tab === "commissions" ? "عمولة" : tab === "leaves" ? "إجازة" : "تقييم أداء"}</h3>
        {tab === "employees" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className={labelStyle}>الاسم *</label><input value={empName_} onChange={(e) => setEmpName(e.target.value)} className={inputStyle} /></div>
            <div><label className={labelStyle}>المسمى</label><input value={position} onChange={(e) => setPosition(e.target.value)} className={inputStyle} /></div>
            <div><label className={labelStyle}>القسم</label><input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputStyle} /></div>
            <div><label className={labelStyle}>الراتب الأساسي</label><input type="number" value={baseSalary} onChange={(e) => setBaseSalary(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
            <div><label className={labelStyle}>الهاتف</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputStyle} dir="ltr" /></div>
            <div><label className={labelStyle}>البريد</label><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputStyle} dir="ltr" /></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className={labelStyle}>الموظف *</label>
              <select value={employeeId ?? ""} onChange={(e) => setEmployeeId(Number(e.target.value))} className={inputStyle}>
                <option value="">— اختر —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            {tab === "attendance" && (<>
              <div><label className={labelStyle}>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>الحالة</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputStyle}>
                  <option value="present">حاضر</option><option value="absent">غائب</option>
                  <option value="late">متأخر</option><option value="half">نص يوم</option>
                  <option value="remote">عن بُعد</option>
                </select>
              </div>
              <div><label className={labelStyle}>حضور</label><input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>انصراف</label><input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputStyle} dir="ltr" /></div>
            </>)}
            {tab === "salaries" && (<>
              <div><label className={labelStyle}>الشهر</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>الأساسي</label><input type="number" value={baseSalary} onChange={(e) => setBaseSalary(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>بدلات</label><input type="number" value={allowances} onChange={(e) => setAllowances(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>خصومات</label><input type="number" value={deductions} onChange={(e) => setDeductions(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>مكافأة</label><input type="number" value={bonus} onChange={(e) => setBonus(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
            </>)}
            {tab === "commissions" && (<>
              <div><label className={labelStyle}>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>النوع</label>
                <select value={commissionType} onChange={(e) => setCommissionType(e.target.value)} className={inputStyle}>
                  <option value="sales">مبيعات</option><option value="referral">إحالة</option>
                  <option value="target">هدف</option><option value="other">أخرى</option>
                </select>
              </div>
              <div><label className={labelStyle}>المبلغ</label><input type="number" value={commissionAmount} onChange={(e) => setCommissionAmount(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>الوصف</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputStyle} /></div>
            </>)}
            {tab === "leaves" && (<>
              <div><label className={labelStyle}>النوع</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={inputStyle}>
                  <option value="annual">سنوي</option><option value="sick">مرضي</option>
                  <option value="unpaid">بدون أجر</option><option value="maternity">أمومة</option>
                  <option value="other">أخرى</option>
                </select>
              </div>
              <div><label className={labelStyle}>من</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>إلى</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>عدد الأيام</label><input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
            </>)}
            {tab === "performance" && (<>
              <div><label className={labelStyle}>الفترة</label><input value={period} onChange={(e) => setPeriod(e.target.value)} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>نتيجة KPI</label><input type="number" min="0" max="100" value={kpiScore} onChange={(e) => setKpiScore(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>الدرجة الإجمالية</label><input type="number" min="0" max="100" value={overallScore} onChange={(e) => setOverallScore(Number(e.target.value))} className={inputStyle} dir="ltr" /></div>
              <div><label className={labelStyle}>التقييم</label>
                <select value={rating} onChange={(e) => setRating(e.target.value)} className={inputStyle}>
                  <option value="ممتاز">ممتاز</option><option value="جيد جداً">جيد جداً</option>
                  <option value="جيد">جيد</option><option value="مقبول">مقبول</option>
                  <option value="ضعيف">ضعيف</option>
                </select>
              </div>
            </>)}
          </div>
        )}
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="px-5 py-2.5 rounded-md bg-transparent text-muted-foreground border border-border font-bold text-[13px] cursor-pointer max-md:min-h-[44px]">إلغاء</button>
        <button onClick={submit} disabled={saving} className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

export default HRView;
