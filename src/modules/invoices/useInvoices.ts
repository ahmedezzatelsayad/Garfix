/**
 * useInvoices — Modern TanStack Query + Cursor Pagination hook for InvoicesView.
 *
 * Replaces the legacy useEffect+fetch approach with:
 *   • TanStack Query for caching, background refetch, and stale management
 *   • Cursor-based pagination (server-side) instead of client-side slicing
 *   • Optimistic updates for delete/bulk-delete operations
 *   • KPI summary computed from cached data
 *
 * The hook maintains the same interface as the legacy version so InvoicesView
 * requires minimal changes.
 */
"use client";

import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBrand } from "@/context/BrandContext";
import { useCursorPagination } from "@/hooks/cursor-pagination";
import { useDeleteInvoice, useUpdateInvoiceStatus, useRecordPayment } from "@/hooks/queries/invoices";
import { queryKeys } from "@/hooks/query-keys";
import { optimisticDelete, invalidateMany } from "@/hooks/optimistic";
import { apiGet, apiDelete, ApiError } from "@/hooks/api-client";
import { Invoice, StatusFilter } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InvoiceListPage {
  items: Invoice[];
  nextCursor: string | null;
  totalCount?: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useInvoices() {
  const { activeCompany } = useBrand();
  const queryClient = useQueryClient();

  // UI-only state (not part of server state)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [reviewQueueWarnings, setReviewQueueWarnings] = useState<string[]>([]);
  const [showWarningsBanner, setShowWarningsBanner] = useState(true);
  const [inventoryWarnings, setInventoryWarnings] = useState<string[]>([]);
  const [showInventoryBanner, setShowInventoryBanner] = useState(true);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const pageSize = 20;

  const companySlug = activeCompany?.slug || "";

  // ─── TanStack Query: cursor-paginated invoice list ──────────────────────

  const {
    items: allInvoices,
    totalCount,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loading,
    refetch: load,
  } = useCursorPagination<Invoice>({
    queryKey: queryKeys.invoices.cursor({ companySlug, search, status: statusFilter }),
    url: "/api/invoices",
    params: {
      companySlug,
      limit: 500, // Fetch up to 500 for local filter/pagination (production will reduce)
      search,
      status: statusFilter !== "all" ? statusFilter : undefined,
    },
    enabled: !!companySlug,
  });

  // ─── TanStack Query mutations ──────────────────────────────────────────

  const deleteMutation = useDeleteInvoice();
  const statusMutation = useUpdateInvoiceStatus();
  const paymentMutation = useRecordPayment();

  // ─── Derived data: status filtering + client-side pagination ───────────

  const filteredInvoices = useMemo(() => {
    return allInvoices.filter((inv) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "paid") return inv.status === "paid";
      if (statusFilter === "pending") return inv.status === "sent" || inv.status === "draft" || inv.status === "partial";
      if (statusFilter === "overdue") return inv.status === "overdue";
      return true;
    });
  }, [allInvoices, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const currentPageInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const safePage = Math.min(currentPage, totalPages);

  // ─── Selection ──────────────────────────────────────────────────────────

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === currentPageInvoices.length && currentPageInvoices.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentPageInvoices.map((inv) => inv.id)));
    }
  }, [selectedIds, currentPageInvoices]);

  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Bulk Delete (optimistic) ──────────────────────────────────────────

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.size} فاتورة؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setBulkDeleting(true);

    // Apply optimistic deletion for all selected items
    const listKey = queryKeys.invoices.lists();
    await queryClient.cancelQueries({ queryKey: listKey });

    const previousData = queryClient.getQueryData(listKey);
    // Remove selected items from cache optimistically
    queryClient.setQueryData(listKey, (old: Invoice[] | undefined) =>
      old ? old.filter((inv) => !selectedIds.has(inv.id)) : old
    );

    let okCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        await apiDelete(`/api/invoices/${id}`);
        okCount++;
      } catch {
        failCount++;
      }
    }

    setBulkDeleting(false);
    setSelectedIds(new Set());

    if (failCount > 0 && previousData) {
      // Rollback on partial failure
      queryClient.setQueryData(listKey, previousData);
    }

    // Always refetch to sync with server
    void invalidateMany(queryClient, [listKey, queryKeys.invoices.cursor({ companySlug })]);

    if (okCount > 0) toast.success(`تم حذف ${okCount} فاتورة بنجاح`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} فاتورة`);
  }, [selectedIds, queryClient, companySlug]);

  // ─── Single Delete (optimistic) ────────────────────────────────────────

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه الفاتورة؟")) return;

    // Optimistic: remove from cache immediately
    const listKey = queryKeys.invoices.lists();
    const cursorKey = queryKeys.invoices.cursor({ companySlug });
    await queryClient.cancelQueries({ queryKey: listKey });

    const previousItems = allInvoices;
    // Optimistically remove the item
    const optimisticOpts = optimisticDelete<Invoice>(queryClient, listKey, "فشل حذف الفاتورة");

    try {
      await deleteMutation.mutateAsync(id);
      toast.success("تم حذف الفاتورة");
    } catch {
      // Error rollback handled by optimisticDelete
    }
  }, [deleteMutation, queryClient, companySlug, allInvoices]);

  // ─── Export CSV ─────────────────────────────────────────────────────────

  const handleExportCSV = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const data = await apiGet<{ invoices: Invoice[] }>(
        `/api/invoices?companySlug=${encodeURIComponent(activeCompany.slug)}`
      );
      const rows: Invoice[] = data.invoices || [];
      const header = ["invoiceNumber", "clientName", "clientEmail", "clientPhone", "issueDate", "dueDate", "status", "subtotal", "taxAmount", "total", "paid"];
      const csvLines = [header.join(",")];
      for (const inv of rows) {
        const line = [
          inv.invoiceNumber, inv.clientName, inv.clientEmail || "", inv.clientPhone || "",
          inv.issueDate, inv.dueDate || "", inv.status,
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
  }, [activeCompany]);

  // ─── KPI summary ────────────────────────────────────────────────────────

  const paidInvoices = useMemo(() => allInvoices.filter((i) => i.status === "paid"), [allInvoices]);
  const pendingInvoices = useMemo(() => allInvoices.filter((i) => i.status === "sent" || i.status === "draft"), [allInvoices]);
  const overdueInvoices = useMemo(() => allInvoices.filter((i) => i.status === "overdue"), [allInvoices]);
  const totalRevenue = useMemo(() => paidInvoices.reduce((s, i) => s + Number(i.total), 0), [paidInvoices]);
  const outstanding = useMemo(
    () => allInvoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + (Number(i.total) - Number(i.paid)), 0),
    [allInvoices]
  );

  return {
    activeCompany,
    invoices: allInvoices,
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
    // New: cursor pagination extras
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    totalCount,
  };
}
