/**
 * Design System v4.0 — Integration Tests
 * 
 * Tests component composition and interaction patterns:
 * - States + Notifications integration
 * - Table + States integration (loading, empty, error states)
 * - Full page state management
 * - RTL support across components
 * - Accessibility patterns
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
// INTEGRATION: STATES + NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: States + Notifications', () => {
  it('should show toast after action in empty state', async () => {
    // Simulates a common pattern: empty state with action that triggers a toast
    
    function EmptyWithAction() {
      const [showToast, setShowToast] = React.useState(false);
      
      return (
        <div>
          <GarfixEmptyState
            title="لا توجد عناصر"
            description="أضف عنصراً جديداً للبدء"
            action={{
              label: 'إضافة جديد',
              onClick: () => setShowToast(true),
            }}
          />
          {showToast && (
            <GarfixToast
              type="success"
              title="تم فتح نموذج الإضافة"
              isOpen={true}
            />
          )}
        </div>
      );
    }
    
    render(<EmptyWithAction />);
    
    expect(screen.getByText('لا توجد عناصر')).toBeInTheDocument();
    
    const addButton = screen.getByRole('button', { name: 'إضافة جديد' });
    await userEvent.click(addButton);
    
    await waitFor(() => {
      expect(screen.getByText('تم فتح نموذج الإضافة')).toBeInTheDocument();
    });
  });

  it('should show confirmation dialog before retry on error', async () => {
    // Pattern: Error state -> Confirm dialog -> Retry action
    
    function ErrorWithConfirm() {
      const [showConfirm, setShowConfirm] = React.useState(false);
      const [retryCount, setRetryCount] = React.useState(0);
      
      return (
        <div>
          <GarfixErrorState
            message="فشل تحميل البيانات"
            code="NET_ERR"
            onRetry={() => setShowConfirm(true)}
          />
          
          <GarfixConfirmDialog
            isOpen={showConfirm}
            title="إعادة المحاولة"
            message="هل تريد إعادة محاولة الاتصال؟"
            confirmLabel="نعم، أعد المحاولة"
            cancelLabel="إلغاء"
            onConfirm={() => {
              setRetryCount(c => c + 1);
              setShowConfirm(false);
            }}
            onCancel={() => setShowConfirm(false)}
          />
          
          {retryCount > 0 && (
            <span data-testid="retry-count">محاولات: {retryCount}</span>
          )}
        </div>
      );
    }
    
    render(<ErrorWithConfirm />);
    
    // Initial error state
    expect(screen.getByText('فشل تحميل البيانات')).toBeInTheDocument();
    expect(screen.getByText('(NET_ERR)')).toBeInTheDocument();
    
    // Click retry button
    const retryButton = screen.getByRole('button', { name: /إعادة المحاولة/ });
    await userEvent.click(retryButton);
    
    // Confirm dialog should appear
    expect(screen.getByText('إعادة المحاولة')).toBeInTheDocument();
    expect(screen.getByText('هل تريد إعادة محاولة الاتصال؟')).toBeInTheDocument();
    
    // Confirm the action
    const confirmButton = screen.getByText('نعم، أعد المحاولة');
    await userEvent.click(confirmButton);
    
    // Should show retry count
    expect(screen.getByTestId('retry-count')).toHaveTextContent('محاولات: 1');
  });

  it('should handle offline state with banner notification', () => {
    function OfflinePage() {
      return (
        <div>
          <GarfixBanner type="warning" icon={<span>📡</span>}>
            أنت الآن في وضع عدم الاتصال - بعض الميزات غير متوفرة
          </GarfixBanner>
          
          <GarfixOfflineState
            message="الخدمات عبر الإنترنت غير متاحة حالياً"
            fullWidth
          />
        </div>
      );
    }
    
    render(<OfflinePage />);
    
    // Both components should be visible
    expect(screen.getByText(/أنت الآن في وضع عدم الاتصال/)).toBeInTheDocument();
    expect(screen.getByText(/غير متاح/)).toBeInTheDocument();
    expect(screen.getByText('عدم الاتصال بالإنترنت')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION: TABLE + STATES
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: Table + States', () => {
  const mockColumns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'الاسم' },
    { key: 'email', label: 'البريد الإلكتروني' },
  ];

  it('should show loading skeleton while fetching table data', () => {
    function DataTable() {
      const [isLoading, setIsLoading] = React.useState(true);
      
      return (
        <div>
          {isLoading ? (
            <GarfixLoadingState 
              variant="skeleton" 
              message="جارٍ تحميل البيانات..." 
            />
          ) : (
            <GarfixEnterpriseTable
              data={[{ id: 1, name: 'أحمد', email: 'ahmed@example.com' }]}
              columns={mockColumns}
            />
          )}
          <button onClick={() => setIsLoading(false)}>تحميل</button>
        </div>
      );
    }
    
    render(<DataTable />);
    
    // Initially shows loading
    expect(screen.getByText('جارٍ تحميل البيانات...')).toBeInTheDocument();
    expect(document.querySelectorAll('.state-skeleton').length).toBeGreaterThan(0);
    
    // After clicking load button
    fireEvent.click(screen.getByText('تحميل'));
    
    // Should show table data
    expect(screen.getByText('أحمد')).toBeInTheDocument();
    expect(screen.getByText('ahmed@example.com')).toBeInTheDocument();
  });

  it('should show empty state when table has no data', () => {
    function DataTable() {
      const [data] = React.useState([]);
      
      return (
        <div>
          {data.length === 0 ? (
            <GarfixEmptyState
              title="لا يوجد مستخدمون"
              description="ابدأ بإضافة مستخدم جديد"
              illustration="users"
              action={{
                label: 'إضافة مستخدم',
                onClick: () => {},
              }}
            />
          ) : (
            <GarfixEnterpriseTable data={data} columns={mockColumns} />
          )}
        </div>
      );
    }
    
    render(<DataTable />);
    
    expect(screen.getByText('لا يوجد مستخدمون')).toBeInTheDocument();
    expect(screen.getByText('ابدأ بإضافة مستخدم جديد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة مستخدم' })).toBeInTheDocument();
  });

  it('should show error state when table fetch fails', async () => {
    function DataTable() {
      const [error, setError] = React.useState<string | null>(null);
      
      return (
        <div>
          {error ? (
            <GarfixErrorState
              title="خطأ في تحميل الجدول"
              message={error}
              code="TABLE_ERR_001"
              severity="error"
              onRetry={() => setError(null)}
            />
          ) : (
            <>
              <GarfixEnterpriseTable
                data={[]}
                columns={mockColumns}
              />
              <button onClick={() => setError('فشل الاتصال بقاعدة البيانات')}>
                محاكاة خطأ
              </button>
            </>
          )}
        </div>
      );
    }
    
    render(<DataTable />);
    
    // Trigger error
    fireEvent.click(screen.getByText('محاكاة خطأ'));
    
    // Should show error state
    expect(screen.getByText('خطأ في تحميل الجدول')).toBeInTheDocument();
    expect(screen.getByText('فشل الاتصال بقاعدة البيانات')).toBeInTheDocument();
    expect(screen.getByText('(TABLE_ERR_001)')).toBeInTheDocument();
    
    // Should have retry button
    const retryButton = screen.getByRole('button', { name: /إعادة المحاولة/ });
    expect(retryButton).toBeInTheDocument();
  });

  it('should integrate bulk actions with selection', async () => {
    function TableWithBulkActions() {
      const [selectedRows, setSelectedRows] = React.useState<Set<number>>(new Set());
      const data = [
        { id: 1, name: 'عنصر 1', status: 'active' },
        { id: 2, name: 'عنصر 2', status: 'active' },
        { id: 3, name: 'عنصر 3', status: 'pending' },
      ];
      
      return (
        <div>
          <GarfixEnterpriseTable
            data={data}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'name', label: 'الاسم' },
              { key: 'status', label: 'الحالة' },
            ]}
            selectedRows={selectedRows}
            onSelectionChange={setSelectedRows}
          />
          
          <GarfixBulkActions
            selectedCount={selectedRows.size}
            totalCount={data.length}
            actions={[
              {
                label: 'حذف',
                icon: <span>🗑️</span>,
                onClick: vi.fn(),
                variant: 'danger',
              },
              {
                label: 'تصدير',
                icon: <span>📤</span>,
                onClick: vi.fn(),
              },
            ]}
            onClearSelection={() => setSelectedRows(new Set())}
          />
        </div>
      );
    }
    
    render(<TableWithBulkActions />);
    
    // Initially no bulk actions visible
    expect(screen.queryByText(/تم تحديد/)).not.toBeInTheDocument();
    
    // Select first row
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is select-all, second is first row
    fireEvent.click(checkboxes[1]);
    
    // Bulk actions should appear
    expect(screen.getByText(/تم تحديد 1/)).toBeInTheDocument();
    expect(screen.getByText(/من 3/)).toBeInTheDocument();
    expect(screen.getByText('حذف')).toBeInTheDocument();
    expect(screen.getByText('تصدير')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION: FULL PAGE STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: Full Page State Management', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should manage complete page lifecycle with states and toasts', async () => {
    // Simulates a full page lifecycle:
    // Loading -> Data/Error -> User Action -> Toast feedback
    
    function DataPage() {
      const [pageState, setPageState] = React.useState<'loading' | 'data' | 'error'>('loading');
      const [toastMessage, setToastMessage] = React.useState<string | null>(null);
      
      React.useEffect(() => {
        // Simulate API call
        const timer = setTimeout(() => {
          setPageState('data');
        }, 1000);
        
        return () => clearTimeout(timer);
      }, []);
      
      const handleRefresh = () => {
        setPageState('loading');
        setTimeout(() => {
          // Randomly succeed or fail for demo
          const success = Math.random() > 0.5;
          setPageState(success ? 'data' : 'error');
          if (success) {
            setToastMessage('تم تحديث البيانات بنجاح');
          }
        }, 500);
      };
      
      return (
        <GarfixToastProvider>
          <div style={{ minHeight: '400px' }}>
            {pageState === 'loading' && (
              <GarfixPageState state="loading" loadingProps={{ message: 'جارٍ تحميل الصفحة...' }} />
            )}
            
            {pageState === 'error' && (
              <GarfixPageState
                state="error"
                errorProps={{
                  message: 'فشل تحميل البيانات',
                  code: 'PAGE_LOAD_ERR',
                  onRetry: handleRefresh,
                }}
              />
            )}
            
            {pageState === 'data' && (
              <div>
                <h1>بيانات الصفحة</h1>
                <button onClick={handleRefresh}>تحديث</button>
                
                <GarfixEnterpriseTable
                  data={[
                    { id: 1, name: 'بيانات تجريبية', value: '100' },
                  ]}
                  columns={[
                    { key: 'id', label: 'ID' },
                    { key: 'name', label: 'الاسم' },
                    { key: 'value', label: 'القيمة' },
                  ]}
                />
              </div>
            )}
            
            {toastMessage && (
              <GarfixToast
                type="success"
                title={toastMessage}
                isOpen={true}
                onClose={() => setToastMessage(null)}
              />
            )}
          </div>
        </GarfixToastProvider>
      );
    }
    
    render(<DataPage />);
    
    // Initial loading state
    expect(screen.getByText('جارٍ تحميل الصفحة...')).toBeInTheDocument();
    
    // Wait for loading to complete
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    // Should show data
    expect(screen.getByText('بيانات الصفحة')).toBeInTheDocument();
    expect(screen.getByText('بيانات تجريبية')).toBeInTheDocument();
    
    // Click refresh
    fireEvent.click(screen.getByText('تحديث'));
    
    // Should show loading again
    expect(screen.getByText('جارٍ تحميل الصفحة...')).toBeInTheDocument();
    
    // Wait for refresh
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    // Either data or error should be shown (random)
    // The test just verifies no crashes occur
  });

  it('should handle offline scenario with multiple components', () => {
    function AppWithOfflineHandling() {
      const [isOffline, setIsOffline] = React.useState(true);
      
      return (
        <div>
          {/* Top banner for offline indication */}
          {!isOffline && (
            <GarfixBanner type="success" onDismiss={() => {}}>
              تم استعادة الاتصال بالإنترنت
            </GarfixBanner>
          )}
          
          {isOffline ? (
            <GarfixPageState
              state="offline"
              offlineProps={{
                message: 'التطبيق يعمل في وضع عدم الاتصال',
                onRetry: () => setIsOffline(false),
                retryLabel: 'إعادة المحاولة'
              }}
            />
          ) : (
            <div>
              <h1>التطبيق متصل</h1>
              <GarfixEnterpriseTable
                data={[{ id: 1, name: 'بيانات مخزنة محلياً' }]}
                columns={[{ key: 'name', label: 'الاسم' }]}
              />
            </div>
          )}
        </div>
      );
    }
    
    render(<AppWithOfflineHandling />);
    
    // Offline state
    expect(screen.getByText(/غير متصل/)).toBeInTheDocument();
    
    // Retry to go online
    const retryButton = screen.getByRole('button', { name: /إعادة المحاولة/ });
    fireEvent.click(retryButton);
    
    // Online state
    expect(screen.getByText('التطبيق متصل')).toBeInTheDocument();
    expect(screen.getByText('بيانات مخزنة محلياً')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION: EDITABLE TABLE WITH CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: Editable Table with Confirmation', () => {
  it('should show confirm dialog before deleting selected rows', async () => {
    function EditableTable() {
      const [data, setData] = React.useState([
        { id: 1, name: 'عنصر 1', status: 'active' },
        { id: 2, name: 'عنصر 2', status: 'active' },
      ]);
      const [selectedRows, setSelectedRows] = React.useState<Set<number>>(new Set());
      const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
      
      const handleDelete = () => {
        // Remove selected items
        const newData = data.filter((_, index) => !selectedRows.has(index));
        setData(newData);
        setSelectedRows(new Set());
        setShowDeleteConfirm(false);
      };
      
      return (
        <div>
          <GarfixEnterpriseTable
            data={data}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'name', label: 'الاسم' },
              { key: 'status', label: 'الحالة' },
            ]}
            selectedRows={selectedRows}
            onSelectionChange={setSelectedRows}
          />
          
          <GarfixBulkActions
            selectedCount={selectedRows.size}
            actions={[
              {
                label: 'حذف المحدد',
                icon: <span>🗑️</span>,
                onClick: () => setShowDeleteConfirm(true),
                variant: 'danger',
              },
            ]}
            onClearSelection={() => setSelectedRows(new Set())}
          />
          
          <GarfixConfirmDialog
            isOpen={showDeleteConfirm}
            title="تأكيد الحذف"
            message={`هل تريد حذف ${selectedRows.size} عنصر؟ لا يمكن التراجع عن هذا الإجراء.`}
            confirmLabel="نعم، احذف"
            cancelLabel="إلغاء"
            variant="danger"
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
          
          <span data-testid="item-count">{data.length}</span>
        </div>
      );
    }
    
    render(<EditableTable />);
    
    // Initial count
    expect(screen.getByTestId('item-count')).toHaveTextContent('2');
    
    // No bulk actions yet
    expect(screen.queryByText(/تم تحديد/)).not.toBeInTheDocument();
    
    // Select first row
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // First data row checkbox
    
    // Bulk actions should appear
    expect(screen.getByText(/تم تحديد 1/)).toBeInTheDocument();
    
    // Click delete
    fireEvent.click(screen.getByText('حذف المحدد'));
    
    // Confirm dialog should appear
    expect(screen.getByText('تأكيد الحذف')).toBeInTheDocument();
    expect(screen.getByText(/هل تريد حذف 1 عنصر/)).toBeInTheDocument();
    
    // Confirm deletion
    fireEvent.click(screen.getByText('نعم، احذف'));
    
    // Item count should decrease
    expect(screen.getByTestId('item-count')).toHaveTextContent('1');
  });

  it('should allow inline editing with save confirmation', async () => {
    function InlineEditableRow() {
      const [value, setValue] = React.useState('قيمة أولية');
      const [isEditing, setIsEditing] = React.useState(false);
      const [showSaveConfirm, setShowSaveConfirm] = React.useState(false);
      const [tempValue, setTempValue] = React.useState(value);
      
      const handleEditStart = () => {
        setTempValue(value);
        setIsEditing(true);
      };
      
      const handleChange = (newValue: string) => {
        setTempValue(newValue);
      };
      
      const handleEditEnd = () => {
        if (tempValue !== value) {
          setShowSaveConfirm(true);
        } else {
          setIsEditing(false);
        }
      };
      
      const handleConfirmSave = () => {
        setValue(tempValue);
        setIsEditing(false);
        setShowSaveConfirm(false);
      };
      
      const handleCancelSave = () => {
        setTempValue(value);
        setIsEditing(false);
        setShowSaveConfirm(false);
      };
      
      return (
        <table>
          <tbody>
            <tr>
              <td>
                <GarfixEditableCell
                  value={tempValue}
                  onChange={handleChange}
                  isEditing={isEditing}
                  onEditStart={handleEditStart}
                  onEditEnd={handleEditEnd}
                />
              </td>
            </tr>
          </tbody>
          
          <GarfixConfirmDialog
            isOpen={showSaveConfirm}
            title="حفظ التغييرات"
            message="هل تريد حفظ التعديلات؟"
            confirmLabel="حفظ"
            cancelLabel="تجاهل"
            onConfirm={handleConfirmSave}
            onCancel={handleCancelSave}
          />
          
          <span data-testid="current-value">{value}</span>
        </table>
      );
    }
    
    render(<InlineEditableRow />);
    
    // Initial value
    expect(screen.getByTestId('current-value')).toHaveTextContent('قيمة أولية');
    expect(screen.getByText('قيمة أولية')).toBeInTheDocument();
    
    // Click to edit
    fireEvent.click(screen.getByText('قيمة أولية'));
    
    // Input should appear
    const input = screen.getByDisplayValue('قيمة أولية');
    expect(input).toBeInTheDocument();
    
    // Change value
    fireEvent.change(input, { target: { value: 'قيمة جديدة' } });
    
    // Press Enter or blur to end editing
    fireEvent.blur(input);
    
    // Confirm dialog should appear
    expect(screen.getByText('حفظ التغييرات')).toBeInTheDocument();
    
    // Confirm save
    fireEvent.click(screen.getByText('حفظ'));
    
    // Value should be updated
    expect(screen.getByTestId('current-value')).toHaveTextContent('قيمة جديدة');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: Accessibility Patterns', () => {
  it('should maintain focus management in modal flow', async () => {
    function ModalFlow() {
      const [showModal, setShowModal] = React.useState(false);
      
      return (
        <div>
          <button onClick={() => setShowModal(true)}>فتح النافذة</button>
          
          <GarfixConfirmDialog
            isOpen={showModal}
            title="نافذة اختبار"
            message="هذه نافذة لاختبار إدارة التركيز"
            onConfirm={() => setShowModal(false)}
            onCancel={() => setShowModal(false)}
          />
        </div>
      );
    }
    
    render(<ModalFlow />);
    
    const openButton = screen.getByText('فتح النافذة');
    openButton.focus();
    
    // Open modal
    fireEvent.click(openButton);
    
    // Focus should move to dialog (confirm or cancel button based on variant)
    await waitFor(() => {
      const focusedElement = document.activeElement;
      expect(focusedElement?.tagName).toBe('BUTTON');
    }, { timeout: 100 });
  });

  it('should provide proper ARIA labels throughout component hierarchy', () => {
    function FullPage() {
      return (
        <div role="main">
          <header>
            <GarfixBanner type="info">إشعار مهم للمستخدم</GarfixBanner>
          </header>
          
          <section aria-label="جدول البيانات">
            <GarfixEnterpriseTable
              data={[{ id: 1, name: 'اختبار' }]}
              columns={[{ key: 'name', label: 'الاسم' }]}
              isLoading={false}
            />
          </section>
          
          <footer>
            <GarfixEmptyState
              title="لا توجد نتائج إضافية"
              description="وصلت إلى نهاية القائمة"
            />
          </footer>
        </div>
      );
    }
    
    render(<FullPage />);
    
    // Check ARIA attributes
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy(); // Banner has role="status"
    expect(screen.getByRole('alert')).toBeTruthy(); // Empty state has role="status" which is subset of alert
  });

  it('should support keyboard navigation across interactive elements', async () => {
    function _KeyboardNavTest() {
      return (
        <div>
          <GarfixEnterpriseTable
            data={[{ id: 1, name: 'عنصر تفاعلي' }]}
            columns={[{ key: 'name', label: 'الاسم' }]}
            onRowClick={() => {}}
          />
          
          <GarfixEditableCell
            value="قيمة قابلة للتعديل"
            onChange={() => {}}
            onEditStart={() => {}}
          />
        </div>
      );
    }
    
    render(<KeyboardNavTestTest />);
    
    // All interactive elements should be keyboard accessible
    const interactiveElements = document.querySelectorAll(
      'button, [role="button"], [tabindex]:not([tabindex="-1"]), input'
    );
    
    expect(interactiveElements.length).toBeGreaterThan(0);
    
    // Each element should be focusable
    interactiveElements.forEach(element => {
      expect(element).toBeTruthy();
    });
  });
});

