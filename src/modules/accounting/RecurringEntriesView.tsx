// Responsive: sm/md/lg breakpoints added
"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import {
  Plus, Play, Pause, Trash2, Edit3, Clock, Calendar,
  RefreshCw, AlertCircle, CheckCircle2, XCircle,
  ChevronRight, ChevronLeft, Search, Filter,
  RotateCcw, FileText, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface TemplateLine {
  accountId: string;
  debit: number | string;
  credit: number | string;
  description?: string;
  /** P0 FIX: stable client-side identifier for React keys.
   *  Previous code used `key={index}` which breaks when lines are
   *  inserted/deleted/reordered — React may bind inputs to wrong
   *  rows. localId is generated once per line and never reused. */
  localId: string;
}

/** Generate a unique-enough client-side id without pulling in a UUID dep. */
function makeLocalId(): string {
  return `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface RecurringEntry {
  id: string;
  companyId: string;
  companySlug: string;
  title: string;
  description: string | null;
  frequency: string;
  intervalValue: number;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  lastRunDate: string | null;
  templateLines: TemplateLine[];
  autoPost: boolean;
  requireApproval: boolean;
  isActive: boolean;
  totalPosted: number;
  createdAt: string;
  updatedAt: string;
}

interface RecurringListResponse {
  entries: RecurringEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/* ─── Frequency Labels (Arabic) ─────────────────────────────────────────────── */

const frequencyLabels: Record<string, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
  quarterly: "ربع سنوي",
  yearly: "سنوي",
};

/* ─── Main Component ────────────────────────────────────────────────────────── */

export function RecurringEntriesView({ companySlug }: { companySlug: string }) {
  // State
  const [entries, setEntries] = useState<RecurringEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RecurringEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        companySlug,
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(searchQuery && { search: searchQuery }),
      });
      
      const response = await apiGet<RecurringListResponse>(
        `/api/accounting/recurring?${params.toString()}`
      );
      
      setEntries(response.entries);
      setPagination(response.pagination);
    } catch (err) {
      logger.error("Error fetching recurring entries:", { err });
      toast.error("خطأ في تحميل القيود الدورية");
    } finally {
      setLoading(false);
    }
  }, [companySlug, pagination.page, pagination.pageSize, statusFilter, searchQuery]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Handlers
  const handleToggleActive = async (id: string, isActive: boolean) => {
    setActionLoading(id);
    try {
      await apiPatch(`/api/accounting/recurring/${id}`, { isActive: !isActive });
      toast.success(isActive ? "تم إيقاف القيد الدوري" : "تم تفعيل القيد الدوري");
      fetchEntries();
    } catch (err) {
      toast.error("خطأ في تحديث الحالة");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunNow = async (id: string) => {
    setActionLoading(id);
    try {
      await apiPost(`/api/accounting/recurring/${id}/run`, {});
      toast.success("تم تشغيل القيد بنجاح");
      fetchEntries();
    } catch (err) {
      toast.error("خطأ في تشغيل القيد");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا القيد الدوري؟")) return;
    
    setActionLoading(id);
    try {
      await apiDelete(`/api/accounting/recurring/${id}`);
      toast.success("تم حذف القيد الدوري");
      fetchEntries();
    } catch (err) {
      toast.error("خطأ في حذف القيد");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkAction = async (action: "pause" | "resume" | "delete") => {
    if (selectedIds.size === 0) {
      toast.error("يرجى اختيار قيد واحد على الأقل");
      return;
    }

    const confirmMessages = {
      pause: `إيقاف ${selectedIds.size} قيد دوري؟`,
      resume: `تفعيل ${selectedIds.size} قيد دوري؟`,
      delete: `حذف ${selectedIds.size} قيد دوري؟ لا يمكن التراجع عن هذا الإجراء.`,
    };

    if (!confirm(confirmMessages[action])) return;

    setActionLoading("bulk");
    try {
      for (const id of selectedIds) {
        if (action === "delete") {
          await apiDelete(`/api/accounting/recurring/${id}`);
        } else {
          await apiPatch(`/api/accounting/recurring/${id}`, {
            isActive: action === "resume",
          });
        }
      }
      toast.success(`تم ${action === "delete" ? "حذف" : action === "pause" ? "إيقاف" : "تفعيل"} القيود المحددة`);
      setSelectedIds(new Set());
      fetchEntries();
    } catch (err) {
      toast.error("خطأ في تنفيذ الإجراء");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)));
    }
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            القيود الدورية
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            إدارة وتشغيل القيود المحاسبية المتكررة تلقائياً
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                const result = await apiPost<Record<string, unknown>, { processed?: number }>("/api/accounting/recurring/process-due", {});
                toast.success(`تمت معالجة ${result?.processed || 0} قيد مستحق`);
                window.location.reload();
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : "فشل المعالجة");
              }
            }}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium",
              "bg-blue-600 hover:bg-blue-700 text-white",
              "transition-colors duration-200",
              "min-h-[44px]"
            )}
          >
            <Play className="w-5 h-5" />
            معالجة المستحقات
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium",
              "bg-emerald-600 hover:bg-emerald-700 text-white",
              "transition-colors duration-200",
              "shadow-brand hover:shadow-brand-md",
              "min-h-[44px]"
            )}
          >
            <Plus className="w-5 h-5" />
            قيد جديد
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="بحث بالعنوان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pr-10 pl-4 py-2 rounded-lg",
              "border border-gray-200 dark:border-gray-600",
              "bg-white dark:bg-gray-700",
              "text-gray-900 dark:text-white",
              "focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            )}
          />
        </div>
        
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "active" | "all" | "paused")}
            className={cn(
              "px-4 py-2 rounded-lg",
              "border border-gray-200 dark:border-gray-600",
              "bg-white dark:bg-gray-700",
              "text-gray-900 dark:text-white",
              "focus:ring-2 focus:ring-emerald-500"
            )}
          >
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="paused">متوقف</option>
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex gap-2 animate-in slide-in-from-left">
            <button
              onClick={() => handleBulkAction("pause")}
              disabled={actionLoading === "bulk"}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium",
                "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
                "dark:bg-yellow-900/30 dark:text-yellow-400",
                "transition-colors"
              )}
            >
              <Pause className="w-4 h-4 inline ml-1" />
              إيقاف ({selectedIds.size})
            </button>
            <button
              onClick={() => handleBulkAction("resume")}
              disabled={actionLoading === "bulk"}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium",
                "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
                "dark:bg-emerald-900/30 dark:text-emerald-400",
                "transition-colors"
              )}
            >
              <Play className="w-4 h-4 inline ml-1" />
              تفعيل ({selectedIds.size})
            </button>
            <button
              onClick={() => handleBulkAction("delete")}
              disabled={actionLoading === "bulk"}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium",
                "bg-red-100 text-red-800 hover:bg-red-200",
                "dark:bg-red-900/30 dark:text-red-400",
                "transition-colors"
              )}
            >
              <Trash2 className="w-4 h-4 inline ml-1" />
              حذف
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
            <span className="mr-3 text-gray-500">جاري التحميل...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <FileText className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium">لا توجد قيود دورية</p>
            <p className="text-sm mt-1">ابدأ بإنشاء قيد دوري جديد</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              إنشاء قيد جديد
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-right">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === entries.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    العنوان
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    التكرار
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    التشغيل التالي
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    آخر تشغيل
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    مرات الترحيل
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    الحالة
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors",
                      selectedIds.has(entry.id) && "bg-emerald-50 dark:bg-emerald-900/20"
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {entry.title}
                      </div>
                      {entry.description && (
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">
                          {entry.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={cn(
                        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      )}>
                        <Clock className="w-3 h-3 ml-1" />
                        كل {entry.intervalValue > 1 ? `${entry.intervalValue} ` : ""}
                        {frequencyLabels[entry.frequency] || entry.frequency}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {formatDate(entry.nextRunDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-sm text-gray-500">
                        {formatDate(entry.lastRunDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={cn(
                        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                        entry.totalPosted > 10 
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                      )}>
                        {entry.totalPosted}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.isActive ? (
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                        )}>
                          <CheckCircle2 className="w-3 h-3 ml-1" />
                          نشط
                        </span>
                      ) : (
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                          "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                        )}>
                          <Pause className="w-3 h-3 ml-1" />
                          متوقف
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRunNow(entry.id)}
                          disabled={actionLoading === entry.id || !entry.isActive}
                          title="تشغيل الآن"
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            "hover:bg-emerald-100 text-emerald-600",
                            "dark:hover:bg-emerald-900/30 dark:text-emerald-400",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {actionLoading === entry.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => setEditingEntry(entry)}
                          title="تعديل"
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            "hover:bg-blue-100 text-blue-600",
                            "dark:hover:bg-blue-900/30 dark:text-blue-400"
                          )}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(entry.id, entry.isActive)}
                          title={entry.isActive ? "إيقاف" : "تفعيل"}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            entry.isActive
                              ? "hover:bg-yellow-100 text-yellow-600 dark:hover:bg-yellow-900/30 dark:text-yellow-400"
                              : "hover:bg-emerald-100 text-emerald-600 dark:hover:bg-emerald-900/30 dark:text-emerald-400"
                          )}
                        >
                          {entry.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={actionLoading === entry.id}
                          title="حذف"
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            "hover:bg-red-100 text-red-600",
                            "dark:hover:bg-red-900/30 dark:text-red-400",
                            "disabled:opacity-50"
                          )}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && entries.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <div className="text-sm text-gray-500">
              عرض {(pagination.page - 1) * pagination.pageSize + 1} -{" "}
              {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} من{" "}
              {pagination.totalItems}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page <= 1}
                className={cn(
                  "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                  "border border-gray-200 dark:border-gray-600",
                  "hover:bg-gray-100 dark:hover:bg-gray-700",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className={cn(
                  "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                  "border border-gray-200 dark:border-gray-600",
                  "hover:bg-gray-100 dark:hover:bg-gray-700",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingEntry) && (
        <RecurringEntryModal
          companySlug={companySlug}
          entry={editingEntry}
          onClose={() => {
            setShowCreateModal(false);
            setEditingEntry(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingEntry(null);
            fetchEntries();
          }}
        />
      )}
    </div>
  );
}

/* ─── Create/Edit Modal Component ───────────────────────────────────────────── */

function RecurringEntryModal({
  companySlug,
  entry,
  onClose,
  onSuccess,
}: {
  companySlug: string;
  entry: RecurringEntry | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!entry;
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: entry?.title || "",
    description: entry?.description || "",
    frequency: entry?.frequency || "monthly",
    intervalValue: entry?.intervalValue || 1,
    startDate: entry?.startDate ? new Date(entry.startDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    endDate: entry?.endDate ? new Date(entry.endDate).toISOString().split("T")[0] : "",
    autoPost: entry?.autoPost ?? true,
    requireApproval: entry?.requireApproval ?? false,
  });
  
  const [lines, setLines] = useState<TemplateLine[]>(
    (entry?.templateLines?.map((l) => ({ ...l, localId: makeLocalId() })) || [
      { accountId: "", debit: 0, credit: 0, description: "", localId: makeLocalId() },
      { accountId: "", debit: 0, credit: 0, description: "", localId: makeLocalId() },
    ])
  );

  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string; nameAr?: string }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch accounts on mount
  useEffect(() => {
    apiGet<any>(`/api/accounting/accounts?companySlug=${companySlug}`)
      .then((res) => setAccounts(res.accounts || []))
      .catch((err: unknown) => logger.error("Error fetching recurring accounts", { err }));
  }, [companySlug]);

  // Handlers
  const addLine = () => {
    setLines([...lines, { accountId: "", debit: 0, credit: 0, description: "", localId: makeLocalId() }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof TemplateLine, value: string | number) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.title.trim()) newErrors.title = "العنوان مطلوب";
    if (!formData.startDate) newErrors.startDate = "تاريخ البدء مطلوب";
    
    if (lines.some((l) => !l.accountId)) {
      newErrors.lines = "يجب اختيار حساب لكل سطر";
    }

    const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      newErrors.balance = "يجب أن يتساوى المدين مع الدائن";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      const payload = {
        companySlug,
        ...formData,
        endDate: formData.endDate || null,
        templateLines: lines.map(({ localId: _localId, ...l }) => ({
          ...l,
          debit: Number(l.debit),
          credit: Number(l.credit),
        })),
      };

      if (isEdit && entry) {
        await apiPatch(`/api/accounting/recurring/${entry.id}`, payload);
        toast.success("تم تحديث القيد الدوري بنجاح");
      } else {
        await apiPost("/api/accounting/recurring", payload);
        toast.success("تم إنشاء القيد الدوري بنجاح");
      }
      
      onSuccess();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "خطأ في حفظ القيد");
    } finally {
      setLoading(false);
    }
  };

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {isEdit ? "تعديل القيد الدوري" : "قيد دوري جديد"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <XCircle className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                العنوان *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={cn(
                  "w-full px-4 py-2 rounded-lg border",
                  errors.title ? "border-red-500" : "border-gray-200 dark:border-gray-600",
                  "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                  "focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                )}
                placeholder="مثال: إيجار شهري"
              />
              {errors.title && <p className="mt-1 text-sm text-red-500">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                الوصف
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={cn(
                  "w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600",
                  "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                  "focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                )}
                placeholder="وصف اختياري..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                التكرار *
              </label>
              <div className="flex gap-2">
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600",
                    "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                    "focus:ring-2 focus:ring-emerald-500"
                  )}
                >
                  <option value="daily">يومي</option>
                  <option value="weekly">أسبوعي</option>
                  <option value="monthly">شهري</option>
                  <option value="quarterly">ربع سنوي</option>
                  <option value="yearly">سنوي</option>
                </select>
                <input
                  type="number"
                  min="1"
                  max="36"
                  value={formData.intervalValue}
                  onChange={(e) => setFormData({ ...formData, intervalValue: parseInt(e.target.value) || 1 })}
                  className={cn(
                    "w-24 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600",
                    "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                    "focus:ring-2 focus:ring-emerald-500 text-center"
                  )}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                تاريخ البدء *
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className={cn(
                  "w-full px-4 py-2 rounded-lg border",
                  errors.startDate ? "border-red-500" : "border-gray-200 dark:border-gray-600",
                  "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                  "focus:ring-2 focus:ring-emerald-500"
                )}
              />
              {errors.startDate && <p className="mt-1 text-sm text-red-500">{errors.startDate}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                تاريخ الانتهاء
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className={cn(
                  "w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600",
                  "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                  "focus:ring-2 focus:ring-emerald-500"
                )}
              />
              <p className="mt-1 text-xs text-gray-500">اتركه فارغاً للتكرار إلى ما لا نهاية</p>
            </div>
          </div>

          {/* Settings */}
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoPost}
                onChange={(e) => setFormData({ ...formData, autoPost: e.target.checked })}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">ترحيل تلقائي</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requireApproval}
                onChange={(e) => setFormData({ ...formData, requireApproval: e.target.checked })}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">يتطلب موافقة</span>
            </label>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                بنود القيد *
              </label>
              <button
                type="button"
                onClick={addLine}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                + إضافة سطر
              </button>
            </div>

            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">الحساب</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-28">مدين</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-28">دائن</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 hidden sm:table-cell">وصف</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {lines.map((line, index) => (
                    <tr key={line.localId}>
                      <td className="px-3 py-2">
                        <select
                          value={line.accountId}
                          onChange={(e) => updateLine(index, "accountId", e.target.value)}
                          className={cn(
                            "w-full px-2 py-1.5 rounded border text-sm",
                            !line.accountId && errors.lines ? "border-red-500" : "border-gray-200 dark:border-gray-600",
                            "bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          )}
                        >
                          <option value="">اختر حساب...</option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.nameAr || acc.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          value={line.debit}
                          onChange={(e) => updateLine(index, "debit", e.target.value)}
                          className={cn(
                            "w-full px-2 py-1.5 rounded border text-sm text-left",
                            "border-gray-200 dark:border-gray-600",
                            "bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          )}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          value={line.credit}
                          onChange={(e) => updateLine(index, "credit", e.target.value)}
                          className={cn(
                            "w-full px-2 py-1.5 rounded border text-sm text-left",
                            "border-gray-200 dark:border-gray-600",
                            "bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          )}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        <input
                          type="text"
                          value={line.description || ""}
                          onChange={(e) => updateLine(index, "description", e.target.value)}
                          className={cn(
                            "w-full px-2 py-1.5 rounded border text-sm",
                            "border-gray-200 dark:border-gray-600",
                            "bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          )}
                          placeholder="وصف..."
                        />
                      </td>
                      <td className="px-3 py-2">
                        {lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeLine(index)}
                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-900/50 font-medium">
                  <tr>
                    <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">المجموع</td>
                    <td className={cn(
                      "px-3 py-2 text-sm text-left",
                      totalDebit !== totalCredit && "text-red-600"
                    )}>
                      {totalDebit.toFixed(3)}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-sm text-left",
                      totalDebit !== totalCredit && "text-red-600"
                    )}>
                      {totalCredit.toFixed(3)}
                    </td>
                    <td colSpan={2} className="px-3 py-2">
                      {errors.balance && (
                        <span className="text-xs text-red-500">{errors.balance}</span>
                      )}
                      {totalDebit === totalCredit && totalDebit > 0 && (
                        <span className="text-xs text-emerald-600">✓ متوازن</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {errors.lines && <p className="mt-1 text-sm text-red-500">{errors.lines}</p>}
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={cn(
              "px-6 py-2 rounded-lg font-medium text-white",
              "bg-emerald-600 hover:bg-emerald-700",
              "transition-colors disabled:opacity-50",
              "shadow-brand hover:shadow-brand-md"
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                جاري الحفظ...
              </span>
            ) : isEdit ? (
              "تحديث"
            ) : (
              "إنشاء"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecurringEntriesView;
