/**
 * GarfixInput.tsx — GarfiX DS v4.0 Enhanced Input
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - 4 Sizes: sm, md, lg, xl
 * - With label and description
 * - Error state with message
 * - Success state
 * - Leading and trailing icons/adornments
 * - RTL-aware icon positioning
 * - Password toggle
 * - Character counter
 * - Loading state
 * - Full accessibility (ARIA)
 *
 * DESIGN TOKENS:
 * - Border: #e5e7eb (light), #374151 (dark)
 * - Focus Ring: #047857 (emerald)
 * - Error: #dc2626 (red)
 * - Success: #059669 (emerald)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { forwardRef, useId, useState, InputHTMLAttributes } from "react";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type InputSize = "sm" | "md" | "lg" | "xl";
export type InputState = "default" | "error" | "success" | "loading";

export interface GarfixInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Input size */
  size?: InputSize;
  /** Visual state */
  state?: InputState;
  /** Label text */
  label?: string;
  /** Helper/description text */
  description?: string;
  /** Error message (shown when state=error) */
  error?: string;
  /** Success message (shown when state=success) */
  successMessage?: string;
  /** Leading icon/adornment */
  leadingIcon?: React.ReactNode;
  /** Trailing icon/adornment */
  trailingIcon?: React.ReactNode;
  /** Full width */
  fullWidth?: boolean;
  /** Show character count */
  showCount?: boolean;
  /** Max characters for count */
  maxLength?: number;
}

// ── Size Styles ─────────────────────────────────────────────────────────