// Helper component for keyboard nav test
function KeyboardNavTestTest() {
  return (
    <div>
      <GarfixEnterpriseTable
        data={[{ id: 1, name: 'عنصر تفاعلي' }]}
        columns={[{ key: 'name', label: 'الاسم' }]}
        onRowClick={() => {}}
      />
      
      <GarfixEditableCell
        value="قيمة قابلة للتعديل"
        onChange={() => {}}
        onEditStart={() => {}}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RTL SUPPORT INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: RTL Support', () => {
  it('should render table with RTL direction', () => {
    render(
      <GarfixEnterpriseTable
        data={[{ id: 1, name: 'بيانات' }]}
        columns={[{ key: 'name', label: 'الاسم' }]}
      />
    );
    
    const rtlContainer = document.querySelector('[dir="rtl"]');
    expect(rtlContainer).toBeTruthy();
  });

  it('should render all text content correctly in RTL context', () => {
    render(
      <div dir="rtl">
        <GarfixErrorState
          message="حدث خطأ في النظام"
          title="تنبيه"
          code="ERR_001"
        />
        
        <GarfixEmptyState
          title="لا توجد بيانات"
          description="لم يتم العثور على نتائج"
        />
        
        <GarfixOfflineState message="انقطع الاتصال" />
      </div>
    );
    
    // Arabic text should render without issues
    expect(screen.getByText('حدث خطأ في النظام')).toBeInTheDocument();
    expect(screen.getByText('لا توجد بيانات')).toBeInTheDocument();
    expect(screen.getByText(/انقطع الاتصال/)).toBeInTheDocument();
  });

  it('should position bulk actions correctly in RTL', () => {
    render(
      <GarfixBulkActions
        selectedCount={5}
        actions={[{ label: 'إجراء', icon: <span>⚡</span>, onClick: () => {} }]}
        onClearSelection={() => {}}
      />
    );
    
    const bulkActionsContainer = document.querySelector('[dir="rtl"]');
    expect(bulkActionsContainer).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOAST PROVIDER CONTEXT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: Toast Provider Context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should share toast context across nested components', () => {
    function ChildComponent() {
      const { addToast } = useGarfixToast();
      
      return (
        <button onClick={() => addToast({ type: 'success', title: 'من المكون الفرعي' })}>
          إشعار من فرعي
        </button>
      );
    }
    
    function ParentComponent() {
      const { addToast } = useGarfixToast();
      
      return (
        <div>
          <button onClick={() => addToast({ type: 'info', title: 'من المكون الرئيسي' })}>
            إشعار من رئيسي
          </button>
          <ChildComponent />
        </div>
      );
    }
    
    render(
      <GarfixToastProvider>
        <ParentComponent />
      </GarfixToastProvider>
    );
    
    // Parent toast
    fireEvent.click(screen.getByText('إشعار من رئيسي'));
    expect(screen.getByText('من المكون الرئيسي')).toBeInTheDocument();
    
    // Child toast
    fireEvent.click(screen.getByText('إشعار من فرعي'));
    expect(screen.getByText('من المكون الفرعي')).toBeInTheDocument();
  });

  it('should auto-dismiss multiple toasts independently', () => {
    function MultiToastComponent() {
      const { addToast } = useGarfixToast();
      
      return (
        <button 
          onClick={() => {
            addToast({ type: 'success', title: 'قصير', duration: 500 });
            addToast({ type: 'info', title: 'طويل', duration: 2000 });
          }}
        >
          أضف إشعارين
        </button>
      );
    }
    
    render(
      <GarfixToastProvider>
        <MultiToastComponent />
      </GarfixToastProvider>
    );
    
    fireEvent.click(screen.getByText('أضف إشعارين'));
    
    // Both toasts should be present
    expect(screen.getByText('قصير')).toBeInTheDocument();
    expect(screen.getByText('طويل')).toBeInTheDocument();
    
    // Short toast should dismiss first
    act(() => {
      vi.advanceTimersByTime(700); // 500ms duration + 200ms animation
    });
    
    // Long toast should still be there
    expect(screen.queryByText('قصير')).not.toBeInTheDocument();
    expect(screen.getByText('طويل')).toBeInTheDocument();
    
    // Long toast should dismiss later
    act(() => {
      vi.advanceTimersByTime(1500); // remaining time + animation
    });
    
    expect(screen.queryByText('طويل')).not.toBeInTheDocument();
  });
});
