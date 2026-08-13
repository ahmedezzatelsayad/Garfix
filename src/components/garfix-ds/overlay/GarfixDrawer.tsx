/**
 * GarfixDrawer.tsx — GarfiX DS v4.0 Drawer Panel
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - Slide from start/end (RTL aware)
 * - Multiple sizes
 * - Backdrop with blur
 * - Close on backdrop click or Escape
 * - Animated slide (250ms)
 * - Header and footer
 * - Drag to close (optional)
 *
 * DESIGN TOKENS:
 * - Duration: 250ms cubic-bezier(0.4, 0, 0.2, 1)
 * - Width: sm(320), md(400), lg(480), xl(560), full(100%)
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GarfixButton } from "../core/GarfixButton";
// FE-03 FIX (Audit v2 · Phase 1) — wire useFocusTrap so that Tab/Shift+Tab
// stays inside the drawer and focus returns to the trigger element on close.
// Before this fix, the drawer had NO focus trap and NO focus restoration —
// keyboard users would Tab out into background page content.
import { useFocusTrap } from "@/hooks/useAccessibility";

// ── Types ───────────────────────────────────────────────────────────────

export type DrawerSide = "start" | "end" | "top" | "bottom";
export type DrawerSize = "sm" | "md" | "lg" | "xl" | "full";

export interface GarfixDrawerProps {
  /** Open state */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Which side to slide from */
  side?: DrawerSide;
  /** Size */
  size?: DrawerSize;
  /** Title */
  title?: string;
  /** Description */
  description?: string;
  /** Show close button */
  showCloseButton?: boolean;
  /** Header content */
  header?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Children */
  children: React.ReactNode;
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Close on escape */
  closeOnEscape?: boolean;
  /** Prevent body scroll */
  preventScroll?: boolean;
  /** Custom class name */
  className?: string;
}

// ── Size Styles ─────────────────────────────────────────────────────────

const widthSizes: Record<DrawerSize, string> = {
  sm: "w-80 max-w-[80vw]",
  md: "w-96 max-w-[85vw]",
  lg: "w-[480px] max-w-[90vw]",
  xl: "w-[560px] max-w-[95vw]",
  full: "w-full max-w-full",
};

const heightSizes: Record<DrawerSize, string> = {
  sm: "h-[40vh] max-h-[80vh]",
  md: "h-[50vh] max-h-[85vh]",
  lg: "h-[60vh] max-h-[90vh]",
  xl: "h-[70vh] max-h-[95vh]",
  full: "h-full max-h-full",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixDrawer: React.FC<GarfixDrawerProps> = ({
  isOpen,
  onClose,
  side = "end",
  size = "md",
  title,
  description,
  showCloseButton = true,
  header,
  footer,
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
  preventScroll = true,
  className,
}) => {
  // FE-03 FIX (Audit v2 · Phase 1) — useFocusTrap returns a ref to attach
  // to the drawer container. It internally:
  //   • captures `document.activeElement` (the trigger) on activation
  //   • moves focus to the first focusable child (or `initialFocus`)
  //   • traps Tab/Shift+Tab so focus can't leave the drawer
  //   • calls `onEscape` when the user presses Escape
  //   • restores focus to the trigger on deactivation
  const drawerRef = useFocusTrap({
    active: isOpen,
    onEscape: closeOnEscape ? onClose : undefined,
    returnFocus: true,
  });

  // Body-scroll lock only — focus management is delegated to useFocusTrap.
  useEffect(() => {
    if (isOpen && preventScroll) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, preventScroll]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdrop) {
      onClose();
    }
  };

  // Determine orientation
  const isHorizontal = side === "start" || side === "end";
  const sizeStyle = isHorizontal ? widthSizes[size] : heightSizes[size];

  // Slide direction classes
  const getSlideClasses = () => {
    switch (side) {
      case "start":
        return [
          "inset-y-0 start-0",
          "translate-x-0 rtl:-translate-x-full ltr:-translate-x-full",
          isOpen ? "translate-x-0" : "-translate-x-full rtl:[direction:rtl]"
        ].join(" ");
      case "end":
        return [
          "inset-y-0 end-0",
          "translate-x-0",
          isOpen ? "translate-x-0" : "translate-x-full rtl:[direction:rtl]"
        ].join(" ");
      case "top":
        return [
          "inset-x-0 top-0",
          "translate-y-0",
          isOpen ? "translate-y-0" : "-translate-y-full"
        ].join(" ");
      case "bottom":
        return [
          "inset-x-0 bottom-0",
          "translate-y-0",
          isOpen ? "translate-y-0" : "translate-y-full"
        ].join(" ");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "قائمة"}
        tabIndex={-1}
        className={cn(
          // Positioning
          "fixed z-50",
          getSlideClasses(),
          
          // Base styles
          "bg-card shadow-2xl border border-border",
          isHorizontal ? "h-full" : "w-full",
          sizeStyle,
          
          // Animation
          "transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]",
          
          // Layout
          "flex flex-col",
          
          // Custom
          className
        )}
      >
        {/* Header */}
        {(header || title || showCloseButton) && (
          <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
            <div className="space-y-1">
              {title && (
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              )}
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
              {!title && header}
            </div>

            {showCloseButton && (
              <button
                onClick={onClose}
                className={cn(
                  "p-2 rounded-lg transition-colors duration-120",
                  "hover:bg-muted text-muted-foreground hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                )}
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

GarfixDrawer.displayName = "GarfixDrawer";
