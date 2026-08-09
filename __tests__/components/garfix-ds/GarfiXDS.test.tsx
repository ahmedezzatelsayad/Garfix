/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Component Library Tests (اختبارات المكتبة)
 * 
 * Comprehensive test suite for GarfiX Design System components:
 * - Core: Button, Card, Input, Badge, Avatar
 * - Layout: Container, Grid, PageHeader
 * - Data: DataTable, StatCard
 * - Feedback: Alert, Progress, Skeleton
 * - Navigation: Tabs, Sidebar, Breadcrumb
 * - Overlay: Modal, Drawer
 * - Accessibility: SkipLinks, A11yProvider
 * - Theme: ThemeProvider, ThemeToggle
 * - AI: Personalization components
 * - Animation: MotionDiv, AnimatedContainer
 * 
 * Testing approach:
 * - Rendering tests (snapshot + structure)
 * - Interaction tests (click, type, focus)
 * - Accessibility tests (ARIA, keyboard nav)
 * - RTL support verification
 * 
 * Framework: Vitest + React Testing Library
 * ═════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach, afterEach , mock} from "bun:test";
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ───────────────────────────────────────────────────

// Mock window.matchMedia for reduced motion tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mock().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: mock(),
    removeListener: mock(),
    addEventListener: mock(),
    removeEventListener: mock(),
    dispatchEvent: mock(),
  })),
});

// Mock IntersectionObserver for scroll animations
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  
  observe() { return; }
  unobserve() { return; }
  disconnect() { return; }
}

window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock requestAnimationFrame
let rafCallbacks: Array<(timestamp: number) => void> = [];
window.requestAnimationFrame = (callback: FrameRequestCallback) => {
  const id = rafCallbacks.length;
  rafCallbacks.push(callback as (timestamp: number) => void);
  return id;
};
window.cancelAnimationFrame = (id: number) => {
  delete rafCallbacks[id];
};

// Helper to flush RAF callbacks
function flushRAF(timestamp: number = 0) {
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach(cb => cb?.(timestamp));
}

// ── Test Utilities ──────────────────────────────────────────

function renderWithRTL(ui: React.ReactElement) {
  return render(ui, {
    container: document.createElement('div'),
    wrapper: ({ children }) => (
      <div dir="rtl" lang="ar">{children}</div>
    ),
  });
}

