/**
 * GarfixGrid.tsx — GarfiX DS v4.0 Grid System
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Responsive grid with breakpoints
 * - Preset column layouts (2,3,4,6 cols)
 * - Gap presets
 * - Auto-fit and auto-fill support
 * - RTL-aware
 *
 * DESIGN TOKENS:
 * - Gap: 1rem (default) → 1.5rem (md) → 2rem (lg)
 * - Breakpoints: sm(640), md(768), lg(1024), xl(1280)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type GridCols = 1 | 2 | 3 | 4 | 5 | 6 | 12 | "auto" | "auto-fit" | "auto-fill";
export type GridGap = "none" | "xs" | "sm" | "md" | "lg" | "xl";

export interface GarfixGridProps {
  children: React.ReactNode;
  /** Number of columns */
  cols?: GridCols;
  /** Responsive columns */
  colsSm?: Partial<GridCols>;
  colsMd?: Partial<GridCols>;
  colsLg?: Partial<GridCols>;
  colsXl?: Partial<GridCols>;
  /** Gap size */
  gap?: GridGap;
  /** Equal height rows */
  equalHeight?: boolean;
  /** Items alignment */
  align?: "start" | "center" | "end" | "stretch";
  /** Content alignment */
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  /** Custom class name */
  className?: string;
}

// ── Column Styles ───────────────────────────────────────────────────────

function getColClass(cols: GridCols): string {
  if (typeof cols === "number") {
    return `grid-cols-${cols}`;
  }
  return `grid-cols-${cols}`;
}

// ── Gap Styles ──────────────────────────────────────────────────────────

const gapStyles: Record<GridGap, string> = {
  none: "gap-0",
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4 sm:gap-6",
  lg: "gap-6 sm:gap-8",
  xl: "gap-8 sm:gap-12",
};

// ── Alignment Styles ────────────────────────────────────────────────────

const alignStyles = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const justifyStyles = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixGrid: React.FC<GarfixGridProps> = ({
  children,
  cols = 12,
  colsSm,
  colsMd,
  colsLg,
  colsXl,
  gap = "md",
  equalHeight = false,
  align = "stretch",
  justify,
  className,
}) => {
  return (
    <div
      className={cn(
        // Base grid
        "grid w-full",
        
        // Columns
        getColClass(cols),
        colsSm && `sm:${getColClass(colsSm as GridCols)}`,
        colsMd && `md:${getColClass(colsMd as GridCols)}`,
        colsLg && `lg:${getColClass(colsLg as GridCols)}`,
        colsXl && `xl:${getColClass(colsXl as GridCols)}`,
        
        // Gap
        gapStyles[gap],
        
        // Options
        equalHeight && "content-stretch",
        alignStyles[align],
        justify && justifyStyles[justify],
        
        // Custom
        className
      )}
    >
      {children}
    </div>
  );
};

GarfixGrid.displayName = "GarfixGrid";

// ── Preset Grid Layouts ─────────────────────────────────────────────────

/** Dashboard KPI Grid - 5 cards on desktop, 2 on mobile */
export const KPICardGrid: React.FC<Omit<GarfixGridProps, "cols" | "colsSm" | "colsMd">> = (props) => (
  <GarfixGrid 
    cols={1} 
    colsSm={2} 
    colsMd={2} 
    colsLg={3} 
    colsXl={5}
    gap="md"
    {...props} 
  />
);

/** Form Grid - 2 columns on desktop */
export const FormGrid: React.FC<Omit<GarfixGridProps, "cols" | "colsSm" | "colsMd">> = (props) => (
  <GarfixGrid 
    cols={1} 
    colsSm={1} 
    colsMd={2}
    gap="lg"
    {...props} 
  />
);

/** Card Grid - 3 columns on desktop */
export const CardGrid: React.FC<Omit<GarfixGridProps, "cols" | "colsSm" | "colsMd">> = (props) => (
  <GarfixGrid 
    cols={1} 
    colsSm={2} 
    colsMd={2} 
    colsLg={3}
    gap="md"
    {...props} 
  />
);

/** List/Grid toggle layout */
export const ContentGrid: React.FC<Omit<GarfixGridProps, "cols" | "colsSm" | "colsMd">> = (props) => (
  <GarfixGrid 
    cols={1} 
    colsSm={2} 
    colsMd={3} 
    colsLg={4}
    gap="md"
    {...props} 
  />
);
