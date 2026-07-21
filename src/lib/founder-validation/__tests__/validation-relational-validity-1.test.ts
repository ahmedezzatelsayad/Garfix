import { describe, it, expect } from 'bun:test';
import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';
describe('Validation: relational-validity 1', () => {
  it('validates relational-validity for 1', () => { const c = seedEnterpriseData(10, 3800+1); expect(c.length).toBe(10); for(const x of c) { expect(x.id).toBeTruthy(); } });
  it('validates relational-validity with 100 companies for 1', () => { const c = seedEnterpriseData(100, 3900+1); expect(c.length).toBe(100); });
  it('validates relational-validity relational integrity for 1', () => { const c = seedEnterpriseData(10, 4000+1); for(const x of c) { const pids = new Set(x.products.map(p=>p.id)); for(const inv of x.invoices) for(const it of inv.items) expect(pids.has(it.productId)).toBe(true); } });
  it('validates relational-validity financial accuracy for 1', () => { const c = seedEnterpriseData(10, 4100+1); for(const x of c) for(const inv of x.invoices) { expect(inv.finalTotal).toBeGreaterThanOrEqual(0); expect(inv.subtotal).toBeGreaterThan(0); } });
  it('validates relational-validity determinism for 1', () => { const a = seedEnterpriseData(10, 4200+1); const b = seedEnterpriseData(10, 4200+1); expect(a[0].id).toBe(b[0].id); });
});
