/**
 * GarfixBreadcrumb.tsx — GarfiX DS v4.0 Breadcrumb
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Automatic separator rendering
 * - Icon support for items
 * - Current page highlighting
 * - Truncation for long paths
 * - RTL-aware separators
 * - Accessible navigation
 *
 * DESIGN TOKENS:
 * - Separator: chevron-left (reversed in LTR)
 * - Current page: bold foreground
 * - Links: muted with hover effect
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import { ChevronLeft, Home } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface BreadcrumbItemData {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  current?: boolean;
}

export interface GarfixBreadcrumbProps {
  /** Breadcrumb items */
  items: BreadcrumbItemData[];
  /** Show home icon as first item */
  showHome?: boolean;
  /** Home URL */
  homeHref?: string;
  /** Max visible items (rest truncated) */
  maxItems?: number;
  /** Separator */
  separator?: React.ReactNode;
  /** Custom class name */
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────

export const GarfixBreadcrumb: React.FC<GarfixBreadcrumbProps> = ({
  items,
  showHome = false,
  homeHref = "/",
  maxItems,
  separator,
  className,
}) => {
  const DefaultSeparator = (
    <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
  );

  // Truncate items if needed
  let displayItems = items;
  
  if (maxItems && items.length > maxItems) {
    displayItems = [
      items[0],
      { label: "...", href: undefined },
      ...items.slice(-(maxItems - 1)),
    ];
  }

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol
        role="list"
        className="flex items-center gap-1.5 flex-wrap text-sm"
      >
        {/* Home Item */}
        {showHome && (
          <li className="flex items-center">
            <a
              href={homeHref}
              className={cn(
                "flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-120",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              )}
            >
              <Home className="h-4 w-4" />
              <span className="sr-only">الرئيسية</span>
            </a>
            <li className="flex items-center ms-1.5 text-muted-foreground" aria-hidden="true">
              {separator || DefaultSeparator}
            </li>
          </li>
        )}

        {/* Breadcrumb Items */}
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const isEllipsis = item.label === "...";

          return (
            <li key={index} className="flex items-center">
              {isEllipsis ? (
                <span className="text-muted-foreground px-1">{item.label}</span>
              ) : item.current || isLast ? (
                <span
                  className="font-medium text-foreground"
                  aria-current="page"
                >
                  {item.icon ? (
                    <span className="flex items-center gap-1.5">
                      {item.icon}
                      {item.label}
                    </span>
                  ) : (
                    item.label
                  )}
                </span>
              ) : item.href ? (
                <a
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-120",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                  )}
                >
                  {item.icon}
                  {item.label}
                </a>
              ) : (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {item.icon}
                  {item.label}
                </span>
              )}

              {/* Separator (not after last item or ellipsis) */}
              {!isLast && !isEllipsis && (
                <span
                  className="ms-1.5 text-muted-foreground"
                  aria-hidden="true"
                >
                  {separator || DefaultSeparator}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

GarfixBreadcrumb.displayName = "GarfixBreadcrumb";
