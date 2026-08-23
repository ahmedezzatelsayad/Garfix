/**
 * GarfixCard.tsx — GarfiX DS v4.0 Enhanced Card System
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - 5 Variants: default, glass, glass-strong, elevated, bordered
 * - KPI Card variant with accent colors
 * Interactive hover states with motion system
 * - Padding presets (sm, md, lg, xl)
 * - Full RTL support
 * - Composable sub-components
 *
 * DESIGN TOKENS:
 * - Background: #111827 (dark), #ffffff (light)
 * - Glass: backdrop-blur-md bg-white/10 (dark), bg-black/5 (light)
 * - Border: rgba(255,255,255,0.1) (dark), rgba(0,0,0,0.08) (light)
 * - Radius: 0.75rem (lg), 1rem (xl)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type CardVariant = "default" | "glass" | "glass-strong" | "elevated" | "bordered" | "kpi";
export type CardPadding = "none" | "sm" | "md" | "lg" | "xl";
export type KPIColor = "emerald" | "gold" | "blue" | "red" | "purple";

export interface GarfixCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card visual variant */
  variant?: CardVariant;
  /** Padding preset */
  padding?: CardPadding;
  /** KPI accent color (only for kpi variant) */
  kpiColor?: KPIColor;
  /** Enable hover lift effect */
  hoverable?: boolean;
  /** Make card clickable */
  clickable?: boolean;
  /** Selected state (for card groups) */
  selected?: boolean;
}

// ── Variant Styles ──────────────────────────────────────────────────────

const variantStyles: Record<CardVariant, string> = {
  default: [
    "bg-card text-card-foreground",
    "border border-border",
    "shadow-sm",
  ].join(" "),
  
  glass: [
    "glass",
    "bg-white/5 dark:bg-white/5",
    "backdrop-blur-md",
    "border border-white/10 dark:border-white/10",
  ].join(" "),
  
  "glass-strong": [
    "glass-strong",
    "bg-white/10 dark:bg-white/10",
    "backdrop-blur-lg",
    "border border-white/15 dark:border-white/15",
    "shadow-lg shadow-black/5",
  ].join(" "),
  
  elevated: [
    "bg-card text-card-foreground",
    "border border-border",
    "shadow-lg shadow-black/10",
    "hover:shadow-xl hover:shadow-black/15",
  ].join(" "),
  
  bordered: [
    "bg-transparent",
    "border-2 border-border",
    "hover:border-primary/50",
  ].join(" "),
  
  kpi: [
    "bg-card text-card-foreground",
    "border border-border",
    "shadow-md",
    "relative overflow-hidden",
    // Accent line on left (RTL: right)
    "before:absolute before:inset-y-0 before:start-0 before:w-1",
  ].join(" "),
};

// ── KPI Color Accents ───────────────────────────────────────────────────

const kpiColorStyles: Record<KPIColor, string> = {
  emerald: "before:bg-[#047857]",
  gold: "before:bg-[#d4a574]", // ⚠️ RESTRICTED USE
  blue: "before:bg-[#2563eb]",
  red: "before:bg-[#dc2626]",
  purple: "before:bg-[#9333ea]",
};

// ── Padding Styles ──────────────────────────────────────────────────────

const paddingStyles: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
  xl: "p-6 sm:p-8",
};

// ── Main Card Component ─────────────────────────────────────────────────

export const GarfixCard = forwardRef<HTMLDivElement, GarfixCardProps>(
  (
    {
      variant = "default",
      padding = "md",
      kpiColor = "emerald",
      hoverable = false,
      clickable = false,
      selected = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        className={cn(
          // Base
          "rounded-xl transition-all duration-200",
          "ease-[cubic-bezier(0.4,0,0.2,1)]",
          
          // Variant
          variantStyles[variant],
          
          // KPI color accent
          variant === "kpi" && kpiColorStyles[kpiColor],
          
          // Padding
          paddingStyles[padding],
          
          // States
          hoverable && "hover-lift cursor-pointer",
          clickable && [
            "cursor-pointer",
            "hover:border-primary/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          ].join(" "),
          selected && "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary",
          
          // Custom
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GarfixCard.displayName = "GarfixCard";

// ── Sub-Components ──────────────────────────────────────────────────────

export type GarfixCardHeaderProps = HTMLAttributes<HTMLDivElement>;

export const GarfixCardHeader = forwardRef<HTMLDivElement, GarfixCardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1.5 pb-4 border-b border-border/50 mb-4", className)}
      {...props}
    />
  )
);
GarfixCardHeader.displayName = "GarfixCardHeader";

export type GarfixCardTitleProps = HTMLAttributes<HTMLHeadingElement>;

export const GarfixCardTitle = forwardRef<HTMLHeadingElement, GarfixCardTitleProps>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-lg font-semibold leading-tight tracking-tight text-card-foreground", className)}
      {...props}
    />
  )
);
GarfixCardTitle.displayName = "GarfixCardTitle";

export type GarfixCardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export const GarfixCardDescription = forwardRef<HTMLParagraphElement, GarfixCardDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-sm text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  )
);
GarfixCardDescription.displayName = "GarfixCardDescription";

export type GarfixCardContentProps = HTMLAttributes<HTMLDivElement>;

export const GarfixCardContent = forwardRef<HTMLDivElement, GarfixCardContentProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} />
  )
);
GarfixCardContent.displayName = "GarfixCardContent";

export type GarfixCardFooterProps = HTMLAttributes<HTMLDivElement>;

export const GarfixCardFooter = forwardRef<HTMLDivElement, GarfixCardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center pt-4 mt-auto border-t border-border/50", className)}
      {...props}
    />
  )
);
GarfixCardFooter.displayName = "GarfixCardFooter";

// ── Preset Cards ────────────────────────────────────────────────────────

/** KPI Card with accent color - for dashboard metrics */
export interface KPICardProps extends Omit<GarfixCardProps, "variant"> {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  kpiColor?: KPIColor;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  change,
  changeLabel,
  icon,
  kpiColor = "emerald",
  className,
  ...props
}) => {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <GarfixCard variant="kpi" kpiColor={kpiColor} hoverable className={cn("relative", className)} {...props}>
      {/* Header Row */}
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-card-foreground">
            {typeof value === 'number' ? value.toLocaleString('ar-EG') : value}
          </p>
        </div>
        {icon && (
          <div className={cn(
            "p-2.5 rounded-lg",
            kpiColor === "emerald" && "bg-emerald-500/10 text-emerald-500",
            kpiColor === "gold" && "bg-[#d4a574]/10 text-[#d4a574]", // ⚠️ RESTRICTED
            kpiColor === "blue" && "bg-blue-500/10 text-blue-500",
            kpiColor === "red" && "bg-red-500/10 text-red-500",
            kpiColor === "purple" && "bg-purple-500/10 text-purple-500",
          )}>
            {icon}
          </div>
        )}
      </div>

      {/* Change Indicator */}
      {(change !== undefined || changeLabel) && (
        <div className="flex items-center gap-2 text-xs">
          {change !== undefined && (
            <span className={cn(
              "inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded",
              isPositive && "bg-emerald-500/10 text-emerald-500",
              isNegative && "bg-red-500/10 text-red-500",
            )}>
              {isPositive ? "↑" : "↓"} {Math.abs(change)}%
            </span>
          )}
          {changeLabel && (
            <span className="text-muted-foreground">{changeLabel}</span>
          )}
        </div>
      )}
    </GarfixCard>
  );
};

KPICard.displayName = "KPICard";
