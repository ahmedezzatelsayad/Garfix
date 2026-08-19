/**
 * GarfixAlert.tsx — GarfiX DS v4.0 Alert System
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - 5 Variants: info, success, warning, error, gold
 * - Dismissible with animation
 * - Icon support
 * - Action button
 * - RTL support
 * - Accessible (ARIA live region)
 *
 * DESIGN TOKENS:
 * - Info: blue-500
 * - Success: emerald-500
 * - Warning: amber-500
 * - Error: red-500
 * - Gold: #d4a574 (RESTRICTED)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useState } from "react";
import { X, Info, CheckCircle2, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type AlertVariant = "info" | "success" | "warning" | "error" | "gold";
export type AlertSize = "sm" | "md" | "lg";

export interface GarfixAlertProps {
  /** Alert content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: AlertVariant;
  /** Size */
  size?: AlertSize;
  /** Title */
  title?: string;
  /** Dismissible */
  dismissible?: boolean;
  /** On dismiss callback */
  onDismiss?: () => void;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Action button */
  action?: React.ReactNode;
  /** Show icon */
  showIcon?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Variant Configurations ─────────────────────────────────────────────

const variantConfig: Record<AlertVariant, {
  container: string;
  icon: React.ElementType;
  iconColor: string;
}> = {
  info: {
    container: "bg-mutedackgroundlue-50 dark:bg-mutedackgroundlue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300",
    icon: Info,
    iconColor: "text-blue-500",
  },
  success: {
    container: "bg-mutedmerald-50 dark:bg-mutedmerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300",
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
  },
  warning: {
    container: "bg-cardmber-50 dark:bg-cardmber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
  },
  error: {
    container: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300",
    icon: AlertCircle,
    iconColor: "text-red-500",
  },
  gold: {
    // ⚠️ RESTRICTED USE
    container: "bg-[#d4a574]/10 border-[#d4a574]/30 text-[#8b6914] dark:text-[#d4a574]",
    icon: Sparkles,
    iconColor: "text-[#d4a574]",
  },
};

// ── Size Styles ─────────────────────────────────────────────────────────

const sizeStyles: Record<AlertSize, string> = {
  sm: "p-3 text-sm gap-2",
  md: "p-4 text-sm gap-3",
  lg: "p-5 text-base gap-4",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixAlert: React.FC<GarfixAlertProps> = ({
  children,
  variant = "info",
  size = "md",
  title,
  dismissible = false,
  onDismiss,
  icon,
  action,
  showIcon = true,
  className,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  const config = variantConfig[variant];
  const IconComponent = config.icon;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <div
      role="alert"
      className={cn(
        // Base
        "relative rounded-xl border transition-all duration-180 ease-out",
        
        // Variant
        config.container,
        
        // Size
        sizeStyles[size],
        
        // Layout
        "flex items-start",
        
        // Animation on mount
        "animate-in fade-in slide-in-from-top-2 duration-200",
        
        // Custom
        className
      )}
    >
      {/* Icon */}
      {showIcon && (
        <div className={cn("flex-shrink-0 mt-0.5", config.iconColor)}>
          {icon || <IconComponent className={cn(
            size === "sm" && "h-4 w-4",
            size === "md" && "h-5 w-5",
            size === "lg" && "h-6 w-6"
          )} />}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {title && (
          <p className={cn(
            "font-semibold",
            size === "sm" && "text-sm",
            size === "md" && "text-sm",
            size === "lg" && "text-base"
          )}>
            {title}
          </p>
        )}
        <div className={cn(!title && "leading-relaxed")}>{children}</div>
      </div>

      {/* Action */}
      {action && (
        <div className="flex-shrink-0 ms-4">{action}</div>
      )}

      {/* Dismiss Button */}
      {dismissible && (
        <button
          onClick={handleDismiss}
          className={cn(
            "flex-shrink-0 rounded-lg p-1 transition-colors duration-120",
            "hover:bg-mutedackgroundlack/5 dark:hover:bg-white/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          )}
          aria-label="إغلاق"
        >
          <X className={cn(
            "opacity-60 hover:opacity-100",
            size === "sm" && "h-3.5 w-3.5",
            size === "md" && "h-4 w-4",
            size === "lg" && "h-5 w-5"
          )} />
        </button>
      )}
    </div>
  );
};

GarfixAlert.displayName = "GarfixAlert";

// ── Preset Alerts ───────────────────────────────────────────────────────

/** Success alert for completed actions */
export const SuccessAlert: React.FC<Omit<GarfixAlertProps, "variant">> = (props) => (
  <GarfixAlert variant="success" {...props} />
);

/** Error alert for errors */
export const ErrorAlert: React.FC<Omit<GarfixAlertProps, "variant">> = (props) => (
  <GarfixAlert variant="error" {...props} />
);

/** Warning alert for cautions */
export const WarningAlert: React.FC<Omit<GarfixAlertProps, "variant">> = (props) => (
  <GarfixAlert variant="warning" {...props} />
);
