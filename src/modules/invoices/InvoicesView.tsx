"use client";

import { useEffect, useState, useMemo } from "react";
import { useBrand } from "@/context/BrandContext";
import { useInvoices as useInvoicesQuery, useDeleteInvoice, useRecordPayment, useUpdateInvoiceStatus, useCreateInvoice, useUpdateInvoice } from "@/hooks/queries";
import type { CreateInvoicePayload } from "@/hooks/queries";
import { EInvoiceSubmitButton } from "@/modules/invoices/EInvoiceSubmitButton";
import { toast } from "sonner";
import {
  Plus, Search, FileText, Trash2, Edit2, Printer, X, ArrowRight, Download, DollarSign,
  CheckCircle2, Clock, AlertTriangle, BarChart3, ListChecks, ChevronLeft, LayoutGrid,
} from "lucide-react";
import { cn, paginate } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// DS v4.0 Components
import {
  GarfixEnterpriseTable,
  GarfixBulkActions,
  GarfixEmptyState,
  GarfixLoadingState,
} from '@/components/ui/index-garfix-ds';
import type { EnterpriseColumn } from '@/components/ui/index-garfix-ds';
import { LazyReviewQueueModal } from "@/modules/common/LazyModals";
import { ProductPicker, type ProductOption } from "@/modules/catalog/ProductPicker";
import { QuickCreateProductDialog } from "@/modules/catalog/QuickCreateProductDialog";
import { Invoice, LineItem, STATUS_LABELS, StatusFilter } from "./types";
import { EmptyInvoices, AISearchBar } from "@/components/garfix";

/**
 * P0 FIX (audit feedback): local LineItem variant with a stable client-side `localId`
 * for React keys. The shared `LineItem` interface in `./types.ts` is also used by
 * e-invoicing and money calc modules, so we can't add a client-only field there
 * without breaking them. Instead we extend it locally — `EditableLineItem` is a
 * superset of `LineItem`, so it satisfies any code that expects a `LineItem`.
 *
 * Why localId: a composite key like `${description}-${qty}-${price}` collides
 * if the user adds the same product twice (legal in ERP — e.g. two batches
 * of the same item at the same price). React would merge the two rows and
 * the second one's inputs would bind to the first row's record.
 */
interface EditableLineItem extends LineItem {
  localId: string;
}

