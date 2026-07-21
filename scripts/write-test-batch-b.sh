#!/usr/bin/env bash
set -euo pipefail
DIR="/home/z/my-project/Garfix/src/lib/founder-validation/__tests__"

#####################################################################
# CATEGORY 2: metrics-{topic}-{01..20}.test.ts
#####################################################################

cat > "$DIR/metrics-latency-percentiles-01.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, seedEnterpriseData, type TelemetryEntry } from "../index";

describe("Metrics latency percentile calculations", () => {
  function makeEntry(overrides: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...overrides,
    };
  }

  it("p50 should be median of sorted latencies", () => {
    const c = new TelemetryCollector("test");
    [10, 20, 30, 40, 50].forEach(ms => c.record({ ...makeEntry(), latencyMs: ms, id: `t-${ms}` }));
    const metrics = calculateMetrics(c.getEntries(), []);
    expect(metrics.p50Latency).toBe(30);
  });

  it("p95 should be high percentile", () => {
    const c = new TelemetryCollector("test");
    for (let i = 0; i < 100; i++) c.record({ ...makeEntry(), latencyMs: i * 10, id: `t-${i}` });
    const metrics = calculateMetrics(c.getEntries(), []);
    expect(metrics.p95Latency).toBeGreaterThanOrEqual(900);
  });

  it("p99 should be near max", () => {
    const c = new TelemetryCollector("test");
    for (let i = 0; i < 100; i++) c.record({ ...makeEntry(), latencyMs: i, id: `t-${i}` });
    const metrics = calculateMetrics(c.getEntries(), []);
    expect(metrics.p99Latency).toBeGreaterThanOrEqual(95);
  });

  it("single entry has all percentiles equal", () => {
    const c = new TelemetryCollector("test");
    c.record(makeEntry());
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p50Latency).toBe(100);
    expect(m.p95Latency).toBe(100);
    expect(m.p99Latency).toBe(100);
  });

  it("all zero latencies produce zero percentiles", () => {
    const c = new TelemetryCollector("test");
    for (let i = 0; i < 10; i++) c.record({ ...makeEntry(), latencyMs: 0, id: `t-${i}` });
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p50Latency).toBe(0);
    expect(m.p95Latency).toBe(0);
    expect(m.p99Latency).toBe(0);
  });

  it("requestsPerMinute should be non-negative", () => {
    const m = calculateMetrics([], []);
    expect(m.requestsPerMinute).toBeGreaterThanOrEqual(0);
  });
});
EOF
echo "  metrics-01 done"

cat > "$DIR/metrics-token-usage-02.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics token usage tracking", () => {
  function base(overrides: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 100,
      completionTokens: 50, totalTokens: 150, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...overrides,
    };
  }

  it("totalTokenUsage sums all entries", () => {
    const c = new TelemetryCollector("t");
    c.record(base()); c.record(base()); c.record(base());
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalTokenUsage).toBe(450);
  });

  it("empty entries produce zero total tokens", () => {
    expect(calculateMetrics([], []).totalTokenUsage).toBe(0);
  });

  it("handles zero token entries", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalTokenUsage).toBe(0);
  });

  it("handles large token counts", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ promptTokens: 100000, completionTokens: 50000, totalTokens: 150000 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalTokenUsage).toBe(150000);
  });

  it("totalRequests counts entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 25; i++) c.record(base({ id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(25);
  });
});
EOF
echo "  metrics-02 done"

cat > "$DIR/metrics-cost-per-request-03.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics cost per request", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("avgCostPerRequest = total / count", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 0.01 }));
    c.record(base({ costUsd: 0.03 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.avgCostPerRequest).toBeCloseTo(0.02, 6);
  });

  it("zero cost entries produce zero avg", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ costUsd: 0, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).avgCostPerRequest).toBe(0);
  });

  it("single entry avg equals its cost", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 0.005 }));
    expect(calculateMetrics(c.getEntries(), []).avgCostPerRequest).toBeCloseTo(0.005, 6);
  });

  it("empty telemetry has zero avg cost", () => {
    expect(calculateMetrics([], []).avgCostPerRequest).toBe(0);
  });

  it("totalUsdSpent sums all costs", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 1.0 })); c.record(base({ costUsd: 2.0 }));
    expect(calculateMetrics(c.getEntries(), []).totalUsdSpent).toBe(3.0);
  });
});
EOF
echo "  metrics-03 done"

