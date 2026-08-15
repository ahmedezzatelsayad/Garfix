import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * GarfiX Enhanced Card — Level 1 UI Delight
 * 
 * Enhancements:
 * - Smooth hover lift with brand shadow
 * - Optional interactive variant (for clickable cards)
 * - Gradient border option
 * - Glass morphism support
 */

function Card({ 
  className, 
  variant = "default",
  interactive = false,
  ...props 
}: React.ComponentProps<"div"> & {
  /** Card visual style variant */
  variant?: "default" | "elevated" | "bordered" | "glass" | "gradient-border"
  /** Enable hover effects (lift + shadow) */
  interactive?: boolean
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        // Base styles
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6",
        // Shadow based on variant
        variant === "default" && "shadow-sm",
        variant === "elevated" && "shadow-brand-md",
        variant === "bordered" && "shadow-none border-2",
        variant === "glass" && "glass shadow-brand-sm",
        variant === "gradient-border" && "shadow-sm relative bg-transparent",
        
        // Mobile touch enhancements
        interactive && [
          // Touch feedback on mobile
          "active:scale-[0.99] active:shadow-sm",
          // GPU layer for smooth animations
          "gpu-layer",
        ],
        
        // Interactive hover state (desktop)
        interactive && [
          "cursor-pointer transition-all duration-300 ease-out",
          "hover:shadow-brand-lg hover:-translate-y-1",
          "hover:border-primary/30 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
        ],
        
        className
      )}
      {...props}
    />
  )
}

/* Gradient border overlay (used with gradient-border variant) */
function CardGradientBorder({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "absolute inset-0 rounded-xl p-[1px] pointer-events-none",
        "bg-gradient-to-br from-primary/50 via-accent/30 to-transparent",
        "-z-10",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

// FE-08 FIX (Audit v2): CardTitle should render as an <h2> (or <h3> with
// as="h3") for proper heading hierarchy. The previous <div> implementation
// broke the document outline — screen readers couldn't navigate card
// titles, and login/signup pages had NO h1/h2 outline at all.
// We accept an `as` prop so callers can pick the right heading level for
// their context (h2 inside a page section, h3 inside a nested card, etc.).
function CardTitle({ className, as = "h2", ...props }: React.ComponentProps<"h2"> & {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
}) {
  const Comp = as as "h2";
  return (
    <Comp
      data-slot="card-title"
      className={cn("leading-none font-semibold text-base tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm mt-1", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

/**
 * KPI Stat Card — Specialized card for dashboard metrics
 * Features animated value display and trend indicator
 */
function KpiCard({
  className,
  title,
  value,
  change,
  changeType = "neutral",
  icon,
  format,
  ...props
}: React.ComponentProps<"div"> & {
  title: string
  value: string | number
  change?: number
  changeType?: "positive" | "negative" | "neutral"
  icon?: React.ReactNode
  format?: "currency" | "number" | "percent"
}) {
  const changeColor = {
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-red-500 dark:text-red-400",
    neutral: "text-muted-foreground",
  }[changeType]

  const changeIcon = {
    positive: "↑",
    negative: "↓",
    neutral: "",
  }[changeType]

  const formattedValue = (() => {
    if (typeof value === "string") return value
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(value)
      case "percent":
        return `${value}%`
      default:
        return new Intl.NumberFormat("ar-SA").format(value)
    }
  })()

  const formattedChange = change !== undefined 
    ? `${changeIcon} ${Math.abs(change)}${format === "percent" ? "%" : ""}`
    : null

  return (
    <Card variant="elevated" interactive className={cn("relative overflow-hidden", className)} {...props}>
      {/* Subtle gradient accent at top */}
      <div className="absolute top-0 start-0 end-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-accent/60" />
      
      <CardContent className="pb-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon && (
            <div className="text-muted-foreground/80 hover-scale p-1">
              {icon}
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <p className="text-2xl font-bold tracking-tight animate-fade-in">
            {formattedValue}
          </p>
          
          {formattedChange && (
            <p className={`text-xs font-medium ${changeColor} flex items-center gap-1`}>
              {formattedChange}
              <span className="text-muted-foreground font-normal">من الشهر الماضي</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export {
  Card,
  CardGradientBorder,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  KpiCard,
}
