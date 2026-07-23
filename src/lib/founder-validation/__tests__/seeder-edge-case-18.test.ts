// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData } from '../index';

describe('Seeder Edge Case 18', () => {

  it('generates companies with valid IDs for edge case 18', () => {
    const companies = seedEnterpriseData(10, 42 + 18);
    expect(companies.length).toBe(10);
    for (const c of companies) {
      expect(c.id).toBeTruthy();
      expect(c.id.length).toBeGreaterThan(5);
    }
  });
  it('each company has at least one user for edge case 18', () => {
    const companies = seedEnterpriseData(10, 42 + 18);
    for (const c of companies) {
      expect(c.users.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('all invoices have valid totals for edge case 18', () => {
    const companies = seedEnterpriseData(10, 42 + 18);
    for (const c of companies) {
      for (const inv of c.invoices) {
        expect(inv.total).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('products have valid pricing for edge case 18', () => {
    const companies = seedEnterpriseData(10, 42 + 18);
    for (const c of companies) {
      for (const p of c.products) {
        expect(p.sellingPrice).toBeGreaterThanOrEqual(p.purchasePrice);
      }
    }
  });
  it('deterministic output with same seed for edge case 18', () => {
    const a = seedEnterpriseData(10, 42 + 18);
    const b = seedEnterpriseData(10, 42 + 18);
    expect(a.length).toBe(b.length);
    expect(a[0].id).toBe(b[0].id);
  });

});
