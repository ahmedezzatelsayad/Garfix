/**
 * DataTable — Reusable table component with search, pagination, and responsive layout.
 *
 * Uses TanStack Query for data fetching via the apiGet helper. The query key
 * includes the fetchUrl, params, search text, and page size so cache is
 * correctly scoped per request.
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/hooks/api-client";
import { Search, ChevronLeft, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T = Record<string, unknown>> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  mobileHidden?: boolean;
}

interface DataTableProps {
  columns: Column[];
  fetchUrl: string;
  fetchParams?: Record<string, string | number | boolean | undefined>;
  rowKey: string;
  onRowClick?: (row: Record<string, unknown>) => void;
  searchPlaceholder?: string;
  searchFields?: string[];
  pageSize?: number;
  emptyMessage?: string;
  actions?: React.ReactNode;
}

export function DataTable({
  columns, fetchUrl, fetchParams = {}, rowKey, onRowClick,
  searchPlaceholder = "بحث...",
  searchFields = [],
  pageSize = 20,
  emptyMessage = "لا توجد بيانات",
  actions,
}: DataTableProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Extract fetchParams serialization to a stable primitive for query key
  const fetchParamsKey = JSON.stringify(fetchParams);

  // Use TanStack Query for data fetching
  const { data, isLoading, refetch } = useQuery<Record<string, unknown>, ApiError>({
    queryKey: ["datatable", fetchUrl, fetchParamsKey, debouncedSearch, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(fetchParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null) params.set(k, String(v));
      });
      if (debouncedSearch && searchFields.length > 0) params.set("search", debouncedSearch);
      params.set("limit", String(pageSize));

      return apiGet<Record<string, unknown>>(`${fetchUrl}?${params.toString()}`);
    },
  });

  // Derive rows from the response data
  const rows: Record<string, unknown>[] = (data
    ? (data.rows || data.invoices || data.clients || data.products || data.employees || data.logs || data.tenants || data.users || data.tickets || data.announcements || data.entries || data.accounts || data.notifications || data.backups || data.companies || data.salaries || data.attendance || data.commissions || data.leaves || data.performance || []) as Record<string, unknown>[]
    : []);
  const totalCount = (data?.total ?? data?.totalCount ?? null) as number | null;
  const hasMore = rows.length === pageSize;
  const loading = isLoading && rows.length === 0;

  const inputClass = "w-full py-2 pr-9 pl-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none";
  const thClass = "text-end px-3 py-2.5 text-[11px] text-[var(--muted-foreground)] font-bold";
  const tdClass = "px-3 py-2.5 text-[13px]";

  return (
    <div className="overflow-x-auto">
      {(searchFields.length > 0 || actions) && (
        <div className="flex gap-2 md:gap-[10px] mb-3 md:mb-[12px] flex-wrap">
          {searchFields.length > 0 && (
            <div className="relative flex-1 min-w-[180px] md:min-w-[200px]">
              <Search size={14} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className={inputClass} />
            </div>
          )}
          {actions}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="p-8 md:p-12 text-center text-muted-foreground">جارٍ التحميل...</div>
      ) : rows.length === 0 ? (
        <div className="p-8 md:p-12 text-center text-muted-foreground">
          <Inbox size={32} className="opacity-30 mb-2" />
          <div>{emptyMessage}</div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse min-w-[480px] md:min-w-0">
              <thead>
                <tr className="bg-[var(--muted)]">
                  {columns.map((col) => (
                    <th key={col.key} className={cn(thClass, col.width && `[width:${col.width}]`)}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={String(row[rowKey] ?? idx)}
                    onClick={() => onRowClick?.(row)}
                    className={cn("border-b border-[var(--border)]", onRowClick ? "cursor-pointer" : "cursor-default")}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={tdClass}>
                        {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-3 md:mt-[12px] text-xs md:text-[12px] text-muted-foreground">
            <span>{rows.length} {totalCount ? `من ${totalCount}` : ""} سجل</span>
            {hasMore && (
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className="inline-flex items-center gap-1 py-1.5 px-3.5 rounded-lg bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] font-inherit text-xs font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "..." : "تحميل المزيد"} {!loading && <ChevronLeft size={12} />}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default DataTable;
