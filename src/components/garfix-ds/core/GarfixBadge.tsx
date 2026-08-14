/**
 * GarfixBadge.tsx — GarfiX DS v4.0 Enhanced Badge
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - 8 Variants: default, primary, secondary, success, warning, error, info, gold
 * - 3 Sizes: sm, md, lg
 * - Dot variant (status indicator)
 * - With icon support
 * - Removable option
 * - Pulse animation for notifications
 *
 * DESIGN TOKENS:
 * - Primary: #047857 bg, white text
 * - Gold: #d4a574 (RESTRICTED)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type BadgeVariant = "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info" | "gold";
export type BadgeSize = "xs" | "sm" | "md" | "lg";

export interface GarfixBadgeProps {
  /** Badge content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: BadgeVariant;
  /** Size */
  size?: BadgeSize;
  /** Show as dot indicator */
  dot?: boolean;
  /** Leading icon */
  icon?: React.ReactNode;
  /** Removable */
  removable?: boolean;
  /** On remove callback */
  onRemove?: () => void;
  /** Pulse animation */
  pulse?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Variant Styles ──────────────────────────────────────────────────────

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-muted text-muted-foreground border-border",
  primary: "bg-[#047857] text-white border-transparent",
  secondary: "bg-secondary text-secondary-foreground border-transparent",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-transparent",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-transparent",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-transparent",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-transparent",
  gold: "bg-[#d4a574] text-[#0b1220] border-transparent", // ⚠️ RESTRICTED
};

const dotColorStyles: Record<BadgeVariant, string> = {
  default: "bg-muted-foreground",
  primary: "bg-[#047857]",
  secondary: "bg-secondary-foreground",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  info: "bg-blue-500",
  gold: "bg-[#d4a574]", // ⚠️ RESTRICTED
};

// ── Size Styles ─────────────────────────────────────────────────────────

const sizeStyles: Record<BadgeSize, string> = {
  xs: "text-[10px] px-1 py-0 gap-0.5",
  sm: "text-xs px-1.5 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
};

const dotSizes: Record<BadgeSize, string> = {
  xs: "h-1 w-1",
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixBadge: React.FC<GarfixBadgeProps> = ({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  removable = false,
  onRemove,
  pulse = false,
  className,
}) => {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border transition-colors duration-120",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {/* Dot Indicator */}
      {dot && (
        <span className={cn(
          "rounded-full",
          dotSizes[size],
          dotColorStyles[variant],
          pulse && "animate-pulse"
        )} />
      )}
      
      {/* Icon */}
      {icon && !dot && (
        <span className="flex-shrink-0" aria-hidden="true">{icon}</span>
      )}
      
      {/* Content */}
      {children}
      
      {/* Remove Button */}
      {removable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className={cn(
            "ms-1 -me-0.5 rounded-full p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
          )}
          aria-label="إزالة"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
};

GarfixBadge.displayName = "GarfixBadge";

// ── Preset Badges ───────────────────────────────────────────────────────

export const StatusBadge: React.FC<Omit<GarfixBadgeProps, "variant"> & { status: "active" | "inactive" | "pending" | "archived" }> = ({
  status,
  ...props
}) => {
  const variants: Record<string, BadgeVariant> = {
    active: "success",
    inactive: "default",
    pending: "warning",
    archived: "secondary",
  };
  return <GarfixBadge variant={variants[status]} dot {...props} />;
};

/** Notification badge with pulse */
export const NotificationBadge: React.FC<{ count: number; max?: number } & Omit<GarfixBadgeProps, "children" | "variant" | "pulse">> = ({
  count,
  max = 99,
  ..._props
}) => (
  <GarfixBadge variant="error" size="sm" pulse>
    {count > max ? `${max}+` : count}
  </GarfixBadge>
);
