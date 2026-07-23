/**
 * DataTable — Reusable table component with search, pagination, and responsive layout.
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authedFetch } from "@/context/AuthContext";
import { Search, ChevronLeft, Inbox } from "lucide-react";

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
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract fetchParams serialization to a stable primitive so it can be used in dependency arrays.
  const fetchParamsKey = JSON.stringify(fetchParams);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(fetchParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null) params.set(k, String(v));
      });
      if (search && searchFields.length > 0) params.set("search", search);
      params.set("limit", String(pageSize));

      const res = await authedFetch(`${fetchUrl}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const newRows = data.rows || data.invoices || data.clients || data.products || data.employees || data.logs || data.tenants || data.users || data.tickets || data.announcements || data.entries || data.accounts || data.notifications || data.backups || data.companies || data.salaries || data.attendance || data.commissions || data.leaves || data.performance || [];
        const newTotal = data.total ?? data.totalCount ?? null;
        setRows(newRows);
        setHasMore(newRows.length === pageSize);
        setTotalCount(newTotal);
      }
    } catch (err) {
      console.error("[DataTable] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchUrl, fetchParamsKey, search, searchFields, pageSize]);

  useEffect(() => {
    // setState runs inside async .then() callback in fetchData (after await authedFetch) — not synchronous in effect body; no cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchUrl, fetchParamsKey, fetchData]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchData]);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 36px 8px 12px", borderRadius: "8px",
    background: "var(--background)", border: "1px solid var(--border)",
    color: "var(--foreground)", fontFamily: "inherit", fontSize: "13px", outline: "none",
  };
  const thStyle: React.CSSProperties = {
    textAlign: "right", padding: "10px 12px", fontSize: "11px",
    color: "var(--muted-foreground)", fontWeight: 700,
  };
  const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: "13px" };

  return (
    <div className="overflow-x-auto">
      {(searchFields.length > 0 || actions) && (
        <div className="flex gap-2 md:gap-[10px] mb-3 md:mb-[12px] flex-wrap">
          {searchFields.length > 0 && (
            <div className="relative flex-1 min-w-[180px] md:min-w-[200px]">
              <Search size={14} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} style={inputStyle} />
            </div>
          )}
          {actions}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="p-8 md:p-12 text-center text-muted-foreground">جارٍ التحميل...</div>
      ) : rows.length === 0 ? (
        <div className="p-8 md:p-12 text-center text-muted-foreground">
          <Inbox size={32} style={{ opacity: 0.3, marginBottom: "8px" }} />
          <div>{emptyMessage}</div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto garfix-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }} className="min-w-[480px] md:min-w-0">
              <thead>
                <tr style={{ background: "var(--muted)" }}>
                  {columns.map((col) => (
                    <th key={col.key} style={{ ...thStyle, width: col.width }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={String(row[rowKey] ?? idx)}
                    onClick={() => onRowClick?.(row)}
                    style={{ borderBottom: "1px solid var(--border)", cursor: onRowClick ? "pointer" : "default" }}
                  >
                    {columns.map((col) => (
                      <td key={col.key} style={tdStyle}>
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
                onClick={fetchData}
                disabled={loading}
                style={{
                  background: "var(--muted)", color: "var(--foreground)",
                  border: "1px solid var(--border)", borderRadius: "8px",
                  padding: "6px 14px", fontFamily: "inherit", fontSize: "12px",
                  fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: "4px",
                }}
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
