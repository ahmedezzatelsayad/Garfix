import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * GarfiX Empty State — Level 1 UI Delight
 * 
 * Friendly, illustrated empty states that guide users to action.
 * Replaces boring "No data" messages with helpful, delightful alternatives.
 * 
 * Usage:
 * <EmptyState
 *   icon={FileText}
 *   title="لا توجد فواتير"
 *   description="ابدأ بإنشاء فاتورتك الأولى أو استورد من ملف"
 *   action={{ label: "إنشاء فاتورة", onClick: handleCreate }}
 * />
 */

// ── SVG Illustrations ────────────────────────────────────────────────

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="20" width="100" height="65" rx="8" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 4"/>
      <path d="M10 30 L60 65 L110 30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="85" cy="55" r="18" fill="currentColor" opacity="0.1"/>
      <path d="M78 55L83 60L92 50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 25C10 21.686 12.686 19 16 19H44L54 29H104C107.314 29 110 31.686 110 35V79C110 82.314 107.314 85 104 85H16C12.686 85 10 82.314 10 79V25Z" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="75" cy="57" r="16" fill="currentColor" opacity="0.1"/>
      <path d="M69 57L73 61L81 53" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="52" cy="48" r="28" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M72 68L92 88" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M38 48H66M52 34V62" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="45" cy="32" r="16" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M15 82C15 67.641 26.641 56 41 56H49C63.359 56 75 67.641 75 82V86H15V82Z" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="85" cy="40" r="11" stroke="currentColor" strokeWidth="2.5" opacity="0.5"/>
      <path d="M64 82C64 72.061 71.611 64 81.5 64H88.5C98.389 64 106 72.061 106 82V86H64V82Z" stroke="currentColor" strokeWidth="2.5" opacity="0.5"/>
    </svg>
  )
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 15H70L90 35V85C90 87.761 87.761 90 85 90H35C32.239 90 30 87.761 30 85V15Z" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M70 15V35H90" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M42 50H78M42 62H68M42 74H58" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="55" width="18" height="30" rx="2" stroke="currentColor" strokeWidth="2.5"/>
      <rect x="42" y="35" width="18" height="50" rx="2" stroke="currentColor" strokeWidth="2.5"/>
      <rect x="69" y="20" width="18" height="65" rx="2" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M10 85H110" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="50" r="18" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M60 38V62M48 50H72" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M60 20L63 28H57L60 20ZM60 80L63 72H57L60 80ZM30 50L38 47V53L30 50ZM90 50L82 47V53L90 50Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
    </svg>
  )
}

// Icon map for easy usage
const illustrations = {
  inbox: InboxIcon,
  folder: FolderIcon,
  search: SearchIcon,
  users: UsersIcon,
  document: DocumentIcon,
  chart: ChartIcon,
  settings: SettingsIcon,
} as const

type IllustrationType = keyof typeof illustrations

// ── Empty State Component ─────────────────────────────────────────────

interface EmptyStateProps {
  /** Visual illustration type */
  illustration?: IllustrationType | React.ReactNode
  /** Custom icon (alternative to illustration) */
  icon?: React.ReactNode
  /** Main heading text */
  title: string
  /** Supporting description */
  description?: string
  /** Primary action button */
  action?: {
    label: string
    onClick: () => void
    variant?: "default" | "gradient" | "outline" | "secondary"
  }
  /** Secondary action link/text */
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  /** Additional content below actions */
  children?: React.ReactNode
  /** Custom class names */
  className?: string
  /** Compact variant for sidebars/small spaces */
  compact?: boolean
}

