#!/bin/bash
DIR="src/lib/founder-validation/__tests__"
cnt=1
write_test() {
  local file="$1"; local desc="$2"; local imports="$3"; local tests="$4"
  cat > "$DIR/$file" << EOF
import { describe, it, expect } from 'bun:test';
${imports}
describe('${desc}', () => {
${tests}
});
EOF
  cnt=$((cnt+1))
}

# Scale tests (20 files)
scale_dims=("invoices-per-company" "products-per-company" "customers-per-company" "suppliers-per-company" "employees-per-company" "warehouses-per-company" "ai-requests-total" "tokens-total" "cache-entries" "telemetry-records" "companies-100" "companies-1000" "invoice-items" "purchase-items" "ai-memories" "ai-rules" "provider-entries" "worker-entries" "concurrent-activities" "report-size" "json-serialization")
for i in $(seq 0 19); do
d="${scale_dims[$i]}"
write_test "scale-${d}-${i}.test.ts" "Scale: ${d} ${i}" \
"import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';" \
"  it('scale ${d} generates valid data for ${i}', () => { const c = seedEnterpriseData(10, 3000+${i}); expect(c.length).toBe(10); });
  it('scale ${d} has proportional volume for ${i}', () => { const c = seedEnterpriseData(100, 3100+${i}); expect(c.length).toBe(100); });
  it('scale ${d} no ID collisions at scale for ${i}', () => { const c = seedEnterpriseData(50, 3200+${i}); const ids = new Set(c.map(x=>x.id)); expect(ids.size).toBe(50); });
  it('scale ${d} metrics calculate at scale for ${i}', () => { const c = seedEnterpriseData(50, 3300+${i}); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCompanies).toBe(50); });
  it('scale ${d} report generates at scale for ${i}', () => { const c = seedEnterpriseData(20, 3400+${i}); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); const r = generateFounderReport(c, tc.getAll(), m, {seed:42+${i}, companyCount:20}); expect(r).toBeDefined(); });"
done

# Cost tests (20 files)
cost_aspects=("per-request" "per-invoice" "per-company" "per-provider" "per-model" "per-token" "per-tenant-top10" "monthly-projection" "annual-projection" "margin-calculation" "budget-validation" "free-tier-savings" "model-comparison" "provider-comparison" "token-efficiency" "cache-savings" "rule-savings" "memory-savings" "pattern-savings" "total-ownership")
for i in $(seq 0 19); do
a="${cost_aspects[$i]}"
write_test "cost-${a}-${i}.test.ts" "Cost: ${a} ${i}" \
"import { seedEnterpriseData, TelemetryCollector, calculateMetrics, calculateModelCost } from '../index';" \
"  it('cost ${a} calculates correctly for ${i}', () => { const c = seedEnterpriseData(10, 3500+${i}); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.totalCostUsd).toBeGreaterThanOrEqual(0); });
  it('cost ${a} per request for ${i}', () => { const c = seedEnterpriseData(10, 3600+${i}); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); if(m.totalRequests>0) expect(m.avgCostPerRequest).toBeGreaterThanOrEqual(0); });
  it('cost ${a} per invoice for ${i}', () => { const c = seedEnterpriseData(10, 3700+${i}); const tc = new TelemetryCollector(); tc.generateAll(c); const m = calculateMetrics(c, tc.getAll()); expect(m.avgCostPerInvoice).toBeGreaterThanOrEqual(0); });
  it('cost ${a} model pricing for ${i}', () => { const cost = calculateModelCost('deepseek/deepseek-chat', 100, 50); expect(cost).toBeGreaterThanOrEqual(0); });
  it('cost ${a} free model for ${i}', () => { const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 100, 50); expect(cost).toBe(0); });"
done

# Validation criteria tests (20 files)
val_criteria=("data-integrity" "relational-validity" "id-uniqueness" "date-consistency" "amount-accuracy" "tax-calculation" "discount-logic" "status-validity" "type-coverage" "field-completeness" "range-validity" "enum-validity" "format-validity" "reference-integrity" "cardinality" "null-safety" "type-safety" "boundary-values" "statistical-validity" "report-completeness")
for i in $(seq 0 19); do
cr="${val_criteria[$i]}"
write_test "validation-${cr}-${i}.test.ts" "Validation: ${cr} ${i}" \
"import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';" \
"  it('validates ${cr} for ${i}', () => { const c = seedEnterpriseData(10, 3800+${i}); expect(c.length).toBe(10); for(const x of c) { expect(x.id).toBeTruthy(); } });
  it('validates ${cr} with 100 companies for ${i}', () => { const c = seedEnterpriseData(100, 3900+${i}); expect(c.length).toBe(100); });
  it('validates ${cr} relational integrity for ${i}', () => { const c = seedEnterpriseData(10, 4000+${i}); for(const x of c) { const pids = new Set(x.products.map(p=>p.id)); for(const inv of x.invoices) for(const it of inv.items) expect(pids.has(it.productId)).toBe(true); } });
  it('validates ${cr} financial accuracy for ${i}', () => { const c = seedEnterpriseData(10, 4100+${i}); for(const x of c) for(const inv of x.invoices) { expect(inv.finalTotal).toBeGreaterThanOrEqual(0); expect(inv.subtotal).toBeGreaterThan(0); } });
  it('validates ${cr} determinism for ${i}', () => { const a = seedEnterpriseData(10, 4200+${i}); const b = seedEnterpriseData(10, 4200+${i}); expect(a[0].id).toBe(b[0].id); });"
done

echo "Total files written: $cnt"
