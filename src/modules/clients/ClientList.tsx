"use client";

import { useState, useEffect, useCallback } from "react";
import { useClients, useDeleteClient, useBulkDeleteClients } from "@/hooks/queries";
import { toast } from "sonner";
import { 
  Search, 
  Trash2, 
  Pencil, 
  Eye, 
  Download, 
  Upload, 
  Plus, 
  ChevronLeft,
  Users,
  Loader2 
} from "lucide-react";
import { cn, paginate } from "@/lib/utils";
import type { Client } from "./types";
import {
  GarfixEnterpriseTable,
  GarfixBulkActions,
  GarfixEmptyState,
  GarfixLoadingState,
  GarfixErrorState,
} from "@/components/ui/index-garfix-ds";

interface ClientListProps {
  companySlug: string;
  onSelectClient: (id: number) => void;
  onAddNew: () => void;
  onEdit: (client: Client) => void;
  onImport: () => void;
  onKpiStatsUpdate?: (stats: {
    totalClients: number;
    activeClients: number;
    newThisMonth: number;
    vipClients: number;
  }) => void;
}

const pageSize = 20;

// Status labels for clients
const CLIENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "نشط", className: "active" },
  inactive: { label: "غير نشط", className: "archived" },
  vip: { label: "VIP", className: "active" },
  new: { label: "جديد", className: "pending" },
};

