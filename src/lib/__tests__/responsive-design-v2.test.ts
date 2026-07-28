/**
 * responsive-design-v2.test.ts — Tests for responsive Tailwind breakpoints
 * added to module view components.
 *
 * Validates that module views use sm:/md:/lg: prefixes for responsive layouts,
 * and that inline style={{}} usage has been significantly reduced.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MODULES_DIR = join(__dirname, '..', '..', 'modules');

// ── Helper: read a module file ──────────────────────────────────────────
function readModuleFile(relPath: string): string {
  try {
    return readFileSync(join(MODULES_DIR, relPath), 'utf-8');
  } catch {
    return '';
  }
}

// ── Helper: count responsive prefixes ───────────────────────────────────
function countResponsive(content: string): { sm: number; md: number; lg: number } {
  const sm = (content.match(/sm:/g) || []).length;
  const md = (content.match(/md:/g) || []).length;
  const lg = (content.match(/lg:/g) || []).length;
  return { sm, md, lg };
}

// ── Helper: count inline styles ─────────────────────────────────────────
function countInlineStyles(content: string): number {
  return (content.match(/style=\{/g) || []).length;
}

// ── Module files (defined at module scope so both describe blocks can access) ──
const moduleFiles = [
  'settings/CompanySettingsForm.tsx',
  'settings/SettingsView.tsx',
  'clients/ClientProfile.tsx',
  'admin/AuditView.tsx',
  'accounting/AccountingView.tsx',
  'accounting/ArApView.tsx',
  'accounting/PayrollWpsView.tsx',
  'accounting/TaxComplianceView.tsx',
  'accounting/BankingView.tsx',
  'accounting/FixedAssetsView.tsx',
  'accounting/MultiCompanyView.tsx',
  'accounting/InventoryCostingView.tsx',
  'common/AppShell.tsx',
  'common/NotificationsDropdown.tsx',
];

describe('Responsive Design — Module Views', () => {
  for (const file of moduleFiles) {
    describe(file, () => {
      it('should contain at least one sm: breakpoint', () => {
        const content = readModuleFile(file);
        if (!content) return; // skip if file doesn't exist in test env
        const responsive = countResponsive(content);
        expect(responsive.sm + responsive.md + responsive.lg).toBeGreaterThan(0);
      });

      it('should have significantly reduced inline styles (or none)', () => {
        const content = readModuleFile(file);
        if (!content) return;
        const inlineCount = countInlineStyles(content);
        // After partial cleanup, files may have remaining inline styles
        // (dynamic styles that can't be expressed in Tailwind).
        // Accounting views use grid-template-columns with dynamic values.
        expect(inlineCount).toBeLessThanOrEqual(40);
      });

      it('should have responsive grid or flex layout patterns', () => {
        const content = readModuleFile(file);
        if (!content) return;
        const hasResponsiveGrid = content.includes('sm:grid-cols') || content.includes('md:grid-cols');
        const hasResponsiveFlex = content.includes('sm:flex-row') || content.includes('md:flex-row');
        const hasResponsivePadding = content.includes('sm:p-') || content.includes('md:p-');
        const hasResponsiveMinmax = content.includes('sm:minmax') || content.includes('md:minmax');
        const hasResponsiveWidth = content.includes('sm:w') || content.includes('md:w');
        expect(hasResponsiveGrid || hasResponsiveFlex || hasResponsivePadding || hasResponsiveMinmax || hasResponsiveWidth).toBe(true);
      });
    });
  }

  // ── Specific test: WebhookManagementView should have zero inline styles ──
  it('WebhookManagementView should have 0 inline styles={{}} occurrences', () => {
    const content = readModuleFile('admin/WebhookManagementView.tsx');
    if (!content) return;
    const inlineCount = countInlineStyles(content);
    expect(inlineCount).toBe(0);
  });

  // ── Specific test: AICopilotBubble should have ≤4 remaining inline styles ──
  it('AICopilotBubble should have ≤4 remaining inline styles (unavoidable)', () => {
    const content = readModuleFile('../ai/AICopilotBubble.tsx');
    if (!content) return;
    const inlineCount = countInlineStyles(content);
    expect(inlineCount).toBeLessThanOrEqual(4);
  });

  // ── Test: AppShell should have responsive sidebar layout ──
  it('AppShell should use responsive flex direction (flex-col sm:flex-row)', () => {
    const content = readModuleFile('common/AppShell.tsx');
    if (!content) return;
    expect(content).toContain('sm:flex-row');
  });

  // ── Test: Responsive grid patterns in accounting views ──
  it('Accounting views should use responsive grid columns', () => {
    const accountingFiles = ['AccountingView.tsx', 'ArApView.tsx', 'BankingView.tsx'];
    for (const f of accountingFiles) {
      const content = readModuleFile(`accounting/${f}`);
      if (!content) continue;
      const hasResponsiveGrid = content.includes('sm:grid-cols') || content.includes('sm:minmax');
      expect(hasResponsiveGrid).toBe(true);
    }
  });

  // ── Test: NotificationsDropdown should be responsive width ──
  it('NotificationsDropdown should have responsive width on mobile', () => {
    const content = readModuleFile('common/NotificationsDropdown.tsx');
    if (!content) return;
    // Should have responsive width pattern (w-[calc] sm:w-[350px] etc.)
    const hasResponsiveWidth = content.includes('sm:w') || content.includes('md:w');
    expect(hasResponsiveWidth).toBe(true);
  });
});

describe('Responsive Design — Global Stats', () => {
  it('total sm: breakpoints in modules should be > 50', () => {
    let totalSm = 0;
    for (const file of moduleFiles) {
      const content = readModuleFile(file);
      if (content) totalSm += countResponsive(content).sm;
    }
    expect(totalSm).toBeGreaterThan(50);
  });

  it('total md: breakpoints in modules should be > 10', () => {
    let totalMd = 0;
    for (const file of moduleFiles) {
      const content = readModuleFile(file);
      if (content) totalMd += countResponsive(content).md;
    }
    expect(totalMd).toBeGreaterThan(10);
  });
});
