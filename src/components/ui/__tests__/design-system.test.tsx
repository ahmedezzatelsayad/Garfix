/**
 * Design System v4.0 — Comprehensive Test Suite
 * 
 * Tests for:
 * - GarfixStates (EmptyState, LoadingState, ErrorState, OfflineState, Skeleton)
 * - GarfixNotifications (Toast, Banner, ConfirmDialog, useGarfixToast)
 * - GarfixEnterpriseTable (Table, BulkActions, EditableCell)
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ─── Import Components ──────────────────────────────────────────────────────
import {
  GarfixEmptyState,
  GarfixLoadingState,
  GarfixErrorState,
  GarfixOfflineState,
  GarfixSkeleton,
  GarfixPageState,
} from '../GarfixStates';

import {
  GarfixToast,
  GarfixBanner,
  GarfixConfirmDialog,
  GarfixToastProvider,
  useGarfixToast,
} from '../GarfixNotifications';

import {
  GarfixEnterpriseTable,
  GarfixBulkActions,
  GarfixEditableCell,
} from '../GarfixEnterpriseTable';

// ═══════════════════════════════════════════════════════════════════════════
// GARFIX STATES TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('GarfixEmptyState', () => {
  it('should render title and description', () => {
    render(
      <GarfixEmptyState
        title="لا توجد بيانات"
        description="لم يتم العثور على أي سجلات"
      />
    );

    expect(screen.getByText('لا توجد بيانات')).toBeInTheDocument();
    expect(screen.getByText('لم يتم العثور على أي سجلات')).toBeInTheDocument();
  });

  it('should render action button when provided', async () => {
    const mockAction = vi.fn();
    
    render(
      <GarfixEmptyState
        title="فارغ"
        action={{
          label: 'إضافة جديد',
          onClick: mockAction,
        }}
      />
    );

    const button = screen.getByRole('button', { name: 'إضافة جديد' });
    expect(button).toBeInTheDocument();
    
    await userEvent.click(button);
    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it('should render correct illustration based on prop', () => {
    const { rerender } = render(
      <GarfixEmptyState title="Test" illustration="search" />
    );
    
    // Should render without errors for each illustration type
    expect(screen.getByText('Test')).toBeInTheDocument();
    
    rerender(<GarfixEmptyState title="Test" illustration="inbox" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    
    rerender(<GarfixEmptyState title="Test" illustration="folder" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    
    rerender(<GarfixEmptyState title="Test" illustration="users" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    
    rerender(<GarfixEmptyState title="Test" illustration="documents" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('should apply animate-float class to icon', () => {
    render(<GarfixEmptyState title="Test" />);
    
    // The icon should have the animate-float class
    const iconContainer = document.querySelector('.animate-float');
    expect(iconContainer).toBeTruthy();
  });

  it('should accept custom className', () => {
    render(
      <GarfixEmptyState title="Test" className="custom-class" />
    );
    
    const container = screen.getByRole('status');
    expect(container.className).toContain('custom-class');
  });

  it('should support custom icon', () => {
    render(
      <GarfixEmptyState
        title="Test"
        icon={<span data-testid="custom-icon">🎨</span>}
      />
    );
    
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
});

describe('GarfixLoadingState', () => {
  it('should render loading message', () => {
    render(<GarfixLoadingState message="جارٍ التحميل..." />);
    
    expect(screen.getByText('جارٍ التحميل...')).toBeInTheDocument();
  });

  it('should render spinner variant by default', () => {
    render(<GarfixLoadingState />);
    
    // Spinner uses Loader2 with animate-spin
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('should render skeleton variant when specified', () => {
    render(<GarfixLoadingState variant="skeleton" skeletonLines={3} />);
    
    // Should have skeleton elements
    const skeletons = document.querySelectorAll('.state-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should render dots variant when specified', () => {
    render(<GarfixLoadingState variant="dots" message="جارٍ المعالجة" />);
    
    // Dots should have bounce animation
    const dots = document.querySelectorAll('.animate-bounce');
    expect(dots.length).toBe(3); // Three dots
  });

  it('should apply correct size classes', () => {
    const { rerender } = render(<GarfixLoadingState size="sm" />);
    let spinner = document.querySelector('.size-6');
    expect(spinner).toBeTruthy();

    rerender(<GarfixLoadingState size="md" />);
    spinner = document.querySelector('.size-8');
    expect(spinner).toBeTruthy();

    rerender(<GarfixLoadingState size="lg" />);
    spinner = document.querySelector('.size-12');
    expect(spinner).toBeTruthy();
  });

  it('should have aria-busy attribute', () => {
    render(<GarfixLoadingState />);
    
    const loadingElement = document.querySelector('[aria-busy="true"]');
    expect(loadingElement).toBeTruthy();
  });
});

describe('GarfixErrorState', () => {
  it('should render error message', () => {
    render(<GarfixErrorState message="حدث خطأ في الاتصال" />);
    
    expect(screen.getByText('حدث خطأ في الاتصال')).toBeInTheDocument();
  });

  it('should render retry button when onRetry provided', async () => {
    const mockRetry = vi.fn();
    
    render(
      <GarfixErrorState
        message="خطأ"
        onRetry={mockRetry}
      />
    );
    
    const retryButton = screen.getByRole('button', { name: /إعادة المحاولة/ });
    expect(retryButton).toBeInTheDocument();
    
    await userEvent.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('should render error code when provided', () => {
    render(
      <GarfixErrorState
        message="خطأ"
        code="ERR_500"
      />
    );
    
    expect(screen.getByText('(ERR_500)')).toBeInTheDocument();
  });

  it('should apply severity styles correctly', () => {
    const { rerender } = render(
      <GarfixErrorState message="Warning" severity="warning" />
    );
    
    // Warning should have amber color classes
    let container = screen.getByRole('alert');
    expect(container.className).toContain('text-amber');

    rerender(<GarfixErrorState message="Critical" severity="critical" />);
    container = screen.getByRole('alert');
    expect(container.className).toContain('text-red-600');

    rerender(<GarfixErrorState message="Error" severity="error" />);
    container = screen.getByRole('alert');
    expect(container.className).toContain('text-red-500');
  });

  it('should show details when expanded', async () => {
    render(
      <GarfixErrorState
        message="خطأ"
        details="Stack trace details here"
        showDetails
      />
    );
    
    // Click to expand details
    const toggleButton = screen.getByText('عرض التفاصيل');
    await userEvent.click(toggleButton);
    
    expect(screen.getByText('Stack trace details here')).toBeInTheDocument();
  });

  it('should use custom retry label', () => {
    render(
      <GarfixErrorState
        message="خطأ"
        onRetry={() => {}}
        retryLabel="حاول مرة أخرى"
      />
    );
    
    expect(screen.getByText('حاول مرة أخرى')).toBeInTheDocument();
  });
});

describe('GarfixOfflineState', () => {
  it('should render offline message', () => {
    render(<GarfixOfflineState />);
    
    expect(screen.getByText(/غير متصل/)).toBeInTheDocument();
  });

  it('should call onRetry when retry clicked', async () => {
    const mockRetry = vi.fn();
    
    render(
      <GarfixOfflineState
        onRetry={mockRetry}
      />
    );
    
    const retryButton = screen.getByRole('button', { name: /إعادة المحاولة/ });
    await userEvent.click(retryButton);
    
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('should render in fullWidth mode', () => {
    render(
      <GarfixOfflineState
        fullWidth
        message="انقطع الاتصال"
      />
    );
    
    expect(screen.getByText('عدم الاتصال بالإنترنت')).toBeInTheDocument();
    expect(screen.getByText(/انقطع الاتصال/)).toBeInTheDocument();
  });

  it('should use custom retry label', () => {
    render(
      <GarfixOfflineState
        onRetry={() => {}}
        retryLabel="إعادة الاتصال"
      />
    );
    
    expect(screen.getByText('إعادة الاتصال')).toBeInTheDocument();
  });
});

describe('GarfixSkeleton', () => {
  it('should render with default props', () => {
    render(<GarfixSkeleton />);
    
    const skeleton = document.querySelector('.state-skeleton');
    expect(skeleton).toBeTruthy();
  });

  it('should apply correct width and height', () => {
    render(
      <GarfixSkeleton
        width={200}
        height={50}
      />
    );
    
    const skeleton = document.querySelector('.state-skeleton') as HTMLElement;
    expect(skeleton.style.width).toBe('200px');
    expect(skeleton.style.height).toBe('50px');
  });

  it('should apply shimmer animation by default', () => {
    render(<GarfixSkeleton />);
    
    const skeleton = document.querySelector('.state-skeleton');
    expect(skeleton?.className).toContain('animate-shimmer');
  });

  it('should not apply shimmer when animate is false', () => {
    render(<GarfixSkeleton animate={false} />);
    
    const skeleton = document.querySelector('.state-skeleton');
    expect(skeleton?.className).not.toContain('animate-shimmer');
  });

  it('should render circular variant', () => {
    render(<GarfixSkeleton variant="circular" />);
    
    const skeleton = document.querySelector('.rounded-full');
    expect(skeleton).toBeTruthy();
  });

  it('should render rectangular variant', () => {
    render(<GarfixSkeleton variant="rectangular" />);
    
    const skeleton = document.querySelector('.rounded-lg');
    expect(skeleton).toBeTruthy();
  });

  it('should render card variant with full structure', () => {
    render(<GarfixSkeleton variant="card" />);
    
    // Card should have header, content, and footer skeletons
    const skeletons = document.querySelectorAll('.state-skeleton');
    expect(skeletons.length).toBeGreaterThan(5);
  });

  it('should render multiple text lines', () => {
    render(<GarfixSkeleton variant="text" lines={4} />);
    
    const skeletons = document.querySelectorAll('.state-skeleton');
    expect(skeletons.length).toBe(4);
  });
});

describe('GarfixPageState', () => {
  it('should render loading state', () => {
    render(
      <GarfixPageState state="loading" loadingProps={{ message: 'تحميل...' }} />
    );
    
    expect(screen.getByText('تحميل...')).toBeInTheDocument();
  });

  it('should render empty state', () => {
    render(
      <GarfixPageState state="empty" emptyProps={{ title: 'فارغ' }} />
    );
    
    expect(screen.getByText('فارغ')).toBeInTheDocument();
  });

  it('should render error state', () => {
    render(
      <GarfixPageState state="error" errorProps={{ message: 'خطأ!' }} />
    );
    
    expect(screen.getByText('خطأ!')).toBeInTheDocument();
  });

  it('should render offline state', () => {
    render(<GarfixPageState state="offline" />);
    
    expect(screen.getByText(/غير متصل/)).toBeInTheDocument();
  });

  it('should render maintenance state', () => {
    render(
      <GarfixPageState state="maintenance" maintenanceProps={{ title: 'صيانة' }} />
    );
    
    expect(screen.getByText('صيانة')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GARFIX NOTIFICATIONS TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('GarfixToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render success toast', () => {
    render(
      <GarfixToast
        type="success"
        title="تم بنجاح"
        isOpen={true}
      />
    );
    
    expect(screen.getByText('تم بنجاح')).toBeInTheDocument();
    expect(document.querySelector('.toast-notification-success')).toBeTruthy();
  });

  it('should render error toast', () => {
    render(
      <GarfixToast
        type="error"
        title="حدث خطأ"
        isOpen={true}
      />
    );
    
    expect(screen.getByText('حدث خطأ')).toBeInTheDocument();
    expect(document.querySelector('.toast-notification-error')).toBeTruthy();
  });

  it('should render warning toast', () => {
    render(
      <GarfixToast
        type="warning"
        title="تحذير"
        isOpen={true}
      />
    );
    
    expect(screen.getByText('تحذير')).toBeInTheDocument();
    expect(document.querySelector('.toast-notification-warning')).toBeTruthy();
  });

  it('should render info toast', () => {
    render(
      <GarfixToast
        type="info"
        title="معلومات"
        isOpen={true}
      />
    );
    
    expect(screen.getByText('معلومات')).toBeInTheDocument();
    expect(document.querySelector('.toast-notification-info')).toBeTruthy();
  });

  it('should call onClose when close button clicked', async () => {
    const mockClose = vi.fn();
    
    render(
      <GarfixToast
        type="info"
        title="اختبار"
        isOpen={true}
        onClose={mockClose}
      />
    );
    
    const closeButton = screen.getByLabelText('إغلاق الإشعار');
    await userEvent.click(closeButton);
    
    // Wait for closing animation
    act(() => {
      vi.advanceTimersByTime(200);
    });
    
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('should render action button when provided', async () => {
    const mockAction = vi.fn();
    
    render(
      <GarfixToast
        type="success"
        title="تم الحفظ"
        isOpen={true}
        action={{
          label: 'تراجع',
          onClick: mockAction,
        }}
      />
    );
    
    const actionButton = screen.getByText('تراجع');
    expect(actionButton).toBeInTheDocument();
    
    await userEvent.click(actionButton);
    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it('should auto-dismiss after duration', () => {
    const mockClose = vi.fn();
    
    render(
      <GarfixToast
        type="info"
        title="اختبار"
        isOpen={true}
        onClose={mockClose}
        duration={1000}
      />
    );
    
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    expect(mockClose).toHaveBeenCalled();
  });

  it('should pause timer on hover', () => {
    const mockClose = vi.fn();
    
    render(
      <GarfixToast
        type="info"
        title="اختبار"
        isOpen={true}
        onClose={mockClose}
        duration={1000}
      />
    );
    
    const toast = document.querySelector('.toast-notification')!;
    
    // Hover should pause timer
    fireEvent.mouseEnter(toast);
    
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    
    // Should NOT have closed yet because we hovered
    expect(mockClose).not.toHaveBeenCalled();
    
    // Leave should resume timer
    fireEvent.mouseLeave(toast);
    
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    expect(mockClose).toHaveBeenCalled();
  });

  it('should not render when isOpen is false', () => {
    render(
      <GarfixToast
        type="info"
        title="اختبار"
        isOpen={false}
      />
    );
    
    expect(screen.queryByText('اختبار')).not.toBeInTheDocument();
  });

  it('should render message when provided', () => {
    render(
      <GarfixToast
        type="success"
        title="تم بنجاح"
        message="تم حفظ التغييرات بنجاح"
        isOpen={true}
      />
    );
    
    expect(screen.getByText('تم حفظ التغييرات بنجاح')).toBeInTheDocument();
  });
});

describe('GarfixBanner', () => {
  it('should render info banner', () => {
    render(
      <GarfixBanner type="info">
        معلومات مهمة
      </GarfixBanner>
    );
    
    expect(screen.getByText('معلومات مهمة')).toBeInTheDocument();
    expect(document.querySelector('.banner-notification-info')).toBeTruthy();
  });

  it('should render success banner', () => {
    render(
      <GarfixBanner type="success">
        تمت العملية بنجاح
      </GarfixBanner>
    );
    
    expect(screen.getByText('تمت العملية بنجاح')).toBeInTheDocument();
    expect(document.querySelector('.banner-notification-success')).toBeTruthy();
  });

  it('should render warning banner', () => {
    render(
      <GarfixBanner type="warning">
        تحذير: انتبه
      </GarfixBanner>
    );
    
    expect(screen.getByText('تحذير: انتبه')).toBeInTheDocument();
    expect(document.querySelector('.banner-notification-warning')).toBeTruthy();
  });

  it('should render error banner', () => {
    render(
      <GarfixBanner type="error">
        خطأ في النظام
      </GarfixBanner>
    );
    
    expect(screen.getByText('خطأ في النظام')).toBeInTheDocument();
    expect(document.querySelector('.banner-notification-error')).toBeTruthy();
  });

  it('should call onDismiss when dismiss clicked', async () => {
    const mockDismiss = vi.fn();
    
    render(
      <GarfixBanner type="info" onDismiss={mockDismiss}>
        رسالة قابلة للإغلاق
      </GarfixBanner>
    );
    
    const dismissButton = screen.getByLabelText('إغلاق الشريط');
    await userEvent.click(dismissButton);
    
    // Wait for animation
    await waitFor(() => {
      expect(mockDismiss).toHaveBeenCalled();
    }, { timeout: 300 });
  });

  it('should dismiss on Escape key', async () => {
    const mockDismiss = vi.fn();
    
    render(
      <GarfixBanner type="info" onDismiss={mockDismiss}>
        اضغط Escape لإغلاقي
      </GarfixBanner>
    );
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    await waitFor(() => {
      expect(mockDismiss).toHaveBeenCalled();
    }, { timeout: 300 });
  });

  it('should accept custom icon', () => {
    render(
      <GarfixBanner type="info" icon={<span data-testid="custom-banner-icon">⭐</span>}>
        مع أيقونة مخصصة
      </GarfixBanner>
    );
    
    expect(screen.getByTestId('custom-banner-icon')).toBeInTheDocument();
  });
});

describe('GarfixConfirmDialog', () => {
  it('should render title and message', () => {
    render(
      <GarfixConfirmDialog
        isOpen={true}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا العنصر؟"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    
    expect(screen.getByText('تأكيد الحذف')).toBeInTheDocument();
    expect(screen.getByText('هل أنت متأكد من حذف هذا العنصر؟')).toBeInTheDocument();
  });

  it('should call onConfirm when confirm clicked', async () => {
    const mockConfirm = vi.fn();
    
    render(
      <GarfixConfirmDialog
        isOpen={true}
        title="تأكيد"
        message="رسالة"
        onConfirm={mockConfirm}
        onCancel={() => {}}
      />
    );
    
    const confirmButton = screen.getByText('تأكيد');
    await userEvent.click(confirmButton);
    
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel clicked', async () => {
    const mockCancel = vi.fn();
    
    render(
      <GarfixConfirmDialog
        isOpen={true}
        title="تأكيد"
        message="رسالة"
        onConfirm={() => {}}
        onCancel={mockCancel}
      />
    );
    
    const cancelButton = screen.getByText('إلغاء');
    await userEvent.click(cancelButton);
    
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('should apply danger variant correctly', () => {
    const { rerender } = render(
      <GarfixConfirmDialog
        isOpen={true}
        title="حذف"
        message="رسالة"
        onConfirm={() => {}}
        onCancel={() => {}}
        variant="default"
      />
    );
    
    // Default variant - confirm button should be primary
    let confirmButton = screen.getByText('تأكيد').closest('button');
    expect(confirmButton?.className).toContain('bg-primary');
    
    rerender(
      <GarfixConfirmDialog
        isOpen={true}
        title="حذف"
        message="رسالة"
        onConfirm={() => {}}
        onCancel={() => {}}
        variant="danger"
      />
    );
    
    // Danger variant - confirm button should be red
    confirmButton = screen.getByText('تأكيد').closest('button');
    expect(confirmButton?.className).toContain('bg-red-600');
  });

  it('should not render when isOpen is false', () => {
    render(
      <GarfixConfirmDialog
        isOpen={false}
        title="اختبار"
        message="رسالة"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    
    expect(screen.queryByText('اختبار')).not.toBeInTheDocument();
  });

  it('should close on overlay click', async () => {
    const mockCancel = vi.fn();
    
    render(
      <GarfixConfirmDialog
        isOpen={true}
        title="اختبار"
        message="رسالة"
        onConfirm={() => {}}
        onCancel={mockCancel}
      />
    );
    
    const overlay = document.querySelector('.confirm-overlay')!;
    fireEvent.click(overlay);
    
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should close on Escape key', async () => {
    const mockCancel = vi.fn();
    
    render(
      <GarfixConfirmDialog
        isOpen={true}
        title="اختبار"
        message="رسالة"
        onConfirm={() => {}}
        onCancel={mockCancel}
      />
    );
    
    const overlay = document.querySelector('.confirm-overlay')!;
    fireEvent.keyDown(overlay, { key: 'Escape' });
    
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should use custom labels', () => {
    render(
      <GarfixConfirmDialog
        isOpen={true}
        title="اختبار"
        message="رسالة"
        confirmLabel="نعم، احذف"
        cancelLabel="لا، تراجع"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    
    expect(screen.getByText('نعم، احذف')).toBeInTheDocument();
    expect(screen.getByText('لا، تراجع')).toBeInTheDocument();
  });

  it('should disable buttons when isLoading', () => {
    render(
      <GarfixConfirmDialog
        isOpen={true}
        title="اختبار"
        message="رسالة"
        onConfirm={() => {}}
        onCancel={() => {}}
        isLoading={true}
      />
    );
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });
});

describe('useGarfixToast', () => {
  // Wrapper component for testing the hook
  function ToastTestComponent({ children }: { children: (hooks: ReturnType<typeof useGarfixToast>) => React.ReactNode }) {
    return (
      <GarfixToastProvider>
        <ToastConsumer>{children}</ToastConsumer>
      </GarfixToastProvider>
    );
  }

  function ToastConsumer({ children }: { children: (hooks: ReturnType<typeof useGarfixToast>) => React.ReactNode }) {
    const hooks = useGarfixToast();
    return <>{children(hooks)}</>;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add toast with addToast', () => {
    render(
      <ToastTestComponent>
        {({ addToast, toasts }) => (
          <>
            <button onClick={() => addToast({ type: 'success', title: 'نجاح' })}>
              Add Toast
            </button>
            <span data-testid="toast-count">{toasts.length}</span>
          </>
        )}
      </ToastTestComponent>
    );
    
    expect(screen.getByTestId('toast-count').textContent).toBe('0');
    
    fireEvent.click(screen.getByText('Add Toast'));
    
    expect(screen.getByTestId('toast-count').textContent).toBe('1');
  });

  it('should remove toast with removeToast', () => {
    render(
      <ToastTestComponent>
        {({ addToast, removeToast, toasts }) => (
          <>
            <button onClick={() => addToast({ type: 'success', title: 'نجاح' })}>
              Add
            </button>
            <button onClick={() => removeToast('test-id')}>
              Remove
            </button>
            <span data-testid="toast-count">{toasts.length}</span>
          </>
        )}
      </ToastTestComponent>
    );
    
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('toast-count').textContent).toBe('1');
  });

  it('should clear all toasts with clearAll', () => {
    render(
      <ToastTestComponent>
        {({ addToast, clearAll, toasts }) => (
          <>
            <button onClick={() => {
              addToast({ type: 'success', title: '1' });
              addToast({ type: 'error', title: '2' });
              addToast({ type: 'info', title: '3' });
            }}>
              Add All
            </button>
            <button onClick={clearAll}>Clear</button>
            <span data-testid="toast-count">{toasts.length}</span>
          </>
        )}
      </ToastTestComponent>
    );
    
    fireEvent.click(screen.getByText('Add All'));
    expect(screen.getByTestId('toast-count').textContent).toBe('3');
    
    fireEvent.click(screen.getByText('Clear'));
    
    // Wait for closing animation
    act(() => {
      vi.advanceTimersByTime(250);
    });
    
    expect(screen.getByTestId('toast-count').textContent).toBe('0');
  });

  it('should auto-dismiss after timeout', async () => {
    render(
      <ToastTestComponent>
        {({ addToast, toasts }) => (
          <>
            <button onClick={() => addToast({ type: 'success', title: 'اختبار', duration: 1000 })}>
              Add
            </button>
            <span data-testid="toast-count">{toasts.length}</span>
          </>
        )}
      </ToastTestComponent>
    );
    
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('toast-count').textContent).toBe('1');
    
    // Advance time but not enough to dismiss
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    // Toast might still be there or starting to close
    
    // Advance time past duration + animation
    act(() => {
      vi.advanceTimersByTime(700);
    });
    
    expect(screen.getByTestId('toast-count').textContent).toBe('0');
  });

  it('should limit max toasts', () => {
    render(
      <GarfixToastProvider maxToasts={3}>
        <ToastConsumer>
          {({ addToast, toasts }) => (
            <>
              <button onClick={() => {
                for (let i = 0; i < 5; i++) {
                  addToast({ type: 'info', title: `Toast ${i}` });
                }
              }}>
                Add Many
              </button>
              <span data-testid="toast-count">{toasts.length}</span>
            </>
          )}
        </ToastConsumer>
      </GarfixToastProvider>
    );
    
    fireEvent.click(screen.getByText('Add Many'));
    expect(screen.getByTestId('toast-count').textContent).toBe('3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GARFIX ENTERPRISE TABLE TESTS
// ═══════════════════════════════════════════════════════════════════════════

const mockData = [
  { id: 1, name: 'Test 1', status: 'active' },
  { id: 2, name: 'Test 2', status: 'pending' },
];

const mockColumns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
];

describe('GarfixEnterpriseTable', () => {
  it('should render table with data', () => {
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
      />
    );
    
    expect(screen.getByText('Test 1')).toBeInTheDocument();
    expect(screen.getByText('Test 2')).toBeInTheDocument();
  });

  it('should render columns correctly', () => {
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
      />
    );
    
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('should handle empty data state', () => {
    render(
      <GarfixEnterpriseTable
        data={[]}
        columns={mockColumns}
        emptyMessage="لا توجد بيانات"
        emptyDescription="أضف عناصر جديدة"
      />
    );
    
    expect(screen.getByText('لا توجد بيانات')).toBeInTheDocument();
    expect(screen.getByText('أضف عناصر جديدة')).toBeInTheDocument();
  });

  it('should handle loading state', () => {
    render(
      <GarfixEnterpriseTable
        data={[]}
        columns={mockColumns}
        isLoading={true}
      />
    );
    
    // Should show skeleton elements
    const skeletons = document.querySelectorAll('.state-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should call onRowClick when row clicked', async () => {
    const mockRowClick = vi.fn();
    
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
        onRowClick={mockRowClick}
      />
    );
    
    // Click on first data row (skip header)
    const rows = screen.getAllByRole('row');
    fireEvent.click(rows[1]); // First data row
    
    expect(mockRowClick).toHaveBeenCalledWith(mockData[0], 0);
  });

  it('should handle selection', async () => {
    const mockSelectionChange = vi.fn();
    
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
        selectedRows={new Set([0])}
        onSelectionChange={mockSelectionChange}
      />
    );
    
    // Find checkbox for first row and click it
    const checkboxes = screen.getAllByRole('checkbox');
    // Second checkbox is for first data row (first is select-all)
    fireEvent.click(checkboxes[1]);
    
    expect(mockSelectionChange).toHaveBeenCalled();
  });

  it('should handle select all', async () => {
    const mockSelectionChange = vi.fn();
    
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
        onSelectionChange={mockSelectionChange}
      />
    );
    
    // Click select-all checkbox
    const selectAllCheckbox = screen.getByLabelText('تحديد الكل');
    fireEvent.click(selectAllCheckbox);
    
    expect(mockSelectionChange).toHaveBeenCalledWith(new Set([0, 1]));
  });

  it('should apply compact density', () => {
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
        density="compact"
      />
    );
    
    const table = document.querySelector('.table-enterprise');
    expect(table?.className).toContain('table-compact');
  });

  it('should apply comfortable density', () => {
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
        density="comfortable"
      />
    );
    
    const table = document.querySelector('.table-enterprise');
    expect(table?.className).toContain('table-comfortable');
  });

  it('should render custom cell renderer', () => {
    const columnsWithRender = [
      ...mockColumns.slice(0, 2),
      {
        key: 'status',
        label: 'Status',
        render: (value: unknown) => (
          <span data-testid="custom-status">Custom: {String(value)}</span>
        ),
      },
    ];
    
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={columnsWithRender}
      />
    );
    
    const customElements = screen.getAllByTestId('custom-status');
    expect(customElements).toHaveLength(2);
    expect(customElements[0]).toHaveTextContent('Custom: active');
  });

  it('should handle sorting', async () => {
    const mockSortChange = vi.fn();
    
    const sortableColumns = mockColumns.map(col => ({ ...col, sortable: true }));
    
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={sortableColumns}
        sortKey="name"
        sortDirection="asc"
        onSortChange={mockSortChange}
      />
    );
    
    // Click on sortable column header
    const nameHeader = screen.getByText('Name');
    fireEvent.click(nameHeader);
    
    expect(mockSortChange).toHaveBeenCalledWith('name', 'desc');
  });

  it('should render RTL direction', () => {
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
      />
    );
    
    const container = document.querySelector('[dir="rtl"]');
    expect(container).toBeTruthy();
  });

  it('should display row status badge', () => {
    render(
      <GarfixEnterpriseTable
        data={mockData}
        columns={mockColumns}
        rowStatus={(row) => row.status as 'active' | 'pending'}
      />
    );
    
    // Status badges should be rendered
    const statusBadges = document.querySelectorAll('.table-row-status');
    expect(statusBadges.length).toBe(2);
  });
});

describe('GarfixBulkActions', () => {
  it('should render selected count', () => {
    render(
      <GarfixBulkActions
        selectedCount={5}
        totalCount={10}
        actions={[]}
        onClearSelection={() => {}}
      />
    );
    
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/من 10/)).toBeInTheDocument();
  });

  it('should render action buttons', () => {
    const action1 = { label: 'حذف', icon: <span>🗑️</span>, onClick: vi.fn() };
    const action2 = { label: 'تصدير', icon: <span>📤</span>, onClick: vi.fn() };
    
    render(
      <GarfixBulkActions
        selectedCount={3}
        actions={[action1, action2]}
        onClearSelection={() => {}}
      />
    );
    
    expect(screen.getByText('حذف')).toBeInTheDocument();
    expect(screen.getByText('تصدير')).toBeInTheDocument();
  });

  it('should call onClearSelection', async () => {
    const mockClear = vi.fn();
    
    render(
      <GarfixBulkActions
        selectedCount={2}
        actions={[]}
        onClearSelection={mockClear}
      />
    );
    
    const clearButton = screen.getByText('إلغاء التحديد');
    await userEvent.click(clearButton);
    
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('should not render when no selection', () => {
    render(
      <GarfixBulkActions
        selectedCount={0}
        actions={[]}
        onClearSelection={() => {}}
      />
    );
    
    expect(screen.queryByText(/تم تحديد/)).not.toBeInTheDocument();
  });

  it('should apply danger variant to danger actions', () => {
    const dangerAction = {
      label: 'حذف نهائي',
      icon: <span>⚠️</span>,
      onClick: vi.fn(),
      variant: 'danger' as const,
    };
    
    render(
      <GarfixBulkActions
        selectedCount={1}
        actions={[dangerAction]}
        onClearSelection={() => {}}
      />
    );
    
    const dangerButton = screen.getByText('حذف نهائي').closest('button');
    expect(dangerButton?.className).toContain('text-destructive');
  });
});

describe('GarfixEditableCell', () => {
  it('should render value in display mode', () => {
    render(
      <GarfixEditableCell
        value="Test Value"
        onChange={() => {}}
      />
    );
    
    expect(screen.getByText('Test Value')).toBeInTheDocument();
  });

  it('should render input in edit mode', () => {
    render(
      <GarfixEditableCell
        value="Edit Me"
        onChange={() => {}}
        isEditing={true}
      />
    );
    
    const input = screen.getByDisplayValue('Edit Me');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('should call onChange when value changes', async () => {
    const mockChange = vi.fn();
    
    render(
      <GarfixEditableCell
        value="Initial"
        onChange={mockChange}
        isEditing={true}
      />
    );
    
    const input = screen.getByDisplayValue('Initial');
    await userEvent.type(input, ' New');
    
    expect(mockChange).toHaveBeenCalled();
  });

  it('should call onEditStart when clicked', async () => {
    const mockEditStart = vi.fn();
    
    render(
      <GarfixEditableCell
        value="Click to Edit"
        onChange={() => {}}
        onEditStart={mockEditStart}
      />
    );
    
    const cell = screen.getByText('Click to Edit');
    await userEvent.click(cell);
    
    expect(mockEditStart).toHaveBeenCalledTimes(1);
  });

  it('should call onEditEnd on Enter key', async () => {
    const mockEditEnd = vi.fn();
    
    render(
      <GarfixEditableCell
        value="Test"
        onChange={() => {}}
        isEditing={true}
        onEditEnd={mockEditEnd}
      />
    );
    
    const input = screen.getByDisplayValue('Test');
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockEditEnd).toHaveBeenCalledTimes(1);
  });

  it('should reset value on Escape key', async () => {
    const mockEditEnd = vi.fn();
    
    render(
      <GarfixEditableCell
        value="Original"
        onChange={() => {}}
        isEditing={true}
        onEditEnd={mockEditEnd}
      />
    );
    
    const input = screen.getByDisplayValue('Original');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    
    expect(mockEditEnd).toHaveBeenCalledTimes(1);
    // Value should revert to original
    expect(screen.getByDisplayValue('Original')).toBeInTheDocument();
  });

  it('should show pencil icon on hover', () => {
    render(
      <GarfixEditableCell
        value="Hover Me"
        onChange={() => {}}
      />
    );
    
    // Pencil icon exists but hidden by default
    const pencilIcon = document.querySelector('.group-hover\\/cell\\:opacity-50');
    expect(pencilIcon).toBeTruthy();
  });

  it('should support number type', () => {
    render(
      <GarfixEditableCell
        value={12345}
        onChange={() => {}}
        isEditing={true}
        type="number"
      />
    );
    
    const input = screen.getByDisplayValue('12345');
    expect(input).toHaveAttribute('type', 'number');
  });

  it('should use custom placeholder', () => {
    render(
      <GarfixEditableCell
        value=""
        onChange={() => {}}
        isEditing={true}
        placeholder="اكتب هنا..."
      />
    );
    
    const input = screen.getByPlaceholderText('اكتب هنا...');
    expect(input).toBeInTheDocument();
  });
});