export function ClientList({ 
  companySlug, 
  onSelectClient, 
  onAddNew, 
  onEdit, 
  onImport,
  onKpiStatsUpdate 
}: ClientListProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Reset page when search changes (render-time adjustment, no cascading render).
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setCurrentPage(1);
  }

  const { data, isLoading, error, refetch } = useClients(companySlug, search || undefined);

  const deleteClient = useDeleteClient();
  const bulkDeleteClients = useBulkDeleteClients();

  const clients: Client[] = data?.clients || [];

  // Update KPI stats when clients data changes
  useEffect(() => {
    if (onKpiStatsUpdate && clients.length >= 0) {
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      
      const newThisMonth = clients.filter(c => {
        if (!c.createdAt) return false;
        const created = new Date(c.createdAt);
        return created.getMonth() === thisMonth && created.getFullYear() === thisYear;
      }).length;

      // Count VIP/Active clients (simplified - in real app would come from API)
      const activeClients = Math.round(clients.length * 0.7); // Estimate
      const vipClients = Math.round(clients.length * 0.15); // Estimate

      onKpiStatsUpdate({
        totalClients: clients.length,
        activeClients,
        newThisMonth,
        vipClients,
      });
    }
  }, [clients, onKpiStatsUpdate]);

  const totalPages = Math.max(1, Math.ceil(clients.length / pageSize));
  const currentPageClients = paginate(clients, currentPage, pageSize);
  const safePage = Math.min(currentPage, totalPages);

  const toggleSelectAll = () => {
    if (selectedIds.size === currentPageClients.length && currentPageClients.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentPageClients.map((c) => c.id)));
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
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.size} عميل؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteClients.mutateAsync(Array.from(selectedIds));
      setSelectedIds(new Set());
      if (result.succeeded > 0) toast.success(`تم حذف ${result.succeeded} عميل بنجاح`);
      if (result.failed > 0) toast.error(`تعذّر حذف ${result.failed} عميل`);
    } catch {
      toast.error("تعذّر حذف العملاء");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("حذف هذا العميل؟")) return;
    try {
      await deleteClient.mutateAsync(id);
      toast.success("تم الحذف");
    } catch {
      toast.error("تعذّر الحذف");
    }
  };

  const handleExportCSV = () => {
    if (clients.length === 0) { toast.error("لا يوجد عملاء للتصدير"); return; }
    const header = ["name", "email", "phone", "company", "address"];
    const csvLines = [header.join(",")];
    for (const c of clients) {
      const line = [c.name, c.email || "", c.phone || "", c.company || "", c.address || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      csvLines.push(line);
    }
    const csv = "\uFEFF" + csvLines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-${companySlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${clients.length} عميل`);
  };

  // Surface API errors
  useEffect(() => {
    if (error) {
      toast.error(error.message || "تعذّر تحميل العملاء");
    }
  }, [error]);

  // ── Table Columns Definition (DS v4.0) ──────────────────────────────
  const columns = [
    { 
      key: 'name', 
      label: 'اسم العميل', 
      pinned: true,
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-semibold">{row.name as string}</span>
      )
    },
    { 
      key: 'email', 
      label: 'البريد الإلكتروني',
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="text-muted-foreground [direction:ltr] inline-block text-end" dir="ltr">
          {(row.email as string) || "—"}
        </span>
      )
    },
    { 
      key: 'phone', 
      label: 'الهاتف',
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="text-muted-foreground [direction:ltr] inline-block text-end" dir="ltr">
          {(row.phone as string) || "—"}
        </span>
      )
    },
    { 
      key: 'company', 
      label: 'الشركة',
      render: (_: unknown, row: Record<string, unknown>) => (
        <span>{(row.company as string) || "—"}</span>
      )
    },
    {
      key: 'actions',
      label: 'إجراءات',
      render: (_: unknown, row: Record<string, unknown>) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button 
            className="hover-scale p-1.5 rounded-md text-primary hover:bg-primary/10 transition-all duration-120"
            onClick={(e) => { e.stopPropagation(); onSelectClient(row.id as number); }}
            title="عرض الملف"
          >
            <Eye size={14} />
          </button>
          <button 
            className="hover-scale p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-all duration-120"
            onClick={(e) => { e.stopPropagation(); onEdit(row as Client); }}
            title="تعديل"
          >
            <Pencil size={14} />
          </button>
          <button 
            className="hover-scale p-1.5 rounded-md text-destructive hover:bg-destructive/10 transition-all duration-120"
            onClick={(e) => { e.stopPropagation(); handleDelete(row.id as number); }}
            title="حذف"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ];

  // Convert clients to record format for table
  const tableData = currentPageClients.map(c => ({ ...c }));

  // Handle retry on error
  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  // ── Loading State ───────────────────────────────────────────────────
  if (isLoading && clients.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {/* Header skeleton */}
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="state-skeleton h-8 w-32 rounded-md" />
            <div className="state-skeleton h-4 w-20 rounded-md" />
          </div>
          <div className="state-skeleton h-11 w-32 rounded-lg" />
        </div>
        {/* Table skeleton */}
        <GarfixLoadingState 
          variant="skeleton" 
          skeletonLines={6}
          message="جارٍ تحميل العملاء..."
        />
      </div>
    );
  }

  // ── Error State ─────────────────────────────────────────────────────
  if (error && clients.length === 0) {
    return (
      <GarfixErrorState
        title="تعذّر تحميل العملاء"
        message={error.message || "حدث خطأ أثناء تحميل بيانات العملاء. يرجى المحاولة مرة أخرى."}
        onRetry={handleRetry}
        retryLabel="إعادة المحاولة"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Title + primary action — stack vertically on mobile, row on desktop */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="kpi-icon-sm bg-primary/10 text-primary">
            <Users size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">العملاء</h1>
            <p className="text-[13px] text-muted-foreground">{clients.length} عميل</p>
          </div>
        </div>
        <button
          onClick={onAddNew}
          className="active-press touch-target inline-flex items-center justify-center gap-1.5 py-2.5 px-[18px] rounded-xl bg-primary text-primary-foreground border-none text-[13px] font-bold cursor-pointer shadow-glow-primary hover-scale transition-all duration-150"
        >
          <Plus size={16} /> عميل جديد
        </button>
      </div>

      {/* Filter / action bar — stack on mobile, row on desktop */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportCSV}
            className="active-press touch-target inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-card text-foreground border border-border text-[12px] font-bold cursor-pointer hover:bg-muted hover:border-primary/20 hover-scale transition-all duration-120"
          >
            <Download size={14} /> تصدير CSV
          </button>
          <button
            onClick={onImport}
            className="active-press touch-target inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-card text-foreground border border-border text-[12px] font-bold cursor-pointer hover:bg-muted hover:border-primary/20 hover-scale transition-all duration-120"
          >
            <Upload size={14} /> استيراد CSV
          </button>
        </div>
        <div className="relative flex-1 md:min-w-[260px]">
          <Search
            size={16}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            placeholder="بحث بالاسم أو البريد أو الهاتف…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="focus-right w-full py-2.5 px-10 rounded-xl bg-card border border-border text-foreground text-[13px] outline-none touch-target min-h-[44px] md:min-h-[unset] focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-150"
          />
        </div>
      </div>

      {/* Bulk Actions Bar (DS v4.0) */}
      <GarfixBulkActions
        selectedCount={selectedIds.size}
        totalCount={clients.length}
        actions={[
          {
            label: bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد",
            icon: bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />,
            onClick: handleBulkDelete,
            variant: "danger",
          },
        ]}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Empty State (DS v4.0) */}
      {!isLoading && clients.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8">
          <GarfixEmptyState
            illustration="users"
            title="لا يوجد عملاء بعد"
            description="ابدأ بإضافة أول عميل أو استيراد جهات الاتصال الخاصة بك"
            action={{
              label: "إضافة عميل جديد",
              onClick: onAddNew,
              variant: "primary",
            }}
          />
        </div>
      ) : (
        <>
          {/* Enterprise Table (DS v4.0) - Desktop */}
          <div className="hidden md:block">
            <GarfixEnterpriseTable
              data={tableData}
              columns={columns}
              density="default"
              onRowClick={(row) => onSelectClient(row.id as number)}
              selectedRows={new Set(currentPageClients.findIndex(c => selectedIds.has(c.id)).filter(i => i >= 0))}
              onSelectionChange={(indices) => {
                const newSelection = new Set<number>();
                indices.forEach(i => {
                  if (currentPageClients[i]) {
                    newSelection.add(currentPageClients[i].id);
                  }
                });
                setSelectedIds(newSelection);
              }}
              isLoading={isLoading}
              emptyMessage="لا يوجد عملاء"
              emptyDescription="جرب تغيير معايير البحث"
              className="garfix-scroll"
            />
          </div>

          {/* Mobile compact list — 2-line items, tap to open detail. */}
          <div className="md:hidden flex flex-col divide-y divide-border pb-[var(--ai-bubble-safe-area)] rounded-xl border border-border bg-card overflow-hidden">
            {currentPageClients.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => onSelectClient(c.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors duration-100 min-h-[56px] hover:bg-muted/50",
                    checked ? "bg-primary/5" : "",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRow(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer w-4 h-4 shrink-0 accent-primary"
                    aria-label={`تحديد العميل ${c.name}`}
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="font-bold text-[14px] truncate leading-tight text-foreground">{c.name}</span>
                    <span className="text-[12px] text-muted-foreground truncate leading-tight">
                      {c.company ? `${c.company} · ` : ""}<span className="[direction:ltr] inline-block">{c.phone || c.email || "—"}</span>
                    </span>
                  </div>
                  <ChevronLeft size={18} className="text-muted-foreground shrink-0" />
                </div>
              );
            })}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-wrap justify-between items-center py-3 px-4 border-t border-border gap-2 bg-card rounded-b-xl">
            <span className="text-[12px] text-muted-foreground">
              عرض {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, clients.length)} من {clients.length} عميل
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button 
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} 
                disabled={safePage === 1}
                className={cn(
                  "py-1.5 px-3 rounded-lg text-[12px] font-bold transition-all duration-150 touch-target min-h-[36px]",
                  safePage === 1 
                    ? "bg-transparent text-muted-foreground border border-border cursor-not-allowed opacity-50" 
                    : "bg-card text-foreground border border-border cursor-pointer hover:bg-muted hover:border-primary/20 hover-scale"
                )}
              >
                السابق
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <span key={p} className="inline-flex items-center">
                      {showEllipsis && <span className="px-1 text-muted-foreground text-[12px]">…</span>}
                      <button 
                        onClick={() => setCurrentPage(p)} 
                        className={cn(
                          "min-w-[32px] py-1.5 px-2 rounded-lg text-[12px] font-bold transition-all duration-150 touch-target min-h-[36px]",
                          p === safePage 
                            ? "bg-primary text-primary-foreground border border-primary cursor-pointer" 
                            : "bg-transparent text-foreground border border-border cursor-pointer hover:bg-muted hover:border-primary/20 hover-scale"
                        )}
                      >
                        {p}
                      </button>
                    </span>
                  );
                })}
              <button 
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} 
                disabled={safePage === totalPages}
                className={cn(
                  "py-1.5 px-3 rounded-lg text-[12px] font-bold transition-all duration-150 touch-target min-h-[36px]",
                  safePage === totalPages 
                    ? "bg-transparent text-muted-foreground border border-border cursor-not-allowed opacity-50" 
                    : "bg-card text-foreground border border-border cursor-pointer hover:bg-muted hover:border-primary/20 hover-scale"
                )}
              >
                التالي
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
