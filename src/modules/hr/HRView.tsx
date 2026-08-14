"use client";

import { useState, useMemo } from "react";
import { useBrand } from "@/context/BrandContext";
import {
  useEmployees, useAttendance, useSalaries, useCommissions,
  useLeaves, usePerformanceReviews,
  useDeleteEmployee, useDeleteAttendance, useDeleteSalary,
  useDeleteCommission, useDeleteLeave, useDeletePerformance,
  useCreateEmployee, useUpdateEmployee,
  useCreateAttendance, useUpdateAttendance,
  useCreateSalary, useUpdateSalary,
  useCreateCommission, useUpdateCommission,
  useCreateLeave, useUpdateLeave,
  useCreatePerformance, useUpdatePerformance,
} from "@/hooks/queries";
import { toast } from "sonner";
import { 
  Plus, Trash2, UserCog, Pencil, Users, UserCheck, DollarSign, 
  Calendar, TrendingUp, Download, Percent, Calculator
} from "lucide-react";
import { GratuityCalculator } from "./GratuityCalculator";
import { cn, paginate } from "@/lib/utils";
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
import { PAGE_SIZE, TAB_META } from "./types";

// ── DS v4.0 Components ──────────────────────────────────────────────────
import {
  GarfixEnterpriseTable,
  GarfixBulkActions,
} from "@/components/ui/GarfixEnterpriseTable";
import {
  GarfixEmptyState,
  GarfixLoadingState,
  GarfixErrorState,
} from "@/components/ui/GarfixStates";
import type { EnterpriseColumn } from "@/components/ui/GarfixEnterpriseTable";


// ─── Style constants (DS v4.0) ───────────────────────────────────────────

const inputStyle = "w-full py-2 px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px] focus-ring";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const _thStyle = "text-start px-3 py-2.5 text-[11px] text-muted-foreground font-bold";
const _tdStyle = "px-3 py-2.5 text-[13px]";
const _thCheck = "w-10 text-center px-2 py-2.5 text-[11px] text-muted-foreground font-bold";
const _iconBtnStyle = "w-7 h-7 rounded-sm bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center hover-lift active-press";
const _editBtnStyle = "w-7 h-7 rounded-sm bg-transparent border border-border text-primary cursor-pointer flex items-center justify-center hover-lift active-press";
const _actionsCell = "flex items-center gap-1";

// ─── Tab Icons Map for DS v4.0 Navigation ───────────────────────────────

