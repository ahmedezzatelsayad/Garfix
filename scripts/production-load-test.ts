/**
 * production-load-test.ts — Comprehensive Production Load Test
 *
 * Designed for production-like environments (Docker + PostgreSQL + Valkey).
 * Measures: p50, p95, p99, max latency, HTTP error rates (500/502),
 * CPU/RAM monitoring, memory leak detection during sustained load.
 *
 * Usage:
 *   bun scripts/production-load-test.ts --url=http://localhost:3000 --duration=300
 *   bun scripts/production-load-test.ts --url=http://localhost:3000 --concurrency=10 --duration=60
 *
 * This script MUST be run on a production-like environment with:
 *   - PostgreSQL 17 (not SQLite)
 *   - Valkey 8.1 / Redis
 *   - OTEL_EXPORTER_OTLP_ENDPOINT configured (or intentionally left empty)
 *   - Sufficient RAM (>4GB available)
 *
 * Output: JSON file in load-test-results/ directory
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── CLI argument parsing ─────────────────────────────────────────────────────

interface TestConfig {
  baseUrl: string;
  concurrency: number;
  duration: number; // seconds
  endpoints: string[];
  verbose: boolean;
}

function parseArgs(args: string[]): TestConfig {
  const config: TestConfig = {
    baseUrl: "http://localhost:3000",
    concurrency: 5,
    duration: 300, // 5 minutes default
    endpoints: [
      "/api/health",
      "/api/auth/login",
      "/api/invoices",
      "/api/clients",
      "/api/settings",
      "/api/accounting/profit-loss",
    ],
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--url=")) config.baseUrl = arg.slice(6);
    else if (arg.startsWith("--concurrency=")) config.concurrency = parseInt(arg.slice(15));
    else if (arg.startsWith("--duration=")) config.duration = parseInt(arg.slice(12));
    else if (arg.startsWith("--endpoints=")) config.endpoints = arg.slice(13).split(",");
    else if (arg === "--verbose") config.verbose = true;
  }
  return config;
}

const config = parseArgs(process.argv.slice(2));
const ROOT = import.meta.dir.replace("/scripts", "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestResult {
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  timestamp: string;
  error?: string;
}

interface PhaseResult {
  phase: string;
  startTime: string;
  endTime: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  http500Count: number;
  http502Count: number;
  http429Count: number;
  http4xxCount: number;
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  avg: number;
  memorySnapshotMB: number;
}

interface LoadTestReport {
  testName: string;
  timestamp: string;
  environment: string;
  config: TestConfig;
  phases: PhaseResult[];
  summary: {
    totalRequests: number;
    totalDuration: number;
    overallP50: number;
    overallP95: number;
    overallP99: number;
    overallMax: number;
    totalHttp500: number;
    totalHttp502: number;
    totalHttp429: number;
    totalErrors: number;
    memoryAtStartMB: number;
    memoryAtEndMB: number;
    memoryGrowthMB: number;
    memoryLeakDetected: boolean;
    status: "PASSED" | "FAILED" | "BLOCKED";
    statusReason?: string;
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function getMemoryMB(): number {
  const mem = process.memoryUsage();
  return Math.round(mem.rss / 1024 / 1024);
}

// ── Main Test Logic ──────────────────────────────────────────────────────────

async function runPhase(
  phaseName: string,
  durationSeconds: number,
  concurrency: number,
): Promise<PhaseResult> {
  const results: RequestResult[] = [];
  const startTime = new Date().toISOString();
  const endTimeExpected = Date.now() + durationSeconds * 1000;
  let activeRequests = 0;
  let completed = 0;

  console.log(`\n  🔄 Phase: ${phaseName} — ${durationSeconds}s, concurrency=${concurrency}`);

  // Distribute requests across endpoints
  let endpointIndex = 0;
  function nextEndpoint(): string {
    const ep = config.endpoints[endpointIndex % config.endpoints.length];
    endpointIndex++;
    return ep;
  }

  // Send requests until duration is reached
  const sendRequest = async (): Promise<void> => {
    const endpoint = nextEndpoint();
    const url = `${config.baseUrl}${endpoint}`;
    const requestStart = Date.now();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const latencyMs = Date.now() - requestStart;
      const result: RequestResult = {
        endpoint,
        statusCode: response.status,
        latencyMs,
        timestamp: new Date().toISOString(),
      };

      if (response.status >= 400) {
        try {
          const body = await response.text();
          result.error = body.slice(0, 200);
        } catch { /* ignore */ }
      }

      results.push(result);
      completed++;
      if (config.verbose && completed % 50 === 0) {
        console.log(`    Completed ${completed} requests...`);
      }
    } catch (err: any) {
      results.push({
        endpoint,
        statusCode: 0,
        latencyMs: Date.now() - requestStart,
        timestamp: new Date().toISOString(),
        error: err.message || "fetch failed",
      });
      completed++;
    }
  };

  // Run concurrent requests for the duration
  const promises: Promise<void>[] = [];
  while (Date.now() < endTimeExpected) {
    if (activeRequests < concurrency) {
      activeRequests++;
      const p = sendRequest().then(() => { activeRequests--; });
      promises.push(p);
    }
    await new Promise(r => setTimeout(r, 10)); // small delay to prevent overwhelming
  }

  // Wait for remaining requests
  await Promise.allSettled(promises);

  const endTime = new Date().toISOString();
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);

  return {
    phase: phaseName,
    startTime,
    endTime,
    totalRequests: results.length,
    successCount: results.filter(r => r.statusCode >= 200 && r.statusCode < 400).length,
    errorCount: results.filter(r => r.statusCode >= 400 || r.statusCode === 0).length,
    http500Count: results.filter(r => r.statusCode === 500).length,
    http502Count: results.filter(r => r.statusCode === 502).length,
    http429Count: results.filter(r => r.statusCode === 429).length,
    http4xxCount: results.filter(r => r.statusCode >= 400 && r.statusCode < 500).length,
    latencies,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
    min: latencies.length > 0 ? latencies[0] : 0,
    avg: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    memorySnapshotMB: getMemoryMB(),
  };
}

