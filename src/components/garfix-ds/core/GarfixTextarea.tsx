/**
 * GarfixTextarea.tsx — GarfiX DS v4.0 Textarea Component
 *
 * Styled textarea matching GarfiX DS design system
 */

"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface GarfixTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label displayed above input */
  label?: string;
  /** Helper text below input */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Input size */
  size?: "sm" | "md" | "lg";
  /** Full width */
  fullWidth?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────

export const GarfixTextarea = forwardRef<HTMLTextAreaElement, GarfixTextareaProps>(
  (
    {
      label,
      helperText,
      error,
      size = "md",
      fullWidth = true,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");

    // Size classes
    const sizeClasses = {
      sm: "px-3 py-2 text-sm min-h-[80px]",
      md: "px-4 py-3 text-sm min-h-[120px]",
      lg: "px-5 py-4 text-base min-h-[160px]",
    };

    return (
      <div className={cn("space-y-1.5", fullWidth && "w-full")}>
        {/* Label */}
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-foreground/80"
          >
            {label}
          </label>
        )}

        {/* Textarea */}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            // Base
            "w-full rounded-xl border bg-mutedackgroundackground text-foreground placeholder:text-muted-foreground/50",
            // Focus & States
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
            "transition-all duration-200 ease-out",
            // Error state
            error
              ? "border-red-500/50 bg-red-500/5 focus:ring-red-500/30"
              : "border-border hover:border-border/80",
            // Disabled
            "disabled:opacity-50 disabled:cursor-not-allowed",
            // Resize
            "resize-y",
            // Size
            sizeClasses[size],
            // Custom
            className
          )}
          {...props}
        />

        {/* Helper Text / Error */}
        {(helperText || error) && (
          <p className={cn("text-xs", error ? "text-red-500" : "text-muted-foreground/70")}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

GarfixTextarea.displayName = "GarfixTextarea";
