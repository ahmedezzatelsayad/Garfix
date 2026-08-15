/**
 * GarfixSkeleton.tsx — GarfiX DS v4.0 Skeleton Loading
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Multiple shapes: text, circle, rectangle, card, table, chart
 * - Pulse animation
 * - Configurable dimensions
 * - Preset patterns for common layouts
 * - RTL support
 *
 * DESIGN TOKENS:
 * - Base: bg-muted
 * - Shimmer: gradient animation
 * - Duration: 1500ms ease-in-out
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type SkeletonShape = "text" | "circle" | "rectangle" | "rounded";
export type SkeletonVariant = "default" | "shimmer" | "pulse";

export interface GarfixSkeletonProps {
  /** Skeleton shape */
  shape?: SkeletonShape;
  /** Variant */
  variant?: SkeletonVariant;
  /** Width */
  width?: string | number;
  /** Height */
  height?: string | number;
  /** Number of lines (for text) */
  lines?: number;
  /** Custom class name */
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────

export const GarfixSkeleton: React.FC<GarfixSkeletonProps> = ({
  shape = "text",
  variant = "shimmer",
  width,
  height,
  lines = 1,
  className,
}) => {
  const baseClasses = cn(
    "bg-muted",
    variant === "shimmer" && [
      "relative overflow-hidden",
      "after:absolute after:inset-0 after:-translate-x-full",
      "after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent",
      "after:animate-[shimmer_1.5s_infinite_ease-in-out]",
    ].join(" "),
    variant === "pulse" && "animate-pulse",
    className
  );

  // Shape-specific styles
  const shapeStyles: Record<SkeletonShape, string> = {
    text: "h-4 rounded",
    circle: "rounded-full",
    rectangle: "rounded-md",
    rounded: "rounded-xl",
  };

  // Multiple lines
  if (lines > 1 && shape === "text") {
    return (
      <div className={cn("space-y-3", className)} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={`line-${i}`}
            className={cn(baseClasses, shapeStyles.text)}
            style={{
              width: i === lines - 1 ? "70%" : "100%",
              height: height || "1rem",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(baseClasses, shapeStyles[shape])}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
};

GarfixSkeleton.displayName = "GarfixSkeleton";

// ════════════════════════════════════════════════════════════════════════
// PRESET SKELETON PATTERNS
// ════════════════════════════════════════════════════════════════════════

/** Card skeleton - matches KPI card layout */
export const CardSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("p-5 rounded-xl border border-border bg-card space-y-4", className)} aria-hidden="true">
    <div className="flex items-start justify-between">
      <div className="space-y-2 flex-1">
        <GarfixSkeleton shape="text" width="40%" height="0.875rem" />
        <GarfixSkeleton shape="text" width="60%" height="2rem" />
      </div>
      <GarfixSkeleton shape="rounded" width="2.5rem" height="2.5rem" />
    </div>
    <GarfixSkeleton shape="text" width="30%" height="1rem" />
  </div>
);

CardSkeleton.displayName = "CardSkeleton";

/** Table row skeleton */
export const TableRowSkeleton: React.FC<{ cols?: number; className?: string }> = ({ 
  cols = 5, 
  className 
}) => (
  <tr className={className} aria-hidden="true">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={`col-${i}`} className="px-4 py-3">
        <GarfixSkeleton 
          shape="text" 
          width={i === 0 ? "80%" : i === cols - 1 ? "40%" : "60%"} 
        />
      </td>
    ))}
  </tr>
);

TableRowSkeleton.displayName = "TableRowSkeleton";

/** Form skeleton */
export const FormSkeleton: React.FC<{ fields?: number; className?: string }> = ({ 
  fields = 3, 
  className 
}) => (
  <div className={cn("space-y-6", className)} aria-hidden="true">
    <div className="space-y-2">
      <GarfixSkeleton shape="text" width="25%" height="0.75rem" />
      <GarfixSkeleton shape="rectangle" height="2.75rem" />
    </div>
    {Array.from({ length: fields - 1 }).map((_, i) => (
      <div key={`field-${i}`} className="space-y-2">
        <GarfixSkeleton shape="text" width={`${30 + (i % 3) * 15}%`} height="0.75rem" />
        <GarfixSkeleton shape="rectangle" height="2.75rem" />
      </div>
    ))}
    <div className="pt-4">
      <GarfixSkeleton shape="rectangle" width="120px" height="2.5rem" />
    </div>
  </div>
);

FormSkeleton.displayName = "FormSkeleton";

/** Dashboard grid skeleton */
export const DashboardSkeleton: React.FC<{ cards?: number; className?: string }> = ({ 
  cards = 5, 
  className 
}) => (
  <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4", className)} aria-hidden="true">
    {Array.from({ length: cards }).map((_, i) => (
      <CardSkeleton key={`card-${i}`} />
    ))}
  </div>
);

DashboardSkeleton.displayName = "DashboardSkeleton";

/** Profile/avatar skeleton */
export const ProfileSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("flex items-center gap-4 p-4", className)} aria-hidden="true">
    <GarfixSkeleton shape="circle" width="3.5rem" height="3.5rem" />
    <div className="space-y-2 flex-1">
      <GarfixSkeleton shape="text" width="40%" height="1rem" />
      <GarfixSkeleton shape="text" width="60%" height="0.875rem" />
    </div>
  </div>
);

ProfileSkeleton.displayName = "ProfileSkeleton";
