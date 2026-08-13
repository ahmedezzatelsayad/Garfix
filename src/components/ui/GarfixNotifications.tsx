/**
 * GarfiX Notifications System — Design System v4.0
 * 
 * Components:
 * - GarfixToast: Toast notification with slide animation (180ms)
 * - GarfixBanner: Banner notification with slide-down animation (220ms)
 * - GarfixConfirmDialog: Modal confirmation dialog with scale animation (220ms)
 * - useGarfixToast: Hook for managing multiple toasts with auto-dismiss
 * 
 * Features:
 * - RTL support
 * - Auto-dismiss after 5 seconds (configurable)
 * - Stackable toasts
 * - Portal-based rendering (document.body)
 * - Accessible (ARIA attributes, focus trap in dialog)
 */

'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
  AlertOctagon,
  Loader2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type BannerType = 'info' | 'success' | 'warning' | 'error';
export type ConfirmDialogVariant = 'default' | 'danger';

export interface ToastProps {
  id?: string;
  type: ToastType;
  title: string;
  message?: string;
  onClose?: () => void;
  isOpen: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number; // Auto-dismiss duration in ms (default: 5000)
}

export interface BannerProps {
  type: BannerType;
  children: React.ReactNode;
  onDismiss?: () => void;
  icon?: React.ReactNode;
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

interface ToastItem extends Omit<ToastProps, 'isOpen' | 'onClose'> {
  id: string;
  isClosing: boolean;
}

export interface UseToastReturn {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastProps, 'id' | 'isOpen' | 'onClose'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICON MAPS
// ═══════════════════════════════════════════════════════════════════════════

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="toast-notification-icon" />,
  error: <XCircle className="toast-notification-icon" />,
  warning: <AlertTriangle className="toast-notification-icon" />,
  info: <Info className="toast-notification-icon" />,
};

const bannerIcons: Record<BannerType, React.ReactNode> = {
  info: <Info size={20} />,
  success: <CheckCircle size={20} />,
  warning: <AlertTriangle size={20} />,
  error: <XCircle size={20} />,
};

// ═══════════════════════════════════════════════════════════════════════════
// TOAST CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

const ToastContext = createContext<UseToastReturn | null>(null);

export const useGarfixToastContext = (): UseToastReturn => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useGarfixToastContext must be used within a GarfixToastProvider');
  }
  return context;
};

// ═══════════════════════════════════════════════════════════════════════════
// GARFIX TOAST COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface GarfixToastProps extends ToastProps {
  onRemove?: () => void;
}

