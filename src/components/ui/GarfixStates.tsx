/**
 * GarfiX States Library — Design System v4.0
 *
 * ════════════════════════════════════════════════════════════════════════
 * مجموعة مكونات الحالات (State Components) لنظام GarfiX EOS
 * 
 * يتضمن:
 * - GarfixEmptyState: حالة الفراغ مع رسومات توضيحية
 * - GarfixLoadingState: حالة التحميل بمتغيرات متعددة
 * - GarfixErrorState: حالة الخطأ مع إمكانية إعادة المحاولة
 * - GarfixOfflineState: حالة عدم الاتصال بالإنترنت
 * - GarfixMaintenanceState: حالة الصيانة
 * - GarfixSkeleton: مكون هيكل عظمي قابل للتخصيص
 * 
 * يدعم: RTL | Dark Mode | TypeScript | Accessibility
 * ════════════════════════════════════════════════════════════════════════
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// ── Icons (lucide-react) ──────────────────────────────────────────────
import {
  FileText,
  Search,
  Inbox,
  FolderOpen,
  Users,
  AlertTriangle,
  AlertOctagon,
  WifiOff,
  Wrench,
  Settings,
  Loader2,
  RefreshCw,
} from "lucide-react"

// ════════════════════════════════════════════════════════════════════════
// 1. GARFIX EMPTY STATE — حالة الفراغ
// ════════════════════════════════════════════════════════════════════════

export interface EmptyStateProps {
  /** أيقونة مخصصة */
  icon?: React.ReactNode
  /** العنوان الرئيسي */
  title: string
  /** الوصف التفصيلي */
  description?: string
  /** زر الإجراء */
  action?: {
    label: string
    onClick: () => void
    variant?: "primary" | "secondary"
  }
  /** نوع الرسم التوضيحي */
  illustration?: "documents" | "search" | "inbox" | "folder" | "users"
  /** أسماء CSS إضافية */
  className?: string
}

// خريطة الرسومات التوضيحية
const illustrationIcons = {
  documents: FileText,
  search: Search,
  inbox: Inbox,
  folder: FolderOpen,
  users: Users,
}

export function GarfixEmptyState({
  icon,
  title,
  description,
  action,
  illustration = "documents",
  className,
}: EmptyStateProps) {
  // تحديد الأيقونة المراد عرضها
  const renderIcon = () => {
    if (icon) return icon
    
    const IllustrationIcon = illustrationIcons[illustration] || FileText
    return (
      <IllustrationIcon 
        className="animate-float size-16 text-muted-foreground/40" 
        strokeWidth={1.5}
      />
    )
  }

  // تحديد نمط الزر بناءً على المتغير
  const buttonVariant = action?.variant === "secondary" ? "secondary" : "default"

  return (
    <div
      className={cn("state-empty", className)}
      role="status"
      aria-label={`${title} - لا توجد بيانات`}
    >
      {/* الأيقونة / الرسم التوضيحي */}
      <div className="mb-4">
        {renderIcon()}
      </div>

      {/* العنوان */}
      <h3 className="text-lg font-semibold text-foreground">
        {title}
      </h3>

      {/* الوصف */}
      {description && (
        <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {/* زر الإجراء */}
      {action && (
        <div className="mt-6">
          <Button
            onClick={action.onClick}
            variant={buttonVariant}
            size="default"
            className="min-w-[140px]"
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 2. GARFIX LOADING STATE — حالة التحميل
// ════════════════════════════════════════════════════════════════════════

export interface LoadingStateProps {
  /** رسالة التحميل */
  message?: string
  /** حجم المؤشر */
  size?: "sm" | "md" | "lg"
  /** نوع التحميل */
  variant?: "spinner" | "skeleton" | "dots"
  /** ملء الشاشة بالكامل */
  fullScreen?: boolean
  /** عدد أسطر Skeleton */
  skeletonLines?: number
  /** أسماء CSS إضافية */
  className?: string
}

// أحجام الـ Spinner
const spinnerSizes = {
  sm: "size-6 border-2",
  md: "size-8 border-3",
  lg: "size-12 border-4",
}

// مكون النقاط المتحركة
function LoadingDots({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="ai-processing-dots flex items-center gap-1.5" role="status">
        <span className="dot size-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
        <span className="dot size-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
        <span className="dot size-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
      </div>
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  )
}

// مكون Skeleton Lines
function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="w-full max-w-md space-y-3" role="status" aria-label="جارٍ التحميل">
      {/* عنوان Skeleton */}
      <div className="state-skeleton h-6 w-3/4 rounded-md" />
      
      {/* أسطر Skeleton */}
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "state-skeleton h-4 rounded-md",
            i === lines - 1 ? "w-1/2" : "w-full"
          )}
        />
      ))}
    </div>
  )
}

