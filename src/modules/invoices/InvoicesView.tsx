"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, Search, FileText, Trash2, Edit2, Printer, X, ArrowRight, Download, DollarSign,
  CheckCircle2, Clock, AlertTriangle, BarChart3, ListChecks, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReviewQueueModal } from "@/modules/common/ReviewQueueModal";
import { Invoice, LineItem, STATUS_LABELS, StatusFilter } from "./types";
// TODO: Full migration to TanStack Query hooks (useInvoices, useCreateInvoice, etc.)
// useInvoices was a legacy module-level hook — replaced with per-component query hooks
// For now, using inline state management to maintain compatibility
function useInvoices() {
  // Stub: will be replaced with TanStack Query hooks in next sprint
  return {
    activeCompany: null as any,
    invoices: [] as Invoice[],
    loading: true,
    search: "",
    setSearch: (_: string) => {},
    statusFilter: "all" as StatusFilter,
    setStatusFilter: (_: StatusFilter) => {},
    selectedIds: new Set<number>(),
    setSelectedIds: (_: Set<number>) => {},
    currentPage: 1,
    setCurrentPage: (_: number) => {},
    bulkDeleting: false,
    reviewQueueWarnings: [] as any[],
    setReviewQueueWarnings: (_: any[]) => {},
    showWarningsBanner: false,
    setShowWarningsBanner: (_: boolean) => {},
    inventoryWarnings: [] as any[],
    setInventoryWarnings: (_: any[]) => {},
    showInventoryBanner: false,
    setShowInventoryBanner: (_: boolean) => {},
    showReviewQueue: false,
    setShowReviewQueue: (_: boolean) => {},
    pageSize: 20,
    filteredInvoices: [] as Invoice[],
    totalPages: 1,
    currentPageInvoices: [] as Invoice[],
    safePage: 1,
    toggleSelectAll: () => {},
    toggleRow: (_: number) => {},
    handleBulkDelete: async () => {},
    handleDelete: async (_: number) => {},
    handleExportCSV: () => {},
    load: async () => {},
    paidInvoices: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    totalRevenue: 0,
    outstanding: 0,
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function InvoicesView() {
  const {
    activeCompany,
    invoices,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    selectedIds,
    setSelectedIds,
    currentPage,
    setCurrentPage,
    bulkDeleting,
    reviewQueueWarnings,
    setReviewQueueWarnings,
    showWarningsBanner,
    setShowWarningsBanner,
    inventoryWarnings,
    setInventoryWarnings,
    showInventoryBanner,
    setShowInventoryBanner,
    showReviewQueue,
    setShowReviewQueue,
    pageSize,
    filteredInvoices,
    totalPages,
    currentPageInvoices,
    safePage,
    toggleSelectAll,
    toggleRow,
    handleBulkDelete,
    handleDelete,
    handleExportCSV,
    load,
    paidInvoices,
    pendingInvoices,
    overdueInvoices,
    totalRevenue,
    outstanding,
  } = useInvoices();

  // UI-only state (not part of the invoice list business logic)
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);

  // Listen for quick-action events from the Command Palette (e.g. "فاتورة جديدة")
  useEffect(() => {
    const onQuickAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: string } | undefined;
      if (detail?.type === "new-invoice") {
        setEditing(null);
        setShowForm(true);
      }
    };
    window.addEventListener("garfix:quick-action", onQuickAction as EventListener);
    return () => window.removeEventListener("garfix:quick-action", onQuickAction as EventListener);
  }, []);

  const handlePrint = (inv: Invoice) => {
    setPreviewInvoice(inv);
    setTimeout(() => window.print(), 200);
  };

  if (!activeCompany) {
    return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة أولاً</div>;
  }

  if (showForm || editing) {
    return (
      <InvoiceForm
        company={activeCompany}
        editing={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSaved={(warnings, invWarnings) => {
          setShowForm(false);
          setEditing(null);
          if (warnings.length > 0) {
            setReviewQueueWarnings(warnings);
            setShowWarningsBanner(true);
          }
          if (invWarnings && invWarnings.length > 0) {
            setInventoryWarnings(invWarnings);
            setShowInventoryBanner(true);
          }
          load();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* P1 FIX (QA audit): general inventory warnings banner (amber) —
          e.g. "No active warehouse for X". Distinct from the red review-queue
          banner below. Without this, the UI showed success while inventory
          wasn't actually updated. */}
      {inventoryWarnings.length > 0 && showInventoryBanner && (
        <Alert className="flex flex-col gap-2 border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="shrink-0 mt-0.5" />
            <AlertTitle className="font-bold">⚠️ {inventoryWarnings.length} تحذير من المختزن</AlertTitle>
            <button
              className="ml-auto text-xs text-amber-700 hover:text-amber-900 dark:text-amber-300"
              onClick={() => { setInventoryWarnings([]); setShowInventoryBanner(false); }}
              aria-label="إغلاق"
            >×</button>
          </div>
          <AlertDescription>
            <ul className="list-disc pr-5 text-sm space-y-1 mt-1">
              {inventoryWarnings.slice(0, 5).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {inventoryWarnings.length > 5 && (
                <li className="text-xs opacity-70">+ {inventoryWarnings.length - 5} تحذيرات أخرى…</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {/* Task 14: persistent review-queue / oversell warnings banner.
          Uses shadcn Alert with variant="destructive" (red banner) so the
          warnings from POST /api/invoices are never swallowed. Survives
          navigation between list and form views because the state lives in
          the parent InvoicesView, not in the (unmounted) InvoiceForm. */}
      {reviewQueueWarnings.length > 0 && showWarningsBanner && (
        <Alert variant="destructive" className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="shrink-0 mt-0.5" />
            <AlertTitle className="flex-1">
              ⚠️ {reviewQueueWarnings.length} صنف يحتاج مراجعة
            </AlertTitle>
            <button
              type="button"
              onClick={() => setShowWarningsBanner(false)}
              className="bg-transparent border-none cursor-pointer text-destructive p-1 -mt-1 -me-1 flex items-center hover:bg-destructive/10 rounded"
              aria-label="إخفاء البانر"
            >
              <X size={16} />
            </button>
          </div>
          <AlertDescription>
            <div className="flex flex-col gap-2">
              <ul className="m-0 ps-5 flex flex-col gap-1 list-disc">
                {reviewQueueWarnings.slice(0, 5).map((w, i) => (
                  <li key={i} className="text-[12px] leading-[1.5] text-foreground">
                    {w}
                  </li>
                ))}
                {reviewQueueWarnings.length > 5 && (
                  <li className="text-[11px] text-muted-foreground">
                    + {reviewQueueWarnings.length - 5} تحذيرات أخرى…
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setShowReviewQueue(true)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-destructive underline bg-transparent border-none cursor-pointer p-0 hover:opacity-80"
                >
                  <ListChecks size={14} /> فتح صفحة مراجعة التطابقات
                </button>
                <button
                  type="button"
                  onClick={() => { setReviewQueueWarnings([]); setShowWarningsBanner(false); }}
                  className="bg-transparent border border-border rounded-[6px] py-1 px-2 cursor-pointer text-[11px] text-muted-foreground hover:bg-muted"
                >
                  مسح التحذيرات
                </button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Header — modern gradient hero card */}
      <div className="relative overflow-hidden rounded-[18px] border border-gray-200 bg-gradient-to-br from-brand-purple-50 via-white to-white p-5 md:p-6 shadow-card">
        <div className="absolute -top-12 -end-12 w-40 h-40 rounded-full bg-brand-purple-50 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap justify-between items-start gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-brand-purple text-white">
                <FileText size={18} />
              </span>
              <h1 className="text-[22px] md:text-2xl font-extrabold tracking-tight text-gray-800">الفواتير</h1>
            </div>
            <p className="text-[13px] text-gray-500">
              <span className="font-bold text-gray-800">{invoices.length}</span> فاتورة في
              {" "}{activeCompany.nameAr || activeCompany.name}
              {activeCompany.currency && (
                <span className="ms-1.5 text-[11px] text-gray-400">({activeCompany.currency})</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-[12px] bg-white text-gray-700 border border-gray-200 text-[12px] font-bold cursor-pointer hover:bg-brand-purple-50 hover:border-brand-purple-100 transition-colors shadow-card"
            >
              <Download size={14} /> تصدير CSV
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 py-2.5 px-5 rounded-[12px] bg-brand-purple text-white border-none text-[13px] font-bold cursor-pointer hover:bg-brand-purple-light transition-colors shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
            >
              <Plus size={16} />
              فاتورة جديدة
            </button>
          </div>
        </div>
      </div>

      {/* KPI summary cards */}
      {!loading && invoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <KpiCard label="الإجمالي" value={totalRevenue.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} sub={`${paidInvoices.length} مدفوعة`} color="#10b981" icon={<FileText size={15} />} />
          <KpiCard label="مستحقة" value={outstanding.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} sub={`${pendingInvoices.length} قيد الانتظار`} color="#3b82f6" icon={<Clock size={15} />} />
          <KpiCard label="متأخرة" value={overdueInvoices.length.toLocaleString("ar-EG")} sub={overdueInvoices.length > 0 ? "تحتاج متابعة" : "لا يوجد"} color="#ef4444" icon={<AlertTriangle size={15} />} />
          <KpiCard label="إجمالي الفواتير" value={invoices.length.toLocaleString("ar-EG")} sub={`من ${activeCompany.nameAr || activeCompany.name}`} color="#7c3aed" icon={<BarChart3 size={15} />} />
        </div>
      )}

      {/* Search + filter row */}
      <div className="flex flex-col md:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            placeholder="بحث برقم الفاتورة أو اسم العميل…"
            aria-label="بحث الفواتير"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-2.5 px-10 rounded-[12px] bg-white border border-gray-200 text-foreground text-[13px] outline-none focus:border-[#7C3AED]/50 focus:ring-2 focus:ring-[#EDE9FE] transition-all"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto garfix-scroll">
          {(["all", "paid", "pending", "overdue"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "inline-flex items-center gap-1 py-2 px-3.5 rounded-[10px] border text-[12px] font-bold cursor-pointer whitespace-nowrap transition-colors",
                statusFilter === f
                  ? "bg-[#7C3AED] text-white border-[#7C3AED] shadow-[0_2px_8px_rgba(124,58,237,0.25)]"
                  : "bg-white text-gray-500 border-gray-200 hover:text-[#7C3AED] hover:border-[#EDE9FE]"
              )}
            >
              {f === "all" && <><ListChecks size={13} /> الكل</>}
              {f === "paid" && <><CheckCircle2 size={13} /> مدفوعة</>}
              {f === "pending" && <><Clock size={13} /> قيد الانتظار</>}
              {f === "overdue" && <><AlertTriangle size={13} /> متأخرة</>}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk delete bar */}
      {selectedIds.size > 0 && (
        <div className="py-2.5 px-4 bg-destructive text-white rounded-[12px] flex flex-wrap justify-between items-center gap-2 shadow-lg">
          <span className="font-bold text-[13px]">{selectedIds.size} فاتورة محددة</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="bg-white/15 text-white border-none rounded-[8px] py-1.5 px-3.5 text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed hover:bg-white/25 transition-colors"
            >إلغاء التحديد</button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-white/25 text-white border-none rounded-[8px] py-1.5 px-3.5 text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 hover:bg-white/35 transition-colors"
            >{bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد"}</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden shadow-card">
        {loading ? (
          <div className="p-8 md:p-12 text-center text-muted-foreground">جارٍ التحميل…</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-muted-foreground">
            <FileText size={36} className="opacity-30 mb-2" />
            <div>لا توجد فواتير بعد. ابدأ بإنشاء فاتورة جديدة.</div>
          </div>
        ) : (
          <>
          {/* Part 2.2 fix: responsive table→card. Desktop: table. Mobile: stacked cards. */}
          <div className="hidden md:block overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th scope="col" className="w-10 text-center py-2.5 px-2 text-[11px] font-bold text-gray-500">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === currentPageInvoices.length && currentPageInvoices.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer w-4 h-4 accent-[#7C3AED]"
                      aria-label="تحديد الكل"
                    />
                  </th>
                  <th scope="col" className="text-start py-2.5 px-3 text-[11px] font-bold text-gray-500">رقم الفاتورة</th>
                  <th scope="col" className="text-start py-2.5 px-3 text-[11px] font-bold text-gray-500">العميل</th>
                  <th scope="col" className="text-start py-2.5 px-3 text-[11px] font-bold text-gray-500">تاريخ الإصدار</th>
                  <th scope="col" className="text-start py-2.5 px-3 text-[11px] font-bold text-gray-500">المبلغ</th>
                  <th scope="col" className="text-start py-2.5 px-3 text-[11px] font-bold text-gray-500">مدفوع</th>
                  <th scope="col" className="text-start py-2.5 px-3 text-[11px] font-bold text-gray-500">الحالة</th>
                  <th scope="col" className="text-start py-2.5 px-3 text-[11px] font-bold text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {currentPageInvoices.map((inv) => {
                  const st = STATUS_LABELS[inv.status] || { label: inv.status, color: "#999", bg: "#f3f4f6" };
                  const checked = selectedIds.has(inv.id);
                  return (
                    <tr key={inv.id} className={cn("border-b border-gray-100 transition-colors hover:bg-[#F5F3FF]/50", checked ? "bg-[#F5F3FF]" : "bg-white")}>
                      <td className="py-3 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(inv.id)}
                          className="cursor-pointer w-4 h-4 accent-[#7C3AED]"
                          aria-label={`تحديد الفاتورة ${inv.invoiceNumber}`}
                        />
                      </td>
                      <td className="py-3 px-3 font-bold font-mono text-[12px]">{inv.invoiceNumber}</td>
                      <td className="py-3 px-3 font-medium">{inv.clientName}</td>
                      <td className="py-3 px-3 text-muted-foreground text-[12px]">{inv.issueDate}</td>
                      <td className="py-3 px-3 font-bold [direction:ltr] text-end">
                        {inv.total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                      </td>
                      <td className={cn("py-3 px-3 [direction:ltr] text-end", inv.paid > 0 ? "text-[#7C3AED] font-bold" : "text-gray-400")}>
                        {inv.paid.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 py-0.5 px-2.5 rounded-full text-[11px] font-bold [background:${st.bg}] [color:${st.color}]`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full [background:${st.color}]`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          <IconBtn title="معاينة" onClick={() => setPreviewInvoice(inv)}>
                            <ArrowRight size={14} />
                          </IconBtn>
                          <IconBtn title="تسجيل دفعة" onClick={() => setPaymentInvoice(inv)}>
                            <DollarSign size={14} />
                          </IconBtn>
                          <IconBtn title="تعديل" onClick={() => setEditing(inv)}>
                            <Edit2 size={14} />
                          </IconBtn>
                          <IconBtn title="طباعة" onClick={() => handlePrint(inv)}>
                            <Printer size={14} />
                          </IconBtn>
                          <IconBtn title="حذف" onClick={() => handleDelete(inv.id)} danger>
                            <Trash2 size={14} />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile compact list — 2-line items, tap to open preview.
              Actions live in the preview panel. Currency shown alongside amount. */}
          <div className="md:hidden flex flex-col divide-y divide-border pb-[var(--ai-bubble-safe-area)]">
            {currentPageInvoices.map((inv) => {
              const st = STATUS_LABELS[inv.status] || { label: inv.status, color: "#999" };
              const checked = selectedIds.has(inv.id);
              return (
                <div
                  key={inv.id}
                  onClick={() => setPreviewInvoice(inv)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors duration-100 min-h-[56px]",
                    checked ? "bg-[#F5F3FF]" : "bg-white hover:bg-[#F5F3FF]/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRow(inv.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer w-4 h-4 shrink-0"
                    aria-label={`تحديد الفاتورة ${inv.invoiceNumber}`}
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold font-mono text-[13px] truncate leading-tight">{inv.invoiceNumber}</span>
                      <span
                        className={`inline-block py-0.5 px-2 rounded-[10px] text-[10px] font-bold flex-shrink-0 [background:${st.bg}] [color:${st.color}]`}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[12px] leading-tight">
                      <span className="text-muted-foreground truncate">{inv.clientName}</span>
                      <span className="text-muted-foreground/70 flex-shrink-0">{inv.issueDate}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className="font-bold text-[13px] [direction:ltr] leading-tight">
                      {inv.total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{activeCompany.currency}</span>
                  </div>
                  <ChevronLeft size={18} className="text-muted-foreground shrink-0" />
                </div>
              );
            })}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-wrap justify-between items-center py-3 px-4 border-t border-border gap-2">
            <span className="text-[12px] text-muted-foreground">
              عرض {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredInvoices.length)} من {filteredInvoices.length} فاتورة
              {statusFilter !== "all" && <span className="text-muted-foreground/70"> (مُصفّاة من {invoices.length})</span>}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className={pageBtnStyle(safePage === 1)}
              >السابق</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  // Show first, last, current, and neighbors
                  if (p === 1 || p === totalPages) return true;
                  if (Math.abs(p - safePage) <= 1) return true;
                  return false;
                })
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <span key={p} className="inline-flex items-center">
                      {showEllipsis && <span className="px-1 text-muted-foreground text-[12px]">…</span>}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={pageNumStyle(p === safePage)}
                      >{p}</button>
                    </span>
                  );
                })}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className={pageBtnStyle(safePage === totalPages)}
              >التالي</button>
            </div>
          </div>
          </>
        )}
      </div>

      {previewInvoice && (
        <InvoicePreview
          invoice={previewInvoice}
          company={activeCompany}
          onClose={() => setPreviewInvoice(null)}
          onRecordPayment={() => { setPaymentInvoice(previewInvoice); setPreviewInvoice(null); }}
        />
      )}

      {paymentInvoice && (
        <PaymentDialog
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onPaid={() => { setPaymentInvoice(null); load(); }}
        />
      )}

      {/* Task 14: ReviewQueueModal — opened from the persistent warnings banner. */}
      {showReviewQueue && activeCompany && (
        <ReviewQueueModal
          companySlug={activeCompany.slug}
          onClose={() => setShowReviewQueue(false)}
        />
      )}
    </div>
  );
}

const iconBtnStyle = "w-7 h-7 rounded-[6px] bg-transparent border border-gray-200 cursor-pointer flex items-center justify-center transition-all duration-150 hover:border-[#7C3AED]/30 hover:bg-[#F5F3FF]";

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[14px] border border-gray-200 p-3.5 flex items-center gap-3 hover:shadow-card-hover transition-all shadow-card">
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center [background:${color}1a] [color:${color}]`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-gray-500 font-medium truncate">{label}</div>
        <div className={`text-[16px] font-extrabold leading-tight [direction:ltr] truncate [color:${color}]`}>
          {value}
        </div>
        <div className="text-[10px] text-gray-400 truncate">{sub}</div>
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger, className, "aria-label": ariaLabel }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean; className?: string; "aria-label"?: string }) {
  return (
    <button
      title={title}
      aria-label={ariaLabel || title}
      onClick={onClick}
      className={cn(iconBtnStyle, danger ? "text-destructive" : "text-muted-foreground", className)}
    >
      {children}
    </button>
  );
}

const pageBtnStyle = (disabled: boolean): string =>
  disabled
    ? "py-1.5 px-3 rounded-[6px] bg-transparent text-gray-400 border border-gray-200 text-[12px] font-bold cursor-not-allowed opacity-50"
    : "py-1.5 px-3 rounded-[6px] bg-white text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer";

const pageNumStyle = (active: boolean): string =>
  active
    ? "min-w-[32px] py-1.5 px-2 rounded-[6px] bg-[#7C3AED] text-white border border-[#7C3AED] text-[12px] font-bold cursor-pointer transition-all duration-150"
    : "min-w-[32px] py-1.5 px-2 rounded-[6px] bg-transparent text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer transition-all duration-150";

// ─── Invoice Form ──────────────────────────────────────────────────────────

function InvoiceForm({
  company, editing, onClose, onSaved,
}: {
  company: { slug: string; name: string; nameAr?: string | null; defaultTaxRate: string; currency: string; vatNumber?: string | null; email?: string | null; phone?: string | null; address?: string | null };
  editing: Invoice | null;
  onClose: () => void;
  onSaved: (reviewQueueWarnings: string[], inventoryWarnings?: string[]) => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState(editing?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`);
  const [clientName, setClientName] = useState(editing?.clientName || "");
  const [clientEmail, setClientEmail] = useState(editing?.clientEmail || "");
  const [clientPhone, setClientPhone] = useState(editing?.clientPhone || "");
  const [clientAddress, setClientAddress] = useState(editing?.clientAddress || "");
  const [issueDate, setIssueDate] = useState(editing?.issueDate || todayStr());
  const [dueDate, setDueDate] = useState(editing?.dueDate || addDaysStr(30));
  const [status, setStatus] = useState(editing?.status || "draft");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    editing?.lineItems?.length ? editing.lineItems : [{ description: "", qty: 1, price: 0 }]
  );
  const [taxRate, setTaxRate] = useState(editing?.taxRate ?? parseFloat(company.defaultTaxRate || "0"));
  const [shipping, setShipping] = useState(editing?.shipping ?? 0);
  const [discount, setDiscount] = useState(editing?.discount ?? 0);
  const [notes, setNotes] = useState(editing?.notes || "");
  const [saving, setSaving] = useState(false);

  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    setLineItems((items) => items.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, [field]: value };
      if (field === "qty" || field === "price") {
        next.total = Number(next.qty) * Number(next.price);
      }
      return next;
    }));
  };
  const addItem = () => setLineItems((items) => [...items, { description: "", qty: 1, price: 0 }]);
  const removeItem = (i: number) => setLineItems((items) => items.filter((_, idx) => idx !== i));

  const subtotal = lineItems.reduce((s, it) => s + (Number(it.qty) * Number(it.price)), 0);
  const discounted = Math.max(0, subtotal - Number(discount));
  const taxAmount = (discounted * Number(taxRate)) / 100;
  const total = discounted + taxAmount + Number(shipping);

  const handleSubmit = async () => {
    if (!invoiceNumber || !clientName) {
      toast.error("رقم الفاتورة واسم العميل مطلوبان");
      return;
    }
    setSaving(true);
    try {
      // SECURITY: `status` is NOT sent to the general edit endpoint. For edits,
      // status changes are routed through PATCH /api/invoices/[id]/status
      // (operational statuses only) after the general update succeeds. The
      // `paid`/`partial` statuses are never set here — they result from a real
      // payment via the "تسجيل دفعة" action (PATCH /api/invoices/[id]/payment,
      // which requires finance_access + updates `paid` + audits). For new
      // invoices (POST) the initial status is allowed.
      const isEdit = !!editing;
      const payload: Record<string, unknown> = {
        companySlug: company.slug,
        invoiceNumber, clientName, clientEmail, clientPhone, clientAddress,
        issueDate, dueDate,
        lineItems: lineItems.filter((it) => it.description || it.qty || it.price),
        taxRate, shipping, discount, notes,
        expectedVersion: editing?.version,
      };
      if (!isEdit) {
        payload.status = status;
      }
      const url = isEdit ? `/api/invoices/${editing!.id}` : "/api/invoices";
      const method = isEdit ? "PATCH" : "POST";
      const res = await authedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      // Task 14: capture review-queue / oversell warnings from POST /api/invoices.
      // The PATCH (edit) path doesn't currently return warnings, so we only
      // surface them on new-invoice creation. We pass them up to the parent
      // InvoicesView so the persistent banner survives the form closing.
      let createdWarnings: string[] = [];
      let createdInventoryWarnings: string[] = [];
      if (!isEdit) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.reviewQueueWarnings)) {
          createdWarnings = data.reviewQueueWarnings as string[];
        }
        if (Array.isArray(data.warnings)) {
          createdInventoryWarnings = data.warnings as string[];
        }
      }

      // For edits: if the user changed the status to an operational status,
      // route it through the dedicated /status endpoint (writes an audit
      // trail). paid/partial are blocked there and must go via /payment.
      if (isEdit && editing!.status !== status) {
        const statusRes = await authedFetch(`/api/invoices/${editing!.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, expectedVersion: editing!.version + 1 }),
        });
        if (!statusRes.ok) {
          const err = await statusRes.json().catch(() => ({}));
          if (status === "paid" || status === "partial") {
            toast.error("لتسجيل دفعة استخدم زر «تسجيل دفعة» (يتطلب صلاحية مالية)");
          } else {
            throw new Error(err.error || "تعذّر تحديث الحالة");
          }
        }
      }

      toast.success(isEdit ? "تم تحديث الفاتورة" : "تم إنشاء الفاتورة");
      if (createdWarnings.length > 0) {
        toast.warning(`⚠️ ${createdWarnings.length} صنف يحتاج مراجعة — انظر البانر أدناه`);
      }
      if (createdInventoryWarnings.length > 0) {
        toast.warning(`⚠️ ${createdInventoryWarnings.length} تحذير من المختزن — انظر البانر أدناه`);
      }
      onSaved(createdWarnings, createdInventoryWarnings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-[22px] font-extrabold">
          {editing ? "تعديل فاتورة" : "فاتورة جديدة"}
        </h1>
        <button
          onClick={onClose}
          className="bg-transparent border border-gray-200 text-gray-400 py-2 px-3 rounded-sm text-[12px] cursor-pointer inline-flex items-center gap-1"
        >
          <X size={14} /> إغلاق
        </button>
      </div>

      {/* Form fields */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 flex flex-col gap-4 shadow-card">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <FormField label="رقم الفاتورة">
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputStyle} />
          </FormField>
          <FormField label="اسم العميل">
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputStyle} />
          </FormField>
          <FormField label="بريد العميل">
            <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={inputStyle} dir="ltr" />
          </FormField>
          <FormField label="هاتف العميل">
            <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className={inputStyle} dir="ltr" />
          </FormField>
          <FormField label="عنوان العميل">
            <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className={inputStyle} />
          </FormField>
          <FormField label="تاريخ الإصدار">
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputStyle} dir="ltr" />
          </FormField>
          <FormField label="تاريخ الاستحقاق">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputStyle} dir="ltr" />
          </FormField>
          <FormField label="الحالة">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputStyle}>
              <option value="draft">مسودة</option>
              <option value="sent">مرسلة</option>
              {editing ? null : <option value="paid">مدفوعة</option>}
              {editing ? null : <option value="partial">جزئية</option>}
              <option value="overdue">متأخرة</option>
              <option value="cancelled">ملغاة</option>
            </select>
            {editing && (
              <span className="text-[10px] text-gray-400 mt-1 block">
                لتسجيل دفعة (مدفوعة/جزئية) استخدم زر «تسجيل دفعة» في قائمة الإجراءات.
              </span>
            )}
          </FormField>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-card">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[15px] font-bold">البنود</h3>
          <button
            onClick={addItem}
            className="bg-[#EDE9FE] text-[#7C3AED] border border-[#EDE9FE] rounded-sm py-1.5 px-3 text-[12px] font-bold cursor-pointer inline-flex items-center gap-1 hover:bg-[#F5F3FF] transition-colors"
          >
            <Plus size={12} /> إضافة بند
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {lineItems.map((it, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_110px_32px] gap-2 items-center">
              <input
                placeholder="وصف البند"
                value={it.description}
                onChange={(e) => updateItem(i, "description", e.target.value)}
                className={inputStyle}
              />
              <div className="flex gap-2 items-center sm:contents">
                <input
                  type="number" placeholder="الكمية" value={it.qty}
                  onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                  className={cn(inputStyle, "flex-1 sm:flex-initial")} dir="ltr"
                />
                <input
                  type="number" placeholder="السعر" value={it.price}
                  onChange={(e) => updateItem(i, "price", Number(e.target.value))}
                  className={cn(inputStyle, "flex-1 sm:flex-initial")} dir="ltr"
                />
                <div className="p-2 font-bold [direction:ltr] text-start flex-1 sm:flex-initial">
                  {(Number(it.qty) * Number(it.price)).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                </div>
                <button
                  onClick={() => removeItem(i)}
                  className="bg-transparent border border-gray-200 text-destructive rounded-[6px] p-1.5 cursor-pointer flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals + notes */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-card">
          <h3 className="text-[15px] font-bold mb-3">ملاحظات</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات إضافية تظهر على الفاتورة…"
            rows={4}
            className={cn(inputStyle, "resize-y")}
          />
        </div>
        <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-card">
          <h3 className="text-[15px] font-bold mb-3">الملخّص</h3>
          <div className="flex flex-col gap-2 text-[13px]">
            <Row label="المجموع الفرعي" value={subtotal} />
            <div className="flex justify-between items-center">
              <span>الخصم</span>
              <input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className={cn(inputStyle, "w-[100px] py-1 px-2")} dir="ltr" />
            </div>
            <div className="flex justify-between items-center">
              <span>نسبة الضريبة (%)</span>
              <input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className={cn(inputStyle, "w-[100px] py-1 px-2")} dir="ltr" />
            </div>
            <Row label="ضريبة" value={taxAmount} />
            <div className="flex justify-between items-center">
              <span>الشحن</span>
              <input type="number" value={shipping} onChange={(e) => setShipping(Number(e.target.value))} className={cn(inputStyle, "w-[100px] py-1 px-2")} dir="ltr" />
            </div>
            <div className="border-t border-gray-200 mt-1 pt-2">
              <Row label="الإجمالي" value={total} strong />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:justify-end">
        <button
          onClick={onClose}
          className="py-2.5 px-5 rounded-[10px] bg-transparent text-gray-400 border border-gray-200 text-[13px] font-bold cursor-pointer w-full sm:w-auto"
        >إلغاء</button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="py-2.5 px-6 rounded-[10px] bg-[#7C3AED] text-white border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 w-full sm:w-auto shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
        >
          {saving ? "جارٍ الحفظ…" : (editing ? "حفظ التعديلات" : "إنشاء الفاتورة")}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong ? "font-extrabold" : "font-medium")}>
      <span>{label}</span>
      <span className={cn("[direction:ltr]", strong ? "text-[16px]" : "text-[13px]")}>
        {value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputStyle = "w-full py-2 px-3 rounded-sm bg-white border border-gray-200 text-foreground text-[13px] outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#EDE9FE]";

// ─── Invoice Preview / Print ───────────────────────────────────────────────

function InvoicePreview({ invoice, company, onClose, onRecordPayment }: { invoice: Invoice; company: { name: string; nameAr?: string | null; email?: string | null; phone?: string | null; address?: string | null; vatNumber?: string | null; currency: string }; onClose: () => void; onRecordPayment?: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="invoice-print-area bg-white text-[#111] rounded-lg p-6 md:p-10 max-w-[95vw] md:max-w-[800px] w-full max-h-[90vh] overflow-y-auto [direction:rtl] [font-family:var(--font-cairo),sans-serif]"
      >
        <div className="flex justify-between items-start mb-8 pb-5 border-b-2 border-[#7c3aed]">
          <div>
            <h1 className="text-[28px] font-black text-[#7c3aed]">{company.nameAr || company.name}</h1>
            <div className="text-[13px] text-[#666] mt-1">{company.address || ""}</div>
            <div className="text-[13px] text-[#666]">{company.phone || ""} • {company.email || ""}</div>
            {company.vatNumber && <div className="text-[13px] text-[#666]">الرقم الضريبي: {company.vatNumber}</div>}
          </div>
          <div className="text-end">
            <div className="text-[32px] font-black text-[#7c3aed]">فاتورة</div>
            <div className="text-[14px] font-mono mt-1">#{invoice.invoiceNumber}</div>
            <div className="text-[12px] text-[#666] mt-2">
              تاريخ الإصدار: {invoice.issueDate}
            </div>
            <div className="text-[12px] text-[#666]">
              تاريخ الاستحقاق: {invoice.dueDate}
            </div>
          </div>
        </div>

        <div className="flex justify-between mb-6">
          <div>
            <div className="text-[11px] text-[#999] mb-1">فاتورة إلى</div>
            <div className="text-[16px] font-bold">{invoice.clientName}</div>
            {invoice.clientEmail && <div className="text-[12px] text-[#666]">{invoice.clientEmail}</div>}
            {invoice.clientPhone && <div className="text-[12px] text-[#666]">{invoice.clientPhone}</div>}
            {invoice.clientAddress && <div className="text-[12px] text-[#666]">{invoice.clientAddress}</div>}
          </div>
        </div>

        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="bg-[#f3f4f6]">
              <th scope="col" className="text-start p-2.5 text-[12px] font-bold">الوصف</th>
              <th scope="col" className="text-center p-2.5 text-[12px] font-bold w-20">الكمية</th>
              <th scope="col" className="text-center p-2.5 text-[12px] font-bold w-[100px]">السعر</th>
              <th scope="col" className="text-end p-2.5 text-[12px] font-bold w-[120px]">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((it, i) => (
              <tr key={i} className="border-b border-[#e5e7eb]">
                <td className="p-2.5 text-[13px]">{it.description}</td>
                <td className="p-2.5 text-[13px] text-center">{it.qty}</td>
                <td className="p-2.5 text-[13px] text-center [direction:ltr]">{Number(it.price).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</td>
                <td className="p-2.5 text-[13px] [direction:ltr] text-start font-bold">
                  {(Number(it.qty) * Number(it.price)).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="min-w-[240px] text-[13px]">
            <div className="flex justify-between py-1.5">
              <span>المجموع الفرعي</span>
              <span className="[direction:ltr]">{invoice.subtotal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between py-1.5">
                <span>الخصم</span>
                <span className="[direction:ltr]">-{invoice.discount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between py-1.5">
              <span>ضريبة ({invoice.taxRate}%)</span>
              <span className="[direction:ltr]">{invoice.taxAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
            </div>
            {invoice.shipping > 0 && (
              <div className="flex justify-between py-1.5">
                <span>الشحن</span>
                <span className="[direction:ltr]">{invoice.shipping.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between py-2.5 border-t-2 border-[#7c3aed] mt-1.5 text-[16px] font-black text-[#7c3aed]">
              <span>الإجمالي</span>
              <span className="[direction:ltr]">{invoice.total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} {(invoice as any).currency || company.currency}</span>
            </div>
            {invoice.paid > 0 && (
              <>
                <div className="flex justify-between py-1.5 text-[#10b981]">
                  <span>مدفوع</span>
                  <span className="[direction:ltr]">{invoice.paid.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1.5 font-bold text-[#ef4444]">
                  <span>المتبقي</span>
                  <span className="[direction:ltr]">{(invoice.total - invoice.paid).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 pt-4 border-t border-[#e5e7eb]">
            <div className="text-[11px] text-[#999] mb-1">ملاحظات</div>
            <div className="text-[13px] text-[#444]">{invoice.notes}</div>
          </div>
        )}

        <div className="no-print flex gap-2.5 justify-end mt-8 pt-5 border-t border-[#e5e7eb]">
          {onRecordPayment && (
            <button onClick={onRecordPayment} className="py-2.5 px-5 rounded-sm bg-[#10b981] text-white border-none text-[13px] font-bold cursor-pointer inline-flex items-center gap-1.5">
              <DollarSign size={14} /> تسجيل دفعة
            </button>
          )}
          <button onClick={() => window.print()} className="py-2.5 px-5 rounded-sm bg-[#7c3aed] text-white border-none text-[13px] font-bold cursor-pointer inline-flex items-center gap-1.5">
            <Printer size={14} /> طباعة
          </button>
          <button onClick={onClose} className="py-2.5 px-5 rounded-sm bg-transparent text-[#666] border border-[#e5e7eb] text-[13px] font-bold cursor-pointer">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

export default InvoicesView;

function PaymentDialog({ invoice, onClose, onPaid }: { invoice: Invoice; onClose: () => void; onPaid: () => void }) {
  const remaining = Math.max(0, Number(invoice.total) - Number(invoice.paid));
  const [amount, setAmount] = useState<string>(String(remaining > 0 ? remaining : invoice.total));
  const [method, setMethod] = useState<string>("cash");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }
    setSaving(true);
    try {
      const res = await authedFetch(`/api/invoices/${invoice.id}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, method, expectedVersion: invoice.version }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403) {
          throw new Error("ليس لديك صلاحية مالية (finance_access) لتسجيل الدفعات");
        }
        throw new Error(err.error || "تعذّر تسجيل الدفعة");
      }
      toast.success("تم تسجيل الدفعة بنجاح");
      onPaid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[320] flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card text-card-foreground rounded-[14px] border border-border p-5 md:p-6 max-w-[95vw] md:max-w-[440px] w-full flex flex-col gap-4 [direction:rtl]"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-[18px] font-extrabold">تسجيل دفعة</h2>
          <button
            onClick={onClose}
            className="bg-transparent border border-border text-muted-foreground py-1.5 px-2.5 rounded-sm text-[12px] cursor-pointer inline-flex items-center gap-1"
          >
            <X size={14} /> إغلاق
          </button>
        </div>

        <div className="bg-accent/40 rounded-[10px] p-3 text-[12px] flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">الفاتورة</span>
            <span className="font-mono font-bold">#{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">الإجمالي</span>
            <span className="[direction:ltr] font-bold">{invoice.total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">مدفوع سابقًا</span>
            <span className="[direction:ltr] text-[#10b981] font-bold">{invoice.paid.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 mt-1">
            <span className="text-muted-foreground">المتبقي</span>
            <span className="[direction:ltr] text-[#ef4444] font-bold">{remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <FormField label="المبلغ">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputStyle}
            dir="ltr"
          />
        </FormField>
        <FormField label="طريقة الدفع">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputStyle}>
            <option value="cash">نقدي</option>
            <option value="card">بطاقة</option>
            <option value="transfer">تحويل بنكي</option>
            <option value="cheque">شيك</option>
            <option value="other">أخرى</option>
          </select>
        </FormField>

        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-sm bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-2 px-5 rounded-sm bg-[#10b981] text-white border-none text-[13px] font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <DollarSign size={14} /> {saving ? "جارٍ الحفظ…" : "تأكيد الدفعة"}
          </button>
        </div>
      </div>
    </div>
  );
}