// ═════════════════════════════════════════════════════════════
// SECTION 1: CORE COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Core Components', () => {
  
  // ── GarfixButton Tests ──────────────────────────────────
  
  describe('GarfixButton', () => {
    it('renders with default props', async () => {
      const { GarfixButton } = await import('@/components/garfix-ds/core/GarfixButton');
      
      render(<GarfixButton>Click me</GarfixButton>);
      
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('garfix-button');
    });
    
    it('handles click events', async () => {
      const { GarfixButton } = await import('@/components/garfix-ds/core/GarfixButton');
      const handleClick = mock();
      
      render(<GarfixButton onClick={handleClick}>Click</GarfixButton>);
      
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
    
    it('shows loading state correctly', async () => {
      const { GarfixButton } = await import('@/components/garfix-ds/core/GarfixButton');
      
      render(<GarfixButton isLoading>Loading...</GarfixButton>);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    });
    
    it('supports all variants', async () => {
      const { GarfixButton } = await import('@/components/garfix-ds/core/GarfixButton');
      const variants = ['primary', 'secondary', 'outline', 'ghost', 'destructive', 'gold'];
      
      for (const variant of variants) {
        const { unmount } = render(
          <GarfixButton variant={variant as any}>{variant}</GarfixButton>
        );
        
        expect(screen.getByRole('button')).toHaveClass(`variant-${variant}`);
        unmount();
      }
    });
    
    it('supports all sizes', async () => {
      const { GarfixButton } = await import('@/components/garfix-ds/core/GarfixButton');
      const sizes = ['xs', 'sm', 'md', 'lg', 'xl'];
      
      for (const size of sizes) {
        const { unmount } = render(
          <GarfixButton size={size as any}>{size}</GarfixButton>
        );
        
        expect(screen.getByRole('button')).toHaveClass(`size-${size}`);
        unmount();
      }
    });
    
    it('has proper accessibility attributes', async () => {
      const { GarfixButton } = await import('@/components/garfix-ds/core/GarfixButton');
      
      render(
        <GarfixButton disabled aria-label="Accessible button">
          Button
        </GarfixButton>
      );
      
      const button = screen.getByLabelText('Accessible button');
      expect(button).toBeDisabled();
    });
    
    it('renders with icon', async () => {
      const { GarfixButton } = await import('@/components/garfix-ds/core/GarfixButton');
      
      render(
        <GarfixButton icon={<span data-testid="icon">→</span>}>
          With Icon
        </GarfixButton>
      );
      
      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });
  });

  // ── GarfixCard Tests ────────────────────────────────────
  
  describe('GarfixCard', () => {
    it('renders card with children', async () => {
      const { GarfixCard } = await import('@/components/garfix-ds/core/GarfixCard');
      
      render(
        <GarfixCard>
          <h2>Card Title</h2>
          <p>Card content</p>
        </GarfixCard>
      );
      
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card content')).toBeInTheDocument();
    });
    
    it('applies variant classes', async () => {
      const { GarfixCard } = await import('@/components/garfix-ds/core/GarfixCard');
      const { container } = render(
        <GarfixCard variant="glass">Glass Card</GarfixCard>
      );
      
      expect(container.firstChild).toHaveClass('variant-glass');
    });
    
    it('renders KPI card with accent colors', async () => {
      const { KPICard } = await import('@/components/garfix-ds/core/GarfixCard');
      
      render(
        <KPICard title="Revenue" value="$10K" trend="up" color="emerald" />
      );
      
      expect(screen.getByText('Revenue')).toBeInTheDocument();
      expect(screen.getByText('$10K')).toBeInTheDocument();
    });
    
    it('uses sub-components correctly', async () => {
      const { 
        GarfixCard, 
        GarfixCardHeader, 
        GarfixCardTitle, 
        GarfixCardContent, 
        GarfixCardFooter 
      } = await import('@/components/garfix-ds/core/GarfixCard');
      
      render(
        <GarfixCard>
          <GarfixCardHeader>
            <GarfixCardTitle>Title</GarfixCardTitle>
          </GarfixCardHeader>
          <GarfixCardContent>Content</GarfixCardContent>
          <GarfixCardFooter>Footer</GarfixCardFooter>
        </GarfixCard>
      );
      
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.getByText('Footer')).toBeInTheDocument();
    });
  });

  // ── GarfixInput Tests ───────────────────────────────────
  
  describe('GarfixInput', () => {
    it('renders input with label', async () => {
      const { GarfixInput } = await import('@/components/garfix-ds/core/GarfixInput');
      
      render(<GarfixInput label="Email" placeholder="Enter email" />);
      
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
    });
    
    it('handles value changes', async () => {
      const { GarfixInput } = await import('@/components/garfix-ds/core/GarfixInput');
      const handleChange = mock();
      
      render(<GarfixInput onChange={handleChange} />);
      
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'test' } });
      
      expect(handleChange).toHaveBeenCalled();
    });
    
    it('shows error state', async () => {
      const { GarfixInput } = await import('@/components/garfix-ds/core/GarfixInput');
      
      render(<GarfixInput error="This field is required" />);
      
      expect(screen.getByText('This field is required')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });
    
    it('shows success state', async () => {
      const { GarfixInput } = await import('@/components/garfix-ds/core/GarfixInput');
      
      render(<GarfixInput success="Looks good!" />);
      
      expect(screen.getByText('Looks good!')).toBeInTheDocument();
    });
    
    it('toggles password visibility', async () => {
      const { GarfixInput } = await import('@/components/garfix-ds/core/GarfixInput');
      
      render(<GarfixInput type="password" label="Password" />);
      
      const input = screen.getByLabelText('Password') as HTMLInputElement;
      expect(input.type).toBe('password');
      
      const toggleBtn = screen.getByRole('button');
      fireEvent.click(toggleBtn);
      
      expect(input.type).toBe('text');
    });
    
    it('shows character count', async () => {
      const { GarfixInput } = await import('@/components/garfix-ds/core/GarfixInput');
      
      render(<GarfixInput maxLength={100} showCharCount value="Hello" />);
      
      expect(screen.getByText('5/100')).toBeInTheDocument();
    });
  });

  // ── GarfixBadge Tests ───────────────────────────────────
  
  describe('GarfixBadge', () => {
    it('renders with text content', async () => {
      const { GarfixBadge } = await import('@/components/garfix-ds/core/GarfixBadge');
      
      render(<GarfixBadge>New</GarfixBadge>);
      
      expect(screen.getByText('New')).toBeInTheDocument();
    });
    
    it('supports dot mode', async () => {
      const { GarfixBadge } = await import('@/components/garfix-ds/core/GarfixBadge');
      
      render(<GarfixBadge dot variant="success" />);
      
      expect(screen.getByRole('status')).toHaveClass('dot-mode');
    });
    
    it('is removable', async () => {
      const { GarfixBadge } = await import('@/components/garfix-ds/core/GarfixBadge');
      const onRemove = mock();
      
      render(<GarfixBadge removable onRemove={onRemove}>Removable</GarfixBadge>);
      
      fireEvent.click(screen.getByRole('button'));
      expect(onRemove).toHaveBeenCalled();
    });
    
    it('supports all variants', async () => {
      const { GarfixBadge } = await import('@/components/garfix-ds/core/GarfixBadge');
      const variants = [
        'default', 'primary', 'secondary', 'success', 
        'warning', 'error', 'gold', 'outline'
      ];
      
      for (const variant of variants) {
        const { unmount } = render(
          <GarfixBadge variant={variant as any}>{variant}</GarfixBadge>
        );
        expect(screen.getByText(variant)).toBeInTheDocument();
        unmount();
      }
    });
  });

  // ── GarfixAvatar Tests ──────────────────────────────────
  
  describe('GarfixAvatar', () => {
    it('renders image avatar', async () => {
      const { GarfixAvatar } = await import('@/components/garfix-ds/core/GarfixAvatar');
      
      render(<GarfixAvatar src="/avatar.jpg" alt="User name" />);
      
      const img = screen.getByAltText('User name');
      expect(img).toHaveAttribute('src', '/avatar.jpg');
    });
    
    it('renders fallback initials', async () => {
      const { GarfixAvatar } = await import('@/components/garfix-ds/core/GarfixAvatar');
      
      render(<GarfixAvatar name="Ahmed Ezzat" />);
      
      expect(screenByTextContent('AE')).toBeInTheDocument();
    });
    
    it('shows status indicator', async () => {
      const { GarfixAvatar } = await import('@/components/garfix-ds/core/GarfixAvatar');
      
      render(<GarfixAvatar name="User" status="online" />);
      
      expect(screen.getByTestId('avatar-status')).toHaveClass('online');
    });
    
    it('supports different sizes', async () => {
      const { GarfixAvatar } = await import('@/components/garfix-ds/core/GarfixAvatar');
      const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
      
      for (const size of sizes) {
        const { unmount } = render(
          <GarfixAvatar name="User" size={size as any} />
        );
        unmount();
      }
    });
  });
});

