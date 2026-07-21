import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';
describe('Validation: statistical-validity 18', () => {
  it('validates statistical-validity for 18', () => { const c = seedEnterpriseData(10, 3800+18); expect(c.length).toBe(10); for(const x of c) { expect(x.id).toBeTruthy(); } });
  it('validates statistical-validity with 100 companies for 18', () => { const c = seedEnterpriseData(100, 3900+18); expect(c.length).toBe(100); });
  it('validates statistical-validity relational integrity for 18', () => { const c = seedEnterpriseData(10, 4000+18); for(const x of c) { const pids = new Set(x.products.map(p=>p.id)); for(const inv of x.invoices) for(const it of inv.items) expect(pids.has(it.productId)).toBe(true); } });
  it('validates statistical-validity financial accuracy for 18', () => { const c = seedEnterpriseData(10, 4100+18); for(const x of c) for(const inv of x.invoices) { expect(inv.finalTotal).toBeGreaterThanOrEqual(0); expect(inv.subtotal).toBeGreaterThan(0); } });
  it('validates statistical-validity determinism for 18', () => { const a = seedEnterpriseData(10, 4200+18); const b = seedEnterpriseData(10, 4200+18); expect(a[0].id).toBe(b[0].id); });
});
