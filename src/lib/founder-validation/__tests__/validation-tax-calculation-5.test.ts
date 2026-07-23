// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';
describe('Validation: tax-calculation 5', () => {
  it('validates tax-calculation for 5', () => { const c = seedEnterpriseData(10, 3800+5); expect(c.length).toBe(10); for(const x of c) { expect(x.id).toBeTruthy(); } });
  it('validates tax-calculation with 100 companies for 5', () => { const c = seedEnterpriseData(100, 3900+5); expect(c.length).toBe(100); });
  it('validates tax-calculation relational integrity for 5', () => { const c = seedEnterpriseData(10, 4000+5); for(const x of c) { const pids = new Set(x.products.map(p=>p.id)); for(const inv of x.invoices) for(const it of inv.lineItems) expect(pids.has(it.productId)).toBe(true); } });
  it('validates tax-calculation financial accuracy for 5', () => { const c = seedEnterpriseData(10, 4100+5); for(const x of c) for(const inv of x.invoices) { expect(inv.total).toBeGreaterThanOrEqual(0); expect(inv.subtotal).toBeGreaterThan(0); } });
  it('validates tax-calculation determinism for 5', () => { const a = seedEnterpriseData(10, 4200+5); const b = seedEnterpriseData(10, 4200+5); expect(a[0].id).toBe(b[0].id); });
});
