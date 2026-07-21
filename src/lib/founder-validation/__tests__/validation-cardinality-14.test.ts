import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';
describe('Validation: cardinality 14', () => {
  it('validates cardinality for 14', () => { const c = seedEnterpriseData(10, 3800+14); expect(c.length).toBe(10); for(const x of c) { expect(x.id).toBeTruthy(); } });
  it('validates cardinality with 100 companies for 14', () => { const c = seedEnterpriseData(100, 3900+14); expect(c.length).toBe(100); });
  it('validates cardinality relational integrity for 14', () => { const c = seedEnterpriseData(10, 4000+14); for(const x of c) { const pids = new Set(x.products.map(p=>p.id)); for(const inv of x.invoices) for(const it of inv.items) expect(pids.has(it.productId)).toBe(true); } });
  it('validates cardinality financial accuracy for 14', () => { const c = seedEnterpriseData(10, 4100+14); for(const x of c) for(const inv of x.invoices) { expect(inv.finalTotal).toBeGreaterThanOrEqual(0); expect(inv.subtotal).toBeGreaterThan(0); } });
  it('validates cardinality determinism for 14', () => { const a = seedEnterpriseData(10, 4200+14); const b = seedEnterpriseData(10, 4200+14); expect(a[0].id).toBe(b[0].id); });
});