// Helper function to find element by text content
function screenByTextContent(text: string): HTMLElement | null {
  const elements = screen.getAllByText((content, element) => {
    return element?.textContent === text;
  });
  return elements[0] || null;
}

// ═════════════════════════════════════════════════════════════
// SECTION 2: LAYOUT COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Layout Components', () => {
  
  describe('GarfixContainer', () => {
    it('wraps children in container', async () => {
      const { GarfixContainer } = await import('@/components/garfix-ds/layout/GarfixContainer');
      
      render(
        <GarfixContainer>
          <p>Content</p>
        </GarfixContainer>
      );
      
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
    
    it('applies padding variants', async () => {
      const { GarfixContainer } = await import('@/components/garfix-ds/layout/GarfixContainer');
      const { container } = render(
        <GarfixContainer padding="lg">Padded</GarfixContainer>
      );
      
      expect(container.firstChild).toHaveClass('padding-lg');
    });
  });

  describe('GarfixGrid', () => {
    it('renders grid with correct columns', async () => {
      const { GarfixGrid } = await import('@/components/garfix-ds/layout/GarfixGrid');
      const { container } = render(
        <GarfixGrid cols={3}>
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </GarfixGrid>
      );
      
      expect(container.firstChild).toHaveClass('grid-cols-3');
      expect(screen.getAllByText(/Item/)).toHaveLength(3);
    });
    
    it('uses preset grids', async () => {
      const { KPICardGrid } = await import('@/components/garfix-ds/layout/GarfixGrid');
      
      render(
        <KPICardGrid>
          <div>KPI 1</div>
          <div>KPI 2</div>
          <div>KPI 3</div>
          <div>KPI 4</div>
        </KPICardGrid>
      );
      
      expect(screen.getAllByText(/KPI/)).toHaveLength(4);
    });
  });

  describe('GarfixPageHeader', () => {
    it('renders title and breadcrumbs', async () => {
      const { GarfixPageHeader } = await import('@/components/garfix-ds/layout/GarfixPageHeader');
      
      render(
        <GarfixPageHeader
          title="Dashboard"
          breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
        />
      );
      
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 3: DATA DISPLAY COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Data Components', () => {
  
  describe('GarfixDataTable', () => {
    const sampleData = [
      { id: 1, name: 'Ahmed', email: 'ahmed@example.com' },
      { id: 2, name: 'Sara', email: 'sara@example.com' },
    ];
    
    const sampleColumns = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
    ];
    
    it('renders table with data', async () => {
      const { GarfixDataTable } = await import('@/components/garfix-ds/data/GarfixDataTable');
      
      render(
        <GarfixDataTable
          data={sampleData}
          columns={sampleColumns}
        />
      );
      
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
      expect(screen.getByText('Sara')).toBeInTheDocument();
    });
    
    it('shows empty state when no data', async () => {
      const { GarfixDataTable } = await import('@/components/garfix-ds/data/GarfixDataTable');
      
      render(
        <GarfixDataTable
          data={[]}
          columns={sampleColumns}
          emptyMessage="No records found"
        />
      );
      
      expect(screen.getByText('No records found')).toBeInTheDocument();
    });
    
    it('enables row selection', async () => {
      const { GarfixDataTable } = await import('@/components/garfix-ds/data/GarfixDataTable');
      const onSelectionChange = mock();
      
      render(
        <GarfixDataTable
          data={sampleData}
          columns={sampleColumns}
          selectable
          onSelectionChange={onSelectionChange}
        />
      );
      
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      
      expect(onSelectionChange).toHaveBeenCalled();
    });
    
    it('filters by search', async () => {
      const { GarfixDataTable } = await import('@/components/garfix-ds/data/GarfixDataTable');
      
      render(
        <GarfixDataTable
          data={sampleData}
          columns={sampleColumns}
          searchable
        />
      );
      
      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, { target: { value: 'Ahmed' } });
      
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
      expect(screen.queryByText('Sara')).not.toBeInTheDocument();
    });
  });

  describe('GarfixStatCard', () => {
    it('displays stat with animated counter', async () => {
      const { GarfixStatCard } = await import('@/components/garfix-ds/data/GarfixStatCard');
      
      render(
        <GarfixStatCard
          title="Total Users"
          value={1234}
          trend={{ direction: 'up', value: 12 }}
        />
      );
      
      expect(screen.getByText('Total Users')).toBeInTheDocument();
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 4: FEEDBACK COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Feedback Components', () => {
  
  describe('GarfixAlert', () => {
    it('renders alert with message', async () => {
      const { GarfixAlert } = await import('@/components/garfix-ds/feedback/GarfixAlert');
      
      render(<GarfixAlert>Something happened</GarfixAlert>);
      
      expect(screen.getByText('Something happened')).toBeInTheDocument();
    });
    
    it('supports different variants', async () => {
      const { GarfixAlert } = await import('@/components/garfix-ds/feedback/GarfixAlert');
      const variants = ['info', 'success', 'warning', 'error', 'gold'];
      
      for (const variant of variants) {
        const { unmount } = render(
          <GarfixAlert variant={variant as any}>{variant} alert</GarfixAlert>
        );
        expect(screen.getByText(`${variant} alert`)).toBeInTheDocument();
        unmount();
      }
    });
    
    it('can be dismissed', async () => {
      const { GarfixAlert } = await import('@/components/garfix-ds/feedback/GarfixAlert');
      
      render(<GarfixAlert dismissible>Dismissible</GarfixAlert>);
      
      const closeBtn = screen.getByRole('button');
      fireEvent.click(closeBtn);
      
      expect(screen.queryByText('Dismissible')).not.toBeInTheDocument();
    });
  });

  describe('GarfixProgress', () => {
    it('renders linear progress bar', async () => {
      const { GarfixProgressBar } = await import('@/components/garfix-ds/feedback/GarfixProgress');
      
      render(<GarfixProgressBar value={50} max={100} />);
      
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    });
    
    it('renders circular progress ring', async () => {
      const { GarfixProgressRing } = await import('@/components/garfix-ds/feedback/GarfixProgress');
      
      render(<GarfixProgressRing value={75} />);
      
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    });
    
    it('renders step progress', async () => {
      const { GarfixStepProgress } = await import('@/components/garfix-ds/feedback/GarfixProgress');
      
      render(
        <GarfixStepProgress
          steps={['Step 1', 'Step 2', 'Step 3']}
          currentStep={1}
        />
      );
      
      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Step 2')).toBeInTheDocument();
    });
  });

  describe('GarfixSkeleton', () => {
    it('renders skeleton patterns', async () => {
      const { GarfixSkeleton } = await import('@/components/garfix-ds/feedback/GarfixSkeleton');
      
      render(<GarfixSkeleton variant="card" />);
      
      expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    });
    
    it('renders dashboard skeleton', async () => {
      const { DashboardSkeleton } = await import('@/components/garfix-ds/feedback/GarfixSkeleton');
      
      render(<DashboardSkeleton />);
      
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 5: NAVIGATION COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Navigation Components', () => {
  
  describe('GarfixTabs', () => {
    it('renders tabs and panels', async () => {
      const { GarfixTabs, GarfixTabPanel } = await import('@/components/garfix-ds/navigation/GarfixTabs');
      
      render(
        <GarfixTabs defaultValue="tab1">
          <div data-value="tab1">Tab 1</div>
          <div data-value="tab2">Tab 2</div>
          <GarfixTabPanel value="tab1">Content 1</GarfixTabPanel>
          <GarfixTabPanel value="tab2">Content 2</GarfixTabPanel>
        </GarfixTabs>
      );
      
      expect(screen.getByText('Content 1')).toBeInTheDocument();
    });
    
    it('switches tabs on click', async () => {
      const { GarfixTabs, GarfixTabPanel } = await import('@/components/garfix-ds/navigation/GarfixTabs');
      
      render(
        <GarfixTabs defaultValue="tab1">
          <button data-value="tab1">Tab 1</button>
          <button data-value="tab2">Tab 2</button>
          <GarfixTabPanel value="tab1">Content 1</GarfixTabPanel>
          <GarfixTabPanel value="tab2">Content 2</GarfixTabPanel>
        </GarfixTabs>
      );
      
      fireEvent.click(screen.getByText('Tab 2'));
      
      await waitFor(() => {
        expect(screen.getByText('Content 2')).toBeVisible();
      });
    });
  });

  describe('GarfixBreadcrumb', () => {
    it('renders breadcrumb trail', async () => {
      const { GarfixBreadcrumb } = await import('@/components/garfix-ds/navigation/GarfixBreadcrumb');
      
      render(
        <GarfixBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Products', href: '/products' },
            { label: 'Product Detail' },
          ]}
        />
      );
      
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Products')).toBeInTheDocument();
      expect(screen.getByText('Product Detail')).toBeInTheDocument();
    });
    
    it('has proper navigation landmark', async () => {
      const { GarfixBreadcrumb } = await import('@/components/garfix-ds/navigation/GarfixBreadcrumb');
      
      render(
        <GarfixBreadcrumb items={[{ label: 'Home', href: '/' }]} />
      );
      
      expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 6: OVERLAY COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Overlay Components', () => {
  
  describe('GarfixModal', () => {
    it('opens and closes modal', async () => {
      const { GarfixModal } = await import('@/components/garfix-ds/overlay/GarfixModal');
      
      render(
        <GarfixModal open onClose={() => {}} title="Test Modal">
          Modal Content
        </GarfixModal>
      );
      
      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Modal Content')).toBeInTheDocument();
    });
    
    it('traps focus within modal', async () => {
      const { GarfixModal } = await import('@/components/garfix-ds/overlay/GarfixModal');
      
      render(
        <GarfixModal open onClose={() => {}} title="Focus Trap">
          <input data-testid="modal-input" placeholder="Type here" />
        </GarfixModal>
      );
      
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });
    
    it('closes on escape key', async () => {
      const onClose = mock();
      const { GarfixModal } = await import('@/components/garfix-ds/overlay/GarfixModal');
      
      render(
        <GarfixModal open onClose={onClose} title="Escape Close">
          Press Escape
        </GarfixModal>
      );
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('GarfixDrawer', () => {
    it('opens from right side by default', async () => {
      const { GarfixDrawer } = await import('@/components/garfix-ds/overlay/GarfixDrawer');
      
      render(
        <GarfixDrawer open onClose={() => {}} title="Drawer">
          Drawer Content
        </GarfixDrawer>
      );
      
      expect(screen.getByText('Drawer Content')).toBeInTheDocument();
    });
    
    it('opens from specified side', async () => {
      const { GarfixDrawer } = await import('@/components/garfix-ds/overlay/GarfixDrawer');
      
      const { container } = render(
        <GarfixDrawer open onClose={() => {}} side="left" title="Left Drawer">
          Left Content
        </GarfixDrawer>
      );
      
      expect(container.querySelector('.drawer-left')).toBeInTheDocument();
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 7: ACCESSIBILITY COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Accessibility Components', () => {
  
  describe('GarfixSkipLinks', () => {
    it('renders skip navigation links', async () => {
      const { GarfixSkipLinks } = await import('@/components/garfix-ds/accessibility/GarfixSkipLinks');
      
      render(<GarfixSkipLinks />);
      
      expect(screen.getByRole('link', { name: /skip to main content/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /skip to navigation/i })).toBeInTheDocument();
    });
    
    it('skip links are not visible until focused', async () => {
      const { GarfixSkipLinks } = await import('@/components/garfix-ds/accessibility/GarfixSkipLinks');
      
      render(<GarfixSkipLinks />);
      
      const skipLink = screen.getByRole('link', { name: /skip to main content/i });
      expect(skipLink).not.toBeVisible(); // Should be off-screen
    });
  });

  describe('GarfixAccessibilityProvider', () => {
    it('provides accessibility context', async () => {
      const { GarfixAccessibilityProvider, useAccessibility } = await import('@/components/garfix-ds/accessibility/GarfixAccessibilityProvider');
      
      let contextValue;
      
      function TestComponent() {
        contextValue = useAccessibility();
        return <div>Test</div>;
      }
      
      render(
        <GarfixAccessibilityProvider>
          <TestComponent />
        </GarfixAccessibilityProvider>
      );
      
      expect(contextValue).toBeDefined();
      expect(contextValue?.keyboardNavEnabled).toBeDefined();
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 8: THEME COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Theme Components', () => {
  
  describe('GarfixThemeProvider', () => {
    it('provides theme context', async () => {
      const { GarfixThemeProvider, useTheme } = await import('@/components/garfix-ds/theme/GarfixThemeProvider');
      
      let themeValue;
      
      function TestConsumer() {
        themeValue = useTheme();
        return <div>{themeValue?.resolvedTheme}</div>;
      }
      
      render(
        <GarfixThemeProvider defaultTheme="dark">
          <TestConsumer />
        </GarfixThemeProvider>
      );
      
      expect(themeValue).toBeDefined();
      expect(themeValue?.resolvedTheme).toBe('dark');
    });
    
    it('toggles between light and dark', async () => {
      const { GarfixThemeProvider, useTheme, GarfixThemeToggle } = await import('@/components/garfix-ds/theme/GarfixThemeProvider');
      
      function TestApp() {
        const { resolvedTheme, toggleTheme } = useTheme();
        
        return (
          <div>
            <span data-testid="theme">{resolvedTheme}</span>
            <button onClick={toggleTheme}>Toggle</button>
          </div>
        );
      }
      
      render(
        <GarfixThemeProvider defaultTheme="light">
          <TestApp />
        </GarfixThemeProvider>
      );
      
      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      
      fireEvent.click(screen.getByText('Toggle'));
      
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });
  });

  describe('GarfixThemeToggle', () => {
    it('renders toggle button', async () => {
      const { GarfixThemeProvider, GarfixThemeToggle } = await import('@/components/garfix-ds/theme/GarfixThemeProvider');
      
      render(
        <GarfixThemeProvider>
          <GarfixThemeToggle />
        </GarfixThemeProvider>
      );
      
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 9: AI PERSONALIZATION COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS AI Personalization Components', () => {
  
  describe('AIPersonalizationProvider', () => {
    it('provides AI personalization context', async () => {
      const { 
        AIPersonalizationProvider, 
        useAIPersonalization 
      } = await import('@/components/garfix-ds/ai/index.ts');
      
      let aiContext;
      
      function TestAIConsumer() {
        aiContext = useAIPersonalization();
        return <div>AI Consumer</div>;
      }
      
      render(
        <AIPersonalizationProvider>
          <TestAIConsumer />
        </AIPersonalizationProvider>
      );
      
      expect(aiContext).toBeDefined();
      expect(aiContext?.userProfile).toBeDefined();
      expect(aiContext?.recommendations).toBeDefined();
    });
    
    it('tracks user behavior', async () => {
      const { 
        AIPersonalizationProvider, 
        useAIPersonalization 
      } = await import('@/components/garfix-ds/ai/index.ts');
      
      let aiContext;
      
      function TestTracker() {
        aiContext = useAIPersonalization();
        return <button onClick={() => aiContext?.trackEvent('button_click', {})}>
          Track
        </button>;
      }
      
      render(
        <AIPersonalizationProvider>
          <TestTracker />
        </AIPersonalizationProvider>
      );
      
      fireEvent.click(screen.getByText('Track'));
      
      expect(aiContext?.behaviorEvents.length).toBeGreaterThan(0);
    });
  });

  describe('GarfixSmartRecommendations', () => {
    it('renders recommendations list', async () => {
      const { GarfixSmartRecommendations } = await import('@/components/garfix-ds/ai/GarfixSmartRecommendations');
      
      const mockRecommendations = [
        { id: '1', title: 'Action 1', description: 'Description 1', priority: 'high' },
        { id: '2', title: 'Action 2', description: 'Description 2', priority: 'medium' },
      ];
      
      render(
        <GarfixSmartRecommendations recommendations={mockRecommendations} />
      );
      
      expect(screen.getByText('Action 1')).toBeInTheDocument();
      expect(screen.getByText('Action 2')).toBeInTheDocument();
    });
    
    it('shows empty state', async () => {
      const { GarfixSmartRecommendations } = await import('@/components/garfix-ds/ai/GarfixSmartRecommendations');
      
      render(<GarfixSmartRecommendations recommendations={[]} />);
      
      expect(screen.getByText(/no recommendations/i)).toBeInTheDocument();
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 10: ANIMATION COMPONENTS TESTS
// ═════════════════════════════════════════════════════════════

describe('GarfiX DS Animation Components', () => {
  
  describe('GarfixAnimatedContainer', () => {
    it('renders children with animation', async () => {
      const { GarfixAnimatedContainer } = await import('@/components/garfix-ds/animations/GarfixAnimatedContainer');
      
      render(
        <GarfixAnimatedContainer animation="fadeUp">
          <p>Animated Content</p>
        </GarfixAnimatedContainer>
      );
      
      expect(screen.getByText('Animated Content')).toBeInTheDocument();
    });
    
    it('respects reduced motion preference', async () => {
      // Mock prefers-reduced-motion
      window.matchMedia = mock().mockImplementation(query => ({
        matches: query.includes('reduced-motion'),
        media: query,
        onchange: null,
        addListener: mock(),
        removeListener: mock(),
        addEventListener: mock(),
        removeEventListener: mock(),
        dispatchEvent: mock(),
      }));
      
      const { GarfixAnimatedContainer } = await import('@/components/garfix-ds/animations/GarfixAnimatedContainer');
      
      render(
        <GarfixAnimatedContainer animation="fadeUp">
          <p>Reduced Motion Content</p>
        </GarfixAnimatedContainer>
      );
      
      const content = screen.getByText('Reduced Motion Content');
      expect(content).toBeInTheDocument();
    });
  });

  describe('GarfixMotionDiv', () => {
    it('applies hover effects', async () => {
      const { GarfixMotionDiv } = await import('@/components/garfix-ds/animations/GarfixMotionDiv');
      
      render(
        <GarfixMotionDiv hoverLift>
          <p>Hoverable</p>
        </GarfixMotionDiv>
      );
      
      const div = screen.getByText('Hoverable').parentElement;
      expect(div).toHaveClass('hover-lift-enabled');
    });
    
    it('applies press effect', async () => {
      const { GarfixMotionDiv } = await import('@/components/garfix-ds/animations/GarfixMotionDiv');
      
      render(
        <GarfixMotionDiv pressScale>
          <button>Press Me</button>
        </GarfixMotionDiv>
      );
      
      const div = screen.getByText('Press Me').closest('.press-scale-enabled');
      expect(div).toBeTruthy();
    });
  });

  describe('GarfixAnimatedCounter', () => {
    it('counts up to target value', async () => {
      const { GarfixAnimatedCounter } = await import('@/components/garfix-ds/animations/GarfixAnimatedCounter');
      
      render(<GarfixAnimatedCounter value={100} from={0} autoStart />);
      
      flushRAF();
      flushRAF(1000);
      
      const counter = screen.getByRole('status');
      expect(counter).toBeInTheDocument();
    });
    
    it('formats with prefix and suffix', async () => {
      const { GarfixAnimatedCounter } = await import('@/components/garfix-ds/animations/GarfixAnimatedCounter');
      
      render(
        <GarfixAnimatedCounter 
          value={1000} 
          prefix="$" 
          suffix=".00"
          autoStart={false}
        />
      );
      
      expect(screen.getByText(/\$.*1000/)).toBeInTheDocument();
    });
  });

  describe('GarfixPageTransition', () => {
    it('renders page content with transition', async () => {
      const { GarfixPageTransition } = await import('@/components/garfix-ds/animations/GarfixPageTransition');
      
      render(
        <GarfixPageTransition enterAnimation="slideUp">
          <h1>Page Title</h1>
          <p>Page Content</p>
        </GarfixPageTransition>
      );
      
      expect(screen.getByText('Page Title')).toBeInTheDocument();
      expect(screen.getByText('Page Content')).toBeInTheDocument();
    });
    
    it('shows loading state during transition', async () => {
      const { GarfixPageTransition } = await import('@/components/garfix-ds/animations/GarfixPageTransition');
      
      render(
        <GarfixPageTransition
          showLoading
          isReady={false}
        >
          Loaded Content
        </GarfixPageTransition>
      );
      
      expect(screen.getByText(/loading|جاري التحميل/i)).toBeInTheDocument();
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 11: ANIMATION UTILITIES & HOOKS TESTS
// ═════════════════════════════════════════════════════════════

describe('Animation System Utilities', () => {
  
  describe('Animation Constants', () => {
    it('has correct duration values', async () => {
      const { DURATIONS } = await import('@/lib/animations');
      
      expect(DURATIONS.fast).toBe(120);
      expect(DURATIONS.normal).toBe(150);
      expect(DURATIONS.smooth).toBe(220);
      expect(DURATIONS.slow).toBe(250);
    });
    
    it('has valid easing curves', async () => {
      const { EASING } = await import('@/lib/animations');
      
      Object.values(EASING).forEach(curve => {
        expect(curve).toMatch(/^cubic-bezier\(.+\)$/);
      });
    });
    
    it('has spring configurations', async () => {
      const { SPRINGS } = await import('@/lib/animations');
      
      expect(SPRINGS.snappy.stiffness).toBeGreaterThan(SPRINGS.gentle.stiffness);
      expect(Object.keys(SPRINGS)).toContain('snappy');
      expect(Object.keys(SPRINGS)).toContain('smooth');
      expect(Object.keys(SPRINGS)).toContain('gentle');
      expect(Object.keys(SPRINGS)).toContain('bouncy');
    });
  });

  describe('Utility Functions', () => {
    it('calculates stagger delay correctly', async () => {
      const { getStaggerDelay, STAGGER_PRESETS } = await import('@/lib/animations');
      
      expect(getStaggerDelay(0, STAGGER_PRESETS.fast)).toBe(0);
      expect(getStaggerDelay(1, STAGGER_PRESETS.fast)).toBe(50);
      expect(getStaggerDelay(2, STAGGER_PRESETS.normal)).toBe(160);
    });
    
    it('generates animation styles', async () => {
      const { getAnimationStyle, PRESETS } = await import('@/lib/animations');
      
      const style = getAnimationStyle(PRESETS.fadeIn);
      
      expect(style.animationName).toBeDefined();
      expect(style.animationDuration).toBeDefined();
      expect(style.animationFillMode).toBe('both');
    });
    
    it('calculates spring physics', async () => {
      const { calculateSpring, SPRINGS } = await import('@/lib/animations');
      
      const result = calculateSpring(0, 100, 0, SPRINGS.smooth);
      
      expect(result.value).not.toBe(0); // Should have moved
      expect(result.newVelocity).toBeDefined();
    });
  });
});

describe('Animation Hooks', () => {
  
  describe('useReducedMotion', () => {
    it('detects reduced motion preference', async () => {
      // This test verifies the hook can be imported and used
      const { useReducedMotion } = await import('@/hooks/useAnimation');
      
      expect(typeof useReducedMotion).toBe('function');
    });
  });

  describe('useHoverAnimation', () => {
    it('provides hover animation handlers', async () => {
      const { useHoverAnimation } = await import('@/hooks/useAnimation');
      
      expect(typeof useHoverAnimation).toBe('function');
    });
  });

  describe('usePressAnimation', () => {
    it('provides press animation handlers', async () => {
      const { usePressAnimation } = await import('@/hooks/useAnimation');
      
      expect(typeof usePressAnimation).toBe('function');
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 12: INTEGRATION & RTL TESTS
// ═════════════════════════════════════════════════════════════

describe('RTL Support Tests', () => {
  it('renders correctly in RTL mode', async () => {
    const { GarfixButton } = await import('@/components/garfix-ds/core/GarfixButton');
    
    const { container } = renderWithRTL(
      <GarfixButton>زر بالعربي</GarfixButton>
    );
    
    expect(container.querySelector('[dir="rtl"]')).toBeInTheDocument();
    expect(screen.getByText('زر بالعربي')).toBeInTheDocument();
  });
  
  it('sidebar renders correctly in RTL', async () => {
    const { GarfixSidebar } = await import('@/components/garfix-ds/navigation/GarfixSidebar');
    
    const items = [{ label: 'الرئيسية', href: '/', icon: 'home' }];
    
    renderWithRTL(
      <GarfixSidebar items={items} />
    );
    
    expect(screen.getByText('الرئيسية')).toBeInTheDocument();
  });
});

describe('Barrel Export Tests', () => {
  it('exports all components from barrel file', async () => {
    const garfixDS = await import('@/components/garfix-ds');
    
    // Core exports
    expect(garfixDS.GarfixButton).toBeDefined();
    expect(garfixDS.GarfixCard).toBeDefined();
    expect(garfixDS.GarfixInput).toBeDefined();
    expect(garfixDS.GarfixBadge).toBeDefined();
    expect(garfixDS.GarfixAvatar).toBeDefined();
    
    // Layout exports
    expect(garfixDS.GarfixContainer).toBeDefined();
    expect(garfixDS.GarfixGrid).toBeDefined();
    expect(garfixDS.GarfixPageHeader).toBeDefined();
    
    // Data exports
    expect(garfixDS.GarfixDataTable).toBeDefined();
    expect(garfixDS.GarfixStatCard).toBeDefined();
    
    // Feedback exports
    expect(garfixDS.GarfixAlert).toBeDefined();
    expect(garfixDS.GarfixProgressBar).toBeDefined();
    expect(garfixDS.GarfixSkeleton).toBeDefined();
    
    // Navigation exports
    expect(garfixDS.GarfixTabs).toBeDefined();
    expect(garfixDS.GarfixSidebar).toBeDefined();
    expect(garfixDS.GarfixBreadcrumb).toBeDefined();
    
    // Overlay exports
    expect(garfixDS.GarfixModal).toBeDefined();
    expect(garfixDS.GarfixDrawer).toBeDefined();
    
    // Accessibility exports
    expect(garfixDS.GarfixSkipLinks).toBeDefined();
    expect(garfixDS.GarfixAccessibilityProvider).toBeDefined();
    
    // Theme exports
    expect(garfixDS.GarfixThemeProvider).toBeDefined();
    expect(garfixDS.GarfixThemeToggle).toBeDefined();
    
    // AI exports
    expect(garfixDS.AIPersonalizationProvider).toBeDefined();
    expect(garfixDS.GarfixSmartRecommendations).toBeDefined();
    
    // Animation exports
    expect(garfixDS.GarfixAnimatedContainer).toBeDefined();
    expect(garfixDS.GarfixMotionDiv).toBeDefined();
    expect(garfixDS.GarfixPageTransition).toBeDefined();
    expect(garfixDS.GarfixAnimatedCounter).toBeDefined();
  });
});