export const GarfixToast: React.FC<GarfixToastProps> = ({
  type,
  title,
  message,
  onClose,
  isOpen,
  action,
  duration = 5000,
  onRemove,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  // Clear auto-dismiss timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start auto-dismiss timer
  const startTimer = useCallback(() => {
    if (duration > 0) {
      clearTimer();
      timerRef.current = setTimeout(() => {
        handleClose();
      }, duration);
    }
  }, [duration, clearTimer]);

  // Handle close with animation
  const handleClose = useCallback(() => {
    if (isClosing) return;
    
    setIsClosing(true);
    // Wait for exit animation (180ms + small buffer)
    setTimeout(() => {
      onClose?.();
      onRemove?.();
    }, 200);
  }, [isClosing, onClose, onRemove]);

  // Handle action click
  const handleActionClick = useCallback(() => {
    action?.onClick();
    handleClose();
  }, [action, handleClose]);

  // Setup auto-dismiss and cleanup
  useEffect(() => {
    if (isOpen && !isClosing) {
      startTimer();
    }

    return () => {
      clearTimer();
    };
  }, [isOpen, isClosing, startTimer, clearTimer]);

  // Pause timer on hover/focus for accessibility
  const handleMouseEnter = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const handleMouseLeave = useCallback(() => {
    if (isOpen && !isClosing) {
      startTimer();
    }
  }, [isOpen, isClosing, startTimer]);

  if (!isOpen) return null;

  return (
    <div
      ref={toastRef}
      className={`toast-notification toast-notification-${type} ${isClosing ? 'closing' : ''}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Icon */}
      <span className="toast-notification-icon" aria-hidden="true">
        {toastIcons[type]}
      </span>

      {/* Content */}
      <div className="toast-notification-content">
        <p className="toast-notification-title">{title}</p>
        {message && (
          <p className="toast-notification-message">{message}</p>
        )}
        {action && (
          <button
            onClick={handleActionClick}
            className="mt-2 text-xs font-medium px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors duration-120"
            style={{ transitionDuration: '120ms' }}
          >
            {action.label}
          </button>
        )}
      </div>

      {/* Close Button */}
      <button
        type="button"
        className="toast-notification-close"
        onClick={handleClose}
        aria-label="إغلاق الإشعار"
      >
        <X size={16} />
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// GARFIX BANNER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const GarfixBanner: React.FC<BannerProps> = ({
  type,
  children,
  onDismiss,
  icon,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const bannerRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    // Wait for animation to complete before calling onDismiss
    setTimeout(() => {
      onDismiss?.();
    }, 230); // 220ms animation + buffer
  }, [onDismiss]);

  // Keyboard dismiss (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        handleDismiss();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, handleDismiss]);

  if (!isVisible) return null;

  return (
    <div
      ref={bannerRef}
      className={`banner-notification banner-notification-${type}`}
      role="status"
      aria-live="polite"
    >
      {/* Icon */}
      <span className="flex-shrink-0" aria-hidden="true">
        {icon || bannerIcons[type]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>

      {/* Dismiss Button */}
      {onDismiss && (
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors duration-120"
          style={{ transitionDuration: '120ms' }}
          aria-label="إغلاق الشريط"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// GARFIX CONFIRM DIALOG COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const GarfixConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  variant = 'default',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus trap management
  useEffect(() => {
    if (isOpen) {
      // Store current focus
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Focus confirm button after mount
      setTimeout(() => {
        if (variant === 'danger') {
          cancelButtonRef.current?.focus();
        } else {
          confirmButtonRef.current?.focus();
        }
      }, 50);
    } else {
      // Restore focus when dialog closes
      previousActiveElement.current?.focus();
    }
  }, [isOpen, variant]);

  // Focus trap within dialog
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    const focusableElements = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (!focusableElements || focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey) {
      // Shift+Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  // Escape key handler
  const handleOverlayKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) {
      onCancel();
    }
  }, [onCancel, isLoading]);

  // Overlay click handler
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isLoading) {
      onCancel();
    }
  }, [onCancel, isLoading]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const confirmButtonClass = isDanger
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-primary text-primary-foreground hover:bg-primary/90';

  return createPortal(
    <div
      className="confirm-overlay"
      role="presentation"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onKeyDown={handleKeyDown}
      >
        {/* Icon */}
        <div className="flex items-center gap-3 mb-4" aria-hidden="true">
          {isDanger ? (
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertOctagon size={20} className="text-red-600 dark:text-red-400" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-primary" />
            </div>
          )}
        </div>

        {/* Title */}
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h2>

        {/* Message */}
        <p id="confirm-dialog-message" className="confirm-dialog-message">
          {message}
        </p>

        {/* Actions */}
        <div className="confirm-dialog-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
            style={{ transitionDuration: '150ms' }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 ${confirmButtonClass}`}
            style={{ transitionDuration: '150ms' }}
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// TOAST PROVIDER & HOOK
// ═══════════════════════════════════════════════════════════════════════════

interface GarfixToastProviderProps {
  children: React.ReactNode;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
}

export const GarfixToastProvider: React.FC<GarfixToastProviderProps> = ({
  children,
  position = 'bottom-left',
  maxToasts = 5,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  // Handle mounting for portal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount flag for portal
    setMounted(true);
  }, []);

  // Generate unique ID
  const generateId = useCallback((): string => {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add new toast
  const addToast = useCallback((
    toast: Omit<ToastProps, 'id' | 'isOpen' | 'onClose'>
  ): string => {
    const id = generateId();
    const newToast: ToastItem = {
      ...toast,
      id,
      isClosing: false,
    };

    setToasts(prev => {
      const updated = [...prev, newToast];
      // Limit the number of toasts
      if (updated.length > maxToasts) {
        return updated.slice(-maxToasts);
      }
      return updated;
    });

    return id;
  }, [generateId, maxToasts]);

  // Remove toast by ID
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Mark toast as closing (for animation)
  const closeToast = useCallback((id: string) => {
    setToasts(prev =>
      prev.map(toast =>
        toast.id === id ? { ...toast, isClosing: true } : toast
      )
    );
    // Actually remove after animation completes
    setTimeout(() => {
      removeToast(id);
    }, 200);
  }, [removeToast]);

  // Clear all toasts
  const clearAll = useCallback(() => {
    setToasts(prev => prev.map(toast => ({ ...toast, isClosing: true })));
    setTimeout(() => {
      setToasts([]);
    }, 200);
  }, []);

  // Context value
  const contextValue = useMemo<UseToastReturn>(() => ({
    toasts,
    addToast,
    removeToast,
    clearAll,
  }), [toasts, addToast, removeToast, clearAll]);

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    'top-right': { top: '1rem', right: '1rem' },
    'top-left': { top: '1rem', left: '1rem' },
    'bottom-right': { bottom: '1rem', right: '1rem' },
    'bottom-left': { bottom: '1rem', left: '1rem' },
    'top-center': { top: '1rem', left: '50%', transform: 'translateX(-50%)' },
    'bottom-center': { bottom: '1rem', left: '50%', transform: 'translateX(-50%)' },
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      
      {/* Toast Container - Portal based */}
      {mounted && createPortal(
        <div
          className="fixed z-[9999] flex flex-col-reverse gap-2 pointer-events-none"
          style={{
            ...positionStyles[position],
            maxWidth: 'calc(100vw - 2rem)',
          }}
          aria-label="إشعارات النظام"
          role="region"
        >
          {toasts.map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <GarfixToast
                {...toast}
                isOpen={!toast.isClosing}
                onClose={() => closeToast(toast.id)}
                onRemove={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for managing toast notifications.
 * Must be used within a GarfixToastProvider.
 * 
 * @example
 * ```tsx
 * const { addToast, removeToast, clearAll, toasts } = useGarfixToast();
 * 
 * // Add a success toast
 * addToast({
 *   type: 'success',
 *   title: 'تم بنجاح',
 *   message: 'تم حفظ التغييرات',
 * });
 * ```
 */
export const useGarfixToast = (): UseToastReturn => {
  return useGarfixToastContext();
};

// ═══════════════════════════════════════════════════════════════════════════
// QUICK TOAST FUNCTIONS (for convenience outside of hook context)
// ═══════════════════════════════════════════════════════════════════════════

// These can be used with event emitters or global state managers
export interface QuickToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

// Custom event for external toast triggering
export const triggerGarfixToast = (options: QuickToastOptions): void => {
  const event = new CustomEvent('garfix-toast', { detail: options });
  window.dispatchEvent(event);
};

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

const GarfixNotifications = {
  GarfixToast,
  GarfixBanner,
  GarfixConfirmDialog,
  GarfixToastProvider,
  useGarfixToast,
  useGarfixToastContext,
  triggerGarfixToast,
};

export default GarfixNotifications;
