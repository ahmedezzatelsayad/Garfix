/**
 * GarfixProgress.tsx — GarfiX DS v4.0 Progress Indicators
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Linear progress bar with label
 * - Circular/ring progress
 * - Animated on value change
 * - Multiple color variants
 * - Size presets
 * - Indeterminate state
 * - Step progress
 *
 * DESIGN TOKENS:
 * - Primary: #047857 emerald
 * - Gold: #d4a574 (RESTRICTED)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type ProgressColor = "emerald" | "gold" | "blue" | "red" | "purple";
export type ProgressSize = "sm" | "md" | "lg";

// ── Color Config ────────────────────────────────────────────────────────

const colorStyles: Record<ProgressColor, { track: string; fill: string }> = {
  emerald: { track: "bg-mutedmerald-100 dark:bg-mutedmerald-900/30", fill: "bg-mutedmerald-500" },
  gold: { track: "bg-[#d4a574]/20", fill: "bg-[#d4a574]" }, // ⚠️ RESTRICTED
  blue: { track: "bg-mutedackgroundlue-100 dark:bg-mutedackgroundlue-900/30", fill: "bg-mutedackgroundlue-500" },
  red: { track: "bg-red-100 dark:bg-red-900/30", fill: "bg-red-500" },
  purple: { track: "bg-purple-100 dark:bg-purple-900/30", fill: "bg-purple-500" },
};

const sizeStyles: Record<ProgressSize, { bar: string; ring: number; strokeWidth: number }> = {
  sm: { bar: "h-1.5", ring: 32, strokeWidth: 3 },
  md: { bar: "h-2.5", ring: 48, strokeWidth: 4 },
  lg: { bar: "h-4", ring: 64, strokeWidth: 5 },
};

// ════════════════════════════════════════════════════════════════════════
// LINEAR PROGRESS BAR
// ════════════════════════════════════════════════════════════════════════

export interface GarfixProgressBarProps {
  /** Progress value (0-100) */
  value: number;
  /** Color variant */
  color?: ProgressColor;
  /** Size */
  size?: ProgressSize;
  /** Show percentage label */
  showLabel?: boolean;
  /** Label position */
  labelPosition?: "top" | "inline" | "bottom";
  /** Custom label */
  label?: string;
  /** Indeterminate mode */
  indeterminate?: boolean;
  /** Animated */
  animated?: boolean;
  /** Maximum value */
  max?: number;
  /** Custom class name */
  className?: string;
}

export const GarfixProgressBar: React.FC<GarfixProgressBarProps> = ({
  value,
  color = "emerald",
  size = "md",
  showLabel = false,
  labelPosition = "inline",
  label,
  indeterminate = false,
  animated = true,
  max = 100,
  className,
}) => {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percentage = Math.round((clampedValue / max) * 100);
  const colors = colorStyles[color];
  const sizes = sizeStyles[size];

  return (
    <div className={cn("w-full", className)}>
      {/* Top Label */}
      {showLabel && labelPosition === "top" && (
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-foreground">{label || ""}</span>
          <span className="text-sm font-medium text-muted-foreground">{percentage}%</span>
        </div>
      )}

      {/* Progress Container */}
      <div className={cn(
        "w-full rounded-full overflow-hidden",
        colors.track,
        sizes.bar
      )}>
        <div
          role="progressbar"
          aria-valuenow={clampedValue}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label || `التقدم: ${percentage}%`}
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out origin-start",
            colors.fill,
            indeterminate && [
              "animate-pulse w-1/3",
              "bg-gradient-to-r from-transparent via-current to-transparent",
            ].join(" "),
            animated && !indeterminate && "transition-all duration-700 ease-out"
          )}
          style={{
            width: indeterminate ? undefined : `${percentage}%`,
          }}
        />
      </div>

      {/* Inline Label */}
      {showLabel && labelPosition === "inline" && (
        <div className="flex justify-between mt-1.5">
          <span className="text-xs text-muted-foreground">{label || ""}</span>
          <span className="text-xs font-medium text-muted-foreground">{percentage}%</span>
        </div>
      )}

      {/* Bottom Label */}
      {showLabel && labelPosition === "bottom" && (
        <div className="flex justify-between mt-2">
          <span className="text-sm font-medium text-foreground">{label || ""}</span>
          <span className="text-sm font-medium text-muted-foreground">{percentage}%</span>
        </div>
      )}
    </div>
  );
};

GarfixProgressBar.displayName = "GarfixProgressBar";

// ════════════════════════════════════════════════════════════════════════
// CIRCULAR/RING PROGRESS
// ════════════════════════════════════════════════════════════════════════

