"use client";

import { useState, useEffect } from "react";
import { useClients, useDeleteClient, useBulkDeleteClients } from "@/hooks/queries";
import { toast } from "sonner";
import { Search, Users, Trash2, Edit2, Eye, Download, Upload, Plus, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client } from "./types";

interface ClientListProps {
  companySlug: string;
  onSelectClient: (id: number) => void;
  onAddNew: () => void;
  onEdit: (client: Client) => void;
  onImport: () => void;
}

const pageSize = 20;

const pageBtnStyle = (disabled: boolean): string =>
  disabled
    ? "py-1.5 px-3 rounded-[6px] bg-transparent text-gray-400 border border-gray-200 text-[12px] font-bold cursor-not-allowed opacity-50"
    : "py-1.5 px-3 rounded-[6px] bg-white text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer";

const pageNumStyle = (active: boolean): string =>
  active
    ? "min-w-[32px] py-1.5 px-2 rounded-[6px] bg-[#7C3AED] text-white border border-[#7C3AED] text-[12px] font-bold cursor-pointer transition-all duration-150"
    : "min-w-[32px] py-1.5 px-2 rounded-[6px] bg-transparent text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer transition-all duration-150";

export function ClientList({ companySlug, onSelectClient, onAddNew, onEdit, onImport }: ClientListProps) {
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

  const { data, isLoading, error } = useClients(companySlug, search || undefined);

  const deleteClient = useDeleteClient();
  const bulkDeleteClients = useBulkDeleteClients();

  const clients: Client[] = data?.clients || [];

  const totalPages = Math.max(1, Math.ceil(clients.length / pageSize));
  const currentPageClients = clients.slice((currentPage - 1) * pageSize, currentPage * pageSize);
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

  return (
    <div className="flex flex-col gap-4">
      {/* Title + primary action — stack vertically on mobile, row on desktop */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">العملاء</h1>
          <p className="text-[13px] text-gray-500">{clients.length} عميل</p>
        </div>
        <button
          onClick={onAddNew}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-[#7C3AED] text-white border-none text-[13px] font-bold cursor-pointer max-md:min-h-[44px] shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
        >
          <Plus size={16} /> عميل جديد
        </button>
      </div>

      {/* Filter / action bar — stack on mobile, row on desktop */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-[10px] bg-white text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer max-md:min-h-[44px] hover:bg-[#F5F3FF] hover:border-[#EDE9FE] transition-colors"
          >
            <Download size={14} /> تصدير CSV
          </button>
          <button
            onClick={onImport}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-[10px] bg-white text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer max-md:min-h-[44px] hover:bg-[#F5F3FF] hover:border-[#EDE9FE] transition-colors"
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
            className="w-full py-2.5 px-10 rounded-[10px] bg-white border border-gray-200 text-foreground text-[13px] outline-none max-md:min-h-[44px] focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#EDE9FE]"
          />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="py-2.5 px-4 bg-destructive text-white rounded-[10px] flex flex-wrap justify-between items-center gap-2">
          <span className="font-bold text-[13px]">{selectedIds.size} عميل محدد</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="bg-white/15 text-white border-none rounded-[6px] py-1.5 px-3.5 text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed"
            >إلغاء التحديد</button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-white/25 text-white border-none rounded-[6px] py-1.5 px-3.5 text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
            >{bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden shadow-card">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users size={36} className="opacity-30 mb-2 mx-auto" />
            <div>لا يوجد عملاء بعد</div>
          </div>
        ) : (
          <>
          {/* Desktop / tablet table */}
          <div className="hidden md:block overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-10 text-center py-2.5 px-2 text-[11px] text-gray-500">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === currentPageClients.length && currentPageClients.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer w-4 h-4 accent-[#7C3AED]"
                      aria-label="تحديد الكل"
                    />
                  </th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">الاسم</th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">البريد</th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">الهاتف</th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">الشركة</th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {currentPageClients.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectClient(c.id)}
                      className={cn(
                        "border-b border-gray-100 cursor-pointer transition-colors duration-100",
                        checked ? "bg-[#F5F3FF]" : "bg-transparent hover:bg-[#F5F3FF]/50",
                      )}
                    >
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(c.id)}
                          className="cursor-pointer w-4 h-4"
                          aria-label={`تحديد العميل ${c.name}`}
                        />
                      </td>
                      <td className="py-2.5 px-3 font-bold">{c.name}</td>
                      <td className="py-2.5 px-3 [direction:ltr] text-end">{c.email || "—"}</td>
                      <td className="py-2.5 px-3 [direction:ltr] text-end">{c.phone || "—"}</td>
                      <td className="py-2.5 px-3">{c.company || "—"}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectClient(c.id); }}
                            title="عرض الملف"
                            className="w-7 h-7 rounded-[6px] bg-transparent border border-gray-200 text-[#7C3AED] cursor-pointer flex items-center justify-center hover:bg-[#F5F3FF] hover:border-[#EDE9FE] transition-colors"
                          ><Eye size={14} /></button>
                          <button onClick={(e) => { e.stopPropagation(); onEdit(c); }} title="تعديل" className="w-7 h-7 rounded-[6px] bg-transparent border border-gray-200 text-gray-400 cursor-pointer flex items-center justify-center hover:bg-[#F5F3FF] hover:border-[#EDE9FE] transition-colors"><Edit2 size={14} /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} title="حذف" className="w-7 h-7 rounded-[6px] bg-transparent border border-gray-200 text-destructive cursor-pointer flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile compact list — 2-line items, tap to open detail. */}
          <div className="md:hidden flex flex-col divide-y divide-border pb-[var(--ai-bubble-safe-area)]">
            {currentPageClients.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => onSelectClient(c.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors duration-100 min-h-[56px]",
                    checked ? "bg-[#F5F3FF]" : "bg-white hover:bg-[#F5F3FF]/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRow(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer w-4 h-4 shrink-0"
                    aria-label={`تحديد العميل ${c.name}`}
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="font-bold text-[14px] truncate leading-tight">{c.name}</span>
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
          <div className="flex flex-wrap justify-between items-center py-3 px-4 border-t border-border gap-2">
            <span className="text-[12px] text-muted-foreground">
              عرض {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, clients.length)} من {clients.length} عميل
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className={pageBtnStyle(safePage === 1)}>السابق</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <span key={p} className="inline-flex items-center">
                      {showEllipsis && <span className="px-1 text-muted-foreground text-[12px]">…</span>}
                      <button onClick={() => setCurrentPage(p)} className={pageNumStyle(p === safePage)}>{p}</button>
                    </span>
                  );
                })}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={pageBtnStyle(safePage === totalPages)}>التالي</button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