const tabIcons: Record<Tab, React.ReactNode> = {
  employees: <Users size={16} />,
  attendance: <UserCheck size={16} />,
  salaries: <DollarSign size={16} />,
  commissions: <Percent size={16} />,
  leaves: <Calendar size={16} />,
  performance: <TrendingUp size={16} />,
  gratuity: <Calculator size={16} />,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HR VIEW COMPONENT — DS v4.0 UPDATE
// ═══════════════════════════════════════════════════════════════════════════

export function HRView() {
  const { activeCompany } = useBrand();
  const companySlug = activeCompany?.slug || "";

  // TanStack Query hooks replace the stub useHRData
  const employeesQuery = useEmployees(companySlug);
  const attendanceQuery = useAttendance(companySlug);
  const salariesQuery = useSalaries(companySlug);
  const commissionsQuery = useCommissions(companySlug);
  const leavesQuery = useLeaves(companySlug);
  const performanceQuery = usePerformanceReviews(companySlug);

  const deleteEmployeeMutation = useDeleteEmployee();
  const deleteAttendanceMutation = useDeleteAttendance();
  const deleteSalaryMutation = useDeleteSalary();
  const deleteCommissionMutation = useDeleteCommission();
  const deleteLeaveMutation = useDeleteLeave();
  const deletePerformanceMutation = useDeletePerformance();

  const employees = useMemo(() => employeesQuery.data?.employees ?? [], [employeesQuery.data]);
  const attendance = useMemo(() => attendanceQuery.data?.attendance ?? [], [attendanceQuery.data]);
  const salaries = salariesQuery.data?.salaries ?? [];
  const commissions = commissionsQuery.data?.commissions ?? [];
  const leaves = useMemo(() => leavesQuery.data?.leaves ?? [], [leavesQuery.data]);
  const performances = useMemo(() => performanceQuery.data?.performance ?? [], [performanceQuery.data]);
  
  const loading = employeesQuery.isLoading;
  const error = employeesQuery.isError;

  const [tab, setTab] = useState<Tab>("employees");

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<HREditItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [_bulkDeleting, setBulkDeleting] = useState(false);

  // ─── KPI Calculations ────────────────────────────────────────────────
  
  // Today's attendance count
  const today = new Date().toISOString().slice(0, 10);
  const attendanceToday = useMemo(() => {
    return attendance.filter((a: Attendance) => a.date === today && a.status === 'present').length;
  }, [attendance, today]);

  // Total salaries calculation
  const totalSalaries = useMemo(() => {
    return employees.reduce((sum: number, emp: Employee) => sum + ((emp.baseSalary as number) ?? 0), 0).toLocaleString("ar-EG");
  }, [employees]);

  // Pending leaves count
  const pendingLeaves = useMemo(() => {
    return leaves.filter((l: LeaveRequest) => l.status === 'pending').length;
  }, [leaves]);

  // Average performance score
  const avgPerformance = useMemo(() => {
    if (performances.length === 0) return 0;
    const total = performances.reduce((sum: number, p: Performance) => {
      const score = (p.overallScore ?? p.kpiScore ?? 0) as number;
      return sum + score;
    }, 0);
    return Math.round(total / performances.length);
  }, [performances]);

  // ─── Tab switch ───────────────────────────────────────────────────────

  const switchTab = (t: Tab) => {
    setTab(t);
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

  // ─── Delete handlers ────────────────────────────────────────────────
  const handleDelete = (id: number) => {
    const mutationMap: Record<string, { mutate: (id: number, opts?: { onSuccess?: () => void; onError?: (err: unknown) => void }) => void }> = {
      employees: deleteEmployeeMutation,
      attendance: deleteAttendanceMutation,
      salaries: deleteSalaryMutation,
      commissions: deleteCommissionMutation,
      leaves: deleteLeaveMutation,
      performance: deletePerformanceMutation,
    };
    const mutation = mutationMap[tab];
    if (!mutation) return;
    mutation.mutate(id, {
      onSuccess: () => toast.success("تم الحذف"),
      onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "خطأ في الحذف"),
    });
  };

  const handleBulkDelete = async (ids: Set<number>) => {
    for (const id of ids) {
      handleDelete(id);
    }
  };

  const handleExport = () => {
    toast.success("جارٍ تصدير البيانات...");
    // Export logic would go here
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
  const pageItems = paginate(allItems, currentPage, PAGE_SIZE);
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

  // ─── Refetch handler ─────────────────────────────────────────────────

  const refetch = () => {
    employeesQuery.refetch();
    attendanceQuery.refetch();
    salariesQuery.refetch();
    commissionsQuery.refetch();
    leavesQuery.refetch();
    performanceQuery.refetch();
  };

  // ─── Guard ────────────────────────────────────────────────────────────

  if (!activeCompany) return (
    <div className="p-8 md:block md:p-12 text-center">
      <GarfixEmptyState 
        title="اختر شركة"
        description="يرجى اختيار شركة لعرض بيانات الموارد البشرية"
        illustration="folder"
      />
    </div>
  );

  const tabs: Array<{ key: Tab; label: string; count: number }> = TAB_META.filter(m => m.key !== 'gratuity').map((m) => ({
    ...m,
    count: m.key === "employees" ? employees.length
      : m.key === "attendance" ? attendance.length
      : m.key === "salaries" ? salaries.length
      : m.key === "commissions" ? commissions.length
      : m.key === "leaves" ? leaves.length
      : m.key === "performance" ? performances.length
      : 0,
  }));

  const _tableProps: TableShared = {
    selectedIds, toggleRow, handleDelete, handleEdit,
    pageItems, employees,
    selectAllChecked: selectedIds.size === pageItems.length && pageItems.length > 0,
    toggleSelectAll,
  };

  // ─── Enterprise Table Columns Definition ─────────────────────────────
  
  const getColumnsForTab = (): EnterpriseColumn[] => {
    switch (tab) {
      case "employees":
        return [
          { key: "name", label: "الاسم", pinned: true },
          { key: "position", label: "المسمى" },
          { key: "department", label: "القسم" },
          { key: "baseSalary", label: "الراتب" },
          { key: "phone", label: "الهاتف" },
          { 
            key: "isActive", 
            label: "الحالة",
            render: (value) => (
              <span className={cn(
                "py-0.5 px-2.5 rounded-xl text-[11px] font-bold",
                value ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
              )}>
                {value ? "نشط" : "موقوف"}
              </span>
            )
          },
        ];
      
      case "attendance":
        return [
          { key: "employeeId", label: "الموظف", pinned: true, render: (value) => empName(employees, Number(value)) },
          { key: "date", label: "التاريخ" },
          { 
            key: "status", 
            label: "الحالة",
            render: (value) => {
              const STATUS: Record<string, { label: string; color: string }> = {
                present: { label: "حاضر", color: "#10b981" }, absent: { label: "غائب", color: "#ef4444" },
                late: { label: "متأخر", color: "#f59e0b" }, half: { label: "نص يوم", color: "#3b82f6" },
                remote: { label: "عن بُعد", color: "#047857" },
              };
              const st = STATUS[String(value)] || { label: String(value), color: "#999" };
              return (
                <span className="py-0.5 px-2.5 rounded-xl text-[11px] font-bold" style={{ background: `${st.color}20`, color: st.color }}>
                  {st.label}
                </span>
              );
            }
          },
          { key: "checkIn", label: "حضور" },
          { key: "checkOut", label: "انصراف" },
        ];
      
      case "salaries":
        return [
          { key: "employeeId", label: "الموظف", pinned: true, render: (value) => empName(employees, Number(value)) },
          { key: "month", label: "الشهر" },
          { key: "baseSalary", label: "الأساسي" },
          { key: "allowances", label: "بدلات" },
          { key: "deductions", label: "خصومات" },
          { key: "bonus", label: "مكافأة" },
          { key: "netSalary", label: "الصافي" },
          { 
            key: "isPaid", 
            label: "حالة",
            render: (value) => (
              <span className={cn(
                "py-0.5 px-2.5 rounded-xl text-[11px] font-bold",
                value ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
              )}>
                {value ? "مدفوع" : "معلّق"}
              </span>
            )
          },
        ];
      
      case "commissions":
        return [
          { key: "employeeId", label: "الموظف", pinned: true, render: (value) => empName(employees, Number(value)) },
          { key: "date", label: "التاريخ" },
          { key: "type", label: "النوع" },
          { key: "description", label: "الوصف" },
          { key: "amount", label: "المبلغ" },
          { 
            key: "isPaid", 
            label: "حالة",
            render: (value) => (
              <span className={cn(
                "py-0.5 px-2.5 rounded-xl text-[11px] font-bold",
                value ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
              )}>
                {value ? "مدفوع" : "معلّق"}
              </span>
            )
          },
        ];
      
      case "leaves":
        return [
          { key: "employeeId", label: "الموظف", pinned: true, render: (value) => empName(employees, Number(value)) },
          { key: "type", label: "النوع" },
          { key: "startDate", label: "من" },
          { key: "endDate", label: "إلى" },
          { key: "days", label: "أيام" },
          { 
            key: "status", 
            label: "حالة",
            render: (value) => {
              const STATUS: Record<string, { label: string; color: string }> = {
                pending: { label: "معلّق", color: "#f59e0b" }, approved: { label: "موافق", color: "#10b981" },
                rejected: { label: "مرفوض", color: "#ef4444" },
              };
              const st = STATUS[String(value)] || { label: String(value), color: "#999" };
              return (
                <span className="py-0.5 px-2.5 rounded-xl text-[11px] font-bold" style={{ background: `${st.color}20`, color: st.color }}>
                  {st.label}
                </span>
              );
            }
          },
        ];
      
      case "performance":
        return [
          { key: "employeeId", label: "الموظف", pinned: true, render: (value) => empName(employees, Number(value)) },
          { key: "period", label: "الفترة" },
          { key: "kpiScore", label: "KPI" },
          { key: "overallScore", label: "الإجمالي" },
          { key: "rating", label: "التقييم" },
        ];
      
      default:
        return [];
    }
  };

  // Convert items to record format for EnterpriseTable
  const getTableData = (): Record<string, unknown>[] => {
    switch (tab) {
      case "employees":
        return (pageItems as Employee[]).map(e => ({ ...e }));
      case "attendance":
        return (pageItems as Attendance[]).map(a => ({ ...a }));
      case "salaries":
        return (pageItems as Salary[]).map(s => ({ ...s }));
      case "commissions":
        return (pageItems as Commission[]).map(c => ({ ...c }));
      case "leaves":
        return (pageItems as LeaveRequest[]).map(l => ({ ...l }));
      case "performance":
        return (pageItems as Performance[]).map(p => ({ ...p }));
      default:
        return [];
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in-up">
      {/* ─── Header Section ─────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
            <UserCog size={20} className="text-primary" /> 
            الموارد البشرية
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">{activeCompany.nameAr || activeCompany.name}</p>
        </div>
        {tab !== "gratuity" && !showForm && (
          <button 
            onClick={() => setShowForm(true)} 
            className="inline-flex items-center gap-1.5 px-[18px] py-2.5 rounded-md bg-primary text-primary-foreground border-none font-bold text-[13px] cursor-pointer hover-lift active-press shadow-brand-sm max-md:min-h-[44px]"
          >
            <Plus size={16} /> إضافة
          </button>
        )}
      </div>

      {/* ─── KPI Cards Section (DS v4.0) ────────────────────────────── */}
      {!showForm && tab !== "gratuity" && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6 stagger-children">
          {/* Total Employees */}
          <div className="kpi-card hover-lift">
            <Users size={18} className="text-primary mb-2" />
            <div className="kpi-value">{employees.length}</div>
            <div className="kpi-label">إجمالي الموظفين</div>
            <div className="sparkline-container mt-2">
              <div className="flex items-end gap-0.5 h-8">
                {[40, 65, 45, 80, 55, 70, 60].map((h) => (
                  <div 
                    key={h} 
                    className="flex-1 bg-primary/30 rounded-sm min-w-[4px]" 
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ⚠️ GOLD KPI - Today's Attendance (Important!) */}
          <div className="kpi-card-gold hover-lift">
            <UserCheck size={18} className="text-[#d4a574] mb-2" />
            <div className="kpi-value">{attendanceToday}</div>
            <div className="kpi-label">الحاضرين اليوم</div>
            <div className="kpi-badge">✦ مباشر</div>
          </div>

          {/* Total Salaries */}
          <div className="kpi-card hover-lift">
            <DollarSign size={18} className="text-primary mb-2" />
            <div className="kpi-value">{totalSalaries}</div>
            <div className="kpi-label">إجمالي الرواتب</div>
            <div className="text-[10px] text-muted-foreground mt-1">KWD</div>
          </div>

          {/* Pending Leaves */}
          <div className="kpi-card hover-lift">
            <Calendar size={18} className="text-warning mb-2" />
            <div className="kpi-value">{pendingLeaves}</div>
            <div className="kpi-label">إجازات معلقة</div>
            {pendingLeaves > 0 && (
              <div className="kpi-trend warning mt-1">← يحتاج موافقة</div>
            )}
          </div>

          {/* Performance Score */}
          <div className="kpi-card hover-lift">
            <TrendingUp size={18} className="data-auxiliary mb-2" />
            <div className="kpi-value">{avgPerformance}%</div>
            <div className="kpi-label">متوسط الأداء</div>
            <div className="progress-emerald mt-2">
              <div 
                className="progress-bar" 
                style={{ width: `${avgPerformance}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Tabs Navigation (DS v4.0 Emerald-themed) ────────────────── */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg mb-4 overflow-x-auto garfix-scroll">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all duration-120 whitespace-nowrap flex items-center gap-1.5",
              tab === t.key 
                ? "bg-primary text-white shadow-brand-sm" 
                : "text-muted-foreground hover:bg-sidebar-accent hover-lift"
            )}
          >
            {tabIcons[t.key]}
            {t.label}
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-full",
              tab === t.key ? "bg-white/20" : "bg-muted"
            )}>
              {t.count}
            </span>
          </button>
        ))}
        {/* Gratuity Tab */}
        <button
          onClick={() => switchTab("gratuity")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-120 whitespace-nowrap flex items-center gap-1.5",
            tab === "gratuity" 
              ? "bg-primary text-white shadow-brand-sm" 
              : "text-muted-foreground hover:bg-sidebar-accent hover-lift"
          )}
        >
          <Calculator size={16} />
          مكافأة نهاية الخدمة
        </button>
      </div>

      {/* ─── Content Area ────────────────────────────────────────────── */}
      {error ? (
        <GarfixErrorState
          message="تعذّر تحميل بيانات الموظفين"
          onRetry={() => refetch()}
        />
      ) : loading ? (
        <GarfixLoadingState message="جارٍ تحميل بيانات الموارد البشرية..." variant="skeleton" skeletonLines={5} />
      ) : tab === "gratuity" ? (
        <GratuityCalculator employees={employees} />
      ) : showForm ? (
        <HRForm
          tab={tab}
          company={activeCompany}
          employees={employees}
          editItem={editingItem}
          onClose={closeForm}
          onSaved={closeForm}
        />
      ) : (
        <>
          {/* ─── Bulk Actions Bar (DS v4.0) ─────────────────────────── */}
          {selectedIds.size > 0 && (
            <GarfixBulkActions
              selectedCount={selectedIds.size}
              totalCount={allItems.length}
              actions={[
                { 
                  label: "حذف المحدد", 
                  icon: <Trash2 size={14} />, 
                  onClick: onBulkDelete, 
                  variant: "danger" 
                },
                { 
                  label: "تصدير", 
                  icon: <Download size={14} />, 
                  onClick: handleExport 
                },
              ]}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          )}

          {/* ─── Data Display ───────────────────────────────────────── */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {allItems.length === 0 ? (
              <GarfixEmptyState
                title={`لا يوجد ${tab === "employees" ? "موظفين" : tab === "attendance" ? "سجلات حضور" : tab === "salaries" ? "رواتب" : tab === "commissions" ? "عمولات" : tab === "leaves" ? "إجازات" : "تقييمات أداء"}`}
                description={`أضف أول ${tab === "employees" ? "موظف" : tab === "attendance" ? "سجل حضور" : tab === "salaries" ? "راتب" : tab === "commissions" ? "عمولة" : tab === "leaves" ? "إجازة" : "تقييم أداء"} لبدء إدارة الموارد البشرية`}
                illustration="users"
                action={{ label: `إضافة ${tab === "employees" ? "موظف" : "جديد"}`, onClick: () => setShowForm(true) }}
              />
            ) : (
              <>
                {/* DS v4.0 Enterprise Table */}
                <GarfixEnterpriseTable
                  data={getTableData()}
                  columns={getColumnsForTab()}
                  density="comfortable"
                  selectedRows={selectedIds}
                  onSelectionChange={(rows) => setSelectedIds(rows)}
                  isLoading={loading}
                  emptyMessage="لا توجد بيانات"
                  emptyDescription="لم يتم العثور على أي سجلات لعرضها"
                />

                {/* Pagination */}
                <div className="flex flex-wrap justify-between items-center px-4 py-3 border-t border-border gap-2">
                  <span className="text-xs text-muted-foreground">
                    صفحة {safePage} من {totalPages} ({allItems.length} عنصر)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} 
                      disabled={safePage === 1} 
                      className={cn(
                        "px-3 py-1.5 rounded-md border border-border font-bold text-xs transition-all duration-120 max-md:min-h-[44px]",
                        safePage === 1 
                          ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" 
                          : "bg-card text-foreground cursor-pointer hover-lift"
                      )}
                    >
                      السابق
                    </button>
                    <button 
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} 
                      disabled={safePage === totalPages} 
                      className={cn(
                        "px-3 py-1.5 rounded-md border border-border font-bold text-xs transition-all duration-120 max-md:min-h-[44px]",
                        safePage === totalPages 
                          ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" 
                          : "bg-card text-foreground cursor-pointer hover-lift"
                      )}
                    >
                      التالي
                    </button>
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

function _Check({ checked, onChange, ariaLabel }: { checked: boolean; onChange?: () => void; ariaLabel: string }) {
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

// ═══════════════════════════════════════════════════════════════════════════
// HR FORM COMPONENT (Preserved - DS v4.0 styling updates)
// ═══════════════════════════════════════════════════════════════════════════

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
  const [baseSalary, setBaseSalary] = useState<number>((editEmployee?.baseSalary as number | undefined) ?? (editSalary?.baseSalary as number | undefined) ?? 0);
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
  const [allowances, setAllowances] = useState<number>((editSalary?.allowances as number | undefined) ?? 0);
  const [deductions, setDeductions] = useState<number>((editSalary?.deductions as number | undefined) ?? 0);
  const [bonus, setBonus] = useState<number>((editSalary?.bonus as number | undefined) ?? 0);
  const [isPaid, setIsPaid] = useState<boolean>((editSalary?.isPaid as boolean | undefined) ?? (editCommission?.isPaid as boolean | undefined) ?? false);
  const [commissionType, setCommissionType] = useState<string>((editCommission?.type as string | undefined) || "sales");
  const [commissionAmount, setCommissionAmount] = useState<number>((editCommission?.amount as number | undefined) ?? 0);
  const [description, setDescription] = useState<string>((editCommission?.description as string | undefined) || "");
  const [leaveType, setLeaveType] = useState<string>((editLeave?.type as string | undefined) || "annual");
  const [startDate, setStartDate] = useState<string>(editLeave?.startDate || date);
  const [endDate, setEndDate] = useState<string>(editLeave?.endDate || date);
  const [days, setDays] = useState<number>((editLeave?.days as number | undefined) ?? 1);
  const [period, setPeriod] = useState<string>(editPerformance?.period || `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`);
  const [kpiScore, setKpiScore] = useState<number>((editPerformance?.kpiScore as number | undefined) ?? 80);
  const [overallScore, setOverallScore] = useState<number>((editPerformance?.overallScore as number | undefined) ?? 80);
  const [rating, setRating] = useState<string>(String(editPerformance?.rating || "جيد"));

  const createEmployeeMutation = useCreateEmployee();
  const updateEmployeeMutation = useUpdateEmployee();
  const createAttendanceMutation = useCreateAttendance();
  const updateAttendanceMutation = useUpdateAttendance();
  const createSalaryMutation = useCreateSalary();
  const updateSalaryMutation = useUpdateSalary();
  const createCommissionMutation = useCreateCommission();
  const updateCommissionMutation = useUpdateCommission();
  const createLeaveMutation = useCreateLeave();
  const updateLeaveMutation = useUpdateLeave();
  const createPerformanceMutation = useCreatePerformance();
  const updatePerformanceMutation = useUpdatePerformance();

  const submit = async () => {
    if ((tab !== "employees") && !employeeId) {
      toast.error("اختر موظفاً");
      return;
    }
    setSaving(true);
    try {
      if (tab === "employees") {
        if (isEditing) {
          await updateEmployeeMutation.mutateAsync({ id: editId!, name: empName_, position, department, salary: baseSalary, phone, email, currency: "KWD" });
        } else {
          await createEmployeeMutation.mutateAsync({ name: empName_, position, department, salary: baseSalary, phone, email, currency: "KWD", companySlug: company.slug });
        }
      } else if (tab === "attendance") {
        if (isEditing) {
          await updateAttendanceMutation.mutateAsync({ id: editId!, date, status, checkIn, checkOut });
        } else {
          await createAttendanceMutation.mutateAsync({ employeeId: employeeId!, date, status, checkIn, checkOut, companySlug: company.slug });
        }
      } else if (tab === "salaries") {
        if (isEditing) {
          await updateSalaryMutation.mutateAsync({ id: editId!, month, baseSalary, deductions, allowances, bonus, isPaid });
        } else {
          await createSalaryMutation.mutateAsync({ employeeId: employeeId!, month, baseSalary, deductions, netSalary: baseSalary - deductions + allowances + bonus, allowances, bonus, isPaid, companySlug: company.slug });
        }
      } else if (tab === "commissions") {
        if (isEditing) {
          await updateCommissionMutation.mutateAsync({ id: editId!, type: commissionType, description, amount: commissionAmount, isPaid });
        } else {
          await createCommissionMutation.mutateAsync({ employeeId: employeeId!, date, type: commissionType, description, amount: commissionAmount, isPaid, companySlug: company.slug });
        }
      } else if (tab === "leaves") {
        if (isEditing) {
          await updateLeaveMutation.mutateAsync({ id: editId!, type: leaveType, startDate, endDate, days });
        } else {
          await createLeaveMutation.mutateAsync({ employeeId: employeeId!, type: leaveType, startDate, endDate, status: "pending", days, companySlug: company.slug });
        }
      } else if (tab === "performance") {
        if (isEditing) {
          await updatePerformanceMutation.mutateAsync({ id: editId!, period, rating: kpiScore, notes: rating });
        } else {
          await createPerformanceMutation.mutateAsync({ employeeId: employeeId!, period, rating: kpiScore, notes: rating, kpiScore, overallScore, companySlug: company.slug });
        }
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
    <div className="flex flex-col gap-4 animate-fade-in-up">
      <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3.5 shadow-brand-sm">
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
                  <option value="unpaid">بدون أجر</option><option value="maternity">أمومة</option><option value="other">أخرى</option>
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
                  <option value="جيد">جيد</option><option value="مقبول">مقبول</option><option value="ضعيف">ضعيف</option>
                </select>
              </div>
            </>)}
          </div>
        )}
      </div>
      <div className="flex gap-2.5 justify-end">
        <button 
          onClick={onClose} 
          className="px-5 py-2.5 rounded-md bg-transparent text-muted-foreground border border-border font-bold text-[13px] cursor-pointer hover-lift active-press max-md:min-h-[44px]"
        >
          إلغاء
        </button>
        <button 
          onClick={submit} 
          disabled={saving} 
          className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 hover-lift active-press shadow-brand-sm max-md:min-h-[44px]"
        >
          {saving ? "جارٍ…" : (isEditing ? "تحديث" : "حفظ")}
        </button>
      </div>
    </div>
  );
}

export default HRView;
