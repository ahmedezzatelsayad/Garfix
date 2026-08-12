import { describe, it, expect } from 'bun:test';
import {
  seedEnterpriseData,
  CURRENCIES,
  type SyntheticCompany,
  type SyntheticInvoice,
  type Currency,
} from '../index';

describe('Enterprise Seeder — 10 companies', () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it('generates exactly 10 companies', () => {
    expect(companies).toHaveLength(10);
  });

  it('each company has a unique ID', () => {
    const ids = companies.map((c) => c.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('each company has at least 1 user', () => {
    for (const c of companies) {
      expect(c.users.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each company has at most 8 users', () => {
    for (const c of companies) {
      expect(c.users.length).toBeLessThanOrEqual(8);
    }
  });

  it('each company has at least 2 employees', () => {
    for (const c of companies) {
      expect(c.employees.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('each company has at most 30 employees', () => {
    for (const c of companies) {
      expect(c.employees.length).toBeLessThanOrEqual(30);
    }
  });

  it('each company has at least 5 customers', () => {
    for (const c of companies) {
      expect(c.clients.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('each company has at most 200 customers', () => {
    for (const c of companies) {
      expect(c.clients.length).toBeLessThanOrEqual(200);
    }
  });

  it('each company has at least 3 suppliers', () => {
    for (const c of companies) {
      expect(c.suppliers.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('each company has at most 20 suppliers', () => {
    for (const c of companies) {
      expect(c.suppliers.length).toBeLessThanOrEqual(20);
    }
  });

  it('each company has at least 1 warehouse', () => {
    for (const c of companies) {
      expect(c.warehouses.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each company has at most 5 warehouses', () => {
    for (const c of companies) {
      expect(c.warehouses.length).toBeLessThanOrEqual(5);
    }
  });

  it('each company has at least 3 categories', () => {
    for (const c of companies) {
      expect(c.categories.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('each company has at most 15 categories', () => {
    for (const c of companies) {
      expect(c.categories.length).toBeLessThanOrEqual(15);
    }
  });

  it('each company has at least 5 products', () => {
    for (const c of companies) {
      expect(c.products.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('each company has at most 80 products', () => {
    for (const c of companies) {
      expect(c.products.length).toBeLessThanOrEqual(80);
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

  it('each company has at most 500 invoices', () => {
    for (const c of companies) {
      expect(c.invoices.length).toBeLessThanOrEqual(500);
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

  it('all invoice items reference real products in the same company', () => {
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

  it('all invoices reference real customers in the same company or null', () => {
    for (const c of companies) {
      const clientIds = new Set(c.clients.map((cl) => cl.id));
      for (const inv of c.invoices) {
        if (inv.clientId !== null) {
          expect(clientIds.has(inv.clientId)).toBe(true);
        }
      }
    }
  });

  it('all inventory items reference real products and warehouses', () => {
    for (const c of companies) {
      const productIds = new Set(c.products.map((p) => p.id));
      const warehouseIds = new Set(c.warehouses.map((w) => w.id));
      for (const item of c.inventory) {
        expect(productIds.has(item.productId)).toBe(true);
        expect(warehouseIds.has(item.warehouseId)).toBe(true);
      }
    }
  });

  it('all purchases reference real suppliers', () => {
    for (const c of companies) {
      const supplierIds = new Set(c.suppliers.map((s) => s.id));
      for (const p of c.purchases) {
        if (p.supplierId !== 0) {
          expect(supplierIds.has(p.supplierId)).toBe(true);
        }
      }
    }
  });

  it('currency is valid Gulf currency', () => {
    const valid: Currency[] = ['SAR', 'AED', 'KWD', 'BHD', 'OMR', 'QAR', 'EGP', 'JOD'];
    for (const c of companies) {
      expect(valid).toContain(c.currency);
    }
  });

  it('company names are Arabic strings', () => {
    for (const c of companies) {
      // Arabic Unicode range: \u0600–\u06FF
      const hasArabic = /[\u0600-\u06FF]/.test(c.nameAr);
      expect(hasArabic).toBe(true);
    }
  });

  it('customer phones have valid format', () => {
    for (const c of companies) {
      for (const client of c.clients) {
        expect(client.phone).toMatch(/^\+\d{9,15}$/);
      }
    }
  });

  it('invoice totals equal subtotal + tax - discount', () => {
    for (const c of companies) {
      for (const inv of c.invoices) {
        const subtotal = parseFloat(inv.subtotal);
        const tax = parseFloat(inv.taxAmount);
        const discount = parseFloat(inv.discount);
        const total = parseFloat(inv.total);
        expect(Math.abs(total - (subtotal + tax - discount))).toBeLessThan(0.02);
      }
    }
  });

  it('invoice numbers are sequential per company', () => {
    for (const c of companies) {
      const numbers = c.invoices.map((inv) => {
        const match = inv.invoiceNumber.match(/INV-(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      }).filter((n): n is number => n !== null);

      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i]).toBe(numbers[i - 1] + 1);
      }
    }
  });

  it('dates are within expected range', () => {
    const start = new Date('2024-01-01').getTime();
    const end = new Date('2025-06-30').getTime();
    for (const c of companies) {
      for (const inv of c.invoices) {
        const t = new Date(inv.issueDate).getTime();
        expect(t).toBeGreaterThanOrEqual(start);
        expect(t).toBeLessThanOrEqual(end);
      }
    }
  });

  it('same seed produces deterministic results', () => {
    const first = seedEnterpriseData({ companyCount: 10, seed: 42 });
    const second = seedEnterpriseData({ companyCount: 10, seed: 42 });
    expect(first.length).toBe(second.length);
    for (let i = 0; i < first.length; i++) {
      expect(first[i].slug).toBe(second[i].slug);
      expect(first[i].nameAr).toBe(second[i].nameAr);
      expect(first[i].clients.length).toBe(second[i].clients.length);
      expect(first[i].invoices.length).toBe(second[i].invoices.length);
    }
  });

  it('different seeds produce different data', () => {
    const a = seedEnterpriseData({ companyCount: 10, seed: 42 });
    const b = seedEnterpriseData({ companyCount: 10, seed: 999 });
    // At least some slugs or counts should differ
    let differs = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].slug !== b[i].slug || a[i].clients.length !== b[i].clients.length) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it('each company has a valid slug', () => {
    for (const c of companies) {
      expect(c.slug).toMatch(/^c-\d+-/);
    }
  });

  it('all employees belong to their company', () => {
    for (const c of companies) {
      for (const emp of c.employees) {
        expect(emp.companyId).toBe(c.id);
        expect(emp.companySlug).toBe(c.slug);
      }
    }
  });
});