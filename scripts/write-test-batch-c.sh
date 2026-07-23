#!/usr/bin/env bash
set -euo pipefail
DIR="/home/z/my-project/Garfix/src/lib/founder-validation/__tests__"

#####################################################################
# CATEGORY 3: telemetry-{topic}-{01..20}.test.ts
#####################################################################

for i in $(seq 1 20); do
  case $i in
    1) f="telemetry-constructor-01.test.ts"; t="TelemetryCollector constructor";;
    2) f="telemetry-record-entry-02.test.ts"; t="TelemetryCollector record entry";;
    3) f="telemetry-get-entries-03.test.ts"; t="TelemetryCollector getEntries";;
    4) f="telemetry-clear-04.test.ts"; t="TelemetryCollector clear";;
    5) f="telemetry-tenant-scope-05.test.ts"; t="TelemetryCollector tenant scoping";;
    6) f="telemetry-summary-06.test.ts"; t="TelemetryCollector summary";;
    7) f="telemetry-large-batch-07.test.ts"; t="TelemetryCollector large batch";;
    8) f="telemetry-error-handling-08.test.ts"; t="TelemetryCollector error handling";;
    9) f="telemetry-timestamp-09.test.ts"; t="TelemetryCollector timestamps";;
    10) f="telemetry-provider-tracking-10.test.ts"; t="TelemetryCollector provider tracking";;
    11) f="telemetry-model-tracking-11.test.ts"; t="TelemetryCollector model tracking";;
    12) f="telemetry-cache-tracking-12.test.ts"; t="TelemetryCollector cache tracking";;
    13) f="telemetry-resolved-by-13.test.ts"; t="TelemetryCollector resolvedBy tracking";;
    14) f="telemetry-confidence-range-14.test.ts"; t="TelemetryCollector confidence range";;
    15) f="telemetry-cost-accumulation-15.test.ts"; t="TelemetryCollector cost accumulation";;
    16) f="telemetry-retry-counting-16.test.ts"; t="TelemetryCollector retry counting";;
    17) f="telemetry-queue-metrics-17.test.ts"; t="TelemetryCollector queue metrics";;
    18) f="telemetry-recovery-tracking-18.test.ts"; t="TelemetryCollector recovery tracking";;
    19) f="telemetry-multi-tenant-19.test.ts"; t="TelemetryCollector multi-tenant";;
    20) f="telemetry-output-quality-20.test.ts"; t="TelemetryCollector output quality";;
  esac
done

cat > "$DIR/telemetry-constructor-01.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector } from "../index";

describe("TelemetryCollector constructor", () => {
  it("creates collector with tenant name", () => {
    const c = new TelemetryCollector("test-tenant");
    expect(c.getEntries()).toHaveLength(0);
  });

  it("starts with zero entries", () => {
    expect(new TelemetryCollector("x").getEntries()).toHaveLength(0);
  });

  it("accepts any string as tenant name", () => {
    const c = new TelemetryCollector("tenant-123_slug");
    expect(c.getEntries()).toHaveLength(0);
  });

  it("accepts empty string tenant", () => {
    expect(new TelemetryCollector("").getEntries()).toHaveLength(0);
  });

  it("creates independent instances", () => {
    const a = new TelemetryCollector("a");
    const b = new TelemetryCollector("b");
    expect(a.getEntries()).not.toBe(b.getEntries());
  });
});
EOF
echo "  telemetry-01 done"

cat > "$DIR/telemetry-record-entry-02.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector record", () => {
  function make(id: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("records single entry", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1"));
    expect(c.getEntries()).toHaveLength(1);
  });

  it("records multiple entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 50; i++) c.record(make(String(i)));
    expect(c.getEntries()).toHaveLength(50);
  });

  it("preserves entry data", () => {
    const c = new TelemetryCollector("t");
    c.record(make("x"));
    expect(c.getEntries()[0].provider).toBe("p");
    expect(c.getEntries()[0].model).toBe("m");
  });
});
EOF
echo "  telemetry-02 done"

cat > "$DIR/telemetry-get-entries-03.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector getEntries", () => {
  function make(id: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("returns array of recorded entries", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1")); c.record(make("2"));
    expect(c.getEntries()).toHaveLength(2);
  });

  it("returns copy not reference", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1"));
    const a = c.getEntries();
    const b = c.getEntries();
    expect(a).not.toBe(b);
    expect(a.length).toBe(b.length);
  });

  it("returns entries in insertion order", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i)));
    const ids = c.getEntries().map(e => e.id);
    expect(ids).toEqual(["0","1","2","3","4","5","6","7","8","9"]);
  });
});
EOF
echo "  telemetry-03 done"