/** Generate a unique-enough client-side id (matches RecurringEntriesView pattern). */
function makeLineLocalId(): string {
  return `li_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  const { activeCompany } = useBrand();
  const companySlug = activeCompany?.slug || "";

  // TanStack Query replaces the stub useInvoices
  const invoicesQuery = useInvoicesQuery(companySlug);
  const deleteInvoiceMutation = useDeleteInvoice();
  const recordPaymentMutation = useRecordPayment();
  const updateStatusMutation = useUpdateInvoiceStatus();

  const allInvoices = ((invoicesQuery.data as any)?.invoices ?? []) as Invoice[];
  const loading = invoicesQuery.isLoading;

  // Local UI state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [reviewQueueWarnings, setReviewQueueWarnings] = useState<any[]>([]);
  const [showWarningsBanner, setShowWarningsBanner] = useState(false);
  const [inventoryWarnings, setInventoryWarnings] = useState<any[]>([]);
  const [showInventoryBanner, setShowInventoryBanner] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const pageSize = 20;

  // ── Branch/warehouse filter (from global Topbar selector) ──
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setWarehouseFilter(detail?.warehouseId || "");
    };
    window.addEventListener("garfix:warehouse-changed", handler as EventListener);
    // Also check localStorage on mount
    try {
      const saved = localStorage.getItem("garfix:selected-warehouse");
      if (saved) setWarehouseFilter(saved);
    } catch { /* ignore */ }
    return () => window.removeEventListener("garfix:warehouse-changed", handler as EventListener);
  }, []);

  // ── Display mode toggle: table / cards ──
  const [displayMode, setDisplayMode] = useState<"table" | "cards">("table");

  // Derived data (was computed by stub)
  const filteredInvoices = useMemo(() => {
    let list = allInvoices;
    // ── Branch/warehouse filter ──
    if (warehouseFilter) {
      list = list.filter((inv: any) => inv.warehouseId === warehouseFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((inv: Invoice) => inv.invoiceNumber.toLowerCase().includes(s) || inv.clientName.toLowerCase().includes(s));
    }
    if (statusFilter !== "all") {
      list = list.filter((inv: Invoice) => inv.status === statusFilter);
    }
    return list;
  }, [allInvoices, search, statusFilter, warehouseFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const currentPageInvoices = paginate(filteredInvoices, safePage, pageSize);

  const paidInvoices = allInvoices.filter((inv: Invoice) => inv.status === "paid");
  const pendingInvoices = allInvoices.filter((inv: Invoice) => inv.status === "sent" || inv.status === "partial");
  const overdueInvoices = allInvoices.filter((inv: Invoice) => inv.status === "overdue");
  const totalRevenue = paidInvoices.reduce((s: number, inv: Invoice) => s + inv.total, 0);
  // Compute outstanding on the client — the API doesn't return an `outstanding`
  // field (only `total` and `paid`). Reading `inv.outstanding` directly was
  // producing NaN in the KPI card ("مستحقة: NaN").
  const outstanding = allInvoices.reduce(
    (s: number, inv: Invoice) => s + Math.max(0, (inv.total ?? 0) - (inv.paid ?? 0)),
    0,
  );

  const invoices = allInvoices;

  // UI-only state (not part of the invoice list business logic)
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedIds.size === currentPageInvoices.length && currentPageInvoices.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(currentPageInvoices.map((i: Invoice) => i.id))); 
  };
  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Delete / bulk delete
  const handleDelete = (id: number) => {
    deleteInvoiceMutation.mutate(id, {
      onSuccess: () => toast.success("تم حذف الفاتورة"),
      onError: (err: any) => toast.error(err.message || "خطأ في الحذف"),
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    for (const id of selectedIds) {
      await deleteInvoiceMutation.mutateAsync(id).catch(() => {});
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
  };

  // Export invoices as CSV — client-side generation from already-loaded data.
  // No server round-trip needed; the user has at most 100 invoices in memory
  // (cursor pagination). For larger exports, a server-side streaming endpoint
  // would be needed (TODO: /api/invoices/export when cursor pagination limit
  // becomes a real constraint).
  const handleExportCSV = () => {
    if (!allInvoices.length) {
      toast.info("لا توجد فواتير لتصديرها");
      return;
    }
    const headers = ["رقم الفاتورة", "العميل", "التاريخ", "الاستحقاق", "الحالة", "الإجمالي", "المدفوع", "المتبقي"];
    const rows = allInvoices.map((inv) => [
      inv.invoiceNumber ?? "",
      inv.clientName ?? "",
      inv.issueDate ? new Date(inv.issueDate).toISOString().slice(0, 10) : "",
      inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : "",
      inv.status ?? "",
      String(inv.total ?? 0),
      String(inv.paid ?? 0),
      String(Math.max(0, (inv.total ?? 0) - (inv.paid ?? 0))),
    ]);
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    // Prepend BOM so Excel reads Arabic correctly
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `garfix-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${allInvoices.length} فاتورة`);
  };

  // Quick-action event listener
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
          invoicesQuery.refetch();
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

      {/* Header — DS v4.0 Hero Card with Emerald Primary */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-card p-5 md:p-6 shadow-sm hover-lift">
        {/* Decorative blob */}
        <div className="absolute -top-12 -end-12 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap justify-between items-start gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-white shadow-sm">
                <FileText size={18} />
              </span>
              <h1 className="text-[22px] md:text-2xl font-extrabold tracking-tight text-foreground">الفواتير</h1>
            </div>
            <p className="text-[13px] text-muted-foreground">
              <span className="font-bold text-foreground">{invoices.length}</span> فاتورة في
              {" "}{activeCompany.nameAr || activeCompany.name}
              {activeCompany.currency && (
                <span className="ms-1.5 text-[11px] text-muted-foreground/70">({activeCompany.currency})</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-card text-foreground border border-border text-[12px] font-bold cursor-pointer hover-lift hover:bg-primary/5 hover:border-primary/30 active-press focus-ring transition-all duration-120 shadow-sm"
            >
              <Download size={14} /> تصدير CSV
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 py-2.5 px-5 rounded-xl bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer hover-lift hover:bg-primary/90 active-press focus-ring transition-all duration-150 shadow-md"
            >
              <Plus size={16} />
              فاتورة جديدة
            </button>
          </div>
        </div>
      </div>

      {/* KPI summary cards — DS v4.0 */}
      {!loading && invoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          {/* Total Invoices — Standard KPI */}
          <div className="kpi-card hover-lift rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <FileText size={18} />
              </div>
              <span className="kpi-label">إجمالي الفواتير</span>
            </div>
            <div className="kpi-value [direction:ltr]">{invoices.length.toLocaleString("ar-EG")}</div>
            <div className="text-xs text-muted-foreground mt-1">من {activeCompany.nameAr || activeCompany.name}</div>
          </div>

          {/* Total Revenue — GOLD KPI (Important!) */}
          <div className="kpi-card-gold hover-lift rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#d4a574]/20 flex items-center justify-center text-[#d4a574]">
                <DollarSign size={18} />
              </div>
              <span className="kpi-label">الإيرادات الإجمالية</span>
              <span className="kpi-badge">✦ مهم</span>
            </div>
            <div className="kpi-value [direction:ltr]">{totalRevenue.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-muted-foreground mt-1">{paidInvoices.length} فاتورة مدفوعة</div>
          </div>

          {/* Paid Invoices — Standard KPI */}
          <div className="kpi-card hover-lift rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={18} />
              </div>
              <span className="kpi-label">الفواتير المدفوعة</span>
            </div>
            <div className="kpi-value [direction:ltr]">{paidInvoices.length.toLocaleString("ar-EG")}</div>
            <div className="text-xs text-muted-foreground mt-1">تم تحصيلها بالكامل</div>
          </div>

          {/* Overdue Invoices — Standard KPI (Danger) */}
          <div className="kpi-card hover-lift rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                <AlertTriangle size={18} />
              </div>
              <span className="kpi-label">الفواتير المتأخرة</span>
            </div>
            <div className="kpi-value [direction:ltr] text-red-500">{overdueInvoices.length.toLocaleString("ar-EG")}</div>
            <div className="text-xs text-muted-foreground mt-1">{overdueInvoices.length > 0 ? "تحتاج متابعة عاجلة" : "لا يوجد"}</div>
          </div>

          {/* Average Invoice Value — Standard KPI */}
          <div className="kpi-card hover-lift rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                <BarChart3 size={18} />
              </div>
              <span className="kpi-label">متوسط قيمة الفاتورة</span>
            </div>
            <div className="kpi-value [direction:ltr]">
              {invoices.length > 0 
                ? (totalRevenue / invoices.length).toLocaleString("ar-EG", { maximumFractionDigits: 2 })
                : "0"
              }
            </div>
            <div className="text-xs text-muted-foreground mt-1">متوسط لكل فاتورة</div>
          </div>
        </div>
      )}

      {/* Search + filter row — DS v4.0 */}
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
            className="w-full py-2.5 px-10 rounded-xl bg-card border border-border text-foreground text-[13px] outline-none focus-ring focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-120 hover-lift"
          />
          {/* AI Badge — DS v4.0 */}
          <span className="ai-badge absolute start-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded-full">
            AI
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto garfix-scroll">
          {(["all", "paid", "pending", "overdue"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "inline-flex items-center gap-1 py-2 px-3.5 rounded-xl border text-[12px] font-bold cursor-pointer whitespace-nowrap transition-all duration-120 active-press focus-ring",
                statusFilter === f
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:text-primary hover:border-primary/30 hover-lift"
              )}
            >
              {f === "all" && <><ListChecks size={13} /> الكل</>}
              {f === "paid" && <><CheckCircle2 size={13} /> مدفوعة</>}
              {f === "pending" && <><Clock size={13} /> قيد الانتظار</>}
              {f === "overdue" && <><AlertTriangle size={13} /> متأخرة</>}
            </button>
          ))}
        </div>

        {/* ── Display mode toggle: table / cards ── */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          <button
            onClick={() => setDisplayMode("table")}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
              displayMode === "table" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
            )}
            title="عرض جدول"
            aria-label="عرض جدول"
          >
            <BarChart3 size={14} className="rotate-90" />
          </button>
          <button
            onClick={() => setDisplayMode("cards")}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
              displayMode === "cards" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
            )}
            title="عرض بطاقات"
            aria-label="عرض بطاقات"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {/* ── Active warehouse filter indicator ── */}
      {warehouseFilter && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-xs font-bold text-primary">🏬 فلتر الفرع نشط</span>
          <button
            onClick={() => { setWarehouseFilter(""); localStorage.removeItem("garfix:selected-warehouse"); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕ إلغاء الفلتر
          </button>
        </div>
      )}
      <GarfixBulkActions
        selectedCount={selectedIds.size}
        totalCount={filteredInvoices.length}
        actions={[
          {
            label: bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد",
            icon: <Trash2 size={14} />,
            onClick: handleBulkDelete,
            variant: "danger",
          },
        ]}
        onClearSelection={() => setSelectedIds(new Set())}
        className="hover-lift"
      />

      {/* Table — DS v4.0 Enterprise Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm hover-lift">
        {loading ? (
          /* Loading State — DS v4.0 */
          <div className="p-8 md:p-12">
            <GarfixLoadingState message="جارٍ تحميل الفواتير..." size="lg" variant="skeleton" skeletonLines={5} />
          </div>
        ) : invoices.length === 0 ? (
          /* Empty State — DS v4.0 */
          <div className="p-8 md:p-12">
            <GarfixEmptyState
              title="لا توجد فواتير"
              description="ابدأ بإنشاء فاتورتك الأولى أو استيرادها من ملف Excel"
              illustration="documents"
              action={{
                label: "إنشاء فاتورة",
                onClick: () => setShowForm(true),
                variant: "primary",
              }}
              className="min-h-[350px]"
            />
            {/* AI Suggestion */}
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-ai-copilot'));
                  toast.info('اسأل GarfiX AI إنشاء فاتورة');
                }}
                className="ai-badge inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium hover-lift active-press focus-ring transition-all duration-120 cursor-pointer"
              >
                <span>✨</span>
                أنشئ بالـ AI
              </button>
            </div>
          </div>
        ) : (
          <>
          {/* Desktop Enterprise Table — DS v4.0 */}
          <div className="hidden md:block">
            <GarfixEnterpriseTable<Invoice>
              data={currentPageInvoices}
              columns={[
                {
                  key: 'invoiceNumber',
                  label: 'رقم الفاتورة',
                  pinned: true,
                  sortable: true,
                  render: (value) => (
                    <span className="font-bold font-mono text-xs">{value as string}</span>
                  ),
                },
                {
                  key: 'clientName',
                  label: 'العميل',
                  sortable: true,
                },
                {
                  key: 'issueDate',
                  label: 'تاريخ الإصدار',
                  sortable: true,
                  render: (value) => (
                    <span className="text-muted-foreground text-xs">{value as string}</span>
                  ),
                },
                {
                  key: 'total',
                  label: 'المبلغ',
                  sortable: true,
                  render: (value) => (
                    <span className="font-bold [direction:ltr] text-end block">
                      {Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                    </span>
                  ),
                },
                {
                  key: 'paid',
                  label: 'مدفوع',
                  render: (_value, row) => {
                    const paid = (row as Invoice).paid || 0;
                    return (
                      <span className={cn(
                        "[direction:ltr] text-end block text-xs",
                        paid > 0 ? "text-primary font-bold" : "text-muted-foreground/50"
                      )}>
                        {paid.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                      </span>
                    );
                  },
                },
                {
                  key: 'status',
                  label: 'الحالة',
                  render: (_value, row) => {
                    const inv = row as Invoice;
                    const st = STATUS_LABELS[inv.status] || { label: inv.status };
                    // Map status to DS v4.0 table-row-status variants
                    const statusClass = inv.status === 'paid' ? 'active' 
                      : inv.status === 'overdue' ? 'error'
                      : 'pending';
                    return (
                      <span className={`table-row-status ${statusClass}`}>
                        {st.label}
                      </span>
                    );
                  },
                },
                {
                  key: 'actions',
                  label: 'إجراءات',
                  render: (_value, row) => {
                    const inv = row as Invoice;
                    return (
                      <div className="flex gap-1">
                        <IconBtn title="معاينة" onClick={() => setPreviewInvoice(inv)} className="hover-lift active-press focus-ring">
                          <ArrowRight size={14} />
                        </IconBtn>
                        <IconBtn title="تسجيل دفعة" onClick={() => setPaymentInvoice(inv)} className="hover-lift active-press focus-ring">
                          <DollarSign size={14} />
                        </IconBtn>
                        <IconBtn title="تعديل" onClick={() => setEditing(inv)} className="hover-lift active-press focus-ring">
                          <Edit2 size={14} />
                        </IconBtn>
                        <IconBtn title="طباعة" onClick={() => handlePrint(inv)} className="hover-lift active-press focus-ring">
                          <Printer size={14} />
                        </IconBtn>
                        <IconBtn title="حذف" onClick={() => handleDelete(inv.id)} danger className="hover-lift active-press focus-ring">
                          <Trash2 size={14} />
                        </IconBtn>
                      </div>
                    );
                  },
                },
              ] as EnterpriseColumn<Invoice>[]}
              density="comfortable"
              selectedRows={new Set(currentPageInvoices.filter(inv => selectedIds.has(inv.id)).map((_, i) => i))}
              onSelectionChange={(newSelection) => {
                const newSelectedIds = new Set<number>();
                newSelection.forEach(idx => {
                  if (currentPageInvoices[idx]) {
                    newSelectedIds.add(currentPageInvoices[idx].id);
                  }
                });
                setSelectedIds(newSelectedIds);
              }}
              isLoading={loading}
              emptyMessage="لا توجد فواتير"
              emptyDescription="لم يتم العثور على فواتير مطابقة"
              rowStatus={(row) => {
                const inv = row as Invoice;
                if (inv.status === 'paid') return 'active';
                if (inv.status === 'overdue') return 'error';
                if (inv.status === 'sent' || inv.status === 'partial' || inv.status === 'draft') return 'pending';
                return undefined;
              }}
              onRowClick={(row) => setPreviewInvoice(row as Invoice)}
              className="garfix-scroll"
            />
          </div>

          {/* Mobile compact list — DS v4.0 with table-row-status badges */}
          <div className="md:hidden flex flex-col divide-y divide-border pb-[var(--ai-bubble-safe-area)]">
            {currentPageInvoices.map((inv) => {
              const st = STATUS_LABELS[inv.status] || { label: inv.status };
              const checked = selectedIds.has(inv.id);
              // Map status to DS v4.0 table-row-status variants
              const statusClass = inv.status === 'paid' ? 'active' 
                : inv.status === 'overdue' ? 'error'
                : 'pending';
              return (
                <div
                  key={inv.id}
                  onClick={() => setPreviewInvoice(inv)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all duration-120 min-h-[56px] hover-lift active-press",
                    checked ? "bg-primary/5" : "bg-card hover:bg-muted/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRow(inv.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer w-4 h-4 shrink-0 accent-primary"
                    aria-label={`تحديد الفاتورة ${inv.invoiceNumber}`}
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold font-mono text-[13px] truncate leading-tight">{inv.invoiceNumber}</span>
                      {/* DS v4.0 Status Badge */}
                      <span className={`table-row-status ${statusClass} text-[10px]`}>
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

          {/* Pagination footer — DS v4.0 */}
          <div className="flex flex-wrap justify-between items-center py-3 px-4 border-t border-border gap-2">
            <span className="text-[12px] text-muted-foreground">
              عرض {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredInvoices.length)} من {filteredInvoices.length} فاتورة
              {statusFilter !== "all" && <span className="text-muted-foreground/70"> (مُصفّاة من {invoices.length})</span>}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className={cn(pageBtnStyle(safePage === 1), "transition-all duration-150 active-press focus-ring")}
              >السابق</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
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
                        className={cn(pageNumStyle(p === safePage), "transition-all duration-150 active-press focus-ring")}
                      >{p}</button>
                    </span>
                  );
                })}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className={cn(pageBtnStyle(safePage === totalPages), "transition-all duration-150 active-press focus-ring")}
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
          onPaid={() => { setPaymentInvoice(null); invoicesQuery.refetch(); }}
        />
      )}

      {/* Task 14: ReviewQueueModal — opened from the persistent warnings banner. */}
      {showReviewQueue && activeCompany && (
        <LazyReviewQueueModal
          companySlug={activeCompany.slug}
          onClose={() => setShowReviewQueue(false)}
        />
      )}
    </div>
  );
}

// DS v4.0 Icon Button Style — with motion timing
const iconBtnStyle = "w-7 h-7 rounded-lg bg-transparent border border-border cursor-pointer flex items-center justify-center transition-all duration-120 hover-lift active-press focus-ring hover:border-primary/30 hover:bg-primary/5";

// Icon Button Component — DS v4.0
function IconBtn({ children, title, onClick, danger, className, "aria-label": ariaLabel }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean; className?: string; "aria-label"?: string }) {
  return (
    <button
      title={title}
      aria-label={ariaLabel || title}
      onClick={onClick}
      className={cn(iconBtnStyle, danger ? "text-destructive hover:bg-destructive/10 hover:border-destructive/30" : "text-muted-foreground", className)}
    >
      {children}
    </button>
  );
}

// DS v4.0 Pagination Button Styles — with motion timing
const pageBtnStyle = (disabled: boolean): string =>
  disabled
    ? "py-1.5 px-3 rounded-lg bg-transparent text-muted-foreground/50 border border-border text-[12px] font-bold cursor-not-allowed opacity-50"
    : "py-1.5 px-3 rounded-lg bg-card text-foreground border border-border text-[12px] font-bold cursor-pointer hover-lift active-press focus-ring transition-all duration-120 hover:bg-primary/5 hover:border-primary/30";

const pageNumStyle = (active: boolean): string =>
  active
    ? "min-w-[32px] py-1.5 px-2 rounded-lg bg-primary text-primary-foreground border border-primary text-[12px] font-bold cursor-pointer transition-all duration-150 hover-lift active-press shadow-sm"
    : "min-w-[32px] py-1.5 px-2 rounded-lg bg-card text-foreground border border-border text-[12px] font-bold cursor-pointer hover-lift active-press focus-ring transition-all duration-120 hover:bg-primary/5 hover:border-primary/30";

// ─── Invoice Form ──────────────────────────────────────────────────────────

function InvoiceForm({
  company, editing, onClose, onSaved,
}: {
  company: { slug: string; name: string; nameAr?: string | null; defaultTaxRate: string; currency: string; vatNumber?: string | null; email?: string | null; phone?: string | null; address?: string | null };
  editing: Invoice | null;
  onClose: () => void;
  onSaved: (reviewQueueWarnings: string[], inventoryWarnings?: string[]) => void;
}) {
  const createInvoiceMutation = useCreateInvoice();
  const updateInvoiceMutation = useUpdateInvoice();
  const updateInvoiceStatusMutation = useUpdateInvoiceStatus();

  const [invoiceNumber, setInvoiceNumber] = useState(editing?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`);
  const [clientName, setClientName] = useState(editing?.clientName || "");
  const [clientEmail, setClientEmail] = useState(editing?.clientEmail || "");
  const [clientPhone, setClientPhone] = useState(editing?.clientPhone || "");
  const [clientAddress, setClientAddress] = useState(editing?.clientAddress || "");
  const [issueDate, setIssueDate] = useState(editing?.issueDate || todayStr());
  const [dueDate, setDueDate] = useState(editing?.dueDate || addDaysStr(30));
  const [status, setStatus] = useState(editing?.status || "draft");
  const [lineItems, setLineItems] = useState<EditableLineItem[]>(
    editing?.lineItems?.length
      ? editing.lineItems.map((it) => ({ ...it, localId: makeLineLocalId() }))
      : [{ description: "", qty: 1, price: 0, localId: makeLineLocalId() }]
  );
  const [taxRate, setTaxRate] = useState(editing?.taxRate ?? parseFloat(company.defaultTaxRate || "0"));
  const [shipping, setShipping] = useState(editing?.shipping ?? 0);
  const [discount, setDiscount] = useState(editing?.discount ?? 0);
  const [notes, setNotes] = useState(editing?.notes || "");
  const [saving, setSaving] = useState(false);
  
  // 🆕 Product Picker State
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogIndex, setCreateDialogIndex] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Record<number, ProductOption>>({});

  const updateItem = (i: number, field: keyof EditableLineItem, value: string | number) => {
    setLineItems((items) => items.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, [field]: value };
      if (field === "qty" || field === "price") {
        next.total = Number(next.qty) * Number(next.price);
      }
      return next;
    }));
  };
  const addItem = () => setLineItems((items) => [...items, { description: "", qty: 1, price: 0, localId: makeLineLocalId() }]);
  const removeItem = (i: number) => setLineItems((items) => items.filter((_, idx) => idx !== i));
  
  // 🆕 Handle product selection
  const handleProductSelect = (index: number, product: ProductOption | null) => {
    if (product) {
      setSelectedProducts(prev => ({ ...prev, [index]: product }));
      updateItem(index, "description", product.name);
      if (product.sellingPrice != null) {
        updateItem(index, "price", product.sellingPrice);
      }
    } else {
      setSelectedProducts(prev => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };
  
  // 🆕 Handle quick create
  const handleOpenCreateDialog = (index: number) => {
    setCreateDialogIndex(index);
    setShowCreateDialog(true);
  };
  
  const handleProductCreated = (product: any) => {
    if (createDialogIndex !== null) {
      handleProductSelect(createDialogIndex, product as ProductOption);
    }
  };

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
        // P0 FIX: strip client-only `localId` before sending to API — backend
        // expects the canonical LineItem shape (description/qty/price/total).
        lineItems: lineItems
          .filter((it) => it.description || it.qty || it.price)
          .map(({ localId: _localId, ...rest }) => rest),
        taxRate, shipping, discount, notes,
        expectedVersion: editing?.version,
      };
      if (!isEdit) {
        payload.status = status;
      }

      let createdWarnings: string[] = [];
      let createdInventoryWarnings: string[] = [];

      if (isEdit) {
        await updateInvoiceMutation.mutateAsync({ id: editing!.id, ...payload });
      } else {
        const result = await createInvoiceMutation.mutateAsync(payload as CreateInvoicePayload);
        // Task 14: capture review-queue / oversell warnings from POST /api/invoices.
        if (Array.isArray(result.reviewQueueWarnings)) {
          createdWarnings = result.reviewQueueWarnings;
        }
        if (Array.isArray(result.warnings)) {
          createdInventoryWarnings = result.warnings;
        }
      }

      // For edits: if the user changed the status to an operational status,
      // route it through the dedicated /status endpoint (writes an audit
      // trail). paid/partial are blocked there and must go via /payment.
      if (isEdit && editing!.status !== status) {
        try {
          await updateInvoiceStatusMutation.mutateAsync({ id: editing!.id, status });
        } catch (statusErr) {
          if (status === "paid" || status === "partial") {
            toast.error("لتسجيل دفعة استخدم زر «تسجيل دفعة» (يتطلب صلاحية مالية)");
          } else {
            throw statusErr;
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
            // P0 FIX: stable key from localId (unique per line, survives
            // edits/reorders/duplicate products). Previous `key={i}` and the
            // interim composite key both had collision bugs — see EditableLineItem.
            <div key={it.localId} className="grid grid-cols-1 sm:grid-cols-[1.5fr_80px_100px_110px_32px] gap-2 items-center">
              {/* 🆕 Product Picker instead of plain input */}
              <ProductPicker
                companySlug={company.slug}
                value={selectedProducts[i] || null}
                onChange={(product) => handleProductSelect(i, product)}
                onDescriptionChange={(desc) => updateItem(i, "description", desc)}
                onCreateNew={() => handleOpenCreateDialog(i)}
                placeholder="🔍 ابحث عن منتج أو اكتب اسم جديد..."
                showStock
                showPrice
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

      {/* 🆕 Quick Create Product Dialog */}
      <QuickCreateProductDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        companySlug={company.slug}
        initialData={
          createDialogIndex !== null
            ? {
                name: lineItems[createDialogIndex]?.description,
                sellingPrice: lineItems[createDialogIndex]?.price,
              }
            : undefined
        }
        onCreated={handleProductCreated}
      />
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
        <div className="flex justify-between items-start mb-8 pb-5 border-b-2 border-[#047857]">
          <div>
            <h1 className="text-[28px] font-black text-[#047857]">{company.nameAr || company.name}</h1>
            <div className="text-[13px] text-[#666] mt-1">{company.address || ""}</div>
            <div className="text-[13px] text-[#666]">{company.phone || ""} • {company.email || ""}</div>
            {company.vatNumber && <div className="text-[13px] text-[#666]">الرقم الضريبي: {company.vatNumber}</div>}
          </div>
          <div className="text-end">
            <div className="text-[32px] font-black text-[#047857]">فاتورة</div>
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
              // P2-B FIX: prefer localId (set on editable items) so duplicate
              // line items (same description+qty+price) don't collide.
              // For read-only DB-sourced items without localId, fall back to
              // the optional `id` field, then the index — read-only view has
              // no input bindings to lose, so index fallback is safe here.
              <tr key={(it as EditableLineItem).localId || it.id || `print-item-${i}`} className="border-b border-[#e5e7eb]">
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
            <div className="flex justify-between py-2.5 border-t-2 border-[#047857] mt-1.5 text-[16px] font-black text-[#047857]">
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

        <div className="no-print flex flex-wrap gap-2.5 justify-end mt-8 pt-5 border-t border-[#e5e7eb]">
          <EInvoiceSubmitButton
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            variant="default"
          />
          {onRecordPayment && (
            <button onClick={onRecordPayment} className="py-2.5 px-5 rounded-sm bg-[#10b981] text-white border-none text-[13px] font-bold cursor-pointer inline-flex items-center gap-1.5">
              <DollarSign size={14} /> تسجيل دفعة
            </button>
          )}
          <button onClick={() => window.print()} className="py-2.5 px-5 rounded-sm bg-[#047857] text-white border-none text-[13px] font-bold cursor-pointer inline-flex items-center gap-1.5">
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
  const recordPaymentMutation = useRecordPayment();

  const handleSave = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }
    recordPaymentMutation.mutate(
      { id: invoice.id, amount: amt, date: new Date().toISOString().slice(0, 10), method },
      {
        onSuccess: () => { toast.success("تم تسجيل الدفعة بنجاح"); onPaid(); },
        onError: (err: any) => {
          if (err.status === 403) {
            toast.error("ليس لديك صلاحية مالية (finance_access) لتسجيل الدفعات");
          } else {
            toast.error(err.message || "تعذّر تسجيل الدفعة");
          }
        },
      },
    );
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
            disabled={recordPaymentMutation.isPending}
            className="py-2 px-5 rounded-sm bg-[#10b981] text-white border-none text-[13px] font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <DollarSign size={14} /> {recordPaymentMutation.isPending ? "جارٍ الحفظ…" : "تأكيد الدفعة"}
          </button>
        </div>
      </div>
    </div>
  );
}
