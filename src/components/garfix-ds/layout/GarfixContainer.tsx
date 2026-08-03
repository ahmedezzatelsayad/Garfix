/**
 * GarfixContainer.tsx — GarfiX DS v4.0 Layout Container
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Max-width container with responsive padding
 * - 3 Variants: default (page), fluid, narrow
 * - Centered by default
 * - RTL-aware
 * - Safe area insets for mobile
 *
 * DESIGN TOKENS:
 * - Max width: 1280px (default), 100% (fluid), 768px (narrow)
 * - Padding: 1rem (mobile) → 2rem (desktop)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type ContainerVariant = "default" | "fluid" | "narrow";
export type ContainerPadding = "none" | "sm" | "md" | "lg" | "xl";

export interface GarfixContainerProps {
  children: React.ReactNode;
  /** Container variant */
  variant?: ContainerVariant;
  /** Padding preset */
  padding?: ContainerPadding;
  /** Center content */
  centered?: boolean;
  /** Full height */
  fullHeight?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Variant Styles ──────────────────────────────────────────────────────

const maxWidthStyles: Record<ContainerVariant, string> = {
  default: "max-w-7xl",
  fluid: "max-w-full",
  narrow: "max-w-3xl",
};

const paddingStyles: Record<ContainerPadding, string> = {
  none: "",
  sm: "px-4 sm:px-6",
  md: "px-4 sm:px-6 lg:px-8",
  lg: "px-6 sm:px-8 lg:px-12",
  xl: "px-8 sm:px-12 lg:px-16",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixContainer: React.FC<GarfixContainerProps> = ({
  children,
  variant = "default",
  padding = "md",
  centered = true,
  fullHeight = false,
  className,
}) => {
  return (
    <div
      className={cn(
        // Base
        "w-full",
        
        // Variant
        maxWidthStyles[variant],
        paddingStyles[padding],
        
        // Layout
        centered && "mx-auto",
        fullHeight && "min-h-screen",
        
        // Mobile safe area
        "safe-area-inset",
        
        // Custom
        className
      )}
    >
      {children}
    </div>
  );
};

GarfixContainer.displayName = "GarfixContainer";

// ── Section Component ───────────────────────────────────────────────────

export interface GarfixSectionProps {
  children: React.ReactNode;
  /** Section spacing */
  space?: "sm" | "md" | "lg" | "xl";
  /** Background color */
  bg?: "transparent" | "muted" | "card" | "primary" | "gradient";
  /** Custom class name */
  className?: string;
}

export const GarfixSection: React.FC<GarfixSectionProps> = ({
  children,
  space = "md",
  bg = "transparent",
  className,
}) => {
  const spaceStyles = {
    sm: "py-4 sm:py-6",
    md: "py-8 sm:py-12",
    lg: "py-12 sm:py-16 lg:py-20",
    xl: "py-16 sm:py-24 lg:py-32",
  };

  const bgStyles = {
    transparent: "",
    muted: "bg-muted/50",
    card: "bg-card",
    primary: "bg-primary text-primary-foreground",
    gradient: "bg-gradient-to-b from-primary/5 to-transparent",
  };

  return (
    <section className={cn(spaceStyles[space], bgStyles[bg], className)}>
      {children}
    </section>
  );
};

GarfixSection.displayName = "GarfixSection";
