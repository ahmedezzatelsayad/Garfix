/**
 * GarfixSidebar.tsx — GarfiX DS v4.0 Sidebar Navigation
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Collapsible sidebar
 * - Multiple item types: link, group, divider
 * - Active state with indicator
 * - Badge support
 * - Icon support
 * - Collapsed tooltip mode
 * - Mobile drawer mode
 * - RTL aware
 *
 * DESIGN TOKENS:
 * - Width: 280px expanded, 72px collapsed
 * - Background: card/surface
 * - Active: primary bg with accent
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React from "react";
import {
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface SidebarItem {
  id: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  badge?: number | string;
  disabled?: boolean;
  children?: SidebarItem[];
}

export interface SidebarGroup {
  label?: string;
  items: SidebarItem[];
}

export interface GarfixSidebarProps {
  /** Sidebar groups/items */
  groups: SidebarGroup[];
  /** Currently active item ID */
  activeItem?: string;
  /** On item click */
  onItemClick?: (item: SidebarItem) => void;
  /** Collapsed state (controlled) */
  collapsed?: boolean;
  /** On collapse toggle */
  onCollapseToggle?: () => void;
  /** Header content */
  header?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Custom class name */
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────

export const GarfixSidebar: React.FC<GarfixSidebarProps> = ({
  groups,
  activeItem,
  onItemClick,
  collapsed = false,
  onCollapseToggle,
  header,
  footer,
  className,
}) => {
  return (
    <aside
      className={cn(
        // Base
        "flex flex-col h-full bg-card border-e border-border transition-all duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]",
        
        // Width
        collapsed ? "w-[72px]" : "w-[280px]",
        
        // Custom
        className
      )}
    >
      {/* Header */}
      {(header || onCollapseToggle) && (
        <div className={cn(
          "flex items-center border-b border-border p-4",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && header}
          
          {onCollapseToggle && (
            <button
              onClick={onCollapseToggle}
              className={cn(
                "p-2 rounded-lg hover:bg-muted transition-colors duration-120",
                "text-muted-foreground hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              )}
              aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
            >
              {collapsed ? (
                <ChevronLeft className="h-5 w-5 rtl:rotate-180 ltr:rotate-0" />
              ) : (
                <ChevronRight className="h-5 w-5 rtl:rotate-180 ltr:rotate-0" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {groups.map((group, groupIndex) => (
          <div key={groupIndex}>
            {/* Group Label */}
            {group.label && !collapsed && (
              <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}

            {/* Group Items */}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const isActive = item.id === activeItem;
                const hasChildren = item.children && item.children.length > 0;

                return (
                  <li key={item.id}>
                    <button
                      onClick={() => !item.disabled && onItemClick?.(item)}
                      disabled={item.disabled}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        // Base
                        "w-full flex items-center gap-3 rounded-lg font-medium transition-all duration-120",
                        
                        // Size
                        collapsed 
                          ? "justify-center p-2.5" 
                          : "px-3 py-2.5",
                        
                        // States
                        isActive && [
                          "bg-primary/10 text-primary",
                          "before:absolute before:start-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-8 before:bg-primary before:rounded-e",
                        ].join(" "),
                        !isActive && !item.disabled && [
                          "text-muted-foreground hover:bg-muted hover:text-foreground",
                        ],
                        item.disabled && [
                          "opacity-50 cursor-not-allowed",
                        ],
                        
                        // Focus
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      )}
                    >
                      {/* Icon */}
                      {item.icon && (
                        <span className={cn(
                          "flex-shrink-0",
                          collapsed ? "h-5 w-5" : "h-5 w-5"
                        )} aria-hidden="true">
                          {item.icon}
                        </span>
                      )}

                      {/* Label & Badge */}
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-start truncate text-sm">
                            {item.label}
                          </span>

                          {item.badge !== undefined && (
                            <span className={cn(
                              "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full",
                              isActive
                                ? "bg-primary text-white"
                                : "bg-muted text-muted-foreground"
                            )}>
                              {item.badge}
                            </span>
                          )}

                          {hasChildren && (
                            <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180 opacity-50" />
                          )}
                        </>
                      )}
                    </button>

                    {/* Children (only when not collapsed) */}
                    {hasChildren && !collapsed && isActive && (
                      <ul className="mt-1 ms-4 space-y-1 border-s border-border ps-3">
                        {item.children!.map((child) => (
                          <li key={child.id}>
                            <button
                              onClick={() => !child.disabled && onItemClick?.(child)}
                              disabled={child.disabled}
                              className={cn(
                                "w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors duration-120",
                                child.id === activeItem
                                  ? "text-primary font-medium"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                child.disabled && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              {child.label}
                              {child.badge !== undefined && (
                                <span className="ms-auto text-xs">{child.badge}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {footer && (
        <div className={cn(
          "border-t border-border p-4",
          collapsed && "flex justify-center"
        )}>
          {footer}
        </div>
      )}
    </aside>
  );
};

GarfixSidebar.displayName = "GarfixSidebar";

// ════════════════════════════════════════════════════════════════════════
// MOBILE SIDEBAR DRAWER WRAPPER
// ════════════════════════════════════════════════════════════════════════

export interface GarfixMobileNavProps extends Omit<GarfixSidebarProps, "className"> {
  isOpen: boolean;
  onClose: () => void;
}

export const GarfixMobileNav: React.FC<GarfixMobileNavProps> = ({
  isOpen,
  onClose,
  ...sidebarProps
}) => {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-popover/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 start-0 z-50 transform transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full rtl:[direction:rtl]"
        )}
      >
        <div className="h-full w-[280px] shadow-xl">
          {/* Close Button */}
          <div className="absolute top-4 end-4 z-10">
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="إغلاق القائمة"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <GarfixSidebar {...sidebarProps} className="shadow-none border-0" />
        </div>
      </div>
    </>
  );
};

GarfixMobileNav.displayName = "GarfixMobileNav";