cat > "$DIR/telemetry-clear-04.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector clear", () => {
  function make(id: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("clear removes all entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i)));
    c.clear();
    expect(c.getEntries()).toHaveLength(0);
  });

  it("clear then record works", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1"));
    c.clear();
    c.record(make("2"));
    expect(c.getEntries()).toHaveLength(1);
    expect(c.getEntries()[0].id).toBe("2");
  });

  it("clear on empty is safe", () => {
    const c = new TelemetryCollector("t");
    c.clear();
    expect(c.getEntries()).toHaveLength(0);
  });
});
EOF
echo "  telemetry-04 done"

cat > "$DIR/telemetry-tenant-scope-05.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector tenant isolation", () => {
  function make(id: string, tenant: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant, worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("each collector has its own entries", () => {
    const a = new TelemetryCollector("tenant-a");
    const b = new TelemetryCollector("tenant-b");
    a.record(make("1", "tenant-a"));
    b.record(make("2", "tenant-b"));
    expect(a.getEntries()).toHaveLength(1);
    expect(b.getEntries()).toHaveLength(1);
    expect(a.getEntries()[0].id).toBe("1");
    expect(b.getEntries()[0].id).toBe("2");
  });

  it("clearing one does not affect the other", () => {
    const a = new TelemetryCollector("a"), b = new TelemetryCollector("b");
    a.record(make("1", "a")); b.record(make("2", "b"));
    a.clear();
    expect(a.getEntries()).toHaveLength(0);
    expect(b.getEntries()).toHaveLength(1);
  });
});
EOF
echo "  telemetry-05 done"

cat > "$DIR/telemetry-summary-06.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector summary methods", () => {
  function make(id: string, o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("entry count matches recorded", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 15; i++) c.record(make(String(i)));
    expect(c.getEntries()).toHaveLength(15);
  });

  it("unique tenants in entries", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { tenant: "a" }));
    c.record(make("2", { tenant: "a" }));
    c.record(make("3", { tenant: "b" }));
    const tenants = new Set(c.getEntries().map(e => e.tenant));
    expect(tenants.size).toBe(2);
  });

  it("can filter by cacheHit", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { cacheHit: true }));
    c.record(make("2", { cacheHit: false }));
    const hits = c.getEntries().filter(e => e.cacheHit);
    expect(hits).toHaveLength(1);
  });
});
EOF
echo "  telemetry-06 done"

cat > "$DIR/telemetry-large-batch-07.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector large batch recording", () => {
  function make(id: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("records 1000 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 1000; i++) c.record(make(String(i)));
    expect(c.getEntries()).toHaveLength(1000);
  });

  it("clears 1000 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 1000; i++) c.record(make(String(i)));
    c.clear();
    expect(c.getEntries()).toHaveLength(0);
  });

  it("unique IDs across 1000 entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 1000; i++) c.record(make(String(i)));
    const ids = new Set(c.getEntries().map(e => e.id));
    expect(ids.size).toBe(1000);
  });
});
EOF
echo "  telemetry-07 done"

cat > "$DIR/telemetry-error-handling-08.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector error entries", () => {
  function make(id: string, o: Partial<TelemetryEntry> = {}): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null, ...o,
    };
  }

  it("entries with empty error array are valid", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { errors: [] }));
    expect(c.getEntries()).toHaveLength(1);
  });

  it("entries with error strings are valid", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { errors: ["timeout", "rate_limit"] }));
    expect(c.getEntries()[0].errors).toHaveLength(2);
  });

  it("filter entries with errors", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", { errors: [] }));
    c.record(make("2", { errors: ["fail"] }));
    c.record(make("3", { errors: [] }));
    expect(c.getEntries().filter(e => e.errors.length > 0)).toHaveLength(1);
  });
});
EOF
echo "  telemetry-08 done"

cat > "$DIR/telemetry-timestamp-09.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector timestamp tracking", () => {
  function make(id: string, ts?: Date): TelemetryEntry {
    return {
      id, timestamp: ts ?? new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("entries preserve their timestamps", () => {
    const c = new TelemetryCollector("t");
    const now = new Date("2024-06-15T12:00:00Z");
    c.record(make("1", now));
    expect(c.getEntries()[0].timestamp).toEqual(now);
  });

  it("entries can have different timestamps", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", new Date("2024-01-01")));
    c.record(make("2", new Date("2024-12-31")));
    const ts = c.getEntries().map(e => e.timestamp.getTime());
    expect(ts[0]).toBeLessThan(ts[1]);
  });
});
EOF
echo "  telemetry-09 done"

