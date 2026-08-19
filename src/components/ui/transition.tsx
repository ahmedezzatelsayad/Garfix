import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GarfiX Transitions — Level 1 UI Delight
 * 
 * Smooth page transitions and animation wrappers for a polished feel.
 */

// ── Page Transition Wrapper ─────────────────────────────────────────

interface PageTransitionProps {
  children: React.ReactNode
  /** Animation type */
  type?: "fade" | "slide-up" | "slide-down" | "scale" | "fade-blur"
  /** Duration in ms */
  duration?: number
  /** Delay before start (ms) */
  delay?: number
  className?: string
}

function PageTransition({
  children,
  type: _type = "fade",
  duration = 300,
  delay = 0,
  className,
}: PageTransitionProps) {
  const _animations = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    "slide-up": {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -12 },
    },
    "slide-down": {
      initial: { opacity: 0, y: -12 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 12 },
    },
    scale: {
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.96 },
    },
    "fade-blur": {
      initial: { opacity: 0, filter: "blur(4px)" },
      animate: { opacity: 1, filter: "blur(0px)" },
      exit: { opacity: 0, filter: "blur(4px)" },
    },
  }

  // CSS-only fallback (no Framer Motion dependency for basic usage)
  const _cssAnimationMap = {
    fade: `fade-in ${duration}ms ease-out ${delay}ms both`,
    "slide-up": `fade-in ${duration}ms ease-out ${delay}ms both`,
    "slide-down": `fade-in ${duration}ms ease-out ${delay}ms both`,
    scale: `scale-in ${duration}ms ease-out ${delay}ms both`,
    "fade-blur": `fade-in ${duration}ms ease-out ${delay}ms both`,
  }

  return (
    <div
      className={cn("animate-fade-in", className)}
      style={{
        animationDuration: `${duration}ms`,
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      {children}
    </div>
  )
}

// ── Staggered List Animation ─────────────────────────────────────────

interface StaggeredListProps {
  children: React.ReactNode
  /** Delay between each item (ms) */
  staggerDelay?: number
  /** Base delay before first item (ms) */
  baseDelay?: number
  className?: string
  /** Tag name to render */
  as?: "div" | "ul" | "ol"
}

function StaggeredList({
  children,
  staggerDelay = 50,
  baseDelay = 0,
  className,
  as: Tag = "div",
}: StaggeredListProps) {
  const childArray = React.Children.toArray(children)

  return (
    <Tag className={cn("stagger-children", className)}>
      {childArray.map((child, index) => (
        <div
          key={index}
          style={{ 
            animationDelay: `${baseDelay + index * staggerDelay}ms` 
          }}
        >
          {child}
        </div>
      ))}
    </Tag>
  )
}

// ── Animated Counter (for KPIs) ──────────────────────────────────────

interface AnimatedCounterProps {
  value: number
  /** Duration of counting animation (ms) */
  duration?: number
  /** Number of decimal places */
  decimals?: number
  /** Prefix (e.g., "$", "ر.س") */
  prefix?: string
  /** Suffix (e.g., "%", "+") */
  suffix?: string
  /** Format number with locale */
  locale?: string
  className?: string
}

function AnimatedCounter({
  value,
  duration = 1000,
  decimals = 0,
  prefix = "",
  suffix = "",
  locale = "ar-SA",
  className,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = React.useState(0)
  const startTimeRef = React.useRef<number | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    startTimeRef.current = null
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1)
      
      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3)
      
      setDisplayValue(eased * value)
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [value, duration])

  const formatted = displayValue.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}{formatted}{suffix}
    </span>
  )
}

// ── Skeleton Loading Variants ────────────────────────────────────────

interface SkeletonCardProps {
  /** Number of skeleton lines */
  lines?: number
  /** Show avatar circle */
  showAvatar?: boolean
  /** Show title block */
  showTitle?: boolean
  className?: string
}

function SkeletonCard({ 
  lines = 3, 
  showAvatar = false, 
  showTitle = true,
  className 
}: SkeletonCardProps) {
  return (
    <div className={cn(
      "bg-card rounded-xl border p-6 space-y-4 animate-pulse",
      className
    )}>
      {/* Header */}
      {(showAvatar || showTitle) && (
        <div className="flex items-center gap-3">
          {showAvatar && (
            <div className="size-10 rounded-full bg-muted" />
          )}
          {showTitle && (
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          )}
        </div>
      )}

      {/* Content lines */}
      <div className="space-y-2 pt-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3 bg-muted rounded",
              i === lines - 1 && "w-2/3"
            )}
          />
        ))}
      </div>

      {/* Footer action */}
      <div className="flex gap-2 pt-2">
        <div className="h-8 w-20 bg-muted rounded-md" />
        <div className="h-8 w-16 bg-muted rounded-md" />
      </div>
    </div>
  )
}

interface SkeletonTableProps {
  rows?: number
  columns?: number
  className?: string
}

function SkeletonTable({ 
  rows = 5, 
  columns = 4,
  className 
}: SkeletonTableProps) {
  return (
    <div className={cn(
      "bg-card rounded-xl border overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="grid gap-4 px-6 py-3 border-b bg-muted/30">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-4 bg-muted rounded w-24" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className={cn(
            "grid gap-4 px-6 py-4 border-b last:border-b-0",
            rowIndex % 2 === 1 && "bg-muted/20"
          )}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className={cn(
                "h-4 bg-muted rounded",
                colIndex === 0 && "w-32",
                colIndex === 1 && "w-24",
                colIndex === 2 && "w-20",
                colIndex === columns - 1 && "w-16 ms-auto"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Success / Celebration Components ─────────────────────────────────

interface SuccessCheckmarkProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

function SuccessCheckmark({ size = "md", className }: SuccessCheckmarkProps) {
  const sizes = {
    sm: "size-8",
    md: "size-12",
    lg: "size-16",
  }

  return (
    <div className={cn(
      "rounded-full bg-mutedmerald-100 dark:bg-mutedmerald-900/30 flex items-center justify-center",
      sizes[size],
      className
    )}>
      <svg
        className={cn(
          "text-emerald-600 dark:text-emerald-400",
          size === "sm" ? "size-4" : size === "md" ? "size-6" : "size-8"
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 13l4 4L19 7" className="origin-center animate-[checkmark_0.5s_ease-in-out_forwards]" />
      </svg>
    </div>
  )
}

// ── Loading Spinner with brand color ─────────────────────────────────

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
  /** Show text label */
  label?: string
}

function LoadingSpinner({ size = "md", className, label }: LoadingSpinnerProps) {
  const sizes = {
    sm: "size-4 border-2",
    md: "size-8 border-3",
    lg: "size-12 border-4",
  }

  return (
    <div className={cn("flex items-center justify-center gap-3", className)}>
      <div
        className={cn(
          "rounded-full border-muted border-t-primary animate-spin",
          sizes[size]
        )}
        role="status"
        aria-label="جاري التحميل"
      />
      {label && (
        <span className="text-sm text-muted-foreground">{label}</span>
      )}
    </div>
  )
}

export {
  PageTransition,
  StaggeredList,
  AnimatedCounter,
  SkeletonCard,
  SkeletonTable,
  SuccessCheckmark,
  LoadingSpinner,
}
