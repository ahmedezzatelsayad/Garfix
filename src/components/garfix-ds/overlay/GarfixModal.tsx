/**
 * GarfixModal.tsx — GarfiX DS v4.0 Modal/Dialog
 *
 * ════════════════════════════════════════════════════════════════════════
 * FEATURES:
 * - 3 Sizes: sm, md, lg, xl, full
 * - Backdrop with blur
 * - Close on backdrop click or Escape key
 * - Animated entrance/exit (220ms)
 * - Focus trap
 * - Header, body, footer sections
 * - RTL support
 * - Accessible (ARIA dialog)
 *
 * DESIGN TOKENS:
 * - Duration: 220ms cubic-bezier(0.4, 0, 0.2, 1)
 * - Background: card with shadow-xl
 * - Backdrop: black/50 with blur
 * ════════════════════════════════════════════════════════════════════════
 */

"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GarfixButton } from "../core/GarfixButton";
// FE-03 FIX (Audit v2 · Phase 1) — wire useFocusTrap so that Tab/Shift+Tab
// stays inside the dialog and focus returns to the trigger element on close.
// The hook was defined in src/hooks/useAccessibility.ts but had ZERO call
// sites (dead code per audit FE-03). It already handles Escape, initial
// focus, and focus restoration — so we delete the duplicate manual logic.
import { useFocusTrap } from "@/hooks/useAccessibility";

// ── Types ───────────────────────────────────────────────────────────────

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full" | "auto";

export interface GarfixModalProps {
  /** Open state */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal description */
  description?: string;
  /** Size */
  size?: ModalSize;
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Close on escape */
  closeOnEscape?: boolean;
  /** Show close button */
  showCloseButton?: boolean;
  /** Header content (overrides title) */
  header?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Children (body) */
  children: React.ReactNode;
  /** Custom class name for container */
  className?: string;
  /** Prevent body scroll when open */
  preventScroll?: boolean;
}

// ── Size Styles ─────────────────────────────────────────────────────────

const sizeStyles: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
  auto: "max-w-auto w-auto",
};

// ── Component ───────────────────────────────────────────────────────────

export const GarfixModal: React.FC<GarfixModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = "md",
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  header,
  footer,
  children,
  className,
  preventScroll = true,
}) => {
  // FE-03 FIX (Audit v2 · Phase 1) — useFocusTrap returns a ref to attach
  // to the dialog container. It internally:
  //   • captures `document.activeElement` (the trigger) on activation
  //   • moves focus to the first focusable child (or `initialFocus`)
  //   • traps Tab/Shift+Tab so focus can't leave the dialog
  //   • calls `onEscape` when the user presses Escape
  //   • restores focus to the trigger on deactivation
  const modalRef = useFocusTrap({
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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={description ? "modal-description" : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-popover/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          // Base
          "relative w-full rounded-2xl bg-card shadow-2xl border border-border",
          
          // Animation
          "animate-in zoom-in-95 fade-in slide-in-from-bottom-2 duration-220 ease-[cubic-bezier(0.4,0,0.2,1)]",
          
          // Size
          sizeStyles[size],
          size !== "full" && "max-h-[calc(100vh-2rem)]",
          size === "full" && "h-full",
          
          // Layout
          "flex flex-col",
          
          // Custom
          className
        )}
      >
        {/* Header */}
        {header || title || showCloseButton ? (
          <div className="flex items-start justify-between px-6 py-4 border-b border-border">
            <div className="space-y-1">
              {title && (
                <h2 id="modal-title" className="text-lg font-semibold text-foreground">
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-description" className="text-sm text-muted-foreground">
                  {description}
                </p>
              )}
              {header && !title && header}
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
        ) : null}

        {/* Body */}
        <div className={cn(
          "px-6 py-4 overflow-y-auto flex-1",
          !header && !showCloseButton && "pt-6"
        )}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

GarfixModal.displayName = "GarfixModal";

// ════════════════════════════════════════════════════════════════════════
// CONFIRMATION DIALOG
// ════════════════════════════════════════════════════════════════════════

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
}

export const GarfixConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  variant = "danger",
  isLoading = false,
}) => {
  const variantStyles = {
    danger: {
      confirm: "destructive" as const,
      icon: "🗑️",
    },
    warning: {
      confirm: "primary" as const,
      icon: "⚠️",
    },
    info: {
      confirm: "primary" as const,
      icon: "ℹ️",
    },
  };

  return (
    <GarfixModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <GarfixButton variant="outline" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </GarfixButton>
          <GarfixButton
            variant={variantStyles[variant].confirm}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </GarfixButton>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{variantStyles[variant].icon}</span>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>
    </GarfixModal>
  );
};

GarfixConfirmDialog.displayName = "GarfixConfirmDialog";
