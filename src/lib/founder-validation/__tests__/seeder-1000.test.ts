import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, type Currency, type SyntheticCompany } from '../index';

describe('Enterprise Seeder — 1000 companies', () => {
  let companies: SyntheticCompany[];
  let startTime: number;

  it('generates 1000 companies within 10 seconds', () => {
    startTime = Date.now();
    companies = seedEnterpriseData({ companyCount: 1000 });
    const elapsed = Date.now() - startTime;
    expect(companies).toHaveLength(1000);
    expect(elapsed).toBeLessThan(10_000);
  });

  it('all companies have valid structure with all relation arrays', () => {
    for (const c of companies) {
      expect(typeof c.id).toBe('number');
      expect(typeof c.slug).toBe('string');
      expect(typeof c.nameAr).toBe('string');
      expect(typeof c.currency).toBe('string');
      expect(Array.isArray(c.users)).toBe(true);
      expect(Array.isArray(c.employees)).toBe(true);
      expect(Array.isArray(c.clients)).toBe(true);
      expect(Array.isArray(c.suppliers)).toBe(true);
      expect(Array.isArray(c.warehouses)).toBe(true);
      expect(Array.isArray(c.categories)).toBe(true);
      expect(Array.isArray(c.products)).toBe(true);
      expect(Array.isArray(c.inventory)).toBe(true);
      expect(Array.isArray(c.invoices)).toBe(true);
      expect(Array.isArray(c.purchases)).toBe(true);
      expect(Array.isArray(c.aiMemories)).toBe(true);
      expect(Array.isArray(c.aiRules)).toBe(true);
      expect(Array.isArray(c.cacheEntries)).toBe(true);
      expect(Array.isArray(c.providerHistory)).toBe(true);
      expect(Array.isArray(c.workerHistory)).toBe(true);
    }
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

  it('each company has at least 5 clients', () => {
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

  it('each company has provider history entries', () => {
    for (const c of companies) {
      expect(c.providerHistory.length).toBeGreaterThan(0);
    }
  });

  it('each company has worker history entries', () => {
    for (const c of companies) {
      expect(c.workerHistory.length).toBeGreaterThan(0);
    }
  });

  it('total data volume is proportional — total invoices > 5000', () => {
    const total = companies.reduce((s, c) => s + c.invoices.length, 0);
    expect(total).toBeGreaterThan(5000);
  });

  it('total data volume is proportional — total products > 5000', () => {
    const total = companies.reduce((s, c) => s + c.products.length, 0);
    expect(total).toBeGreaterThan(5000);
  });

  it('total data volume is proportional — total clients > 5000', () => {
    const total = companies.reduce((s, c) => s + c.clients.length, 0);
    expect(total).toBeGreaterThan(5000);
  });

  it('no ID collisions across all company IDs', () => {
    const ids = companies.map((c) => c.id);
    expect(new Set(ids).size).toBe(1000);
  });

  it('no duplicate user IDs across all 1000 companies', () => {
    const allIds: string[] = [];
    for (const c of companies) {
      for (const u of c.users) {
        allIds.push(u.id);
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('no duplicate employee IDs across all 1000 companies', () => {
    const allIds: string[] = [];
    for (const c of companies) {
      for (const e of c.employees) {
        allIds.push(e.id);
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('no duplicate invoice IDs within any single company', () => {
    for (const c of companies) {
      const ids = c.invoices.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('no duplicate client IDs within any single company', () => {
    for (const c of companies) {
      const ids = c.clients.map((cl) => cl.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('no duplicate product IDs within any single company', () => {
    for (const c of companies) {
      const ids = c.products.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('all currencies are valid across 1000 companies', () => {
    const valid: Currency[] = ['SAR', 'AED', 'KWD', 'BHD', 'OMR', 'QAR', 'EGP', 'JOD'];
    for (const c of companies) {
      expect(valid).toContain(c.currency);
    }
  });

  it('all company slugs are unique', () => {
    const slugs = companies.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(1000);
  });

  it('memory usage is reasonable — object count is bounded', () => {
    // Rough heuristic: 1000 companies shouldn't produce more than ~5M top-level entities
    let totalEntities = 0;
    for (const c of companies) {
      totalEntities += c.users.length + c.employees.length + c.clients.length
        + c.suppliers.length + c.warehouses.length + c.categories.length
        + c.products.length + c.inventory.length + c.invoices.length
        + c.purchases.length + c.aiMemories.length + c.aiRules.length
        + c.cacheEntries.length + c.providerHistory.length + c.workerHistory.length;
    }
    expect(totalEntities).toBeLessThan(5_000_000);
  });

  it('all invoices have valid companySlug referencing their own company', () => {
    for (const c of companies) {
      for (const inv of c.invoices) {
        expect(inv.companySlug).toBe(c.slug);
      }
    }
  });

  it('all purchases have valid companySlug', () => {
    for (const c of companies) {
      for (const p of c.purchases) {
        expect(p.companySlug).toBe(c.slug);
      }
    }
  });

  it('all cache entries have valid companySlug', () => {
    for (const c of companies) {
      for (const ce of c.cacheEntries) {
        expect(ce.companySlug).toBe(c.slug);
      }
    }
  });

  it('all provider history entries have valid companySlug', () => {
    for (const c of companies) {
      for (const ph of c.providerHistory) {
        expect(ph.companySlug).toBe(c.slug);
      }
    }
  });

  it('all AI memories have valid companySlug', () => {
    for (const c of companies) {
      for (const mem of c.aiMemories) {
        expect(mem.companySlug).toBe(c.slug);
      }
    }
  });

  it('all AI rules have valid companySlug', () => {
    for (const c of companies) {
      for (const rule of c.aiRules) {
        expect(rule.companySlug).toBe(c.slug);
      }
    }
  });

  it('all worker history entries have valid companySlug', () => {
    for (const c of companies) {
      for (const wh of c.workerHistory) {
        expect(wh.companySlug).toBe(c.slug);
      }
    }
  });

  it('sample check: first 10 companies have correct IDs 1-10', () => {
    for (let i = 0; i < 10; i++) {
      expect(companies[i].id).toBe(i + 1);
    }
  });

  it('sample check: last company has ID 1000', () => {
    expect(companies[999].id).toBe(1000);
  });
});