cat > "$DIR/telemetry-provider-tracking-10.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector provider tracking", () => {
  function make(id: string, provider: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider, model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks multiple providers", () => {
    const c = new TelemetryCollector("t");
    ["openai", "anthropic", "google", "deepseek"].forEach((p, i) => c.record(make(String(i), p)));
    const providers = c.getEntries().map(e => e.provider);
    expect(new Set(providers).size).toBe(4);
  });

  it("counts per provider", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i), i < 7 ? "openai" : "anthropic"));
    const providers = c.getEntries().map(e => e.provider);
    expect(providers.filter(p => p === "openai")).toHaveLength(7);
    expect(providers.filter(p => p === "anthropic")).toHaveLength(3);
  });
});
EOF
echo "  telemetry-10 done"

cat > "$DIR/telemetry-model-tracking-11.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector model tracking", () => {
  function make(id: string, model: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model, latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks different models", () => {
    const c = new TelemetryCollector("t");
    ["gpt-4", "claude-3", "gemini-pro"].forEach((m, i) => c.record(make(String(i), m)));
    expect(new Set(c.getEntries().map(e => e.model)).size).toBe(3);
  });

  it("model count matches entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 20; i++) c.record(make(String(i), "gpt-4"));
    expect(c.getEntries().filter(e => e.model === "gpt-4")).toHaveLength(20);
  });
});
EOF
echo "  telemetry-11 done"

cat > "$DIR/telemetry-cache-tracking-12.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector cache hit tracking", () => {
  function make(id: string, cacheHit: boolean): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "cache", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks cache hit/miss ratio", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 30; i++) c.record(make(String(i), i < 18));
    const entries = c.getEntries();
    expect(entries.filter(e => e.cacheHit)).toHaveLength(18);
    expect(entries.filter(e => !e.cacheHit)).toHaveLength(12);
  });
});
EOF
echo "  telemetry-12 done"

cat > "$DIR/telemetry-resolved-by-13.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry, type CascadeStage } from "../index";

describe("TelemetryCollector resolvedBy tracking", () => {
  function make(id: string, stage: CascadeStage): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: stage, confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("all cascade stages represented", () => {
    const stages: CascadeStage[] = ["cache", "pattern", "rule", "memory", "ai"];
    const c = new TelemetryCollector("t");
    stages.forEach((s, i) => c.record(make(String(i), s)));
    expect(new Set(c.getEntries().map(e => e.resolvedBy)).size).toBe(5);
  });

  it("counts per stage", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i), "ai"));
    for (let i = 0; i < 5; i++) c.record(make(`c${i}`, "cache"));
    const entries = c.getEntries();
    expect(entries.filter(e => e.resolvedBy === "ai")).toHaveLength(10);
    expect(entries.filter(e => e.resolvedBy === "cache")).toHaveLength(5);
  });
});
EOF
echo "  telemetry-13 done"

cat > "$DIR/telemetry-confidence-range-14.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector confidence range", () => {
  function make(id: string, conf: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: conf,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("records confidence from 0 to 1", () => {
    const c = new TelemetryCollector("t");
    [0, 0.1, 0.5, 0.9, 1.0].forEach((conf, i) => c.record(make(String(i), conf)));
    const confs = c.getEntries().map(e => e.confidence);
    expect(Math.min(...confs)).toBe(0);
    expect(Math.max(...confs)).toBe(1);
  });

  it("average confidence is calculable", () => {
    const c = new TelemetryCollector("t");
    [0.8, 0.9, 1.0].forEach((conf, i) => c.record(make(String(i), conf)));
    const avg = c.getEntries().reduce((s, e) => s + e.confidence, 0) / 3;
    expect(avg).toBeCloseTo(0.9, 6);
  });
});
EOF
echo "  telemetry-14 done"

cat > "$DIR/telemetry-cost-accumulation-15.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector cost accumulation", () => {
  function make(id: string, cost: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: cost, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("sums total cost across entries", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", 0.5)); c.record(make("2", 1.5)); c.record(make("3", 3.0));
    const total = c.getEntries().reduce((s, e) => s + e.costUsd, 0);
    expect(total).toBe(5.0);
  });

  it("zero cost entries contribute zero", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", 0)); c.record(make("2", 0));
    expect(c.getEntries().reduce((s, e) => s + e.costUsd, 0)).toBe(0);
  });

  it("handles very small costs", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", 0.0001));
    expect(c.getEntries()[0].costUsd).toBe(0.0001);
  });
});
EOF
echo "  telemetry-15 done"

cat > "$DIR/telemetry-retry-counting-16.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector retry counting", () => {
  function make(id: string, retries: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks retry counts", () => {
    const c = new TelemetryCollector("t");
    [0, 1, 2, 3, 5].forEach((r, i) => c.record(make(String(i), r)));
    const retries = c.getEntries().map(e => e.retries);
    expect(retries).toEqual([0, 1, 2, 3, 5]);
  });

  it("high retries are stored correctly", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", 100));
    expect(c.getEntries()[0].retries).toBe(100);
  });
});
EOF
echo "  telemetry-16 done"

