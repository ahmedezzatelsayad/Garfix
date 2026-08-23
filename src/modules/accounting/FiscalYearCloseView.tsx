// Responsive: sm/md/lg breakpoints added
"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/hooks/api-client";
import {
  Lock, Unlock, AlertTriangle,
  FileText, RefreshCw, X, ChevronRight, ChevronLeft,
  Shield, History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface FiscalYearCloseRecord {
  id: string;
  year: number;
  status: string;
  closedAt: string;
  closedBy: string;
  reopenedAt: string | null;
  reopenedBy: string | null;
  openingRetainedEarnings: string;
  notes: string | null;
  createdAt: string;
  companySlug: string;
}

interface AuditLogResponse {
  entries: FiscalYearCloseRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  summary: {
    totalClosed: number;
    totalReopened: number;
  };
}

/* ─── Main Component ────────────────────────────────────────────────────────── */

export function FiscalYearCloseView({ companySlug }: { companySlug: string }) {
  // State
  const [currentYear] = useState(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [yearStatus, setYearStatus] = useState<{
    isClosed: boolean;
    closeRecord: FiscalYearCloseRecord | null;
    canClose: boolean;
  } | null>(null);
  const [auditLog, setAuditLog] = useState<FiscalYearCloseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditPagination, setAuditPagination] = useState({
    page: 1,
    totalPages: 0,
  });

  // Fetch year status
  const fetchYearStatus = useCallback(async (year: number) => {
    try {
      const response = await apiGet<{ isClosed: boolean; closeRecord: FiscalYearCloseRecord | null; canClose: boolean }>(
        `/api/accounting/fiscal/status?companySlug=${companySlug}&year=${year}`
      );
      setYearStatus(response);
    } catch (err) {
      logger.error("Error fetching fiscal status:", { err });
      toast.error("خطأ في تحميل حالة السنة المالية");
    }
  }, [companySlug]);

  // Fetch audit log
  const fetchAuditLog = useCallback(async (page = 1) => {
    try {
      const response = await apiGet<AuditLogResponse>(
        `/api/accounting/fiscal/audit-log?companySlug=${companySlug}&page=${page}&pageSize=20`
      );
      setAuditLog(response.entries);
      setAuditPagination({
        page: response.pagination.page,
        totalPages: response.pagination.totalPages,
      });
    } catch (err) {
      logger.error("Error fetching audit log:", { err });
    }
  }, [companySlug]);

  // Initial fetch
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        fetchYearStatus(selectedYear),
        fetchAuditLog(1),
      ]);
      setLoading(false);
    };
    init();
  }, [selectedYear, fetchYearStatus, fetchAuditLog]);

  // Handlers
  const handleCloseYear = async (notes: string) => {
    setActionLoading(true);
    try {
      await apiPost(`/api/accounting/fiscal/${selectedYear}?action=close`, {
        companySlug,
        notes,
        confirmRetainedEarnings: true,
      });
      toast.success(`تم إغلاق السنة المالية ${selectedYear} بنجاح`);
      setShowCloseModal(false);
      await fetchYearStatus(selectedYear);
      await fetchAuditLog(1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "خطأ في إغلاق السنة المالية");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenYear = async (reason: string) => {
    setActionLoading(true);
    try {
      await apiPost(`/api/accounting/fiscal/${selectedYear}?action=reopen`, {
        companySlug,
        reason,
      });
      toast.success(`تم إعادة فتح السنة المالية ${selectedYear} بنجاح`);
      setShowReopenModal(false);
      await fetchYearStatus(selectedYear);
      await fetchAuditLog(1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "خطأ في إعادة فتح السنة المالية");
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Shield className="w-8 h-8 text-emerald-600" />
            إغلاق السنة المالية
          </h2>
          <p className="text-muted-foreground mt-1">
            إدارة إغلاق وإعادة فتح السنوات المالية مع سجل التدقيق
          </p>
        </div>
        <button
          onClick={() => setShowAuditModal(true)}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium",
            "bg-muted hover:bg-muted/80 text-gray-700",
            "dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200",
            "transition-colors duration-200"
          )}
        >
          <History className="w-5 h-5" />
          سجل التدقيق
        </button>
      </div>

      {/* Year Selector & Status Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Year Selector */}
        <div className="lg:col-span-1 bg-card rounded-xl shadow-sm border border-border p-6">
          <label className="block text-sm font-medium text-foreground mb-3">
            اختر السنة المالية
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                "hover:bg-muted dark:hover:bg-gray-700",
                "text-muted-foreground"
              )}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className={cn(
                "flex-1 px-4 py-3 rounded-lg text-center text-lg font-bold",
                "border border-border",
                "bg-white dark:bg-gray-700 text-foreground",
                "focus:ring-2 focus:ring-emerald-500"
              )}
            >
              {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              disabled={selectedYear >= currentYear}
              className={cn(
                "p-2 rounded-lg transition-colors",
                "hover:bg-muted dark:hover:bg-gray-700",
                "text-muted-foreground",
                "disabled:opacity-50"
              )}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Year Status List */}
          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {Array.from({ length: 5 }, (_, i) => currentYear - 4 + i).map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                  selectedYear === year
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400"
                    : "hover:bg-muted dark:hover:bg-gray-700/50 text-muted-foreground"
                )}
              >
                <span>{year}</span>
                <YearStatusBadge year={year} companySlug={companySlug} />
              </button>
            ))}
          </div>
        </div>

        {/* Status Card */}
        <div className="lg:col-span-2 bg-card rounded-xl shadow-sm border border-border p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
              <span className="mr-3 text-muted-foreground">جاري التحميل...</span>
            </div>
          ) : yearStatus ? (
            <div className="space-y-6">
              {/* Status Header */}
              <div className={cn(
                "flex items-center justify-between p-4 rounded-xl",
                yearStatus.isClosed
                  ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  : "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
              )}>
                <div className="flex items-center gap-3">
                  {yearStatus.isClosed ? (
                    <Lock className="w-10 h-10 text-red-500" />
                  ) : (
                    <Unlock className="w-10 h-10 text-emerald-500" />
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      السنة المالية {selectedYear}
                    </h3>
                    <p className={cn(
                      "text-sm font-medium",
                      yearStatus.isClosed 
                        ? "text-red-700 dark:text-red-400" 
                        : "text-emerald-700 dark:text-emerald-400"
                    )}>
                      {yearStatus.isClosed ? "مغلقة" : "مفتوحة"}
                    </p>
                  </div>
                </div>
                
                {yearStatus.isClosed ? (
                  <button
                    onClick={() => setShowReopenModal(true)}
                    disabled={actionLoading}
                    className={cn(
                      "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium",
                      "bg-yellow-500 hover:bg-yellow-600 text-white",
                      "transition-colors disabled:opacity-50"
                    )}
                  >
                    <Unlock className="w-4 h-4" />
                    إعادة فتح
                  </button>
                ) : (
                  <button
                    onClick={() => setShowCloseModal(true)}
                    disabled={actionLoading}
                    className={cn(
                      "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium",
                      "bg-emerald-600 hover:bg-emerald-700 text-white",
                      "transition-colors disabled:opacity-50",
                      "shadow-brand hover:shadow-brand-md"
                    )}
                  >
                    <Lock className="w-4 h-4" />
                    إغلاق السنة
                  </button>
                )}
              </div>

              {/* Close Details */}
              {yearStatus.closeRecord && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">تاريخ الإغلاق</div>
                    <div className="font-medium text-foreground">
                      {new Date(yearStatus.closeRecord.closedAt).toLocaleDateString("ar-EG", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">تم الإغلاق بواسطة</div>
                    <div className="font-medium text-foreground">
                      {yearStatus.closeRecord.closedBy}
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">الأرباح المحتجزة</div>
                    <div className="font-medium text-foreground">
                      {parseFloat(yearStatus.closeRecord.openingRetainedEarnings).toLocaleString("ar-EG", {
                        style: "currency",
                        currency: "SAR",
                      })}
                    </div>
                  </div>

                  {yearStatus.closeRecord.notes && (
                    <div className="p-4 bg-muted rounded-lg md:col-span-2">
                      <div className="text-sm text-muted-foreground mb-1">ملاحظات</div>
                      <div className="font-medium text-foreground">
                        {yearStatus.closeRecord.notes}
                      </div>
                    </div>
                  )}

                  {yearStatus.closeRecord.reopenedAt && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg md:col-span-2 border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                        <div>
                          <div className="font-medium text-yellow-800 dark:text-yellow-400">
                            تمت إعادة الفتح
                          </div>
                          <div className="text-sm text-yellow-700 dark:text-yellow-500 mt-1">
                            بواسطة: {yearStatus.closeRecord.reopenedBy} في{" "}
                            {yearStatus.closeRecord.reopenedAt && new Date(yearStatus.closeRecord.reopenedAt).toLocaleDateString("ar-EG")}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Warning Message for Open Years */}
              {!yearStatus.isClosed && (
                <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-800 dark:text-blue-300">
                    <strong>تنبيه:</strong> قبل إغلاق السنة المالية، تأكد من:
                    <ul className="mt-2 mr-4 list-disc space-y-1">
                      <li>ترحيل جميع القيود المسودة</li>
                      <li>مراجعة ميزان المراجعة</li>
                      <li>تسوية الحسابات البنكية</li>
                      <li>إعداد قيود التسويات الضرورية</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Close Modal */}
      {showCloseModal && (
        <CloseYearModal
          year={selectedYear}
          companySlug={companySlug}
          loading={actionLoading}
          onClose={() => setShowCloseModal(false)}
          onConfirm={handleCloseYear}
        />
      )}

      {/* Reopen Modal */}
      {showReopenModal && (
        <ReopenYearModal
          year={selectedYear}
          companySlug={companySlug}
          loading={actionLoading}
          onClose={() => setShowReopenModal(false)}
          onConfirm={handleReopenYear}
        />
      )}

      {/* Audit Log Modal */}
      {showAuditModal && (
        <AuditLogModal
          companySlug={companySlug}
          entries={auditLog}
          pagination={auditPagination}
          onPageChange={(page) => fetchAuditLog(page)}
          onClose={() => setShowAuditModal(false)}
        />
      )}
    </div>
  );
}

/* ─── Year Status Badge Component ───────────────────────────────────────────── */

function YearStatusBadge({ year, companySlug }: { year: number; companySlug: string }) {
  const [status, setStatus] = useState<"closed" | "open" | "loading">("loading");

  useEffect(() => {
    apiGet<{ isClosed?: boolean }>(`/api/accounting/fiscal/status?companySlug=${companySlug}&year=${year}`)
      .then((res) => setStatus(res.isClosed ? "closed" : "open"))
      .catch(() => setStatus("open"));
  }, [year, companySlug]);

  if (status === "loading") {
    return <RefreshCw className="w-4 h-4 animate-spin" />;
  }

  return status === "closed" ? (
    <span className="flex items-center gap-1 text-xs text-red-600">
      <Lock className="w-3 h-3" />
      مغلق
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-emerald-600">
      <Unlock className="w-3 h-3" />
      مفتوح
    </span>
  );
}

/* ─── Close Year Modal ──────────────────────────────────────────────────────── */

function CloseYearModal({
  year,
  companySlug: _companySlug,
  loading,
  onClose,
  onConfirm,
}: {
  year: number;
  companySlug: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-popover/50">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-red-50 dark:bg-red-900/20">
          <h3 className="text-xl font-bold text-red-800 dark:text-red-300 flex items-center gap-2">
            <Lock className="w-6 h-6" />
            تأكيد إغلاق السنة المالية {year}
          </h3>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mt-0.5 shrink-0" />
            <div className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>تحذير هام:</strong> هذا إجراء لا يمكن التراجع عنه بسهولة.
              بعد إغلاق السنة المالية، لن يمكن تعديل أو حذف القيود الخاصة بهذه السنة
              إلا بإعادة فتحها (يتطلب صلاحيات خاصة).
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              ملاحظات (اختياري)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={cn(
                "w-full px-4 py-2 rounded-lg border border-border",
                "bg-white dark:bg-gray-700 text-foreground",
                "focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
                "resize-none"
              )}
              placeholder="أضف أي ملاحظات حول عملية الإغلاق..."
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-4 bg-muted rounded-lg border border-border">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-foreground">
              أؤكد أنني قمت بمراجعة جميع القيود والحسابات للسنة المالية {year}،
              وأوافق على إغلاقها.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted dark:hover:bg-gray-700 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => onConfirm(notes)}
            disabled={!confirmed || loading}
            className={cn(
              "px-6 py-2 rounded-lg font-medium text-white",
              "bg-red-600 hover:bg-red-700",
              "transition-colors disabled:opacity-50"
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                جاري الإغلاق...
              </span>
            ) : (
              "تأكيد الإغلاق"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Reopen Year Modal ─────────────────────────────────────────────────────── */

function ReopenYearModal({
  year,
  companySlug: _companySlug,
  loading,
  onClose,
  onConfirm,
}: {
  year: number;
  companySlug: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-popover/50">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-yellow-50 dark:bg-yellow-900/20">
          <h3 className="text-xl font-bold text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
            <Unlock className="w-6 h-6" />
            إعادة فتح السنة المالية {year}
          </h3>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mt-0.5 shrink-0" />
            <div className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>تنبيه:</strong> إعادة فتح سنة مالية مغلقة هو إجراء حساس.
              سيتم تسجيل هذا الإجراء في سجل التدقيق مع السبب المقدم.
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              سبب إعادة الفتح *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              minLength={5}
              className={cn(
                "w-full px-4 py-2 rounded-lg border border-border",
                "bg-white dark:bg-gray-700 text-foreground",
                "focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
                "resize-none"
              )}
              placeholder="اشرح سبب إعادة فتح السنة المالية..."
            />
            <p className="mt-1 text-xs text-muted-foreground">يجب أن يكون السبب 5 أحرف على الأقل</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted dark:hover:bg-gray-700 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => reason.length >= 5 && onConfirm(reason)}
            disabled={reason.length < 5 || loading}
            className={cn(
              "px-6 py-2 rounded-lg font-medium text-white",
              "bg-yellow-500 hover:bg-yellow-600",
              "transition-colors disabled:opacity-50"
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                جاري الفتح...
              </span>
            ) : (
              "تأكيد إعادة الفتح"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Audit Log Modal ───────────────────────────────────────────────────────── */

function AuditLogModal({
  companySlug: _companySlug,
  entries,
  pagination,
  onPageChange,
  onClose,
}: {
  companySlug: string;
  entries: FiscalYearCloseRecord[];
  pagination: { page: number; totalPages: number };
  onPageChange: (page: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-popover/50">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <History className="w-6 h-6 text-emerald-600" />
            سجل تدقيق إغلاق السنوات المالية
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-16 h-16 mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">لا توجد سجلات</p>
              <p className="text-sm mt-1">لم يتم إغلاق أي سنوات مالية بعد</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">السنة</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">الحالة</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase hidden sm:table-cell">تاريخ الإغلاق</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">بواسطة</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">الأرباح المحتجزة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {entry.year}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                        entry.status === "مغلق"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      )}>
                        {entry.status === "مغلق" ? (
                          <Lock className="w-3 h-3 ml-1" />
                        ) : (
                          <Unlock className="w-3 h-3 ml-1" />
                        )}
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {new Date(entry.closedAt).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                      {entry.closedBy}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">
                      {parseFloat(entry.openingRetainedEarnings).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer with Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            الصفحة {pagination.page} من {pagination.totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className={cn(
                "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                "border border-border",
                "hover:bg-muted dark:hover:bg-gray-700",
                "disabled:opacity-50"
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className={cn(
                "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                "border border-border",
                "hover:bg-muted dark:hover:bg-gray-700",
                "disabled:opacity-50"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FiscalYearCloseView;
