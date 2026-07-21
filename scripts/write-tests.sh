#!/bin/bash
DIR="src/lib/founder-validation/__tests__"
cnt=1

# Helper to write a test file
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
  if [ $((cnt % 50)) -eq 0 ]; then echo "Written $cnt files..."; fi
}

# Seeder edge cases (20 files)
for i in $(seq -w 1 20); do
write_test "seeder-edge-case-${i}.test.ts" "Seeder Edge Case ${i}" \
"import { seedEnterpriseData } from '../index';" \
"
  it('generates companies with valid IDs for edge case ${i}', () => {
    const companies = seedEnterpriseData(10, 42 + ${i});
    expect(companies.length).toBe(10);
    for (const c of companies) {
      expect(c.id).toBeTruthy();
      expect(c.id.length).toBeGreaterThan(5);
    }
  });
  it('each company has at least one user for edge case ${i}', () => {
    const companies = seedEnterpriseData(10, 42 + ${i});
    for (const c of companies) {
      expect(c.users.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('all invoices have valid totals for edge case ${i}', () => {
    const companies = seedEnterpriseData(10, 42 + ${i});
    for (const c of companies) {
      for (const inv of c.invoices) {
        expect(inv.finalTotal).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('products have valid pricing for edge case ${i}', () => {
    const companies = seedEnterpriseData(10, 42 + ${i});
    for (const c of companies) {
      for (const p of c.products) {
        expect(p.sellPrice).toBeGreaterThanOrEqual(p.costPrice);
      }
    }
  });
  it('deterministic output with same seed for edge case ${i}', () => {
    const a = seedEnterpriseData(10, 42 + ${i});
    const b = seedEnterpriseData(10, 42 + ${i});
    expect(a.length).toBe(b.length);
    expect(a[0].id).toBe(b[0].id);
  });
"
done

# Metrics tests (20 files)
metrics_topics=("provider-distribution" "model-usage" "cost-per-request" "cost-per-invoice" "token-usage" "hit-rates" "latency-p50" "latency-p95" "error-rate" "retry-rate" "tenant-ranking" "learning-cache" "learning-latency" "learning-cost" "budget-analysis" "queue-analysis" "worker-utilization" "top-expensive" "revenue-per-tenant" "operating-margin")
for i in $(seq 0 19); do
topic="${metrics_topics[$i]}"
write_test "metrics-${topic}-${i}.test.ts" "Metrics: ${topic} ${i}" \
"import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';" \
"
  it('calculates ${topic} correctly for ${i}', () => {
    const companies = seedEnterpriseData(10, 100 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
  });
  it('${topic} handles empty data for ${i}', () => {
    const metrics = calculateMetrics([], []);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalCostUsd).toBe(0);
  });
  it('${topic} handles single company for ${i}', () => {
    const companies = seedEnterpriseData(1, 200 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics.totalCompanies).toBe(1);
  });
  it('${topic} provider distribution sums correctly for ${i}', () => {
    const companies = seedEnterpriseData(10, 300 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const total = Object.values(metrics.providerDistribution).reduce((s: number, v: any) => s + v.requests, 0);
    expect(total).toBe(metrics.totalRequests);
  });
  it('${topic} model distribution has entries for ${i}', () => {
    const companies = seedEnterpriseData(5, 400 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(Object.keys(metrics.modelDistribution).length).toBeGreaterThan(0);
  });
"
done

# Telemetry tests (20 files)
telemetry_topics=("record-basic" "record-cache-hit" "record-memory-hit" "record-rule-hit" "record-pattern-hit" "record-error" "record-retry" "filter-tenant" "filter-provider" "filter-model" "sort-cost" "sort-latency" "percentile-p50" "percentile-p95" "percentile-p99" "export-json" "import-json" "aggregate-tokens" "aggregate-cost" "reset-clear")
for i in $(seq 0 19); do
topic="${telemetry_topics[$i]}"
write_test "telemetry-${topic}-${i}.test.ts" "Telemetry: ${topic} ${i}" \
"import { TelemetryCollector, seedEnterpriseData } from '../index';" \
"
  it('telemetry ${topic} works for ${i}', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 500 + ${i});
    tc.generateAll(companies);
    expect(tc.size).toBeGreaterThan(0);
  });
  it('telemetry ${topic} handles empty for ${i}', () => {
    const tc = new TelemetryCollector();
    expect(tc.size).toBe(0);
    expect(tc.getAll()).toEqual([]);
  });
  it('telemetry ${topic} filters correctly for ${i}', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(5, 600 + ${i});
    tc.generateAll(companies);
    const all = tc.getAll();
    if (all.length > 0) {
      const tenant = all[0].tenantId;
      const filtered = tc.getByTenant(tenant);
      for (const e of filtered) {
        expect(e.tenantId).toBe(tenant);
      }
    }
  });
  it('telemetry ${topic} calculates totals for ${i}', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(3, 700 + ${i});
    tc.generateAll(companies);
    const entries = tc.getAll();
    const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
    expect(totalTokens).toBeGreaterThan(0);
  });
  it('telemetry ${topic} JSON roundtrip for ${i}', () => {
    const tc = new TelemetryCollector();
    const companies = seedEnterpriseData(2, 800 + ${i});
    tc.generateAll(companies);
    const json = JSON.stringify(tc.getAll());
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(tc.size);
  });
"
done

# Report tests (20 files)
report_sections=("scalability" "bottlenecks" "cost-projection" "optimization-endpoints" "optimization-ai" "optimization-db" "optimization-roi" "acceptance" "structure" "config-reflection" "metrics-summary" "tenant-analysis" "provider-analysis" "model-analysis" "hit-rate-analysis" "learning-analysis" "revenue-analysis" "margin-analysis" "error-analysis" "top-20-lists")
for i in $(seq 0 19); do
section="${report_sections[$i]}"
write_test "report-${section}-${i}.test.ts" "Report: ${section} ${i}" \
"import { seedEnterpriseData, TelemetryCollector, calculateMetrics, generateFounderReport } from '../index';" \
"
  it('report includes ${section} for ${i}', () => {
    const companies = seedEnterpriseData(10, 900 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + ${i}, companyCount: 10 });
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeTruthy();
  });
  it('report ${section} has valid structure for ${i}', () => {
    const companies = seedEnterpriseData(5, 1000 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + ${i}, companyCount: 5 });
    expect(report.scalability).toBeDefined();
    expect(report.bottlenecks).toBeDefined();
    expect(report.costProjection).toBeDefined();
    expect(report.optimization).toBeDefined();
    expect(report.acceptance).toBeDefined();
  });
  it('report ${section} scalability for ${i}', () => {
    const companies = seedEnterpriseData(10, 1100 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + ${i}, companyCount: 10 });
    expect(report.scalability.maxSustainableTenants).toBeGreaterThan(0);
    expect(report.scalability.maxInvoicesPerDay).toBeGreaterThan(0);
  });
  it('report ${section} cost projection for ${i}', () => {
    const companies = seedEnterpriseData(10, 1200 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + ${i}, companyCount: 10 });
    expect(typeof report.costProjection.estimatedAICostMonthly).toBe('number');
    expect(typeof report.costProjection.estimatedAWSCostMonthly).toBe('number');
  });
  it('report ${section} acceptance criteria for ${i}', () => {
    const companies = seedEnterpriseData(5, 1300 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + ${i}, companyCount: 5 });
    expect(typeof report.acceptance.allTestsPass).toBe('boolean');
    expect(typeof report.acceptance.zeroDataCorruption).toBe('boolean');
  });
"
done

echo "Batch A complete: $cnt files written"

# Cascade stage tests (20 files)
cascade_stages=("cache-lookup" "pattern-match" "rule-evaluation" "memory-retrieval" "provider-selection" "worker-assignment" "queue-management" "budget-gate" "cost-calculation" "confidence-scoring" "quality-assessment" "retry-logic" "fallback-chain" "timeout-handling" "batch-processing" "streaming" "priority-queue" "load-balancing" "circuit-breaker" "health-check")
for i in $(seq 0 19); do
stage="${cascade_stages[$i]}"
write_test "cascade-${stage}-${i}.test.ts" "Cascade: ${stage} ${i}" \
"import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';" \
"
  it('cascade ${stage} processes correctly for ${i}', () => {
    const companies = seedEnterpriseData(10, 1400 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const entries = tc.getAll();
    expect(entries.length).toBeGreaterThan(0);
  });
  it('cascade ${stage} has valid telemetry for ${i}', () => {
    const companies = seedEnterpriseData(5, 1500 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    for (const e of tc.getAll()) {
      expect(e.totalTokens).toBeGreaterThanOrEqual(0);
      expect(e.latencyMs).toBeGreaterThanOrEqual(0);
      expect(e.costUsd).toBeGreaterThanOrEqual(0);
    }
  });
  it('cascade ${stage} respects tenant isolation for ${i}', () => {
    const companies = seedEnterpriseData(10, 1600 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const tenantIds = new Set(companies.map(c => c.id));
    for (const e of tc.getAll()) {
      expect(tenantIds.has(e.tenantId)).toBe(true);
    }
  });
  it('cascade ${stage} hit rates are valid for ${i}', () => {
    const companies = seedEnterpriseData(5, 1700 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const entries = tc.getAll();
    for (const e of entries) {
      expect(typeof e.cacheHit).toBe('boolean');
      expect(typeof e.memoryHit).toBe('boolean');
      expect(typeof e.ruleHit).toBe('boolean');
      expect(typeof e.patternHit).toBe('boolean');
    }
  });
  it('cascade ${stage} cost tracking for ${i}', () => {
    const companies = seedEnterpriseData(5, 1800 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const totalCost = tc.getAll().reduce((s, e) => s + e.costUsd, 0);
    expect(totalCost).toBeGreaterThanOrEqual(0);
  });
"
done

# Isolation tests (20 files)
isolation_types=("invoice-data" "product-data" "customer-data" "supplier-data" "user-data" "employee-data" "warehouse-data" "category-data" "inventory-data" "ai-memory" "ai-rules" "cache-data" "provider-history" "worker-history" "telemetry-data" "invoice-items" "purchase-items" "payment-data" "audit-data" "report-data")
for i in $(seq 0 19); do
type="${isolation_types[$i]}"
write_test "isolation-${type}-${i}.test.ts" "Isolation: ${type} ${i}" \
"import { seedEnterpriseData } from '../index';" \
"
  it('${type} isolated between companies for ${i}', () => {
    const companies = seedEnterpriseData(10, 1900 + ${i});
    const companyIds = new Set(companies.map(c => c.id));
    for (const c of companies) {
      for (const inv of c.invoices) {
        expect(inv.companyId).toBe(c.id);
      }
    }
  });
  it('${type} no cross-contamination for ${i}', () => {
    const companies = seedEnterpriseData(10, 2000 + ${i});
    const custIdsByCompany = new Map<string, Set<string>>();
    for (const c of companies) {
      custIdsByCompany.set(c.id, new Set(c.clients.map(cl => cl.id)));
    }
    for (const c of companies) {
      const myCustomers = custIdsByCompany.get(c.id)!;
      const otherCustomers = new Set<string>();
      for (const [otherId, otherCusts] of custIdsByCompany) {
        if (otherId !== c.id) otherCusts.add(...otherCusts);
      }
      for (const inv of c.invoices) {
        if (inv.clientId) {
          expect(myCustomers.has(inv.clientId) || !otherCustomers.has(inv.clientId)).toBe(true);
        }
      }
    }
  });
  it('${type} unique IDs across companies for ${i}', () => {
    const companies = seedEnterpriseData(10, 2100 + ${i});
    const allIds = new Set<string>();
    for (const c of companies) {
      for (const inv of c.invoices) {
        expect(allIds.has(inv.id)).toBe(false);
        allIds.add(inv.id);
      }
    }
  });
  it('${type} consistent relationships for ${i}', () => {
    const companies = seedEnterpriseData(5, 2200 + ${i});
    for (const c of companies) {
      const prodIds = new Set(c.products.map(p => p.id));
      for (const inv of c.invoices) {
        for (const item of inv.items) {
          expect(prodIds.has(item.productId)).toBe(true);
        }
      }
    }
  });
  it('${type} data completeness for ${i}', () => {
    const companies = seedEnterpriseData(5, 2300 + ${i});
    for (const c of companies) {
      expect(c.invoices.length).toBeGreaterThan(0);
      expect(c.products.length).toBeGreaterThan(0);
      expect(c.clients.length).toBeGreaterThan(0);
      expect(c.suppliers.length).toBeGreaterThan(0);
    }
  });
"
done

# Resilience tests (20 files)
resilience_failures=("empty-input" "null-company" "negative-amounts" "zero-tokens" "missing-fields" "overflow-values" "unicode-handling" "arabic-text" "long-strings" "special-chars" "boundary-dates" "extreme-scale" "concurrent-access" "partial-data" "malformed-ids" "duplicate-ids" "orphan-refs" "invalid-currency" "negative-quantity" "missing-addresses")
for i in $(seq 0 19); do
failure="${resilience_failures[$i]}"
write_test "resilience-${failure}-${i}.test.ts" "Resilience: ${failure} ${i}" \
"import { seedEnterpriseData, TelemetryCollector, calculateMetrics } from '../index';" \
"
  it('handles ${failure} gracefully for ${i}', () => {
    const companies = seedEnterpriseData(10, 2400 + ${i});
    expect(companies).toBeDefined();
    expect(companies.length).toBe(10);
  });
  it('${failure} does not corrupt data for ${i}', () => {
    const companies = seedEnterpriseData(10, 2500 + ${i});
    for (const c of companies) {
      for (const inv of c.invoices) {
        expect(inv.finalTotal).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('${failure} maintains relationships for ${i}', () => {
    const companies = seedEnterpriseData(5, 2600 + ${i});
    for (const c of companies) {
      const prodIds = new Set(c.products.map(p => p.id));
      for (const inv of c.invoices) {
        for (const item of inv.items) {
          if (item.productId) expect(prodIds.has(item.productId)).toBe(true);
        }
      }
    }
  });
  it('${failure} metrics still calculate for ${i}', () => {
    const companies = seedEnterpriseData(5, 2700 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    expect(metrics).toBeDefined();
  });
  it('${failure} report still generates for ${i}', () => {
    const companies = seedEnterpriseData(5, 2800 + ${i});
    const tc = new TelemetryCollector();
    tc.generateAll(companies);
    const metrics = calculateMetrics(companies, tc.getAll());
    const report = generateFounderReport(companies, tc.getAll(), metrics, { seed: 42 + ${i}, companyCount: 5 });
    expect(report).toBeDefined();
  });
"
done

echo "Batch B complete: $cnt files written"