cat > "$DIR/telemetry-queue-metrics-17.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector queue metrics", () => {
  function make(id: string, queue: string, waitMs: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue,
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: waitMs, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("tracks different queues", () => {
    const c = new TelemetryCollector("t");
    ["ai-jobs", "email-jobs", "backup-jobs"].forEach((q, i) => c.record(make(String(i), q, 10)));
    expect(new Set(c.getEntries().map(e => e.queue)).size).toBe(3);
  });

  it("queue wait times stored correctly", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", "q", 5000));
    expect(c.getEntries()[0].queueWaitMs).toBe(5000);
  });
});
EOF
echo "  telemetry-17 done"

cat > "$DIR/telemetry-recovery-tracking-18.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector recovery path tracking", () => {
  function make(id: string, recovery: string | null): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: recovery,
    };
  }

  it("null recovery path stored", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", null));
    expect(c.getEntries()[0].recoveryPath).toBeNull();
  });

  it("string recovery path stored", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", "cache->rule->ai"));
    expect(c.getEntries()[0].recoveryPath).toBe("cache->rule->ai");
  });

  it("filter entries with recovery paths", () => {
    const c = new TelemetryCollector("t");
    c.record(make("1", null));
    c.record(make("2", "fallback"));
    c.record(make("3", null));
    expect(c.getEntries().filter(e => e.recoveryPath !== null)).toHaveLength(1);
  });
});
EOF
echo "  telemetry-18 done"

cat > "$DIR/telemetry-multi-tenant-19.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector multi-tenant isolation", () => {
  function make(id: string, tenant: string): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant, worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: 0.8, errors: [], recoveryPath: null,
    };
  }

  it("20 tenants each have their own collector", () => {
    const collectors = Array.from({ length: 20 }, (_, i) => new TelemetryCollector(`t-${i}`));
    collectors.forEach((c, i) => c.record(make(`e-${i}`, `t-${i}`)));
    collectors.forEach((c, i) => {
      expect(c.getEntries()).toHaveLength(1);
      expect(c.getEntries()[0].tenant).toBe(`t-${i}`);
    });
  });

  it("entries in one collector never appear in another", () => {
    const a = new TelemetryCollector("a"), b = new TelemetryCollector("b");
    a.record(make("a1", "a")); a.record(make("a2", "a"));
    b.record(make("b1", "b"));
    const aIds = new Set(a.getEntries().map(e => e.id));
    b.getEntries().forEach(e => expect(aIds.has(e.id)).toBe(false));
  });
});
EOF
echo "  telemetry-19 done"

cat > "$DIR/telemetry-output-quality-20.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test";
import { TelemetryCollector, type TelemetryEntry } from "../index";

describe("TelemetryCollector output quality scores", () => {
  function make(id: string, score: number): TelemetryEntry {
    return {
      id, timestamp: new Date(), tenant: "t", worker: "w", queue: "q",
      provider: "p", model: "m", latencyMs: 100, promptTokens: 10,
      completionTokens: 10, totalTokens: 20, costUsd: 0.01, retries: 0,
      queueWaitMs: 10, executionTimeMs: 90, cacheHit: false, memoryHit: false,
      ruleHit: false, patternHit: false, resolvedBy: "ai", confidence: 0.9,
      outputQualityScore: score, errors: [], recoveryPath: null,
    };
  }

  it("tracks quality from 0 to 1", () => {
    const c = new TelemetryCollector("t");
    [0, 0.25, 0.5, 0.75, 1.0].forEach((s, i) => c.record(make(String(i), s)));
    const scores = c.getEntries().map(e => e.outputQualityScore);
    expect(Math.min(...scores)).toBe(0);
    expect(Math.max(...scores)).toBe(1);
  });

  it("average quality is calculable", () => {
    const c = new TelemetryCollector("t");
    [0.6, 0.7, 0.8, 0.9].forEach((s, i) => c.record(make(String(i), s)));
    const avg = c.getEntries().reduce((s, e) => s + e.outputQualityScore, 0) / 4;
    expect(avg).toBeCloseTo(0.75, 6);
  });

  it("all perfect quality entries", () => {
    const c = new TelemetryCollector("t");
    for (let i = 0; i < 10; i++) c.record(make(String(i), 1.0));
    expect(c.getEntries().every(e => e.outputQualityScore === 1.0)).toBe(true);
  });
});
EOF
echo "  telemetry-20 done"
echo "Category 3 complete: 20 files"
