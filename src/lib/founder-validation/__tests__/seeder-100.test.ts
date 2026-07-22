// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  type SyntheticCompany,
  type InvoiceStatus,
  type Currency,
} from '../index';

describe('Enterprise Seeder — 100 companies', () => {
  const companies = seedEnterpriseData({ companyCount: 100 });

  it('generates exactly 100 companies', () => {
    expect(companies).toHaveLength(100);
  });

  it('total invoices across all companies exceeds 1000', () => {
    const totalInvoices = companies.reduce((s, c) => s + c.invoices.length, 0);
    expect(totalInvoices).toBeGreaterThan(1000);
  });

  it('total products across all companies exceeds 500', () => {
    const totalProducts = companies.reduce((s, c) => s + c.products.length, 0);
    expect(totalProducts).toBeGreaterThan(500);
  });

  it('no duplicate company IDs', () => {
    const ids = companies.map((c) => c.id);
    expect(new Set(ids).size).toBe(100);
  });

  it('no duplicate user IDs across all companies', () => {
    const allUserIds: string[] = [];
    for (const c of companies) {
      for (const u of c.users) {
        allUserIds.push(u.id);
      }
    }
    expect(new Set(allUserIds).size).toBe(allUserIds.length);
  });

  it('no duplicate employee IDs across all companies', () => {
    const allEmpIds: string[] = [];
    for (const c of companies) {
      for (const e of c.employees) {
        allEmpIds.push(e.id);
      }
    }
    expect(new Set(allEmpIds).size).toBe(allEmpIds.length);
  });

  it('cross-company data isolation: invoices never reference other companies customers', () => {
    for (const c of companies) {
      const clientIds = new Set(c.clients.map((cl) => cl.id));
      for (const inv of c.invoices) {
        if (inv.clientId !== null) {
          expect(clientIds.has(inv.clientId)).toBe(true);
        }
      }
    }
  });

  it('cross-company data isolation: invoices never reference other companies products', () => {
    for (const c of companies) {
      const productIds = new Set(c.products.map((p) => p.id));
      for (const inv of c.invoices) {
        for (const li of inv.lineItems) {
          if (li.productId !== 0) {
            expect(productIds.has(li.productId)).toBe(true);
          }
        }
      }
    }
  });

  it('cross-company data isolation: inventory never references other companies warehouses', () => {
    for (const c of companies) {
      const whIds = new Set(c.warehouses.map((w) => w.id));
      for (const item of c.inventory) {
        expect(whIds.has(item.warehouseId)).toBe(true);
      }
    }
  });

  it('cross-company data isolation: purchases never reference other companies suppliers', () => {
    for (const c of companies) {
      const supplierIds = new Set(c.suppliers.map((s) => s.id));
      for (const p of c.purchases) {
        if (p.supplierId !== 0) {
          expect(supplierIds.has(p.supplierId)).toBe(true);
        }
      }
    }
  });

  it('invoice status distribution: draft invoices present', () => {
    const allStatuses = companies.flatMap((c) => c.invoices.map((i) => i.status));
    expect(allStatuses).toContain('draft');
  });

  it('invoice status distribution: sent invoices present', () => {
    const allStatuses = companies.flatMap((c) => c.invoices.map((i) => i.status));
    expect(allStatuses).toContain('sent');
  });

  it('invoice status distribution: paid invoices present', () => {
    const allStatuses = companies.flatMap((c) => c.invoices.map((i) => i.status));
    expect(allStatuses).toContain('paid');
  });

  it('invoice status distribution: overdue invoices present', () => {
    const allStatuses = companies.flatMap((c) => c.invoices.map((i) => i.status));
    expect(allStatuses).toContain('overdue');
  });

  it('invoice status distribution: cancelled invoices present', () => {
    const allStatuses = companies.flatMap((c) => c.invoices.map((i) => i.status));
    expect(allStatuses).toContain('cancelled');
  });

  it('payment method distribution: manual source invoices exist', () => {
    const allSources = companies.flatMap((c) => c.invoices.map((i) => i.source).filter(Boolean));
    expect(allSources).toContain('manual');
  });

  it('payment method distribution: whatsapp source invoices exist', () => {
    const allSources = companies.flatMap((c) => c.invoices.map((i) => i.source).filter(Boolean));
    expect(allSources).toContain('whatsapp');
  });

  it('payment method distribution: ai_extract source invoices exist', () => {
    const allSources = companies.flatMap((c) => c.invoices.map((i) => i.source).filter(Boolean));
    expect(allSources).toContain('ai_extract');
  });

  it('each company has at least 1 user', () => {
    for (const c of companies) {
      expect(c.users.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each company has at least 2 employees', () => {
    for (const c of companies) {
      expect(c.employees.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('each company has at least 5 customers', () => {
    for (const c of companies) {
      expect(c.clients.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('each company has at least 3 suppliers', () => {
    for (const c of companies) {
      expect(c.suppliers.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('each company has at least 1 warehouse', () => {
    for (const c of companies) {
      expect(c.warehouses.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each company has at least 3 categories', () => {
    for (const c of companies) {
      expect(c.categories.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('each company has at least 5 products', () => {
    for (const c of companies) {
      expect(c.products.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('each company has inventory items', () => {
    for (const c of companies) {
      expect(c.inventory.length).toBeGreaterThan(0);
    }
  });

  it('each company has invoices', () => {
    for (const c of companies) {
      expect(c.invoices.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('each company has purchases', () => {
    for (const c of companies) {
      expect(c.purchases.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('each company has AI memories', () => {
    for (const c of companies) {
      expect(c.aiMemories.length).toBeGreaterThan(0);
    }
  });

  it('each company has AI rules', () => {
    for (const c of companies) {
      expect(c.aiRules.length).toBeGreaterThan(0);
    }
  });

  it('each company has cache entries', () => {
    for (const c of companies) {
      expect(c.cacheEntries.length).toBeGreaterThan(0);
    }
  });

  it('each company has provider history', () => {
    for (const c of companies) {
      expect(c.providerHistory.length).toBeGreaterThan(0);
    }
  });

  it('each company has worker history', () => {
    for (const c of companies) {
      expect(c.workerHistory.length).toBeGreaterThan(0);
    }
  });

  it('all currencies are valid', () => {
    const valid: Currency[] = ['SAR', 'AED', 'KWD', 'BHD', 'OMR', 'QAR', 'EGP', 'JOD'];
    for (const c of companies) {
      expect(valid).toContain(c.currency);
    }
  });

  it('no duplicate client IDs within a company', () => {
    for (const c of companies) {
      const ids = c.clients.map((cl) => cl.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('no duplicate product IDs within a company', () => {
    for (const c of companies) {
      const ids = c.products.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('all user companySlugs reference a valid company', () => {
    const slugs = new Set(companies.map((c) => c.slug));
    for (const c of companies) {
      for (const u of c.users) {
        for (const uSlug of u.companies) {
          expect(slugs.has(uSlug)).toBe(true);
        }
      }
    }
  });

  it('total clients across all companies exceeds 500', () => {
    const total = companies.reduce((s, c) => s + c.clients.length, 0);
    expect(total).toBeGreaterThan(500);
  });

  it('all invoices have valid tax rates', () => {
    for (const c of companies) {
      for (const inv of c.invoices) {
        const rate = parseFloat(inv.taxRate);
        expect([0, 5, 10, 15]).toContain(rate);
      }
    }
  });

  it('all invoice line item totals are non-negative', () => {
    for (const c of companies) {
      for (const inv of c.invoices) {
        for (const li of inv.lineItems) {
          expect(parseFloat(li.total)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('no duplicate invoice IDs within a company', () => {
    for (const c of companies) {
      const ids = c.invoices.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('no duplicate purchase IDs within a company', () => {
    for (const c of companies) {
      const ids = c.purchases.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});