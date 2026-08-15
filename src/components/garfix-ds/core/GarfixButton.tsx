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
//
// FE-12 FIX (Audit v2): Replaced hardcoded hex colors (#047857, #065f46, ...)
// with CSS variable tokens (bg-primary, bg-primary/90, text-primary-foreground,
// ring-primary, etc.). The hardcoded hex values broke dark mode — the light-
// mode primary (#047857) was always used even when the dark theme was active,
// because the hex values bypassed Tailwind's dark: variant system.
//
// The token-based approach below automatically picks up the correct color
// for the active theme via the --primary CSS variable defined in globals.css.
const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-primary text-primary-foreground",
    "hover:bg-primary/90 active:bg-primary/80",
    "border border-primary",
    "shadow-sm shadow-primary/20",
    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ].join(" "),

  secondary: [
    "bg-primary/10 text-primary",
    "hover:bg-primary/20 active:bg-primary/30",
    "border border-primary/20",
    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  ].join(" "),

  outline: [
    "bg-transparent text-primary",
    "hover:bg-primary/10 active:bg-primary/20",
    "border border-primary",
    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  ].join(" "),

  ghost: [
    "bg-transparent text-primary",
    "hover:bg-primary/5 active:bg-primary/10",
    "border border-transparent",
    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  ].join(" "),

  destructive: [
    "bg-destructive text-destructive-foreground",
    "hover:bg-destructive/90 active:bg-destructive/80",
    "border border-destructive",
    "shadow-sm shadow-destructive/20",
    "focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2",
  ].join(" "),

  gold: [
    // ⚠️ RESTRICTED USE: Premium/AI features only!
    // Gold variant keeps its hex values because it's a brand accent color
    // that doesn't have a corresponding CSS variable token (it's used only
    // for premium features and shouldn't change with the theme).
    "bg-[#d4a574] text-[#0b1220]",
    "hover:bg-[#c9956a] active:bg-[#b8855a]",
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
