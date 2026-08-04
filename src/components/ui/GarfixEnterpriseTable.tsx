"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  Inbox,
  ArrowUpDown,
  Check,
  X,
  Pencil,
} from "lucide-react"

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EnterpriseColumn<T = Record<string, unknown>> {
  key: string
  label: string
  pinned?: boolean
  sortable?: boolean
  render?: (value: unknown, row: T, index: number) => React.ReactNode
}

export interface GarfixEnterpriseTableProps<T extends Record<string, unknown> = Record<string, unknown>> {
  data: T[]
  columns: EnterpriseColumn<T>[]
  density?: "compact" | "comfortable" | "default"
  onRowClick?: (row: T, index: number) => void
  selectedRows?: Set<number>
  onSelectionChange?: (selected: Set<number>) => void
  sortKey?: string
  sortDirection?: "asc" | "desc"
  onSortChange?: (key: string, direction: "asc" | "desc") => void
  isLoading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  rowStatus?: (row: T) => "active" | "pending" | "archived" | "error" | undefined
  className?: string
}

export interface BulkAction {
  label: string
  icon: React.ReactNode
  onClick: () => void
  variant?: "default" | "danger"
}

export interface GarfixBulkActionsProps {
  selectedCount: number
  totalCount?: number
  actions: BulkAction[]
  onClearSelection: () => void
  className?: string
}