export function GarfixLoadingState({
  message = "جارٍ التحميل...",
  size = "md",
  variant = "spinner",
  fullScreen = false,
  skeletonLines = 3,
  className,
}: LoadingStateProps) {
  // محتوى التحميل حسب النوع
  const renderContent = () => {
    switch (variant) {
      case "dots":
        return <LoadingDots message={message} />

      case "skeleton":
        return <SkeletonLines lines={skeletonLines} />

      case "spinner":
      default:
        return (
          <div className="flex flex-col items-center gap-4">
            <div
              className={cn(
                "state-loading-spinner rounded-full border-border",
                spinnerSizes[size]
              )}
              role="status"
              aria-label="جارٍ التحميل"
            >
              <Loader2 className="size-full animate-spin text-primary" />
            </div>
            {message && (
              <p className="text-sm text-muted-foreground">{message}</p>
            )}
          </div>
        )
    }
  }

  if (fullScreen) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
          className
        )}
        role="alert"
        aria-busy="true"
      >
        <div className="state-loading">
          {renderContent()}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn("state-loading", className)}
      role="alert"
      aria-busy="true"
    >
      {renderContent()}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 3. GARFIX ERROR STATE — حالة الخطأ
// ════════════════════════════════════════════════════════════════════════

export interface ErrorStateProps {
  /** عنوان الخطأ */
  title?: string
  /** رسالة الخطأ */
  message: string
  /** نص زر إعادة المحاولة */
  retryLabel?: string
  /** دالة إعادة المحاولة */
  onRetry?: () => void
  /** رمز الخطأ */
  code?: string
  /** عرض التفاصيل */
  showDetails?: boolean
  /** تفاصيل إضافية */
  details?: string
  /** شدة الخطأ */
  severity?: "warning" | "error" | "critical"
  /** أسماء CSS إضافية */
  className?: string
}

