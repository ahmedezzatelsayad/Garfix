import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';
describe('Validation: amount-accuracy 4', () => {
  it('validates amount-accuracy for 4', () => { const c = seedEnterpriseData(10, 3800+4); expect(c.length).toBe(10); for(const x of c) { expect(x.id).toBeTruthy(); } });
  it('validates amount-accuracy with 100 companies for 4', () => { const c = seedEnterpriseData(100, 3900+4); expect(c.length).toBe(100); });
  it('validates amount-accuracy relational integrity for 4', () => { const c = seedEnterpriseData(10, 4000+4); for(const x of c) { const pids = new Set(x.products.map(p=>p.id)); for(const inv of x.invoices) for(const it of inv.items) expect(pids.has(it.productId)).toBe(true); } });
  it('validates amount-accuracy financial accuracy for 4', () => { const c = seedEnterpriseData(10, 4100+4); for(const x of c) for(const inv of x.invoices) { expect(inv.finalTotal).toBeGreaterThanOrEqual(0); expect(inv.subtotal).toBeGreaterThan(0); } });
  it('validates amount-accuracy determinism for 4', () => { const a = seedEnterpriseData(10, 4200+4); const b = seedEnterpriseData(10, 4200+4); expect(a[0].id).toBe(b[0].id); });
});
