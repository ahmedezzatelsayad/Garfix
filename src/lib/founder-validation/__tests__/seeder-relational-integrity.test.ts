// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, type SyntheticCompany, type SyntheticInvoice } from '../index';

describe('Enterprise Seeder — Relational Integrity (10 companies)', () => {
  const companies = seedEnterpriseData({ companyCount: 10 });

  it('every invoice clientId exists in company clients', () => {
    for (const c of companies) {
      const clientIds = new Set(c.clients.map((cl) => cl.id));
      for (const inv of c.invoices) {
        if (inv.clientId !== null) {
          expect(clientIds.has(inv.clientId)).toBe(true);
        }
      }
    }
  });

  it('every invoice line item productId exists in company products', () => {
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

  it('every inventory productId exists in company products', () => {
    for (const c of companies) {
      const productIds = new Set(c.products.map((p) => p.id));
      for (const item of c.inventory) {
        expect(productIds.has(item.productId)).toBe(true);
      }
    }
  });

  it('every inventory warehouseId exists in company warehouses', () => {
    for (const c of companies) {
      const warehouseIds = new Set(c.warehouses.map((w) => w.id));
      for (const item of c.inventory) {
        expect(warehouseIds.has(item.warehouseId)).toBe(true);
      }
    }
  });

  it('every purchase supplierId exists in company suppliers', () => {
    for (const c of companies) {
      const supplierIds = new Set(c.suppliers.map((s) => s.id));
      for (const p of c.purchases) {
        if (p.supplierId !== 0) {
          expect(supplierIds.has(p.supplierId)).toBe(true);
        }
      }
    }
  });

  it('every purchase line item productId exists in company products', () => {
    for (const c of companies) {
      const productIds = new Set(c.products.map((p) => p.id));
      for (const p of c.purchases) {
        for (const li of p.lineItems) {
          if (li.productId !== 0) {
            expect(productIds.has(li.productId)).toBe(true);
          }
        }
      }
    }
  });

  it('every employee companyId matches their company', () => {
    for (const c of companies) {
      for (const emp of c.employees) {
        expect(emp.companyId).toBe(c.id);
      }
    }
  });

  it('every employee companySlug matches their company', () => {
    for (const c of companies) {
      for (const emp of c.employees) {
        expect(emp.companySlug).toBe(c.slug);
      }
    }
  });

  it('every user companies array contains their company slug', () => {
    for (const c of companies) {
      for (const u of c.users) {
        expect(u.companies).toContain(c.slug);
      }
    }
  });

  it('every AI memory companySlug matches', () => {
    for (const c of companies) {
      for (const mem of c.aiMemories) {
        expect(mem.companySlug).toBe(c.slug);
      }
    }
  });

  it('every cache entry companySlug matches', () => {
    for (const c of companies) {
      for (const ce of c.cacheEntries) {
        expect(ce.companySlug).toBe(c.slug);
      }
    }
  });

  it('every provider history entry companySlug matches', () => {
    for (const c of companies) {
      for (const ph of c.providerHistory) {
        expect(ph.companySlug).toBe(c.slug);
      }
    }
  });

  it('every worker history entry companySlug matches', () => {
    for (const c of companies) {
      for (const wh of c.workerHistory) {
        expect(wh.companySlug).toBe(c.slug);
      }
    }
  });

  it('invoice item totals sum correctly (quantity * unitPrice)', () => {
    for (const c of companies) {
      for (const inv of c.invoices) {
        for (const li of inv.lineItems) {
          const expected = li.quantity * parseFloat(li.unitPrice);
          const actual = parseFloat(li.total);
          expect(Math.abs(expected - actual)).toBeLessThan(0.02);
        }
      }
    }
  });

  it('invoice tax calculations are correct (15% VAT for SA)', () => {
    for (const c of companies) {
      if (c.country !== 'SA') continue;
      for (const inv of c.invoices) {
        const vatRate = parseFloat(inv.taxRate);
        if (vatRate !== 15) continue;
        const subtotal = parseFloat(inv.subtotal);
        const taxAmount = parseFloat(inv.taxAmount);
        expect(Math.abs(taxAmount - subtotal * 0.15)).toBeLessThan(0.02);
      }
    }
  });

  it('invoice tax calculations are correct (5% VAT for AE)', () => {
    for (const c of companies) {
      if (c.country !== 'AE') continue;
      for (const inv of c.invoices) {
        const vatRate = parseFloat(inv.taxRate);
        if (vatRate !== 5) continue;
        const subtotal = parseFloat(inv.subtotal);
        const taxAmount = parseFloat(inv.taxAmount);
        expect(Math.abs(taxAmount - subtotal * 0.05)).toBeLessThan(0.02);
      }
    }
  });

  it('product sellingPrice > costPrice (markup exists)', () => {
    for (const c of companies) {
      for (const prod of c.products) {
        const sell = parseFloat(prod.sellingPrice);
        const cost = parseFloat(prod.purchasePrice);
        expect(sell).toBeGreaterThan(cost);
      }
    }
  });

  it('product wholesalePrice is between costPrice and sellingPrice', () => {
    for (const c of companies) {
      for (const prod of c.products) {
        const sell = parseFloat(prod.sellingPrice);
        const cost = parseFloat(prod.purchasePrice);
        const wholesale = parseFloat(prod.wholesalePrice);
        expect(wholesale).toBeGreaterThanOrEqual(cost);
        expect(wholesale).toBeLessThanOrEqual(sell);
      }
    }
  });

  it('invoice dueDate is after issueDate', () => {
    for (const c of companies) {
      for (const inv of c.invoices) {
        expect(new Date(inv.dueDate).getTime()).toBeGreaterThanOrEqual(
          new Date(inv.issueDate).getTime()
        );
      }
    }
  });

  it('purchase dueDate is after issueDate', () => {
    for (const c of companies) {
      for (const p of c.purchases) {
        expect(new Date(p.dueDate).getTime()).toBeGreaterThanOrEqual(
          new Date(p.issueDate).getTime()
        );
      }
    }
  });

  it('paid amount never exceeds total for any invoice', () => {
    for (const c of companies) {
      for (const inv of c.invoices) {
        const paid = parseFloat(inv.paid);
        const total = parseFloat(inv.total);
        expect(paid).toBeLessThanOrEqual(total + 0.01);
      }
    }
  });

  it('inventory quantity is non-negative', () => {
    for (const c of companies) {
      for (const item of c.inventory) {
        expect(item.quantity).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('provider history latency is non-negative', () => {
    for (const c of companies) {
      for (const ph of c.providerHistory) {
        expect(ph.latencyMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('worker history execution time is non-negative', () => {
    for (const c of companies) {
      for (const wh of c.workerHistory) {
        expect(wh.executionTimeMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('cache entry expiresAt is after createdAt', () => {
    for (const c of companies) {
      for (const ce of c.cacheEntries) {
        expect(ce.expiresAt.getTime()).toBeGreaterThan(ce.createdAt.getTime());
      }
    }
  });

  it('AI memory confidence is between 0 and 1', () => {
    for (const c of companies) {
      for (const mem of c.aiMemories) {
        expect(mem.confidence).toBeGreaterThanOrEqual(0);
        expect(mem.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it('AI rule priority is between 1 and 10', () => {
    for (const c of companies) {
      for (const rule of c.aiRules) {
        expect(rule.priority).toBeGreaterThanOrEqual(1);
        expect(rule.priority).toBeLessThanOrEqual(10);
      }
    }
  });

  it('employee salary is a valid numeric string', () => {
    for (const c of companies) {
      for (const emp of c.employees) {
        expect(typeof emp.baseSalary).toBe('string');
        expect(parseFloat(emp.baseSalary)).not.toBeNaN();
        expect(parseFloat(emp.baseSalary)).toBeGreaterThan(0);
      }
    }
  });

  it('client emails contain @ symbol', () => {
    for (const c of companies) {
      for (const cl of c.clients) {
        expect(cl.email).toContain('@');
      }
    }
  });

  it('supplier emails contain @ symbol', () => {
    for (const c of companies) {
      for (const s of c.suppliers) {
        expect(s.email).toContain('@');
      }
    }
  });

  it('all product categoryIds reference valid categories', () => {
    for (const c of companies) {
      if (c.categories.length === 0) continue;
      const catIds = new Set(c.categories.map((cat) => cat.id));
      for (const prod of c.products) {
        if (prod.categoryId !== 0) {
          expect(catIds.has(prod.categoryId)).toBe(true);
        }
      }
    }
  });

  it('invoice paid amount matches status (paid=full, partial=partial)', () => {
    for (const c of companies) {
      for (const inv of c.invoices) {
        const paid = parseFloat(inv.paid);
        const total = parseFloat(inv.total);
        if (inv.status === 'paid') {
          expect(Math.abs(paid - total)).toBeLessThan(0.02);
        } else if (inv.status === 'cancelled' || inv.status === 'draft') {
          expect(paid).toBe(0);
        }
      }
    }
  });

  it('all warehouses have valid country codes', () => {
    const validCountries = ['SA', 'AE', 'KW', 'BH', 'OM'];
    for (const c of companies) {
      for (const w of c.warehouses) {
        expect(validCountries).toContain(w.country);
      }
    }
  });

  it('provider history cost is non-negative', () => {
    for (const c of companies) {
      for (const ph of c.providerHistory) {
        expect(ph.costUsd).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('worker history retries are non-negative', () => {
    for (const c of companies) {
      for (const wh of c.workerHistory) {
        expect(wh.retries).toBeGreaterThanOrEqual(0);
      }
    }
  });
});