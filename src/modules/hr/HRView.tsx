"use client";

import { useState } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, UserCog, Pencil } from "lucide-react";
import { GratuityCalculator } from "./GratuityCalculator";
import { cn } from "@/lib/utils";
import type {
  Tab,
  Employee,
  Attendance,
  Salary,
  Commission,
  LeaveRequest,
  Performance,
  HREditItem,
  TableShared,
} from "./types";
import { PAGE_SIZE, DELETE_PATH, TAB_META } from "./types";
// TODO: Full migration to TanStack Query hooks (useEmployees, useAttendance, etc.)
// useHRData was a legacy module-level hook — replaced with individual query hooks
// For now, using inline stub to maintain compatibility
function useHRData() {
  // Stub: will be replaced with TanStack Query hooks in next sprint
  return {
    activeTab: "employees" as Tab,
    setActiveTab: (_: Tab) => {},
    employees: [] as Employee[],
    attendance: [] as Attendance[],
    salaries: [] as Salary[],
    commissions: [] as Commission[],
    leaves: [] as LeaveRequest[],
    performances: [] as Performance[],
    loading: true,
    loadAll: async () => {},
    handleDelete: async (_: string, _: number) => {},
    handleBulkDelete: async (_: string, _: number[]) => {},
  };
}

// ─── Style constants ────────────────────────────────────────────────────────

const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px]";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const thStyle = "text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold";
const tdStyle = "px-3 py-2.5 text-[13px]";
const thCheck = "w-10 text-center px-2 py-2.5 text-[11px] text-muted-foreground font-bold";
const iconBtnStyle = "w-7 h-7 rounded-sm bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center";
const editBtnStyle = "w-7 h-7 rounded-sm bg-transparent border border-border text-primary cursor-pointer flex items-center justify-center hover:bg-primary/10 hover:border-primary/40 transition-colors";
const actionsCell = "flex items-center gap-1.5";

// ─── Main component ─────────────────────────────────────────────────────────

