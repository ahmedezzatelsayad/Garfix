/**
 * observability.test.ts — Tests for GarfiX Observability Stack
 *
 * Validates:
 *   - MetricsRegistry: counters, gauges, histograms, cardinality limits
 *   - TraceContext: distributed tracing, span creation, error marking
 *   - SLO definitions: completeness, thresholds
 *   - OTLP export format compliance
 *   - trackApiRequest helper
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { metrics, traceContext, SLOs, trackApiRequest, checkSLOCompliance } from "@/lib/observability";

// ── MetricsRegistry Tests ──────────────────────────────────────────────────

describe("MetricsRegistry", () => {
  beforeEach(() => {
    metrics.reset();
  });

  it("increments counters correctly", () => {
    metrics.increment("api.request", { route: "/api/invoices", method: "GET" });
    metrics.increment("api.request", { route: "/api/invoices", method: "GET" }); // Same labels → accumulates to value=2
    metrics.increment("api.request", { route: "/api/companies", method: "POST" }); // Different labels → new entry

    const stats = metrics.stats();
    expect(stats.counters).toBe(2); // 2 distinct label combinations
  });

  it("sets gauge values correctly", () => {
    metrics.gauge("system.memory", 512, { unit: "MB" });
    metrics.gauge("system.memory", 1024, { unit: "MB" }); // Overwrites same key

    const stats = metrics.stats();
    expect(stats.gauges).toBe(1);
  });

  it("records histogram observations", () => {
    metrics.histogram("api.latency", 50, { route: "/api/invoices" });
    metrics.histogram("api.latency", 100, { route: "/api/invoices" });
    metrics.histogram("api.latency", 200, { route: "/api/invoices" });

    const stats = metrics.stats();
    expect(stats.histograms).toBe(1);
    expect(stats.totalObservations).toBeGreaterThan(0);
  });

  it("redacts sensitive labels", () => {
    metrics.increment("api.request", { route: "/api/auth/login", token: "secret-jwt-token" });

    const otlp = metrics.exportOTLP();
    const counterMetric = otlp.scopeMetrics[0].metrics.find((m: any) => m.kind === "COUNTER" && m.labels.token);
    expect(counterMetric?.labels.token).toBe("[REDACTED]");
  });

  it("enforces cardinality limits", () => {
    // Generate 1001 different label values to exceed cardinality limit
    for (let i = 0; i < 1001; i++) {
      metrics.increment("api.request", { requestId: `req-${i}` });
    }

    const otlp = metrics.exportOTLP();
    // After 1000 unique values, overflow kicks in
    const overflowMetric = otlp.scopeMetrics[0].metrics.find((m: any) => m.labels.requestId === "cardinality_overflow");
    expect(overflowMetric).toBeTruthy();
  });

  it("exports OTLP-compliant JSON structure", () => {
    metrics.increment("api.request", { route: "/api/health" });
    metrics.gauge("system.uptime", 3600);
    metrics.histogram("api.latency", 100);

    const otlp = metrics.exportOTLP();

    // Verify OTLP structure
    expect(otlp.resource).toBeTruthy();
    expect(otlp.resource.attributes["service.name"]).toBe("garfix-eos");
    expect(otlp.scopeMetrics).toBeTruthy();
    expect(otlp.scopeMetrics.length).toBeGreaterThan(0);
    expect(otlp.scopeMetrics[0].scope.name).toBe("garfix.metrics");
    expect(otlp.scopeMetrics[0].metrics.length).toBeGreaterThan(0);
    expect(otlp.exportedAt).toBeTruthy();
  });

  it("computes histogram summary with percentiles", () => {
    // Add 100 observations ranging from 1 to 100
    for (let i = 1; i <= 100; i++) {
      metrics.histogram("api.latency", i);
    }

    const otlp = metrics.exportOTLP();
    const histMetric = otlp.scopeMetrics[0].metrics.find((m: any) => m.kind === "HISTOGRAM")!;

    expect(histMetric.summary).toBeTruthy();
    expect(histMetric.summary!.count).toBe(100);
    expect(histMetric.summary!.sum).toBe(5050);
    expect(histMetric.summary!.min).toBe(1);
    expect(histMetric.summary!.max).toBe(100);
    expect(histMetric.summary!.p50).toBe(50);
    expect(histMetric.summary!.p99).toBe(99);
    expect(histMetric.summary!.buckets.length).toBeGreaterThan(0);
  });

  it("measure() records latency and handles errors", async () => {
    // Success case
    const result = await metrics.measure("db.query", async () => "result", { table: "invoices" });
    expect(result).toBe("result");

    // Error case
    try {
      await metrics.measure("db.query", async () => { throw new Error("connection failed"); }, { table: "users" });
    } catch (err) {
      expect((err as Error).message).toBe("connection failed");
    }

    const stats = metrics.stats();
    expect(stats.counters).toBeGreaterThan(0); // Error counter was incremented
  });

  it("reset() clears all metrics", () => {
    metrics.increment("api.request");
    metrics.gauge("system.uptime", 3600);
    metrics.histogram("api.latency", 100);

    metrics.reset();

    const stats = metrics.stats();
    expect(stats.counters).toBe(0);
    expect(stats.gauges).toBe(0);
    expect(stats.histograms).toBe(0);
  });
});

// ── TraceContext Tests ──────────────────────────────────────────────────────

describe("TraceContext", () => {
  it("creates a trace with trace ID", () => {
    const trace = traceContext.start("invoice-creation");
    const result = trace.end();

    expect(result.traceId).toBeTruthy();
    expect(result.traceId.length).toBe(32); // 128-bit hex
    expect(result.rootSpan).toBe("invoice-creation");
  });

  it("creates child spans", () => {
    const trace = traceContext.start("invoice-creation");
    trace.span("validate-input").span("save-to-db");
    const result = trace.end();

    expect(result.spans.length).toBe(3); // root + 2 child
    expect(result.spans[1].name).toBe("validate-input");
    expect(result.spans[2].name).toBe("save-to-db");
  });

  it("records span events", () => {
    const trace = traceContext.start("invoice-creation");
    trace.span("validate-input").event("field-checked", { field: "total" });
    const result = trace.end();

    expect(result.spans[1].events.length).toBe(1);
    expect(result.spans[1].events[0].name).toBe("field-checked");
  });

  it("marks errors correctly", () => {
    const trace = traceContext.start("invoice-creation");
    trace.span("save-to-db").setError("connection refused");
    const result = trace.end();

    expect(result.status).toBe("error");
    expect(result.spans[1].status).toBe("error");
  });

  it("calculates duration", () => {
    const trace = traceContext.start("invoice-creation");
    // Simulate some work
    const result = trace.end();

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.startTime).toBeLessThanOrEqual(result.endTime);
  });
});

// ── SLO Definitions Tests ───────────────────────────────────────────────────

describe("SLO Definitions", () => {
  it("has all required SLO categories", () => {
    const categories = Object.values(SLOs).map((s) => s.category);
    expect(categories).toContain("availability");
    expect(categories).toContain("latency");
    expect(categories).toContain("correctness");
    expect(categories).toContain("durability");
  });

  it("each SLO has required fields", () => {
    for (const [key, slo] of Object.entries(SLOs)) {
      expect(slo.name).toBeTruthy();
      expect(slo.description.length).toBeGreaterThan(20);
      expect(slo.target).toBeGreaterThan(0);
      expect(slo.metricName).toBeTruthy();
      expect(slo.window).toBeTruthy();
      expect(slo.category).toBeTruthy();
    }
  });

  it("availability SLOs have >= 99% targets", () => {
    const availabilitySLOs = Object.values(SLOs).filter((s) => s.category === "availability");
    for (const slo of availabilitySLOs) {
      expect(slo.target).toBeGreaterThanOrEqual(99);
    }
  });

  it("latency SLOs have realistic thresholds", () => {
    const latencySLOs = Object.values(SLOs).filter((s) => s.category === "latency");
    for (const slo of latencySLOs) {
      expect(slo.target).toBeGreaterThanOrEqual(50); // At least 50ms minimum
      expect(slo.target).toBeLessThanOrEqual(5000); // At most 5 seconds
    }
  });
});

// ── trackApiRequest Tests ───────────────────────────────────────────────────

describe("trackApiRequest", () => {
  beforeEach(() => {
    metrics.reset();
  });

  it("tracks successful requests", () => {
    trackApiRequest("/api/invoices", "GET", 50, 200, "acme-co");

    const stats = metrics.stats();
    expect(stats.counters).toBeGreaterThanOrEqual(1);
    expect(stats.histograms).toBeGreaterThanOrEqual(1);
  });

  it("tracks error requests separately", () => {
    trackApiRequest("/api/invoices", "GET", 5000, 500, "acme-co");

    const stats = metrics.stats();
    expect(stats.counters).toBeGreaterThanOrEqual(2); // request + error
  });

  it("tracks requests without company slug", () => {
    trackApiRequest("/api/health", "GET", 10, 200);

    const stats = metrics.stats();
    expect(stats.counters).toBeGreaterThanOrEqual(1);
  });
});

// ── SLO Compliance Tests ────────────────────────────────────────────────────

describe("SLO Compliance Check", () => {
  it("returns compliance report for all SLOs", () => {
    const compliance = checkSLOCompliance();

    expect(Object.keys(compliance).length).toBe(Object.keys(SLOs).length);
    for (const [key, report] of Object.entries(compliance)) {
      expect(report.slo).toBeTruthy();
      expect(report.current).toBeTruthy();
      expect(typeof report.compliant).toBe("boolean");
      expect(typeof report.burnRate).toBe("number");
    }
  });
});