export function GarfixErrorState({
  title = "حدث خطأ",
  message,
  retryLabel = "إعادة المحاولة",
  onRetry,
  code,
  showDetails = false,
  details,
  severity = "error",
  className,
}: ErrorStateProps) {
  // اختيار الأيقونة واللون حسب الشدة
  const getSeverityStyles = () => {
    switch (severity) {
      case "warning":
        return {
          icon: AlertTriangle,
          color: "text-amber-500",
          bgColor: "bg-amber-500/5",
          borderColor: "border-amber-500/20",
          titleColor: "text-amber-600 dark:text-amber-400",
        }
      case "critical":
        return {
          icon: AlertOctagon,
          color: "text-red-600",
          bgColor: "bg-red-500/10",
          borderColor: "border-red-500/30",
          titleColor: "text-red-600 dark:text-red-400",
        }
      case "error":
      default:
        return {
          icon: AlertTriangle,
          color: "text-red-500",
          bgColor: "bg-red-500/5",
          borderColor: "border-red-500/20",
          titleColor: "text-red-600 dark:text-red-400",
        }
    }
  }

  const styles = getSeverityStyles()
  const IconComponent = styles.icon

  const [isExpanded, setIsExpanded] = React.useState(false)

  return (
    <div
      className={cn(
        "state-error",
        styles.bgColor,
        styles.borderColor,
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      {/* الأيقونة */}
      <IconComponent
        className={cn("size-12 mb-4", styles.color)}
        strokeWidth={1.5}
      />

      {/* العنوان */}
      <h3 className={cn("text-base font-semibold", styles.titleColor)}>
        {title}
        {code && (
          <span className="mr-2 text-xs font-mono opacity-60">
            ({code})
          </span>
        )}
      </h3>

      {/* الرسالة */}
      <p className="mt-2 max-w-[360px] text-sm text-muted-foreground">
        {message}
      </p>

      {/* زر إعادة المحاولة */}
      {onRetry && (
        <div className="mt-6">
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            {retryLabel}
          </Button>
        </div>
      )}

      {/* تفاصيل إضافية قابلة للتوسيع */}
      {(showDetails || details) && (
        <div className="mt-4 w-full max-w-[360px]">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline transition-colors"
            type="button"
          >
            {isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
          </button>
          
          {isExpanded && details && (
            <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs font-mono text-muted-foreground rtl:text-right ltr:text-left">
              {details}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 4. GARFIX OFFLINE STATE — حالة عدم الاتصال
// ════════════════════════════════════════════════════════════════════════

export interface OfflineStateProps {
  /** رسالة عدم الاتصال */
  message?: string
  /** دالة إعادة المحاولة */
  onRetry?: () => void
  /** نص زر إعادة المحاولة */
  retryLabel?: string
  /** عرض كاملاً (شريط أو بطاقة) */
  fullWidth?: boolean
  /** أسماء CSS إضافية */
  className?: string
}

export function GarfixOfflineState({
  message = "أنت غير متصل بالإنترنت",
  onRetry,
  retryLabel = "إعادة المحاولة",
  fullWidth = false,
  className,
}: OfflineStateProps) {
  // وضع الشريط المصغر
  if (!fullWidth) {
    return (
      <div className={cn("state-offline", className)} role="alert">
        <WifiOff className="size-4 shrink-0" strokeWidth={2} />
        <span>{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mr-2 font-medium underline underline-offset-4 hover:no-underline"
            type="button"
          >
            {retryLabel}
          </button>
        )}
      </div>
    )
  }

  // وضع البطاقة الكاملة
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
      role="alert"
    >
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-amber-500/10">
        <WifiOff className="size-8 text-amber-500" strokeWidth={1.5} />
      </div>
      
      <h3 className="text-lg font-semibold text-foreground">
        عدم الاتصال بالإنترنت
      </h3>
      
      <p className="mt-2 max-w-[320px] text-sm text-muted-foreground">
        {message}. تأكد من اتصالك وحاول مرة أخرى.
      </p>
      
      {onRetry && (
        <div className="mt-6">
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 5. GARFIX MAINTENANCE STATE — حالة الصيانة
// ════════════════════════════════════════════════════════════════════════

export interface MaintenanceStateProps {
  /** عنوان الصيانة */
  title?: string
  /** رسالة الصيانة */
  message?: string
  /** الوقت المتوقع للانتهاء */
  estimatedTime?: string
  /** أسماء CSS إضافية */
  className?: string
}

export function GarfixMaintenanceState({
  title = "نحن نقوم ببعض التحسينات",
  message = "نظام GarfiX حالياً تحت الصيانة. نعتذر عن أي إزعاج.",
  estimatedTime,
  className,
}: MaintenanceStateProps) {
  return (
    <div className={cn("state-maintenance", className)} role="status">
      {/* أيقونة المفتاح المتحركة */}
      <div className="state-maintenance-icon flex items-center justify-center">
        <Wrench className="size-full text-muted-foreground" strokeWidth={1.5} />
      </div>

      {/* العنوان */}
      <h3 className="text-xl font-semibold text-foreground">
        {title}
      </h3>

      {/* الرسالة */}
      <p className="mt-3 max-w-[360px] text-sm leading-relaxed text-muted-foreground">
        {message}
      </p>

      {/* الوقت المتوقع */}
      {estimatedTime && (
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm">
          <Settings className="size-4 animate-spin text-primary" style={{ animationDuration: '3s' }} />
          <span>الوقت المتوقع: {estimatedTime}</span>
        </div>
      )}

      {/* زخرفة */}
      <div className="mt-8 flex items-center gap-1.5 opacity-30">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="size-1.5 rounded-full bg-foreground animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 6. GARFIX SKELETON — مكون الهيكل العظمي القابل للتخصيص
// ════════════════════════════════════════════════════════════════════════

export interface SkeletonProps {
  /** نوع الهيكل */
  variant?: "text" | "circular" | "rectangular" | "card"
  /** العرض */
  width?: string | number
  /** الارتفاع */
  height?: string | number
  /** عدد الأسطر (للنصوص) */
  lines?: number
  /** تفعيل الحركة */
  animate?: boolean
  /** أسماء CSS إضافية */
  className?: string
}

export function GarfixSkeleton({
  variant = "text",
  width,
  height,
  lines = 1,
  animate = true,
  className,
}: SkeletonProps) {
  // تحويل الأرقام إلى قيم CSS
  const getWidth = (): string => {
    if (typeof width === "number") return `${width}px`
    return width || (variant === "circular" ? "40px" : "100%")
  }

  const getHeight = (): string => {
    if (typeof height === "number") return `${height}px`
    if (height) return height
    
    // ارتفاعات افتراضية حسب النوع
    switch (variant) {
      case "circular": return "40px"
      case "rectangular": return "120px"
      case "card": return "200px"
      case "text": 
      default: return "16px"
    }
  }

  // أنماط خاصة بكل نوع
  const baseStyles: Record<string, string> = {
    text: "rounded",
    circular: "rounded-full",
    rectangular: "rounded-lg",
    card: "rounded-xl",
  }

  // عرض نصوص متعددة الأسطر
  if (variant === "text" && lines > 1) {
    return (
      <div className={cn("space-y-2 w-full", className)} role="status" aria-label="جارٍ التحميل">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "state-skeleton",
              animate && "animate-shimmer",
              baseStyles[variant]
            )}
            style={{
              width: i === lines - 1 ? "60%" : "100%",
              height: getHeight(),
            }}
          />
        ))}
      </div>
    )
  }

  // بطاقة Skeleton كاملة
  if (variant === "card") {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border p-4",
          className
        )}
        role="status"
        aria-label="جارٍ تحميل البطاقة"
      >
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div
            className={cn(
              "state-skeleton shrink-0 rounded-full",
              animate && "animate-shimmer"
            )}
            style={{ width: "40px", height: "40px" }}
          />
          <div className="space-y-2 flex-1">
            <div
              className={cn(
                "state-skeleton rounded",
                animate && "animate-shimmer"
              )}
              style={{ width: "70%", height: "14px" }}
            />
            <div
              className={cn(
                "state-skeleton rounded",
                animate && "animate-shimmer"
              )}
              style={{ width: "40%", height: "12px" }}
            />
          </div>
        </div>
        
        {/* Content */}
        <div className="mt-4 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "state-skeleton rounded",
                animate && "animate-shimmer"
              )}
              style={{
                width: i === 2 ? "80%" : "100%",
                height: "14px",
              }}
            />
          ))}
        </div>
        
        {/* Footer */}
        <div className="mt-4 flex gap-2">
          <div
            className={cn(
              "state-skeleton rounded-md",
              animate && "animate-shimmer"
            )}
            style={{ width: "80px", height: "32px" }}
          />
          <div
            className={cn(
              "state-skeleton rounded-md",
              animate && "animate-shimmer"
            )}
            style={{ width: "80px", height: "32px" }}
          />
        </div>
      </div>
    )
  }

  // عنصر Skeleton واحد
  return (
    <div
      className={cn(
        "state-skeleton",
        animate && "animate-shimmer",
        baseStyles[variant],
        className
      )}
      style={{
        width: getWidth(),
        height: getHeight(),
      }}
      role="status"
      aria-label="جارٍ التحميل"
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// PRE-CONFIGURED COMBO COMPONENTS — مكونات جاهزة شائعة الاستخدام
// ════════════════════════════════════════════════════════════════════════

interface PageStateProps {
  /** نوع الحالة */
  state: "loading" | "empty" | "error" | "offline" | "maintenance"
  /** props خاصة بكل حالة */
  loadingProps?: Omit<LoadingStateProps, "fullScreen">
  emptyProps?: Omit<EmptyStateProps, "className">
  errorProps?: Omit<ErrorStateProps, "className">
  offlineProps?: Omit<OfflineStateProps, "className" | "fullWidth">
  maintenanceProps?: Omit<MaintenanceStateProps, "className">
  /** ارتفاع الحد الأدنى للصفحة */
  minHeight?: string
  /** أسماء CSS إضافية */
  className?: string
}

/**
 * GarfixPageState - مكون موحد لحالات الصفحة
 * 
 * يستخدم لعرض حالة واحدة من حالات الصفحة المختلفة
 * مع تنسيق موحد وملء المساحة المتاحة
 */
export function GarfixPageState({
  state,
  loadingProps,
  emptyProps,
  errorProps,
  offlineProps,
  maintenanceProps,
  minHeight = "400px",
  className,
}: PageStateProps) {
  return (
    <div
      className={cn("flex items-center justify-center w-full", className)}
      style={{ minHeight }}
    >
      {state === "loading" && <GarfixLoadingState {...loadingProps} />}
      {state === "empty" && <GarfixEmptyState {...emptyProps} />}
      {state === "error" && <GarfixErrorState {...errorProps} />}
      {state === "offline" && <GarfixOfflineState {...offlineProps} fullWidth />}
      {state === "maintenance" && <GarfixMaintenanceState {...maintenanceProps} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════

export {
  // إعادة تصدير الأيقونات للاستخدام الخارجي
  FileText,
  Search,
  Inbox,
  FolderOpen,
  Users,
  AlertTriangle,
  AlertOctagon,
  WifiOff,
  Wrench,
  Settings,
  Loader2,
  RefreshCw,
}

// Default export object
const GarfixStates = {
  Empty: GarfixEmptyState,
  Loading: GarfixLoadingState,
  Error: GarfixErrorState,
  Offline: GarfixOfflineState,
  Maintenance: GarfixMaintenanceState,
  Skeleton: GarfixSkeleton,
  PageState: GarfixPageState,
}

export default GarfixStates
