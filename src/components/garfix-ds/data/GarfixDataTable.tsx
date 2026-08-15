/**
 * GarfixDataTable.tsx — GarfiX DS v4.0 Data Table
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Sortable columns
 * - Selectable rows (checkbox)
 * - Row actions menu
 * - Pagination
 * - Empty state
 * - Loading skeleton
 * - Responsive: horizontal scroll on mobile
 * - RTL support
 * - Density control (compact, normal, comfortable)
 *
 * DESIGN TOKENS:
 * - Header bg: muted/50
 * - Row hover: subtle background change
 * - Selected row: primary/10
 * - Border: border-border
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GarfixButton } from "../core/GarfixButton";
import { GarfixInput } from "../core/GarfixInput";

// FE-07 FIX (Audit v2 · Phase 2)
// Accessibility hardening for the data table:
//   • <caption> element (visually hidden via `sr-only`) gives screen-reader
//     users an at-a-glance description of the table.
//   • scope="col" on every <th> so AT can announce header↔cell pairings.
//   • aria-sort="ascending|descending|none" on sortable columns so AT users
//     know the current sort state.
//   • tabIndex={0} + onKeyDown (Enter / Space) on sortable <th> and on
//     clickable <tr> so keyboard-only users can trigger the same handlers
//     as mouse users (WCAG 2.1 SC 2.1.1 Keyboard).
//   • aria-rowindex on every <tr> so AT can announce "row N of M".

// ── Types ───────────────────────────────────────────────────────────────

export type TableDensity = "compact" | "normal" | "comfortable";
export type SortDirection = "asc" | "desc" | null;

export interface Column<T> {
  key: string;
  header: string;
  render?: (value: T[keyof T], row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "start" | "center" | "end";
  className?: string;
}

export interface GarfixDataTableProps<T> {
  /** Data array */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Unique key extractor */
  rowKey: keyof T | ((row: T, index: number) => string);
  /** Row selection */
  selectable?: boolean;
  /** On selection change */
  onSelectionChange?: (selectedRows: T[]) => void;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Row actions */
  renderRowActions?: (row: T, index: number) => React.ReactNode;
  /** Table density */
  density?: TableDensity;
  /** Loading state */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Pagination */
  pagination?: {
    pageSize: number;
    currentPage: number;
    totalItems: number;
    onPageChange: (page: number) => void;
  };
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Custom class name */
  className?: string;
  /** Accessible caption (rendered inside <caption class="sr-only">).
   *  Defaults to an Arabic description of the table. */
  caption?: string;
}

// ── Density Styles ──────────────────────────────────────────────────────

const densityStyles: Record<TableDensity, { cell: string; header: string }> = {
  compact: { cell: "px-3 py-2 text-sm", header: "px-3 py-2.5 text-xs" },
  normal: { cell: "px-4 py-3 text-sm", header: "px-4 py-3.5 text-xs" },
  comfortable: { cell: "px-5 py-4 text-sm", header: "px-5 py-4 text-sm" },
};

// ── Component ───────────────────────────────────────────────────────────