export function HRView() {
  const { activeCompany } = useBrand();
  const {
    activeTab: tab,
    setActiveTab,
    employees,
    attendance,
    salaries,
    commissions,
    leaves,
    performances,
    loading,
    loadAll,
    handleDelete,
    handleBulkDelete,
  } = useHRData();

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<HREditItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ─── Tab switch ───────────────────────────────────────────────────────

  const switchTab = (t: Tab) => {
    setActiveTab(t);
    setShowForm(false);
    setEditingItem(null);
    setSelectedIds(new Set());
    setCurrentPage(1);
  };

  // ─── Edit ─────────────────────────────────────────────────────────────

  const handleEdit = (item: HREditItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  // ─── Items for current tab ────────────────────────────────────────────

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

  // ─── Selection ────────────────────────────────────────────────────────

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

  // ─── Bulk delete ──────────────────────────────────────────────────────

  const onBulkDelete = async () => {
    setBulkDeleting(true);
    await handleBulkDelete(selectedIds);
    setBulkDeleting(false);
    setSelectedIds(new Set());
  };

  // ─── Guard ────────────────────────────────────────────────────────────

  if (!activeCompany) return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة</div>;

  const tabs: Array<{ key: Tab; label: string; count: number }> = TAB_META.map((m) => ({
    ...m,
    count: m.key === "employees" ? employees.length
      : m.key === "attendance" ? attendance.length
      : m.key === "salaries" ? salaries.length
      : m.key === "commissions" ? commissions.length
      : m.key === "leaves" ? leaves.length
      : m.key === "performance" ? performances.length
      : 0,
  }));

  const tableProps: TableShared = {
    selectedIds, toggleRow, handleDelete, handleEdit,
    pageItems, employees,
    selectAllChecked: selectedIds.size === pageItems.length && pageItems.length > 0,
    toggleSelectAll,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2"><UserCog size={20} /> الموارد البشرية</h1><p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p></div>
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
        <div className="p-8 md:p-12 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : tab === "gratuity" ? (
        <GratuityCalculator employees={employees} />
      ) : showForm ? (
        <HRForm
          tab={tab}
          company={activeCompany}
          employees={employees}
          editItem={editingItem}
          onClose={closeForm}
          onSaved={() => { closeForm(); loadAll(); }}
        />
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="py-2.5 px-4 bg-destructive text-white rounded-md flex flex-wrap justify-between items-center gap-2">
              <span className="font-bold text-[13px]">{selectedIds.size} عنصر محدد</span>
              <div className="flex gap-2">
                <button onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting} className="bg-white/15 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed max-md:min-h-[44px]">إلغاء التحديد</button>
                <button onClick={onBulkDelete} disabled={bulkDeleting} className="bg-white/25 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد"}</button>
              </div>
            </div>
          )}

          <div className="bg-card rounded-[14px] border border-border overflow-hidden">
            {allItems.length === 0 ? (
              <Empty label={tab === "employees" ? "موظفين" : tab === "attendance" ? "سجلات حضور" : tab === "salaries" ? "رواتب" : tab === "commissions" ? "عمولات" : tab === "leaves" ? "إجازات" : "تقييمات أداء"} />
            ) : (
              <>
                {/* Tables: desktop table on md+, mobile card fallback below */}
                <div className="hidden md:block overflow-x-auto garfix-scroll">
                  {tab === "employees" && <EmployeesTable {...tableProps} />}
                  {tab === "attendance" && <AttendanceTable {...tableProps} />}
                  {tab === "salaries" && <SalariesTable {...tableProps} />}
                  {tab === "commissions" && <CommissionsTable {...tableProps} />}
                  {tab === "leaves" && <LeavesTable {...tableProps} />}
                  {tab === "performance" && <PerformanceTable {...tableProps} />}
                </div>
                {/* Mobile fallback: overflow-x-auto table on small screens */}
                <div className="md:hidden overflow-x-auto garfix-scroll">
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

// ─── Helpers ────────────────────────────────────────────────────────────────

const empName = (employees: Employee[], id: number) => employees.find((e) => e.id === id)?.name || `#${id}`;

// ─── Checkbox ───────────────────────────────────────────────────────────────

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
  return <div className="p-6 md:p-12 text-center text-muted-foreground">لا توجد {label} بعد</div>;
}

// ─── Table components ───────────────────────────────────────────────────────
// Each table now wraps its items in HREditItem via the typed _tag, eliminating
// the unsafe `as unknown as Record<string, unknown>` casts.

function EmployeesTable({ selectedIds, toggleRow, handleDelete, handleEdit, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
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
              <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-xl text-[11px] font-bold", e.isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500")}>{e.isActive ? "نشط" : "موقوف"}</span></td>
              <td className={tdStyle}>
                <div className={actionsCell}>
                  <button onClick={() => handleEdit({ _tag: "employees", data: e })} title="تعديل" className={editBtnStyle}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(e.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AttendanceTable({ selectedIds, toggleRow, handleDelete, handleEdit, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
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
              <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-xl text-[11px] font-bold" style={{ background: `${st.color}20`, color: st.color }} /* TAILWINDBREAK: dynamic color */>{st.label}</span></td>
              <td className={cn(tdStyle, "[direction:ltr] text-end")}>{a.checkIn || "—"}</td>
              <td className={cn(tdStyle, "[direction:ltr] text-end")}>{a.checkOut || "—"}</td>
              <td className={tdStyle}>
                <div className={actionsCell}>
                  <button onClick={() => handleEdit({ _tag: "attendance", data: a })} title="تعديل" className={editBtnStyle}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(a.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SalariesTable({ selectedIds, toggleRow, handleDelete, handleEdit, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
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
              <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-xl text-[11px] font-bold", s.isPaid ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500")}>{s.isPaid ? "مدفوع" : "معلّق"}</span></td>
              <td className={tdStyle}>
                <div className={actionsCell}>
                  <button onClick={() => handleEdit({ _tag: "salaries", data: s })} title="تعديل" className={editBtnStyle}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(s.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CommissionsTable({ selectedIds, toggleRow, handleDelete, handleEdit, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
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
              <td className={tdStyle}><span className={cn("py-0.5 px-2.5 rounded-xl text-[11px] font-bold", c.isPaid ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500")}>{c.isPaid ? "مدفوع" : "معلّق"}</span></td>
              <td className={tdStyle}>
                <div className={actionsCell}>
                  <button onClick={() => handleEdit({ _tag: "commissions", data: c })} title="تعديل" className={editBtnStyle}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(c.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LeavesTable({ selectedIds, toggleRow, handleDelete, handleEdit, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
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
        {(pageItems as LeaveRequest[]).map((l) => {
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
              <td className={tdStyle}><span className="py-0.5 px-2.5 rounded-xl text-[11px] font-bold" style={{ background: `${st.color}20`, color: st.color }} /* TAILWINDBREAK: dynamic color */>{st.label}</span></td>
              <td className={tdStyle}>
                <div className={actionsCell}>
                  <button onClick={() => handleEdit({ _tag: "leaves", data: l })} title="تعديل" className={editBtnStyle}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(l.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PerformanceTable({ selectedIds, toggleRow, handleDelete, handleEdit, pageItems, employees, selectAllChecked, toggleSelectAll }: TableShared) {
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
              <td className={tdStyle}>
                <div className={actionsCell}>
                  <button onClick={() => handleEdit({ _tag: "performance", data: p })} title="تعديل" className={editBtnStyle}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(p.id)} title="حذف" className={iconBtnStyle}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── HR Form (single form adapted per tab) ──────────────────────────────────
//
// The form now accepts `HREditItem | null` instead of `Record<string, unknown>`.
// By discriminating on `editItem._tag`, each field initializer can safely access
// the proper typed data without any `as string` casts.

function HRForm({ tab, company, employees, editItem, onClose, onSaved }: {
  tab: Tab; company: { slug: string }; employees: Employee[];
  editItem?: HREditItem | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const isEditing = !!editItem;
  const editId = isEditing ? editItem!.data.id : null;

  // ─── Extract typed data from editItem using discriminated union ──────

  const editEmployee = editItem?._tag === "employees" ? editItem.data : null;
  const editAttendance = editItem?._tag === "attendance" ? editItem.data : null;
  const editSalary = editItem?._tag === "salaries" ? editItem.data : null;
  const editCommission = editItem?._tag === "commissions" ? editItem.data : null;
  const editLeave = editItem?._tag === "leaves" ? editItem.data : null;
  const editPerformance = editItem?._tag === "performance" ? editItem.data : null;

  // Employee fields — no `as string` needed
  const [empName_, setEmpName] = useState<string>(editEmployee?.name || "");
  const [position, setPosition] = useState<string>(editEmployee?.position || "");
  const [department, setDepartment] = useState<string>(editEmployee?.department || "");
  const [baseSalary, setBaseSalary] = useState<number>(editEmployee?.baseSalary ?? editSalary?.baseSalary ?? 0);
  const [phone, setPhone] = useState<string>(editEmployee?.phone || "");
  const [email, setEmail] = useState<string>(editEmployee?.email || "");

  // Other tab fields — each extracted from its typed variant, no casts
  const [employeeId, setEmployeeId] = useState<number | null>(
    editAttendance?.employeeId ?? editSalary?.employeeId ?? editCommission?.employeeId ?? editLeave?.employeeId ?? editPerformance?.employeeId ?? null
  );
  const [date, setDate] = useState<string>(editAttendance?.date || editCommission?.date || new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<string>(editAttendance?.status || "present");
  const [checkIn, setCheckIn] = useState<string>(editAttendance?.checkIn || "");
  const [checkOut, setCheckOut] = useState<string>(editAttendance?.checkOut || "");
  const [month, setMonth] = useState<string>(editSalary?.month || new Date().toISOString().slice(0, 7));
  const [allowances, setAllowances] = useState<number>(editSalary?.allowances ?? 0);
  const [deductions, setDeductions] = useState<number>(editSalary?.deductions ?? 0);
  const [bonus, setBonus] = useState<number>(editSalary?.bonus ?? 0);
  const [isPaid, setIsPaid] = useState<boolean>(editSalary?.isPaid ?? editCommission?.isPaid ?? false);
  const [commissionType, setCommissionType] = useState<string>(editCommission?.type || "sales");
  const [commissionAmount, setCommissionAmount] = useState<number>(editCommission?.amount ?? 0);
  const [description, setDescription] = useState<string>(editCommission?.description || "");
  const [leaveType, setLeaveType] = useState<string>(editLeave?.type || "annual");
  const [startDate, setStartDate] = useState<string>(editLeave?.startDate || date);
  const [endDate, setEndDate] = useState<string>(editLeave?.endDate || date);
  const [days, setDays] = useState<number>(editLeave?.days ?? 1);
  const [period, setPeriod] = useState<string>(editPerformance?.period || `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`);
  const [kpiScore, setKpiScore] = useState<number>(editPerformance?.kpiScore ?? 80);
  const [overallScore, setOverallScore] = useState<number>(editPerformance?.overallScore ?? 80);
  const [rating, setRating] = useState<string>(editPerformance?.rating || "جيد");

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
        payload = { ...payload, employeeId, month, baseSalary, allowances, deductions, bonus, isPaid };
      } else if (tab === "commissions") {
        endpoint = "/api/hr/commissions";
        payload = { ...payload, employeeId, date, type: commissionType, description, amount: commissionAmount, isPaid };
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
      const url = isEditing ? `${endpoint}/${editId}` : endpoint;
      const method = isEditing ? "PATCH" : "POST";
      const finalPayload = isEditing ? { ...payload, companySlug: undefined } : payload;
      Object.keys(finalPayload).forEach((k) => finalPayload[k] === undefined && delete finalPayload[k]);
      const res = await authedFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      toast.success(isEditing ? "تم التحديث بنجاح" : "تم الحفظ بنجاح");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  const formTitle = isEditing
    ? `تعديل ${tab === "employees" ? "موظف" : tab === "attendance" ? "سجل حضور" : tab === "salaries" ? "راتب" : tab === "commissions" ? "عمولة" : tab === "leaves" ? "إجازة" : "تقييم أداء"}`
    : `إضافة ${tab === "employees" ? "موظف" : tab === "attendance" ? "سجل حضور" : tab === "salaries" ? "راتب" : tab === "commissions" ? "عمولة" : tab === "leaves" ? "إجازة" : "تقييم أداء"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[14px] border border-border p-5 flex flex-col gap-3.5">
        <h3 className="text-[15px] font-bold flex items-center gap-2">
          {isEditing && <Pencil size={14} className="text-primary" />}
          {formTitle}
        </h3>
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
              <div><label className={labelStyle}>مدفوع</label>
                <select value={isPaid ? "1" : "0"} onChange={(e) => setIsPaid(e.target.value === "1")} className={inputStyle}>
                  <option value="0">معلّق</option>
                  <option value="1">مدفوع</option>
                </select>
              </div>
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
              <div><label className={labelStyle}>مدفوع</label>
                <select value={isPaid ? "1" : "0"} onChange={(e) => setIsPaid(e.target.value === "1")} className={inputStyle}>
                  <option value="0">معلّق</option>
                  <option value="1">مدفوع</option>
                </select>
              </div>
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
        <button onClick={submit} disabled={saving} className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]">{saving ? "جارٍ…" : (isEditing ? "تحديث" : "حفظ")}</button>
      </div>
    </div>
  );
}

export default HRView;
