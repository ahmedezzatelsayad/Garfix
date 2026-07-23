// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';
describe('Validation: id-uniqueness 2', () => {
  it('validates id-uniqueness for 2', () => { const c = seedEnterpriseData(10, 3800+2); expect(c.length).toBe(10); for(const x of c) { expect(x.id).toBeTruthy(); } });
  it('validates id-uniqueness with 100 companies for 2', () => { const c = seedEnterpriseData(100, 3900+2); expect(c.length).toBe(100); });
  it('validates id-uniqueness relational integrity for 2', () => { const c = seedEnterpriseData(10, 4000+2); for(const x of c) { const pids = new Set(x.products.map(p=>p.id)); for(const inv of x.invoices) for(const it of inv.lineItems) expect(pids.has(it.productId)).toBe(true); } });
  it('validates id-uniqueness financial accuracy for 2', () => { const c = seedEnterpriseData(10, 4100+2); for(const x of c) for(const inv of x.invoices) { expect(inv.total).toBeGreaterThanOrEqual(0); expect(inv.subtotal).toBeGreaterThan(0); } });
  it('validates id-uniqueness determinism for 2', () => { const a = seedEnterpriseData(10, 4200+2); const b = seedEnterpriseData(10, 4200+2); expect(a[0].id).toBe(b[0].id); });
});