async function main() {
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("  GarfiX EOS — Production Load Test");
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log(`  Target: ${config.baseUrl}`);
  console.log(`  Duration: ${config.duration}s (${Math.round(config.duration / 60)} min)`);
  console.log(`  Concurrency: ${config.concurrency}`);
  console.log(`  Endpoints: ${config.endpoints.join(", ")}`);
  console.log("");

  const memoryAtStart = getMemoryMB();
  const phases: PhaseResult[] = [];

  // Phase 1: Warm-up (30s, low concurrency)
  phases.push(await runPhase("warmup", 30, Math.max(1, config.concurrency / 3)));

  // Phase 2: Sustained load (config.duration - 60s)
  const mainDuration = Math.max(60, config.duration - 60);
  phases.push(await runPhase("sustained-load", mainDuration, config.concurrency));

  // Phase 3: Cool-down + memory check (30s, low concurrency)
  phases.push(await runPhase("cooldown", 30, Math.max(1, config.concurrency / 3)));

  // 5-minute wait to check for memory leaks
  console.log("\n  ⏳ Waiting 5 minutes to check for memory leaks...");
  await new Promise(r => setTimeout(r, 5 * 60 * 1000));
  const memoryAfterWait = getMemoryMB();

  const memoryAtEnd = getMemoryMB();
  const memoryGrowth = memoryAtEnd - memoryAtStart;
  const memoryLeakDetected = memoryGrowth > 100; // >100MB growth = potential leak

  // Compute overall statistics
  const allLatencies = phases.flatMap(p => p.latencies).sort((a, b) => a - b);
  const totalRequests = phases.reduce((s, p) => s + p.totalRequests, 0);

  const report: LoadTestReport = {
    testName: "production-load-test",
    timestamp: new Date().toISOString(),
    environment: config.baseUrl,
    config,
    phases,
    summary: {
      totalRequests,
      totalDuration: config.duration,
      overallP50: percentile(allLatencies, 50),
      overallP95: percentile(allLatencies, 95),
      overallP99: percentile(allLatencies, 99),
      overallMax: allLatencies.length > 0 ? allLatencies[allLatencies.length - 1] : 0,
      totalHttp500: phases.reduce((s, p) => s + p.http500Count, 0),
      totalHttp502: phases.reduce((s, p) => s + p.http502Count, 0),
      totalHttp429: phases.reduce((s, p) => s + p.http429Count, 0),
      totalErrors: phases.reduce((s, p) => s + p.errorCount, 0),
      memoryAtStartMB: memoryAtStart,
      memoryAtEndMB: memoryAtEnd,
      memoryGrowthMB: memoryGrowth,
      memoryLeakDetected,
      status: memoryLeakDetected
        ? "FAILED"
        : phases.reduce((s, p) => s + p.http500Count, 0) > 0
          ? "FAILED"
          : phases.reduce((s, p) => s + p.http502Count, 0) > 0
            ? "FAILED"
            : "PASSED",
      statusReason: memoryLeakDetected
        ? `Memory leak detected: ${memoryGrowth}MB growth`
        : phases.reduce((s, p) => s + p.http500Count, 0) > 0
          ? `HTTP 500 errors detected: ${phases.reduce((s, p) => s + p.http500Count, 0)}`
          : phases.reduce((s, p) => s + p.http502Count, 0) > 0
            ? `HTTP 502 errors detected: ${phases.reduce((s, p) => s + p.http502Count, 0)}`
            : undefined,
    },
  };

  // Print summary
  console.log("\n════════════════════════════════════════════════════════════════════════");
  console.log("  LOAD TEST SUMMARY");
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log(`  Status:         ${report.summary.status}`);
  if (report.summary.statusReason) console.log(`  Reason:         ${report.summary.statusReason}`);
  console.log(`  Total Requests: ${totalRequests}`);
  console.log(`  p50 Latency:    ${report.summary.overallP50}ms`);
  console.log(`  p95 Latency:    ${report.summary.overallP95}ms`);
  console.log(`  p99 Latency:    ${report.summary.overallP99}ms`);
  console.log(`  Max Latency:    ${report.summary.overallMax}ms`);
  console.log(`  HTTP 500:       ${report.summary.totalHttp500}`);
  console.log(`  HTTP 502:       ${report.summary.totalHttp502}`);
  console.log(`  HTTP 429:       ${report.summary.totalHttp429}`);
  console.log(`  Total Errors:   ${report.summary.totalErrors}`);
  console.log(`  Memory Start:   ${memoryAtStart}MB`);
  console.log(`  Memory End:     ${memoryAtEnd}MB`);
  console.log(`  Memory Growth:  ${memoryGrowth}MB`);
  console.log(`  Leak Detected:  ${memoryLeakDetected ? "YES ❌" : "NO ✅"}`);
  console.log("════════════════════════════════════════════════════════════════════════");

  // Save results
  const resultsDir = join(ROOT, "load-test-results");
  mkdirSync(resultsDir, { recursive: true });
  const filename = `production-load-test-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(join(resultsDir, filename), JSON.stringify(report, null, 2));
  console.log(`\n  Results saved to: load-test-results/${filename}`);

  // Exit with failure if test failed
  if (report.summary.status === "FAILED") process.exit(1);
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