function EmptyState({
  illustration,
  icon,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
  compact = false,
}: EmptyStateProps) {
  // Render illustration or custom icon
  const renderVisual = () => {
    if (illustration) {
      if (typeof illustration === "string" && illustration in illustrations) {
        const IllustrationComponent = illustrations[illustration as IllustrationType]
        return (
          <div className={cn(
            "animate-float text-muted-foreground/60",
            compact ? "size-12" : "size-24 mb-4"
          )}>
            <IllustrationComponent className="size-full" />
          </div>
        )
      }
      return <div className={cn("mb-4", compact ? "size-12" : "size-24")}>{illustration}</div>
    }
    
    if (icon) {
      return (
        <div className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground mb-4",
          compact ? "size-12" : "size-16"
        )}>
          {icon}
        </div>
      )
    }
    
    return null
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-8 px-4 animate-fade-in empty-state-mobile",
        compact ? "py-4" : "py-12 md:py-16",
        className
      )}
      role="status"
      aria-label={`${title} - لا توجد بيانات`}
    >
      {/* Visual / Illustration */}
      {renderVisual()}

      {/* Title */}
      <h3 className={cn(
        "font-semibold text-foreground mt-2",
        compact ? "text-sm" : "text-lg"
      )}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={cn(
          "text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed",
          compact ? "text-xs" : "text-sm"
        )}>
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className={cn(
          "flex flex-col sm:flex-row items-center gap-3 mt-6",
          compact && "mt-4 gap-2"
        )}>
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant || "gradient"}
              size={compact ? "sm" : "default"}
              className="min-w-[140px] touch-lg haptic-medium sm:h-auto"
            >
              {action.label}
            </Button>
          )}
          
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={cn(
                "text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline touch-target haptic-light py-2",
                compact && "text-xs"
              )}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}

      {/* Additional content */}
      {children && (
        <div className="mt-6 w-full max-w-md">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Pre-configured Empty States for common use cases ──────────────────

/** No invoices yet */
function EmptyInvoices({ onCreate, onImport }: { onCreate?: () => void; onImport?: () => void }) {
  return (
    <EmptyState
      illustration="document"
      title="لا توجد فواتير بعد"
      description="ابدأ بإنشاء أول فاتورة لك أو استورد فواتيرك السابقة من ملف"
      action={onCreate ? { label: "إنشاء فاتورة جديدة", onClick: onCreate, variant: "gradient" } : undefined}
      secondaryAction={onImport ? { label: "استيراد من ملف", onClick: onImport } : undefined}
    />
  )
}

/** No clients/customers */
function EmptyClients({ onAdd, onInvite }: { onAdd?: () => void; onInvite?: () => void }) {
  return (
    <EmptyState
      illustration="users"
      title="لا يوجد عملاء بعد"
      description="أضف عميلك الأول لتبدأ إصدار الفواتير وتتبع المدفوعات"
      action={onAdd ? { label: "إضافة عميل جديد", onClick: onAdd } : undefined}
      secondaryAction={onInvite ? { label: "دعوة عميل بالبريد", onClick: onInvite } : undefined}
    />
  )
}

/** No products in catalog */
function EmptyCatalog({ onAdd, onImport }: { onAdd?: () => void; onImport?: () => void }) {
  return (
    <EmptyState
      illustration="folder"
      title="الكتالوغ فارغ"
      description="أضف منتجاتك أو خدماتك لاستخدامها بسهولة في الفواتير"
      action={onAdd ? { label: "إضافة منتج", onClick: onAdd } : undefined}
      secondaryAction={onImport ? { label: "استيراد كتالوغ", onClick: onImport } : undefined}
    />
  )
}

/** No search results */
function EmptySearch({ query, onClear }: { query?: string; onClear?: () => void }) {
  return (
    <EmptyState
      illustration="search"
      title={`لا توجد نتائج${query ? ` لـ "${query}"` : ""}`}
      description="جرب تغيير كلمات البحث أو استخدم فلتر مختلف"
      secondaryAction={onClear ? { label: "مسح البحث", onClick: onClear } : undefined}
      compact
    />
  )
}

/** No data/analytics available */
function EmptyAnalytics({ onConfigure }: { onConfigure?: () => void }) {
  return (
    <EmptyState
      illustration="chart"
      title="لا توجد بيانات تحليلية"
      description="سيظهر هنا رسم بياني عندما تتوفر بيانات كافية"
      action={onConfigure ? { label: "إعداد التقارير", onClick: onConfigure, variant: "outline" } : undefined}
    />
  )
}

/** Settings not configured */
function EmptySettings({ onConfigure }: { onConfigure?: () => void }) {
  return (
    <EmptyState
      illustration="settings"
      title="لم يتم الإعداد بعد"
      description="أكمل إعداداتك الأساسية للبدء في استخدام النظام بكامل قدراته"
      action={onConfigure ? { label: "بدء الإعداد", onClick: onConfigure } : undefined}
    />
  )
}

export {
  EmptyState,
  // Pre-configured variants
  EmptyInvoices,
  EmptyClients,
  EmptyCatalog,
  EmptySearch,
  EmptyAnalytics,
  EmptySettings,
  // Illustrations for custom use
  illustrations,
  type IllustrationType,
}
