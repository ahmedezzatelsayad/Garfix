/**
 * GarfixTabs.tsx — GarfiX DS v4.0 Tab Navigation
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - 3 Variants: default (underline), pills, cards
 * - Full width option
 * - With icons
 * - Badge support
 * - Animated indicator
 * - RTL support
 * - Keyboard navigation
 *
 * DESIGN TOKENS:
 * - Active: primary color with indicator
 * - Hover: subtle background change
 * - Transition: 150ms ease
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export type TabVariant = "default" | "pills" | "cards";
export type TabSize = "sm" | "md" | "lg";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: number | string;
}

export interface GarfixTabsProps {
  /** Tab items */
  tabs: TabItem[];
  /** Active tab ID */
  activeTab: string;
  /** On tab change */
  onTabChange: (tabId: string) => void;
  /** Visual variant */
  variant?: TabVariant;
  /** Size */
  size?: TabSize;
  /** Full width tabs */
  fullWidth?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Size Styles ─────────────────────────────────────────────────────────

const sizeStyles: Record<TabSize, { container: string; tab: string; icon: string }> = {
  sm: { container: "gap-1", tab: "px-3 py-1.5 text-xs", icon: "h-3.5 w-3.5" },
  md: { container: "gap-1", tab: "px-4 py-2 text-sm", icon: "h-4 w-4" },
  lg: { container: "gap-2", tab: "px-6 py-3 text-base", icon: "h-5 w-5" },
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixTabs: React.FC<GarfixTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  variant = "default",
  size = "md",
  fullWidth = false,
  className,
}) => {
  const sizes = sizeStyles[size];

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        // Base
        "flex items-center",
        
        // Variant base styles
        variant === "default" && [
          "border-b border-border",
          sizes.container,
        ],
        variant === "pills" && [
          "bg-muted/50 p-1 rounded-lg",
          sizes.container,
        ],
        variant === "cards" && [
          "bg-muted/30 p-1 rounded-xl gap-1",
        ],
        
        // Full width
        fullWidth && "[&>button]:flex-1",
        
        // Custom
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            onKeyDown={(e) => {
              // Arrow key navigation
              const currentIndex = tabs.findIndex(t => t.id === tab.id);
              let nextIndex: number | null = null;
              
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                // RTL: swap arrow directions
                const isRTL = document.dir === "rtl";
                const nextKey = isRTL ? "ArrowLeft" : "ArrowRight";
                const prevKey = isRTL ? "ArrowRight" : "ArrowLeft";
                
                if (e.key === nextKey) {
                  nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
                } else if (e.key === prevKey) {
                  nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
                }
                
                if (nextIndex !== null && !tabs[nextIndex].disabled) {
                  e.preventDefault();
                  onTabChange(tabs[nextIndex].id);
                  document.getElementById(`tab-${tabs[nextIndex].id}`)?.focus();
                }
              }
            }}
            className={cn(
              // Base
              "relative inline-flex items-center justify-center font-medium",
              "transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
              "whitespace-nowrap select-none",
              
              // Size
              sizes.tab,
              
              // Focus
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              
              // Disabled
              tab.disabled && "opacity-50 pointer-events-none cursor-not-allowed",
              
              // Variant-specific styles
              variant === "default" && [
                "-mb-px border-b-2",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              ].join(" "),
              
              variant === "pills" && [
                "rounded-md",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              ].join(" "),
              
              variant === "cards" && [
                "rounded-lg",
                isActive
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              ].join(" ")
            )}
          >
            {/* Icon */}
            {tab.icon && (
              <span className={cn(sizes.icon, "me-1.5")} aria-hidden="true">
                {tab.icon}
              </span>
            )}

            {/* Label */}
            {tab.label}

            {/* Badge */}
            {tab.badge !== undefined && (
              <span className={cn(
                "ms-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-semibold rounded-full",
                isActive
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

GarfixTabs.displayName = "GarfixTabs";

// ── Tab Panel ──────────────────────────────────────────────────────────

export interface GarfixTabPanelProps {
  /** Tab ID this panel belongs to */
  tabId: string;
  /** Active tab ID */
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

export const GarfixTabPanel: React.FC<GarfixTabPanelProps> = ({
  tabId,
  activeTab,
  children,
  className,
}) => {
  if (activeTab !== tabId) return null;

  return (
    <div
      role="tabpanel"
      id={`panel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      tabIndex={0}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        className
      )}
    >
      {children}
    </div>
  );
};

GarfixTabPanel.displayName = "GarfixTabPanel";