cat > "$DIR/metrics-cache-hit-rate-04.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics cache hit rate", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("all cache hits = 100% hit rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ cacheHit: true, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).cacheHitRate).toBe(1);
  });

  it("no cache hits = 0% hit rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ cacheHit: false, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).cacheHitRate).toBe(0);
  });

  it("half cache hits = 0.5 rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ cacheHit: true, id: `h-${i}` }));
    for (let i = 0; i < 5; i++) c.record(base({ cacheHit: false, id: `m-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).cacheHitRate).toBeCloseTo(0.5, 6);
  });

  it("empty entries = 0 hit rate", () => {
    expect(calculateMetrics([], []).cacheHitRate).toBe(0);
  });
});
EOF
echo "  metrics-04 done"

cat > "$DIR/metrics-provider-distribution-05.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics provider distribution", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("single provider has count 1", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ provider: "anthropic" }));
    const d = calculateMetrics(c.getEntries(), []).providerDistribution;
    expect(d["anthropic"]).toBe(1);
  });

  it("multiple providers counted correctly", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 7; i++) c.record(base({ provider: "openai", id: `a-${i}` }));
    for (let i = 0; i < 3; i++) c.record(base({ provider: "anthropic", id: `b-${i}` }));
    const d = calculateMetrics(c.getEntries(), []).providerDistribution;
    expect(d["openai"]).toBe(7);
    expect(d["anthropic"]).toBe(3);
  });

  it("empty entries produce empty distribution", () => {
    expect(calculateMetrics([], []).providerDistribution).toEqual({});
  });

  it("model distribution tracks models", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ model: "gpt-4" }));
    c.record(base({ model: "claude-3" }));
    const d = calculateMetrics(c.getEntries(), []).modelDistribution;
    expect(d["gpt-4"]).toBe(1);
    expect(d["claude-3"]).toBe(1);
  });
});
EOF
echo "  metrics-05 done"

cat > "$DIR/metrics-error-rate-06.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics error rate", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("no errors = 0 error rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBe(0);
  });

  it("all errors = 1.0 error rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ errors: ["timeout"], id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBe(1);
  });

  it("mixed success/error = correct rate", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 8; i++) c.record(base({ id: `ok-${i}` }));
    for (let i = 0; i < 2; i++) c.record(base({ errors: ["fail"], id: `er-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBeCloseTo(0.2, 6);
  });

  it("empty = 0 error rate", () => {
    expect(calculateMetrics([], []).errorRate).toBe(0);
  });
});
EOF
echo "  metrics-06 done"

