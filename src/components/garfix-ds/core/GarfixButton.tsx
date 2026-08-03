/**
 * GarfixButton.tsx — GarfiX DS v4.0 Enhanced Button
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - 6 Variants: primary, secondary, outline, ghost, destructive, gold
 * - 4 Sizes: xs, sm, md, lg, xl
 * - Full RTL support with proper spacing
 * - Motion system: 150ms cubic-bezier(0.4, 0, 0.2, 1)
 * - Loading state with spinner
 * - Icon support (leading/trailing)
 * - Full width option
 * - Accessible (ARIA labels, keyboard navigation)
 *
 * DESIGN TOKENS:
 * - Primary: #047857 (emerald)
 * - Gold: #d4a574 (RESTRICTED: premium/AI only)
 * - Hover lift effect via hover-lift class
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { forwardRef, ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type ButtonVariant = 
  | "primary" 
  | "secondary" 
  | "outline" 
  | "ghost" 
  | "destructive" 
  | "gold";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface GarfixButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Show loading spinner */
  isLoading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Leading icon (left in LTR, right in RTL) */
  leadingIcon?: React.ReactNode;
  /** Trailing icon (right in LTR, left in RTL) */
  trailingIcon?: React.ReactNode;
}

// ── Variant Styles ──────────────────────────────────────────────────────

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-[#047857] text-white",
    "hover:bg-[#065f46] active:bg-[#064e3b]",
    "border border-[#047857]",
    "shadow-sm shadow-emerald-900/20",
    "focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ].join(" "),
  
  secondary: [
    "bg-[#ecfdf5] text-[#064e3b]",
    "hover:bg-[#d1fae5] active:bg-[#a7f3d0]",
    "border border-[#a7f3d0]",
    "focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:ring-offset-2",
  ].join(" "),
  
  outline: [
    "bg-transparent text-[#047857]",
    "hover:bg-[#ecfdf5] active:bg-[#d1fae5]",
    "border border-[#047857]",
    "focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:ring-offset-2",
  ].join(" "),
  
  ghost: [
    "bg-transparent text-[#047857]",
    "hover:bg-[#f0fdf4] active:bg-[#ecfdf5]",
    "border border-transparent",
    "focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:ring-offset-2",
  ].join(" "),
  
  destructive: [
    "bg-[#dc2626] text-white",
    "hover:bg-[#b91c1c] active:bg-[#991b1b]",
    "border border-[#dc2626]",
    "shadow-sm shadow-red-900/20",
    "focus-visible:ring-2 focus-visible:ring-[#dc2626] focus-visible:ring-offset-2",
  ].join(" "),
  
  gold: [
    // ⚠️ RESTRICTED USE: Premium/AI features only!
    "bg-[#d4a574] text-[#0b1220]",
    "hover:bg-[#c9956a] active:bg[#b8855a]",
    "border border-[#d4a574]",
    "shadow-sm shadow-[#d4a574]/20",
    "focus-visible:ring-2 focus-visible:ring-[#d4a574] focus-visible:ring-offset-2",
  ].join(" "),
};

// ── Size Styles ─────────────────────────────────────────────────────────

const sizeStyles: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
  xl: "h-14 px-8 text-lg gap-3 rounded-xl",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixButton = forwardRef<HTMLButtonElement, GarfixButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      fullWidth = false,
      leadingIcon,
      trailingIcon,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center font-medium",
          "transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "active-press hover-lift",
          "disabled:pointer-events-none disabled:opacity-50",
          "select-none",
          
          // Variant & Size
          variantStyles[variant],
          sizeStyles[size],
          
          // Full width
          fullWidth && "w-full",
          
          // Custom classes
          className
        )}
        {...props}
      >
        {/* Loading Spinner */}
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin rtl:ml-2 ltr:mr-2" aria-hidden="true" />
        )}
        
        {/* Leading Icon */}
        {!isLoading && leadingIcon && (
          <span className="rtl:ml-1.5 ltr:mr-1.5 flex-shrink-0" aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        
        {/* Content */}
        {children}
        
        {/* Trailing Icon */}
        {trailingIcon && (
          <span className="rtl:mr-1.5 ltr:ml-1.5 flex-shrink-0" aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </button>
    );
  }
);

GarfixButton.displayName = "GarfixButton";

// ── Preset Buttons ──────────────────────────────────────────────────────

/** Primary CTA Button - Use for main actions */
export const PrimaryButton: React.FC<Omit<GarfixButtonProps, "variant">> = (props) => (
  <GarfixButton variant="primary" {...props} />
);

/** Secondary Button - Use for secondary actions */
export const SecondaryButton: React.FC<Omit<GarfixButtonProps, "variant">> = (props) => (
  <GarfixButton variant="secondary" {...props} />
);

/** Gold Premium Button - RESTRICTED: AI/Premium features only! */
export const GoldButton: React.FC<Omit<GarfixButtonProps, "variant">> = (props) => (
  <GarfixButton variant="gold" {...props} />
);

/** Danger/Destructive Button */
export const DangerButton: React.FC<Omit<GarfixButtonProps, "variant">> = (props) => (
  <GarfixButton variant="destructive" {...props} />
);
