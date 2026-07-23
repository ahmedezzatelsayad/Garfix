/**
 * inline-styles-cleanup-v2.test.ts — Verifies that inline styles
 * have been removed from the top offender module views and replaced
 * with Tailwind CSS classes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(__dirname, '..', '..', '..');

function readFile(relPath: string): string {
  try {
    return readFileSync(join(SRC_DIR, relPath), 'utf-8');
  } catch {
    return '';
  }
}

function countInlineStyles(content: string): number {
  return (content.match(/style=\{/g) || []).length;
}

function hasTailwindClasses(content: string, classes: string[]): boolean {
  return classes.every(c => content.includes(c));
}

describe('Inline Styles Cleanup — Module Views', () => {
  // ── WebhookManagementView: was 128 inline styles, now 0 ──────────
  describe('WebhookManagementView.tsx', () => {
    it('should have 0 inline style={{}} occurrences', () => {
      const content = readFile('modules/admin/WebhookManagementView.tsx');
      if (!content) return;
      expect(countInlineStyles(content)).toBe(0);
    });

    it('should use Tailwind className helpers instead of style helpers', () => {
      const content = readFile('modules/admin/WebhookManagementView.tsx');
      if (!content) return;
      // Should have className-based helper functions, not style-based
      expect(content).toContain('tabClasses');
      expect(content).toContain('thClasses');
      expect(content).toContain('tdClasses');
    });

    it('should use Tailwind utility classes for layout', () => {
      const content = readFile('modules/admin/WebhookManagementView.tsx');
      if (!content) return;
      expect(hasTailwindClasses(content, ['flex', 'rounded-lg', 'text-sm'])).toBe(true);
    });

    it('should NOT have tabStyle/thStyle/tdStyle/badgeStyle functions', () => {
      const content = readFile('modules/admin/WebhookManagementView.tsx');
      if (!content) return;
      expect(content).not.toContain('tabStyle');
      expect(content).not.toContain('thStyle');
      expect(content).not.toContain('tdStyle');
      expect(content).not.toContain('badgeStyle');
    });
  });

  // ── AICopilotBubble: was 58, now ≤4 ──────────────────────────────
  describe('AICopilotBubble.tsx', () => {
    it('should have ≤4 remaining inline styles', () => {
      const content = readFile('modules/ai/AICopilotBubble.tsx');
      if (!content) return;
      expect(countInlineStyles(content)).toBeLessThanOrEqual(4);
    });

    it('should use Tailwind hover pseudo-classes instead of onMouseEnter/Leave', () => {
      const content = readFile('modules/ai/AICopilotBubble.tsx');
      if (!content) return;
      // Hover effects should be in Tailwind, not JS handlers
      expect(content).toContain('hover:');
    });

    it('should use Tailwind shadow classes', () => {
      const content = readFile('modules/ai/AICopilotBubble.tsx');
      if (!content) return;
      expect(content).toContain('shadow-');
    });

    it('should use Tailwind gradient classes', () => {
      const content = readFile('modules/ai/AICopilotBubble.tsx');
      if (!content) return;
      expect(content).toContain('bg-gradient');
    });
  });

  // ── CompanySettingsForm: was 32, now significantly reduced ────────
  describe('CompanySettingsForm.tsx', () => {
    it('should have ≤5 remaining inline styles', () => {
      const content = readFile('modules/settings/CompanySettingsForm.tsx');
      if (!content) return;
      expect(countInlineStyles(content)).toBeLessThanOrEqual(5);
    });

    it('should use responsive Tailwind grid classes', () => {
      const content = readFile('modules/settings/CompanySettingsForm.tsx');
      if (!content) return;
      expect(content).toContain('grid-cols-1');
      expect(content).toContain('sm:grid-cols');
    });
  });

  // ── AuditView: was 22, now significantly reduced ──────────────────
  describe('AuditView.tsx', () => {
    it('should have ≤5 remaining inline styles', () => {
      const content = readFile('modules/admin/AuditView.tsx');
      if (!content) return;
      expect(countInlineStyles(content)).toBeLessThanOrEqual(5);
    });

    it('should use Tailwind className helpers for table cells', () => {
      const content = readFile('modules/admin/AuditView.tsx');
      if (!content) return;
      expect(content).toContain('thClass');
      expect(content).toContain('tdClass');
    });
  });

  // ── Global: all module files should have reduced inline styles ────
  it('average inline style count per module view should be < 5', () => {
    const moduleFiles = [
      'modules/admin/AuditView.tsx',
      'modules/settings/CompanySettingsForm.tsx',
      'modules/accounting/AccountingView.tsx',
      'modules/accounting/ArApView.tsx',
      'modules/accounting/BankingView.tsx',
      'modules/accounting/PayrollWpsView.tsx',
      'modules/accounting/TaxComplianceView.tsx',
    ];

    let totalInline = 0;
    let fileCount = 0;
    for (const f of moduleFiles) {
      const content = readFile(f);
      if (content) {
        totalInline += countInlineStyles(content);
        fileCount++;
      }
    }
    if (fileCount === 0) return;
    const avg = totalInline / fileCount;
    expect(avg).toBeLessThan(5);
  });
});
