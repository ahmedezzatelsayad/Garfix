import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Invoice, StatusFilter } from "./types";

export function useInvoices() {
  const { activeCompany } = useBrand();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Task 14: persistent review-queue / oversell warnings banner state.
  // Survives the InvoiceForm closing because warnings are lifted up to here
  // via the onSaved(createdWarnings) callback. Cleared only on explicit dismiss.
  const [reviewQueueWarnings, setReviewQueueWarnings] = useState<string[]>([]);
  const [showWarningsBanner, setShowWarningsBanner] = useState(true);
  // P1 FIX (QA audit): general inventory warnings (e.g. "No active warehouse")
  // shown as a separate amber alert, distinct from the red review-queue banner.
  const [inventoryWarnings, setInventoryWarnings] = useState<string[]>([]);
  const [showInventoryBanner, setShowInventoryBanner] = useState(true);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const pageSize = 20;

  const load = useCallback(async () => {
    if (!activeCompany) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url = `/api/invoices?companySlug=${encodeURIComponent(activeCompany.slug)}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
      const res = await authedFetch(url);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
        setCurrentPage(1);
        setSelectedIds(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, [activeCompany, search]);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Reset page when search or filter changes (render-time adjustment, no cascading render).
  const [prevSearch, setPrevSearch] = useState(search);
  const [prevFilter, setPrevFilter] = useState(statusFilter);
  if (search !== prevSearch || statusFilter !== prevFilter) {
    setPrevSearch(search);
    setPrevFilter(statusFilter);
    setCurrentPage(1);
  }

  // Apply status filter before pagination
  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "paid") return inv.status === "paid";
    if (statusFilter === "pending") return inv.status === "sent" || inv.status === "draft" || inv.status === "partial";
    if (statusFilter === "overdue") return inv.status === "overdue";
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const currentPageInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const safePage = Math.min(currentPage, totalPages);

  const toggleSelectAll = () => {
    if (selectedIds.size === currentPageInvoices.length && currentPageInvoices.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentPageInvoices.map((inv) => inv.id)));
    }
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
    if (selectedIds.size === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.size} فاتورة؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setBulkDeleting(true);
    let okCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        const res = await authedFetch(`/api/invoices/${id}`, { method: "DELETE" });
        if (res.ok) okCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تم حذف ${okCount} فاتورة بنجاح`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} فاتورة`);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه الفاتورة؟")) return;
    const res = await authedFetch(`/api/invoices/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("تم حذف الفاتورة");
      load();
    } else {
      toast.error("تعذّر الحذف");
    }
  };

  const handleExportCSV = async () => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/invoices?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (!res.ok) { toast.error("تعذّر جلب الفواتير"); return; }
      const data = await res.json();
      const rows: Invoice[] = data.invoices || [];
      const header = ["invoiceNumber", "clientName", "clientEmail", "clientPhone", "issueDate", "dueDate", "status", "subtotal", "taxAmount", "total", "paid"];
      const csvLines = [header.join(",")];
      for (const inv of rows) {
        const line = [
          inv.invoiceNumber, inv.clientName, inv.clientEmail || "", inv.clientPhone || "",
          inv.issueDate, inv.dueDate, inv.status,
          String(inv.subtotal), String(inv.taxAmount), String(inv.total), String(inv.paid),
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
        csvLines.push(line);
      }
      const csv = "\uFEFF" + csvLines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices-${activeCompany.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير ${rows.length} فاتورة`);
    } catch {
      toast.error("تعذّر التصدير");
    }
  };

  // KPI summary — computed from the current invoice list
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const pendingInvoices = invoices.filter((i) => i.status === "sent" || i.status === "draft");
  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const totalRevenue = paidInvoices.reduce((s, i) => s + Number(i.total), 0);
  const outstanding = invoices
    .filter((i) => i.status !== "paid" && i.status !== "cancelled")
    .reduce((s, i) => s + (Number(i.total) - Number(i.paid)), 0);
  return {
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
  };
}
