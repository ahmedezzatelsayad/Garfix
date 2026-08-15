/**
 * GarfixPageHeader.tsx — GarfiX DS v4.0 Page Header
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Page title with optional subtitle
 * - Breadcrumb integration
 * - Action buttons area
 * - Back navigation button
 * - Responsive layout (stack on mobile)
 * - Glass morphism option
 *
 * DESIGN TOKENS:
 * - Title: text-xl font-semibold → text-2xl font-bold (lg)
 * - Subtitle: text-sm text-muted-foreground
 * - Border-bottom with subtle gradient
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

export interface GarfixPageHeaderProps {
  /** Page title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Breadcrumb items */
  breadcrumbs?: BreadcrumbItem[];
  /** Action buttons */
  actions?: React.ReactNode;
  /** Show back button */
  showBack?: boolean;
  /** Back button callback */
  onBack?: () => void;
  /** Header variant */
  variant?: "default" | "compact" | "glass";
  /** Sticky header */
  sticky?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────

export const GarfixPageHeader: React.FC<GarfixPageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  showBack = false,
  onBack,
  variant = "default",
  sticky = false,
  className,
}) => {
  const isCompact = variant === "compact";
  const isGlass = variant === "glass";

  return (
    <header
      className={cn(
        // Base
        "w-full pb-6 border-b border-border/50",
        
        // Sticky
        sticky && "sticky top-0 z-30 bg-background/80 backdrop-blur-md",
        
        // Glass variant
        isGlass && [
          "glass-strong rounded-xl mb-6 p-6",
          "border-b-0 border border-white/10",
        ].join(" "),
        
        isGlass && "mb-6",
        
        // Custom
        className
      )}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className={cn("mb-3", !isCompact && "mb-4")}>
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
            {breadcrumbs.map((item, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li key={index} className="flex items-center gap-1.5">
                  {!isLast ? (
                    <>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="hover:text-foreground transition-colors duration-120"
                        >
                          {item.icon || item.label}
                        </a>
                      ) : (
                        <span className="flex items-center gap-1">
                          {item.icon}
                          {item.label}
                        </span>
                      )}
                      <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
                    </>
                  ) : (
                    <span className="font-medium text-foreground" aria-current="page">
                      {item.icon ? (
                        <span className="flex items-center gap-1">
                          {item.icon}
                          {item.label}
                        </span>
                      ) : (
                        item.label
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {/* Main Header Row */}
      <div className={cn(
        "flex items-start gap-4",
        "flex-col sm:flex-row sm:items-center sm:justify-between",
        isCompact && "flex-row items-center"
      )}>
        {/* Left Section: Title + Back */}
        <div className={cn("flex items-start gap-3", showBack && "flex-row")}>
          {showBack && (
            <button
              onClick={onBack}
              className={cn(
                "mt-0.5 p-2 -ms-2 rounded-lg transition-colors duration-120",
                "hover:bg-muted text-muted-foreground hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              )}
              aria-label="رجوع"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          )}
          
          <div className={cn(isCompact && "min-w-0")}>
            <h1 className={cn(
              "text-foreground tracking-tight",
              isCompact ? "text-lg font-semibold" : "text-xl font-semibold sm:text-2xl sm:font-bold"
            )}>
              {title}
            </h1>
            
            {subtitle && !isCompact && (
              <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right Section: Actions */}
        {actions && (
          <div className={cn(
            "flex items-center gap-3 flex-shrink-0 mt-4 sm:mt-0",
            isCompact && "mt-0"
          )}>
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};

GarfixPageHeader.displayName = "GarfixPageHeader";

// ── Simple Title Component ─────────────────────────────────────────────

export interface GarfixTitleProps {
  title: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const GarfixTitle: React.FC<GarfixTitleProps> = ({
  title,
  subtitle,
  size = "md",
  className,
}) => {
  const sizes = {
    sm: "text-lg font-semibold",
    md: "text-xl font-semibold",
    lg: "text-2xl font-bold",
    xl: "text-3xl font-bold tracking-tight",
  };

  return (
    <div className={cn("space-y-1", className)}>
      <h2 className={cn(sizes[size], "text-foreground")}>{title}</h2>
      {subtitle && (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
};

GarfixTitle.displayName = "GarfixTitle";