export interface GarfixProgressRingProps {
  /** Progress value (0-100) */
  value: number;
  /** Color variant */
  color?: ProgressColor;
  /** Size */
  size?: ProgressSize;
  /** Show percentage inside */
  showValue?: boolean;
  /** Center content (overrides showValue) */
  children?: React.ReactNode;
  /** Stroke width override */
  strokeWidth?: number;
  /** Custom class name */
  className?: string;
}

export const GarfixProgressRing: React.FC<GarfixProgressRingProps> = ({
  value,
  color = "emerald",
  size = "md",
  showValue = true,
  children,
  strokeWidth,
  className,
}) => {
  const clampedValue = Math.min(Math.max(value, 0), 100);
  const sizes = sizeStyles[size];
  const sw = strokeWidth ?? sizes.strokeWidth;
  const radius = (sizes.ring - sw) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (clampedValue / 100) * circumference;

  const strokeColors: Record<ProgressColor, string> = {
    emerald: "#047857",
    gold: "#d4a574",
    blue: "#2563eb",
    red: "#dc2626",
    purple: "#9333ea",
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={sizes.ring}
        height={sizes.ring}
        className="-rotate-90"
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Background Track */}
        <circle
          cx={sizes.ring / 2}
          cy={sizes.ring / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={sw}
          className="text-muted/30"
        />
        {/* Progress Fill */}
        <circle
          cx={sizes.ring / 2}
          cy={sizes.ring / 2}
          r={radius}
          fill="none"
          stroke={strokeColors[color]}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      
      {/* Center Content */}
      {(showValue || children) && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children || (
            <span className="text-sm font-semibold text-foreground">
              {Math.round(clampedValue)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
};

GarfixProgressRing.displayName = "GarfixProgressRing";

// ════════════════════════════════════════════════════════════════════════
// STEP PROGRESS
// ════════════════════════════════════════════════════════════════════════

export interface StepItem {
  label: string;
  description?: string;
  completed?: boolean;
  current?: boolean;
  error?: boolean;
}

export interface GarfixStepProgressProps {
  steps: StepItem[];
  /** Current step index (0-based) */
  currentStep?: number;
  /** Vertical orientation */
  vertical?: boolean;
  /** Custom class name */
  className?: string;
}

export const GarfixStepProgress: React.FC<GarfixStepProgressProps> = ({
  steps,
  currentStep = 0,
  vertical = false,
  className,
}) => {
  return (
    <div className={cn(
      "flex items-start",
      vertical ? "flex-col gap-0" : "flex-row",
      className
    )}>
      {steps.map((step, index) => {
        const isCompleted = step.completed || index < currentStep;
        const isCurrent = step.current || index === currentStep;
        const isError = step.error;

        return (
          <React.Fragment key={step.label}>
            {/* Step Item */}
            <div className={cn("flex items-center", vertical ? "gap-3 py-2" : "flex-col gap-2")}>
              {/* Circle */}
              <div
                className={cn(
                  "flex items-center justify-center rounded-full border-2 transition-colors duration-200",
                  vertical ? "h-8 w-8" : "h-10 w-10",
                  isCompleted && "border-emerald-500 bg-mutedmerald-500 text-white",
                  isCurrent && !isCompleted && "border-primary bg-mutedackgroundackground text-primary ring-2 ring-primary/20",
                  !isCompleted && !isCurrent && "border-border bg-mutedackgroundackground text-muted-foreground",
                  isError && "border-red-500 bg-red-500 text-white"
                )}
              >
                {isCompleted ? (
                  <svg className={vertical ? "h-4 w-4" : "h-5 w-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isError ? (
                  <svg className={vertical ? "h-4 w-4" : "h-5 w-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <span className={vertical ? "text-xs" : "text-sm font-semibold"}>
                    {index + 1}
                  </span>
                )}
              </div>

              {/* Text */}
              <div className={cn(vertical && "min-w-0")}>
                <p className={cn(
                  "font-medium",
                  vertical ? "text-sm" : "text-xs text-center",
                  isCompleted && "text-emerald-600 dark:text-emerald-400",
                  isCurrent && !isCompleted && "text-foreground",
                  !isCompleted && !isCurrent && "text-muted-foreground",
                  isError && "text-red-600 dark:text-red-400"
                )}>
                  {step.label}
                </p>
                {step.description && vertical && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "bg-mutedackgroundorder transition-colors duration-200",
                  vertical 
                    ? "w-0.5 h-6 mx-auto my-1" 
                    : "h-0.5 flex-1 my-2",
                  isCompleted && "bg-mutedmerald-500"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

GarfixStepProgress.displayName = "GarfixStepProgress";
