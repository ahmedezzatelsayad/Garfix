import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';
describe('Validation: type-coverage 8', () => {
  it('validates type-coverage for 8', () => { const c = seedEnterpriseData(10, 3800+8); expect(c.length).toBe(10); for(const x of c) { expect(x.id).toBeTruthy(); } });
  it('validates type-coverage with 100 companies for 8', () => { const c = seedEnterpriseData(100, 3900+8); expect(c.length).toBe(100); });
  it('validates type-coverage relational integrity for 8', () => { const c = seedEnterpriseData(10, 4000+8); for(const x of c) { const pids = new Set(x.products.map(p=>p.id)); for(const inv of x.invoices) for(const it of inv.items) expect(pids.has(it.productId)).toBe(true); } });
  it('validates type-coverage financial accuracy for 8', () => { const c = seedEnterpriseData(10, 4100+8); for(const x of c) for(const inv of x.invoices) { expect(inv.finalTotal).toBeGreaterThanOrEqual(0); expect(inv.subtotal).toBeGreaterThan(0); } });
  it('validates type-coverage determinism for 8', () => { const a = seedEnterpriseData(10, 4200+8); const b = seedEnterpriseData(10, 4200+8); expect(a[0].id).toBe(b[0].id); });
});