const sizeStyles: Record<InputSize, { container: string; input: string; icon: string }> = {
  sm: {
    container: "h-9",
    input: "h-9 px-3 text-xs",
    icon: "h-4 w-4",
  },
  md: {
    container: "h-10",
    input: "h-10 px-3.5 text-sm",
    icon: "h-4 w-4",
  },
  lg: {
    container: "h-12",
    input: "h-12 px-4 text-base",
    icon: "h-5 w-5",
  },
  xl: {
    container: "h-14",
    input: "h-14 px-5 text-lg",
    icon: "h-6 w-6",
  },
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixInput = forwardRef<HTMLInputElement, GarfixInputProps>(
  (
    {
      size = "md",
      state = "default",
      label,
      description,
      error,
      successMessage,
      leadingIcon,
      trailingIcon,
      fullWidth = true,
      showCount = false,
      maxLength,
      className,
      id: providedId,
      type: providedType,
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = providedType === "password";
    const type = isPassword ? (showPassword ? "text" : "password") : providedType;

    // FE-10 FIX (Audit v2 · Phase 2)
    // Replaced Math.random()-based id with React's useId().
    // Math.random() produces a different value on server vs client which
    // triggers a React hydration mismatch warning and can break label↔input
    // associations after hydration. useId() is SSR-safe and stable.
    const generatedId = `garfix-input-${useId()}`;
    const id = providedId || generatedId;
    
    const hasError = state === "error" || !!error;
    const isSuccess = state === "success" || !!successMessage;

    // Calculate character count
    const valueLength = typeof props.value === "string" ? props.value.length : 
                       props.defaultValue?.toString().length || 0;
    const isOverLimit = maxLength && valueLength > maxLength;

    return (
      <div className={cn("space-y-1.5", fullWidth && "w-full")}>
        {/* Label */}
        {label && (
          <label
            htmlFor={id}
            className={cn(
              "block text-sm font-medium text-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {label}
          </label>
        )}

        {/* Input Container */}
        <div className={cn("relative", sizeStyles[size].container)}>
          {/* Leading Icon */}
          {leadingIcon && (
            <div className={cn(
              "absolute inset-y-0 start-0 flex items-center justify-center pointer-events-none",
              "text-muted-foreground",
              size === "sm" && "start-3",
              size === "md" && "start-3.5",
              size === "lg" && "start-4",
              size === "xl" && "start-5",
              sizeStyles[size].icon
            )}>
              {leadingIcon}
            </div>
          )}

          {/* Input Element */}
          <input
            ref={ref}
            id={id}
            type={type}
            disabled={disabled || state === "loading"}
            maxLength={maxLength}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? `${id}-error` :
              isSuccess ? `${id}-success` :
              description ? `${id}-description` : undefined
            }
            className={cn(
              // Base
              "w-full rounded-lg border bg-background text-foreground",
              "placeholder:text-muted-foreground/60",
              "transition-all duration-120 ease-[cubic-bezier(0.4,0,0.2,1)]",
              
              // Focus state
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              
              // Size
              sizeStyles[size].input,
              
              // Icon spacing
              leadingIcon && "ps-10",
              (trailingIcon || isPassword || state === "loading") && "pe-10",
              
              // State styles
              hasError && [
                "border-[#dc2626] focus:ring-[#dc2626]/30 focus:border-[#dc2626]",
                "bg-red-50/50 dark:bg-red-950/10",
              ].join(" "),
              isSuccess && !hasError && [
                "border-[#059669] focus:ring-[#059669]/30 focus:border-[#059669]",
                "bg-emerald-50/50 dark:bg-emerald-950/10",
              ].join(" "),
              state === "default" && !hasError && !isSuccess && [
                "border-input focus:ring-[#047857]/20 focus:border-[#047857]",
              ].join(" "),
              
              // Disabled
              disabled && "opacity-50 cursor-not-allowed bg-muted",
              
              // Custom
              className
            )}
            {...props}
          />

          {/* Trailing Section */}
          <div className={cn(
            "absolute inset-y-0 end-0 flex items-center justify-center",
            size === "sm" && "end-3",
            size === "md" && "end-3.5",
            size === "lg" && "end-4",
            size === "xl" && "end-5",
          )}>
            {/* Loading State */}
            {state === "loading" && (
              <Loader2 className={cn(sizeStyles[size].icon, "animate-spin text-muted-foreground")} />
            )}
            
            {/* Error Icon */}
            {hasError && state !== "loading" && (
              <AlertCircle className={cn(sizeStyles[size].icon, "text-[#dc2626]")} />
            )}
            
            {/* Success Icon */}
            {isSuccess && !hasError && state !== "loading" && (
              <CheckCircle2 className={cn(sizeStyles[size].icon, "text-[#059669]")} />
            )}
            
            {/* Password Toggle */}
            {isPassword && !hasError && isSuccess && state !== "loading" && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={cn(sizeStyles[size].icon, "text-muted-foreground hover:text-foreground transition-colors")}
                // FE-11 FIX (Audit v2 · Phase 2)
                // tabIndex was -1, which made the toggle unreachable by
                // keyboard users — a WCAG 2.1 SC 2.1.1 Keyboard violation.
                // Changed to 0 so it joins the natural tab order.
                tabIndex={0}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            )}
            
            {/* Custom Trailing Icon */}
            {trailingIcon && !isPassword && state !== "loading" && !hasError && !isSuccess && (
              <span className="text-muted-foreground">{trailingIcon}</span>
            )}
          </div>
        </div>

        {/* Helper Text / Error / Success */}
        <div className="min-h-[1.25rem]">
          {hasError && error && (
            <p id={`${id}-error`} className="text-xs text-[#dc2626] flex items-center gap-1" role="alert">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          )}
          {isSuccess && !hasError && successMessage && (
            <p id={`${id}-success`} className="text-xs text-[#059669] flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {successMessage}
            </p>
          )}
          {description && !hasError && !isSuccess && (
            <p id={`${id}-description`} className="text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {/* Character Count */}
        {showCount && maxLength && (
          <div className={cn(
            "text-xs text-end",
            isOverLimit ? "text-[#dc2626]" : "text-muted-foreground"
          )}>
            {valueLength}/{maxLength}
          </div>
        )}
      </div>
    );
  }
);

GarfixInput.displayName = "GarfixInput";