export interface GarfixEditableCellProps {
  value: string | number
  onChange: (value: string) => void
  isEditing?: boolean
  onEditStart?: () => void
  onEditEnd?: () => void
  placeholder?: string
  type?: "text" | "number" | "email"
  className?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// SORTING INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SortIndicator({
  isActive,
  direction,
}: {
  isActive: boolean
  direction?: "asc" | "desc"
}) {
  if (!isActive) {
    return <ChevronsUpDown className="size-3.5 opacity-40" />
  }
  return direction === "asc" ? (
    <ChevronUp className="size-3.5 text-primary" />
  ) : (
    <ChevronDown className="size-3.5 text-primary" />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING SKELETON COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function TableSkeleton<T extends Record<string, unknown> = Record<string, unknown>>({ columns, rows = 5 }: { columns: EnterpriseColumn<T>[]; rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={`skeleton-${rowIndex}`}>
          {/* Selection column */}
          <td className="table-pin-left">
            <div className="state-skeleton h-4 w-4 rounded" />
          </td>
          {columns.map((col) => (
            <td
              key={col.key}
              className={cn(col.pinned && "table-pin-left")}
            >
              <div className="state-skeleton h-4 w-3/4 rounded" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY STATE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function TableEmptyState({
  message = "لا توجد بيانات",
  description = "لم يتم العثور على أي سجلات لعرضها",
}: {
  message?: string
  description?: string
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={100} className="!border-0">
          <div className="state-empty py-12">
            <Inbox className="size-16" />
            <h3>{message}</h3>
            <p>{description}</p>
          </div>
        </td>
      </tr>
    </tbody>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ROW STATUS BADGE
// ═══════════════════════════════════════════════════════════════════════════

function RowStatusBadge({ status }: { status: "active" | "pending" | "archived" | "error" }) {
  const labels: Record<string, string> = {
    active: "نشط",
    pending: "قيد الانتظار",
    archived: "مؤرشف",
    error: "خطأ",
  }

  const icons: Record<string, React.ReactNode> = {
    active: <Check className="size-3" />,
    pending: <Loader2 className="size-3 animate-spin" />,
    archived: <X className="size-3" />,
    error: <X className="size-3" />,
  }

  return (
    <span className={cn("table-row-status", status)}>
      {icons[status]}
      {labels[status]}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTERPRISE TABLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function GarfixEnterpriseTable<
  T extends Record<string, unknown> = Record<string, unknown>
>({
  data,
  columns,
  density = "default",
  onRowClick,
  selectedRows = new Set(),
  onSelectionChange,
  sortKey,
  sortDirection,
  onSortChange,
  isLoading = false,
  emptyMessage,
  emptyDescription,
  rowStatus,
  className,
}: GarfixEnterpriseTableProps<T>) {
  // Handle select all
  const allSelected = data.length > 0 && selectedRows.size === data.length
  const someSelected = selectedRows.size > 0 && !allSelected

  const handleSelectAll = () => {
    if (allSelected || someSelected) {
      onSelectionChange?.(new Set())
    } else {
      onSelectionChange?.(new Set(data.map((_, i) => i)))
    }
  }

  // Handle single row selection
  const handleSelectRow = (index: number) => {
    const newSelection = new Set(selectedRows)
    if (newSelection.has(index)) {
      newSelection.delete(index)
    } else {
      newSelection.add(index)
    }
    onSelectionChange?.(newSelection)
  }

  // Handle sort click
  const handleSortClick = (key: string) => {
    if (!onSortChange) return
    
    if (sortKey === key) {
      onSortChange(key, sortDirection === "asc" ? "desc" : "asc")
    } else {
      onSortChange(key, "asc")
    }
  }

  // Density class mapping
  const densityClass = {
    compact: "table-compact",
    comfortable: "table-comfortable",
    default: "",
  }[density]

  return (
    <div dir="rtl" className={cn("overflow-x-auto rounded-lg border border-border", className)}>
      <table className={cn("table-enterprise", densityClass)}>
        {/* Header */}
        <thead>
          <tr>
            {/* Selection column */}
            <th className="table-pin-left !w-12">
              <Checkbox
                checked={allSelected}
                ref={(ref) => {
                  if (ref && someSelected) {
                    (ref as HTMLButtonElement).dataset.state = "indeterminate"
                  }
                }}
                onCheckedChange={handleSelectAll}
                aria-label="تحديد الكل"
              />
            </th>

            {/* Column headers */}
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  col.pinned && "table-pin-left",
                  onSortChange && col.sortable !== false && "cursor-pointer select-none hover:text-foreground transition-colors"
                )}
                onClick={() => onSortChange && col.sortable !== false && handleSortClick(col.key)}
              >
                <div className="flex items-center gap-2">
                  <span>{col.label}</span>
                  {onSortChange && col.sortable !== false && (
                    <SortIndicator
                      isActive={sortKey === col.key}
                      direction={sortDirection}
                    />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        {isLoading ? (
          <TableSkeleton columns={columns} />
        ) : data.length === 0 ? (
          <TableEmptyState message={emptyMessage} description={emptyDescription} />
        ) : (
          <tbody>
            {data.map((row, rowIndex) => {
              const isSelected = selectedRows.has(rowIndex)
              const status = rowStatus ? rowStatus(row as T) : undefined

              return (
                <tr
                  key={rowIndex}
                  className={cn(
                    isSelected && "selected",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={() => onRowClick?.(row as T, rowIndex)}
                >
                  {/* Selection checkbox */}
                  <td className="table-pin-left">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleSelectRow(rowIndex)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`تحديد الصف ${rowIndex + 1}`}
                    />
                  </td>

                  {/* Data cells */}
                  {columns.map((col) => {
                    const value = row[col.key]
                    
                    return (
                      <td
                        key={`${rowIndex}-${col.key}`}
                        className={cn(col.pinned && "table-pin-left")}
                      >
                        {/* Status column special handling */}
                        {status && col.key === "status" ? (
                          <RowStatusBadge status={status} />
                        ) : col.render ? (
                          col.render(value, row as T, rowIndex)
                        ) : (
                          <span>{value != null ? String(value) : ""}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        )}
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK ACTIONS BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function GarfixBulkActions({
  selectedCount,
  totalCount,
  actions,
  onClearSelection,
  className,
}: GarfixBulkActionsProps) {
  if (selectedCount === 0) return null

  return (
    <div dir="rtl" className={cn("table-bulk-actions", className)}>
      <span className="table-bulk-actions-count">
        تم تحديد <strong>{selectedCount}</strong>
        {totalCount && ` من ${totalCount}`} عنصر
      </span>

      <div className="flex items-center gap-2">
        {actions.map((action, index) => (
          <button
            key={index}
            type="button"
            onClick={action.onClick}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150",
              action.variant === "danger"
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}

        <button
          type="button"
          onClick={onClearSelection}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <X className="size-4" />
          إلغاء التحديد
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EDITABLE CELL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function GarfixEditableCell({
  value,
  onChange,
  isEditing = false,
  onEditStart,
  onEditEnd,
  placeholder = "أدخل قيمة...",
  type = "text",
  className,
}: GarfixEditableCellProps) {
  const [internalValue, setInternalValue] = React.useState(String(value))
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Sync external value
  React.useEffect(() => {
    setInternalValue(String(value))
  }, [value])

  // Focus input when editing starts
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEditStart?.()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInternalValue(e.target.value)
    onChange(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onEditEnd?.()
    } else if (e.key === "Escape") {
      setInternalValue(String(value))
      onEditEnd?.()
    }
  }

  const handleBlur = () => {
    onEditEnd?.()
  }

  if (isEditing) {
    return (
      <div className={cn("table-editing", className)} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type={type}
          value={internalValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full bg-transparent border border-primary rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          dir="rtl"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group/cell flex items-center gap-2 cursor-text min-h-[1.5rem]",
        className
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onEditStart?.()}
    >
      <span className="truncate">{value}</span>
      <Pencil className="size-3.5 opacity-0 group-hover/cell:opacity-50 transition-opacity" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

// Default export
export default GarfixEnterpriseTable