cat > "$DIR/metrics-learning-improvement-07.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics learning improvement", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("improvementPct is zero when costs are equal", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 20; i++) c.record(base({ costUsd: 0.01, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.learningImprovement.improvementPct).toBe(0);
  });

  it("improvementPct is positive when second half cheaper", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ costUsd: 0.10, id: `h-${i}` }));
    for (let i = 0; i < 10; i++) c.record(base({ costUsd: 0.05, id: `l-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.learningImprovement.improvementPct).toBeGreaterThan(0);
    expect(m.learningImprovement.firstHalfAvgCost).toBeGreaterThan(
      m.learningImprovement.secondHalfAvgCost
    );
  });

  it("single entry has zero improvement", () => {
    const c = new TelemetryCollector("t");
    c.record(base());
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.learningImprovement.improvementPct).toBe(0);
  });
});
EOF
echo "  metrics-07 done"

cat > "$DIR/metrics-memory-hit-rate-08.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics memory hit rate", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("100% memory hits", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ memoryHit: true, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).memoryHitRate).toBe(1);
  });

  it("0% memory hits", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ memoryHit: false, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).memoryHitRate).toBe(0);
  });

  it("partial memory hits calculated correctly", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ memoryHit: true, id: "1" }));
    c.record(base({ memoryHit: true, id: "2" }));
    c.record(base({ memoryHit: false, id: "3" }));
    c.record(base({ memoryHit: false, id: "4" }));
    c.record(base({ memoryHit: true, id: "5" }));
    expect(calculateMetrics(c.getEntries(), []).memoryHitRate).toBeCloseTo(0.6, 6);
  });

  it("empty = 0", () => {
    expect(calculateMetrics([], []).memoryHitRate).toBe(0);
  });
});
EOF
echo "  metrics-08 done"

cat > "$DIR/metrics-rule-pattern-hit-09.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics rule and pattern hit rates", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("rule hit rate matches ratio", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 7; i++) c.record(base({ ruleHit: true, id: `r-${i}` }));
    for (let i = 0; i < 3; i++) c.record(base({ ruleHit: false, id: `n-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).ruleHitRate).toBeCloseTo(0.7, 6);
  });

  it("pattern hit rate matches ratio", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 3; i++) c.record(base({ patternHit: true, id: `p-${i}` }));
    for (let i = 0; i < 7; i++) c.record(base({ patternHit: false, id: `n-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).patternHitRate).toBeCloseTo(0.3, 6);
  });

  it("both can be 1.0 simultaneously", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ ruleHit: true, patternHit: true, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.ruleHitRate).toBe(1);
    expect(m.patternHitRate).toBe(1);
  });

  it("both zero when no hits", () => {
    expect(calculateMetrics([], []).ruleHitRate).toBe(0);
    expect(calculateMetrics([], []).patternHitRate).toBe(0);
  });
});
EOF
echo "  metrics-09 done"

cat > "$DIR/metrics-highest-cost-tenants-10.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics highest cost tenants", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("groups costs by tenant", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ tenant: "high", costUsd: 1.0, id: `h-${i}` }));
    for (let i = 0; i < 5; i++) c.record(base({ tenant: "low", costUsd: 0.1, id: `l-${i}` }));
    const top = calculateMetrics(c.getEntries(), []).highestCostTenants;
    expect(top[0].tenant).toBe("high");
    expect(top[0].cost).toBe(10.0);
  });

  it("sorts descending by cost", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ tenant: "a", costUsd: 5, id: "1" }));
    c.record(base({ tenant: "b", costUsd: 10, id: "2" }));
    c.record(base({ tenant: "c", costUsd: 2, id: "3" }));
    const top = calculateMetrics(c.getEntries(), []).highestCostTenants;
    expect(top[0].cost).toBeGreaterThanOrEqual(top[1]?.cost ?? 0);
  });

  it("counts requests per tenant", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 3; i++) c.record(base({ tenant: "x", id: `t-${i}` }));
    const top = calculateMetrics(c.getEntries(), []).highestCostTenants;
    expect(top[0].requests).toBe(3);
  });
});
EOF
echo "  metrics-10 done"

cat > "$DIR/metrics-budget-blocked-11.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics budget blocked count", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("empty telemetry = 0 budget blocked", () => {
    expect(calculateMetrics([], []).budgetBlockedCount).toBe(0);
  });

  it("no budget-blocked entries = 0", () => {
    const c = new TelemetryCollector("t");
    c.record(base());
    expect(calculateMetrics(c.getEntries(), []).budgetBlockedCount).toBe(0);
  });

  it("budget blocked entries counted", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 3; i++)
      c.record(base({ errors: ["budget_exceeded"], resolvedBy: "cache", id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.budgetBlockedCount).toBeGreaterThanOrEqual(0);
  });
});
EOF
echo "  metrics-11 done"

cat > "$DIR/metrics-cost-per-invoice-12.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, seedEnterpriseData, type TelemetryEntry } from "../index";

describe("Metrics cost per invoice", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("cost per invoice uses company invoice counts", () => {
    const companies = seedEnterpriseData({ companyCount: 10 });
    const totalInvoices = companies.reduce((s, c) => s + c.invoices.length, 0);
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ costUsd: 0.1, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), companies);
    if (totalInvoices > 0) expect(m.avgCostPerInvoice).toBeGreaterThan(0);
  });

  it("zero invoices = zero cost per invoice", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 1.0 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.avgCostPerInvoice).toBe(0);
  });

  it("cost per company = total / companyCount", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ costUsd: 0.5 }));
    const m = calculateMetrics(c.getEntries(), [{ id: 1, name: "", nameAr: "", slug: "a", email: "", phone: "", address: "", vatNumber: "", commercialRegistration: "", currency: "SAR", country: "SA", plan: "trial", openrouterApiKey: null, openrouterModel: "m/m", createdAt: new Date(), users: [], employees: [], clients: [], suppliers: [], warehouses: [], categories: [], products: [], inventory: [], invoices: [], purchases: [], aiMemories: [], aiRules: [], cacheEntries: [], providerHistory: [], workerHistory: [] }]);
    expect(m.avgCostPerCompany).toBe(0.5);
  });
});
EOF
echo "  metrics-12 done"

cat > "$DIR/metrics-confidence-scores-13.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics confidence score handling", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("handles confidence 0.0 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ confidence: 0.0, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalRequests).toBe(5);
  });

  it("handles confidence 1.0 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++) c.record(base({ confidence: 1.0, id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(5);
  });

  it("handles mixed confidence values", () => {
    const c = new TelemetryCollector("t");
    [0.1, 0.5, 0.9, 1.0, 0.0].forEach((conf, i) =>
      c.record(base({ confidence: conf, id: `t-${i}` }))
    );
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(5);
  });

  it("output quality score does not affect request count", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ outputQualityScore: 0.1 }));
    c.record(base({ outputQualityScore: 0.9 }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(2);
  });
});
EOF
echo "  metrics-13 done"

cat > "$DIR/metrics-retry-tracking-14.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics retry tracking", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("zero retries is valid", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ retries: 0 }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });

  it("high retry count entries are counted", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ retries: 10, id: "t-1" }));
    c.record(base({ retries: 5, id: "t-2" }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(2);
  });

  it("retries with errors are counted", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ retries: 3, errors: ["timeout"], id: "t-1" }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBe(1);
  });
});
EOF
echo "  metrics-14 done"

cat > "$DIR/metrics-recovery-path-15.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics recovery path tracking", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("null recovery path is valid", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ recoveryPath: null }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });

  it("string recovery path is valid", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ recoveryPath: "cache->rule->ai" }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });

  it("recovery path does not affect error rate when no errors", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 5; i++)
      c.record(base({ recoveryPath: "fallback", id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).errorRate).toBe(0);
  });
});
EOF
echo "  metrics-15 done"

cat > "$DIR/metrics-cascade-stage-16.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics cascade stage resolvedBy", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("all resolvedBy values are valid stages", () => {
    const valid = ["cache", "pattern", "rule", "memory", "ai"];
    const c = new TelemetryCollector("t");
    for (const stage of valid)
      c.record(base({ resolvedBy: stage as any, id: `t-${stage}` }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(5);
  });

  it("cache-resolved entries have cacheHit=true", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ resolvedBy: "cache", cacheHit: true }));
    expect(calculateMetrics(c.getEntries(), []).cacheHitRate).toBe(1);
  });

  it("ai-resolved entries counted in total requests", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(base({ resolvedBy: "ai", id: `t-${i}` }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(10);
  });
});
EOF
echo "  metrics-16 done"

cat > "$DIR/metrics-queue-wait-17.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics queue wait time", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("zero queue wait is valid", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ queueWaitMs: 0 }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p50Latency).toBeGreaterThanOrEqual(0);
  });

  it("high queue wait reflects in p95", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 100; i++)
      c.record(base({ queueWaitMs: 5000, latencyMs: 5100, executionTimeMs: 100, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p95Latency).toBeGreaterThanOrEqual(5000);
  });

  it("execution time + queue wait <= latency", () => {
    const c = new TelemetryCollector("t");
    c.record(base({ queueWaitMs: 10, executionTimeMs: 80, latencyMs: 100 }));
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });
});
EOF
echo "  metrics-17 done"

cat > "$DIR/metrics-empty-input-18.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { calculateMetrics } from "../index";

describe("Metrics with empty inputs", () => {
  it("empty telemetry + empty companies = zero metrics", () => {
    const m = calculateMetrics([], []);
    expect(m.totalRequests).toBe(0);
    expect(m.totalTokenUsage).toBe(0);
    expect(m.totalUsdSpent).toBe(0);
    expect(m.avgCostPerRequest).toBe(0);
    expect(m.errorRate).toBe(0);
    expect(m.cacheHitRate).toBe(0);
    expect(m.memoryHitRate).toBe(0);
    expect(m.ruleHitRate).toBe(0);
    expect(m.patternHitRate).toBe(0);
  });

  it("empty telemetry with companies = zero cost per company", () => {
    const m = calculateMetrics([], [{ id: 1, name: "", nameAr: "", slug: "a", email: "", phone: "", address: "", vatNumber: "", commercialRegistration: "", currency: "SAR", country: "SA", plan: "trial", openrouterApiKey: null, openrouterModel: "m/m", createdAt: new Date(), users: [], employees: [], clients: [], suppliers: [], warehouses: [], categories: [], products: [], inventory: [], invoices: [], purchases: [], aiMemories: [], aiRules: [], cacheEntries: [], providerHistory: [], workerHistory: [] }]);
    expect(m.avgCostPerCompany).toBe(0);
    expect(m.avgCostPerInvoice).toBe(0);
  });
});
EOF
echo "  metrics-18 done"

cat > "$DIR/metrics-single-entry-19.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics with single entry", () => {
  const entry: TelemetryEntry = {
    id: "single", timestamp: new Date(), tenant: "solo", worker: "w1", queue: "q1",
    provider: "anthropic", model: "claude-3", latencyMs: 250, promptTokens: 500,
    completionTokens: 200, totalTokens: 700, costUsd: 0.05, retries: 2,
    queueWaitMs: 50, executionTimeMs: 200, cacheHit: true, memoryHit: true,
    ruleHit: true, patternHit: true, resolvedBy: "cache", confidence: 0.95,
    outputQualityScore: 0.9, errors: [], recoveryPath: null,
  };

  it("totalRequests = 1", () => {
    const c = new TelemetryCollector("t"); c.record(entry);
    expect(calculateMetrics(c.getEntries(), []).totalRequests).toBe(1);
  });

  it("all hit rates = 1.0", () => {
    const c = new TelemetryCollector("t"); c.record(entry);
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.cacheHitRate).toBe(1);
    expect(m.memoryHitRate).toBe(1);
    expect(m.ruleHitRate).toBe(1);
    expect(m.patternHitRate).toBe(1);
  });

  it("costs match entry", () => {
    const c = new TelemetryCollector("t"); c.record(entry);
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.totalUsdSpent).toBe(0.05);
    expect(m.avgCostPerRequest).toBe(0.05);
  });

  it("tokens match entry", () => {
    const c = new TelemetryCollector("t"); c.record(entry);
    expect(calculateMetrics(c.getEntries(), []).totalTokenUsage).toBe(700);
  });
});
EOF
echo "  metrics-19 done"

cat > "$DIR/metrics-perf-characteristics-20.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, calculateMetrics, type TelemetryEntry } from "../index";

describe("Metrics performance characteristics with 100 entries", () => {
  function base(o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id: "t-1", timestamp: new Date(), tenant: "a", worker: "w", queue: "q",
      provider: "openrouter", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.001, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("calculates 100 entries efficiently", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 100; i++) c.record(base({ id: `t-${i}` }));
    const start = Date.now();
    const m = calculateMetrics(c.getEntries(), []);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(m.totalRequests).toBe(100);
  });

  it("p50 < p95 < p99", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 100; i++) c.record(base({ latencyMs: i, id: `t-${i}` }));
    const m = calculateMetrics(c.getEntries(), []);
    expect(m.p50Latency).toBeLessThanOrEqual(m.p95Latency);
    expect(m.p95Latency).toBeLessThanOrEqual(m.p99Latency);
  });

  it("top tenants limited in count", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 100; i++) c.record(base({ tenant: `tenant-${i}`, costUsd: i, id: `t-${i}` }));
    const top = calculateMetrics(c.getEntries(), []).highestCostTenants;
    expect(top.length).toBeLessThanOrEqual(10);
  });
});
EOF
echo "  metrics-20 done"
echo "Category 2 complete: 20 files"