export function GarfixDataTable<T extends Record<string, unknown>>({
  data,
  columns,
  rowKey,
  selectable = false,
  onSelectionChange,
  onRowClick,
  renderRowActions,
  density = "normal",
  isLoading = false,
  emptyMessage = "لا توجد بيانات",
  pagination,
  searchPlaceholder = "بحث...",
  className,
  caption = "جدول بيانات",
}: GarfixDataTableProps<T>) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;
    
    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal ?? "");
      const bStr = String(bVal ?? "");
      
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, "ar")
        : bStr.localeCompare(aStr, "ar");
    });
  }, [data, sortColumn, sortDirection]);

  // Filtering
  const filteredData = useMemo(() => {
    if (!searchQuery) return sortedData;
    
    const query = searchQuery.toLowerCase();
    return sortedData.filter(row =>
      columns.some(col => {
        const value = row[col.key];
        return String(value ?? "").toLowerCase().includes(query);
      })
    );
  }, [sortedData, searchQuery, columns]);

  // Selection handlers
  const toggleSelection = (key: string) => {
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedKeys(newSelected);
    onSelectionChange?.(
      filteredData.filter((_, i) => {
        const key = typeof rowKey === "function" ? rowKey(_, i) : String(_[rowKey]);
        return newSelected.has(key);
      })
    );
  };

  const toggleAll = () => {
    if (selectedKeys.size === filteredData.length) {
      setSelectedKeys(new Set());
      onSelectionChange?.([]);
    } else {
      const allKeys = filteredData.map((row, i) =>
        typeof rowKey === "function" ? rowKey(row, i) : String(row[rowKey])
      );
      setSelectedKeys(new Set(allKeys));
      onSelectionChange?.(filteredData);
    }
  };

  // Sort handler
  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
  };

  // FE-07 FIX (Audit v2 · Phase 2): keyboard activation for sortable <th>.
  // Mirrors the mouse `onClick` so keyboard-only users can sort columns.
  const handleSortKeyDown = (
    e: React.KeyboardEvent<HTMLTableCellElement>,
    columnKey: string,
    sortable?: boolean
  ) => {
    if (!sortable) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      handleSort(columnKey);
    }
  };

  // FE-07 FIX (Audit v2 · Phase 2): keyboard activation for clickable <tr>.
  // Mirrors `onRowClick` for keyboard users (WCAG 2.1 SC 2.1.1 Keyboard).
  const handleRowKeyDown = (
    e: React.KeyboardEvent<HTMLTableRowElement>,
    row: T,
    rowIndex: number
  ) => {
    if (!onRowClick) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onRowClick(row, rowIndex);
    }
  };

  // FE-07 FIX (Audit v2 · Phase 2): map internal sort state to the WAI-ARIA
  // `aria-sort` vocabulary so screen readers can announce it.
  const ariaSortFor = (col: Column<T>): "ascending" | "descending" | "none" | undefined => {
    if (!col.sortable) return undefined;
    if (sortColumn !== col.key || !sortDirection) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  };

  // Get row key
  const getRowKey = (row: T, index: number): string => {
    return typeof rowKey === "function" ? rowKey(row, index) : String(row[rowKey]);
  };

  const styles = densityStyles[density];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Search */}
        <GarfixInput
          leadingIcon={<Search className="h-4 w-4" />}
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="sm"
          className="max-w-xs"
        />
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          {selectable && selectedKeys.size > 0 && (
            <span className="text-sm text-muted-foreground">
              تم تحديد {selectedKeys.size.toLocaleString("ar-EG")}
            </span>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* FE-07 FIX (Audit v2 · Phase 2): accessible caption (visually hidden). */}
            <caption className="sr-only">{caption}</caption>
            {/* Header */}
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {selectable && (
                  <th
                    scope="col"
                    className={cn(styles.header, "w-12")}
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys.size === filteredData.length && filteredData.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      aria-label="تحديد الكل"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSortFor(col)}
                    onClick={() => col.sortable && handleSort(col.key)}
                    onKeyDown={(e) => handleSortKeyDown(e, col.key, col.sortable)}
                    tabIndex={col.sortable ? 0 : undefined}
                    role={col.sortable ? "button" : undefined}
                    className={cn(
                      styles.header,
                      "font-semibold text-foreground whitespace-nowrap",
                      col.align === "center" && "text-center",
                      col.align === "end" && "text-end",
                      col.sortable && "cursor-pointer select-none hover:bg-muted transition-colors duration-120",
                      col.className
                    )}
                    style={{ width: col.width }}
                  >
                    <div className={cn(
                      "flex items-center gap-1",
                      col.align === "center" && "justify-center",
                      col.align === "end" && "justify-end"
                    )}>
                      {col.header}
                      {col.sortable && (
                        <span className="text-muted-foreground">
                          {sortColumn === col.key ? (
                            sortDirection === "asc" ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                {renderRowActions && (
                  <th scope="col" className={cn(styles.header, "w-12")}></th>
                )}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {isLoading ? (
                // Loading Skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b border-border/50 animate-pulse">
                    {selectable && <td className={styles.cell}><div className="h-4 w-4 rounded bg-muted" /></td>}
                    {columns.map((col) => (
                      <td key={col.key} className={styles.cell}>
                        <div className="h-4 rounded bg-muted max-w-[150px]" />
                      </td>
                    ))}
                    {renderRowActions && <td className={styles.cell}><div className="h-6 w-6 rounded bg-muted" /></td>}
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                // Empty State
                <tr>
                  <td
                    colSpan={
                      columns.length +
                      (selectable ? 1 : 0) +
                      (renderRowActions ? 1 : 0)
                    }
                    className={cn(styles.cell, "text-center py-12")}
                  >
                    <div className="text-muted-foreground">
                      <p>{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                // Data Rows
                filteredData.map((row, rowIndex) => {
                  const key = getRowKey(row, rowIndex);
                  const isSelected = selectedKeys.has(key);

                  return (
                    <tr
                      key={key}
                      aria-rowindex={rowIndex + 1}
                      onClick={() => onRowClick?.(row, rowIndex)}
                      onKeyDown={(e) => handleRowKeyDown(e, row, rowIndex)}
                      tabIndex={onRowClick ? 0 : undefined}
                      className={cn(
                        "border-b border-border/50 transition-colors duration-120",
                        "hover:bg-muted/30",
                        isSelected && "bg-primary/5",
                        onRowClick && "cursor-pointer"
                      )}
                    >
                      {selectable && (
                        <td className={styles.cell}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelection(key);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            styles.cell,
                            col.align === "center" && "text-center",
                            col.align === "end" && "text-end",
                            col.className
                          )}
                        >
                          {col.render
                            ? col.render(row[col.key as keyof T], row, rowIndex)
                            : (row[col.key] as React.ReactNode) ?? "-"}
                        </td>
                      ))}
                      {renderRowActions && (
                        <td className={styles.cell}>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex justify-end"
                          >
                            {renderRowActions(row, rowIndex)}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalItems > 0 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            عرض {(pagination.currentPage - 1) * pagination.pageSize + 1} -{" "}
            {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)} من{" "}
            {pagination.totalItems.toLocaleString("ar-EG")}
          </p>
          
          <div className="flex items-center gap-2">
            <GarfixButton
              variant="outline"
              size="sm"
              disabled={pagination.currentPage <= 1}
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              السابق
            </GarfixButton>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.ceil(pagination.totalItems / pagination.pageSize) }).map((_, i) => {
                const page = i + 1;
                const isCurrent = page === pagination.currentPage;
                
                // Show first, last, current, and adjacent pages
                if (
                  page === 1 ||
                  page === Math.ceil(pagination.totalItems / pagination.pageSize) ||
                  Math.abs(page - pagination.currentPage) <= 1
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => pagination.onPageChange(page)}
                      className={cn(
                        "h-8 w-8 rounded-lg text-sm font-medium transition-colors duration-120",
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {page}
                    </button>
                  );
                } else if (Math.abs(page - pagination.currentPage) === 2) {
                  return <span key={page} className="text-muted-foreground">...</span>;
                }
                return null;
              })}
            </div>
            
            <GarfixButton
              variant="outline"
              size="sm"
              disabled={pagination.currentPage >= Math.ceil(pagination.totalItems / pagination.pageSize)}
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
            >
              التالي
              <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
            </GarfixButton>
          </div>
        </div>
      )}
    </div>
  );
}

GarfixDataTable.displayName = "GarfixDataTable";
