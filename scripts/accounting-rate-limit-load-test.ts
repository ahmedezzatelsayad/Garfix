#!/usr/bin/env bun
/**
 * ═══════════════════════════════════════════════════════════════════
 * GarfiX EOS — Accounting Rate Limit Load Test
 * ═══════════════════════════════════════════════════════════════════
 *
 * Validates that ACCOUNTING_READ (40/min) and ACCOUNTING_WRITE (15/min)
 * rate limits work correctly under burst traffic conditions.
 * Also tests REPORT_GENERATION (5/5min) for heavy financial report endpoints.
 *
 * Usage: bun scripts/accounting-rate-limit-load-test.ts [options]
 *   --url BASE_URL       Target URL (default: http://localhost:3000)
 *   --duration SECONDS   Test duration in seconds (default: 120)
 *   --concurrency N      Concurrent request streams (default: 5)
 *   --output DIR         Output directory (default: ./load-test-results)
 *   --auth-token TOKEN   JWT token for authenticated endpoints (optional)
 *
 * Expected behavior:
 *   ACCOUNTING_READ: 40 requests/min → 429 after limit
 *   ACCOUNTING_WRITE: 15 requests/min → 429 after limit
 *   REPORT_GENERATION: 5 requests/5min → 429 after limit
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";

// ─── Configuration ──────────────────────────────────────────────────
const CONFIG = {
  baseUrl: process.argv.find(a => a.startsWith("--url"))?.split("=")[1] || "http://localhost:3000",
  duration: parseInt(process.argv.find(a => a.startsWith("--duration"))?.split("=")[1] || "120"),
  concurrency: parseInt(process.argv.find(a => a.startsWith("--concurrency"))?.split("=")[1] || "5"),
  outputDir: process.argv.find(a => a.startsWith("--output"))?.split("=")[1] || "./load-test-results",
  authToken: process.argv.find(a => a.startsWith("--auth-token"))?.split("=")[1] || "",
};

// ─── Rate Limit Definitions ────────────────────────────────────────
const RATE_LIMITS = {
  ACCOUNTING_READ: { maxPerMin: 40, endpoints: [
    "/api/accounting/accounts?companySlug=test-company",
    "/api/accounting/journal-entries?companySlug=test-company&limit=20",
    "/api/accounting/vouchers?companySlug=test-company",
    "/api/accounting/bank-accounts?companySlug=test-company",
    "/api/accounting/aging?companySlug=test-company&direction=receivable",
  ]},
  ACCOUNTING_WRITE: { maxPerMin: 15, endpoints: [
    "/api/accounting/journal-entries",     // POST
    "/api/accounting/vouchers",            // POST
    "/api/accounting/accounts",            // POST
    "/api/accounting/bank-transfer",       // POST
  ]},
  REPORT_GENERATION: { maxPer5Min: 5, endpoints: [
    "/api/accounting/profit-loss?companySlug=test-company",
    "/api/accounting/balance-sheet?companySlug=test-company",
    "/api/accounting/cash-flow?companySlug=test-company",
    "/api/accounting/trial-balance?companySlug=test-company",
    "/api/accounting/export-excel?companySlug=test-company&reportType=profit-loss",
  ]},
};

// ─── Types ───────────────────────────────────────────────────────────
interface RateLimitSample {
  timestamp: number;
  endpoint: string;
  method: string;
  category: string;
  status: number;
  latencyMs: number;
  rateLimitRemaining?: string;
  rateLimitReset?: string;
  error?: string;
}

interface RateLimitResult {
  category: string;
  totalRequests: number;
  successCount: number;     // 200 responses
  rateLimitedCount: number; // 429 responses
  otherErrorCount: number;  // other non-2xx responses
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  rateLimitedPercentage: number;
  expectedLimitPerMin: number;
  actualThroughputPerMin: number;
  burstDetected: boolean;   // whether 429s appear before the expected limit
  limitWorkingCorrectly: boolean;
}

// ─── Utilities ──────────────────────────────────────────────────────
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || 0;
}

async function fetchWithTiming(
  url: string,
  options: RequestInit = {},
  category: string,
): Promise<RateLimitSample> {
  const start = performance.now();
  const timestamp = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (CONFIG.authToken) {
    headers["Cookie"] = `access_token=${CONFIG.authToken}`;
  }

  try {
    const response = await fetch(url, { ...options, headers });
    const latencyMs = performance.now() - start;

    return {
      timestamp,
      endpoint: url.replace(CONFIG.baseUrl, ""),
      method: options.method || "GET",
      category,
      status: response.status,
      latencyMs,
      rateLimitRemaining: response.headers.get("X-RateLimit-Remaining") || undefined,
      rateLimitReset: response.headers.get("X-RateLimit-Reset") || undefined,
    };
  } catch (error) {
    const latencyMs = performance.now() - start;
    return {
      timestamp,
      endpoint: url.replace(CONFIG.baseUrl, ""),
      method: options.method || "GET",
      category,
      status: 0,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Load Test Runner ──────────────────────────────────────────────
async function runRateLimitTest(): Promise<RateLimitSample[]> {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  GarfiX EOS — Accounting Rate Limit Load Test           ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("Configuration:");
  console.log(`  • Duration:        ${CONFIG.duration}s`);
  console.log(`  • Concurrency:     ${CONFIG.concurrency}`);
  console.log(`  • Target URL:      ${CONFIG.baseUrl}`);
  console.log(`  • Auth Token:      ${CONFIG.authToken ? "✓ provided" : "✗ none (unauthenticated)"}`);
  console.log(`  • ACCOUNTING_READ: ${RATE_LIMITS.ACCOUNTING_READ.maxPerMin} req/min`);
  console.log(`  • ACCOUNTING_WRITE: ${RATE_LIMITS.ACCOUNTING_WRITE.maxPerMin} req/min`);
  console.log(`  • REPORT_GENERATION: ${RATE_LIMITS.REPORT_GENERATION.maxPer5Min} req/5min\n`);

  const samples: RateLimitSample[] = [];
  const startTime = performance.now();
  const endTime = startTime + CONFIG.duration * 1000;

  console.log("Starting rate limit burst test...\n");

  // Create concurrent workers that send rapid requests
  const workers = Array.from({ length: CONFIG.concurrency }, async (_, workerId) => {
    while (performance.now() < endTime) {
      // ACCOUNTING_READ burst — cycle through all read endpoints
      for (const endpoint of RATE_LIMITS.ACCOUNTING_READ.endpoints) {
        const url = `${CONFIG.baseUrl}${endpoint}`;
        const sample = await fetchWithTiming(url, { method: "GET" }, "ACCOUNTING_READ");
        samples.push(sample);
        // Very small delay — simulate rapid client browsing
        await new Promise(resolve => setTimeout(resolve, 50));
        if (performance.now() >= endTime) break;
      }

      // ACCOUNTING_WRITE burst — send POST requests with minimal payload
      for (const endpoint of RATE_LIMITS.ACCOUNTING_WRITE.endpoints) {
        const url = `${CONFIG.baseUrl}${endpoint}`;
        const body = { companySlug: "test-company", description: "rate-limit-test", date: "2026-01-01" };
        const sample = await fetchWithTiming(url, {
          method: "POST",
          body: JSON.stringify(body),
        }, "ACCOUNTING_WRITE");
        samples.push(sample);
        await new Promise(resolve => setTimeout(resolve, 100));
        if (performance.now() >= endTime) break;
      }

      // REPORT_GENERATION burst — cycle through all heavy report endpoints
      for (const endpoint of RATE_LIMITS.REPORT_GENERATION.endpoints) {
        const url = `${CONFIG.baseUrl}${endpoint}`;
        const sample = await fetchWithTiming(url, { method: "GET" }, "REPORT_GENERATION");
        samples.push(sample);
        await new Promise(resolve => setTimeout(resolve, 200));
        if (performance.now() >= endTime) break;
      }
    }
  });

  // Progress updates
  const progressInterval = setInterval(() => {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    const read429s = samples.filter(s => s.category === "ACCOUNTING_READ" && s.status === 429).length;
    const write429s = samples.filter(s => s.category === "ACCOUNTING_WRITE" && s.status === 429).length;
    const report429s = samples.filter(s => s.category === "REPORT_GENERATION" && s.status === 429).length;
    process.stdout.write(`\r  [${elapsed}s] READ: ${samples.filter(s => s.category === "ACCOUNTING_READ").length} (${read429s} 429s) | WRITE: ${samples.filter(s => s.category === "ACCOUNTING_WRITE").length} (${write429s} 429s) | REPORT: ${samples.filter(s => s.category === "REPORT_GENERATION").length} (${report429s} 429s)`);
  }, 2000);

  await Promise.all(workers);
  clearInterval(progressInterval);

  const totalTime = performance.now() - startTime;
  console.log(`\n\n✅ Rate limit test completed in ${(totalTime / 1000).toFixed(2)}s\n`);

  return samples;
}

// ─── Results Analysis ─────────────────────────────────────────────
function analyzeResults(samples: RateLimitSample[]): RateLimitResult[] {
  const categories = ["ACCOUNTING_READ", "ACCOUNTING_WRITE", "REPORT_GENERATION"] as const;
  const results: RateLimitResult[] = [];

  for (const category of categories) {
    const catSamples = samples.filter(s => s.category === category);
    if (catSamples.length === 0) continue;

    const latencies = catSamples.filter(s => s.status !== 429).map(s => s.latencyMs);
    const successes = catSamples.filter(s => s.status >= 200 && s.status < 300);
    const rateLimited = catSamples.filter(s => s.status === 429);
    const otherErrors = catSamples.filter(s => s.status !== 429 && (s.status === 0 || s.status >= 400));

    // Calculate actual throughput per minute
    const timeRangeSeconds = (catSamples[catSamples.length - 1]?.timestamp - catSamples[0]?.timestamp) / 1000 || 1;
    const actualThroughputPerMin = catSamples.length / (timeRangeSeconds / 60);

    // Expected limits
    const expectedLimitPerMin = category === "REPORT_GENERATION"
      ? RATE_LIMITS.REPORT_GENERATION.maxPer5Min / 5  // normalize to per-minute
      : RATE_LIMITS[category].maxPerMin;

    // Check if 429s appear proportionally (i.e. rate limiting is working)
    const rateLimitedPct = (rateLimited.length / catSamples.length) * 100;
    const limitWorking = rateLimited.length > 0 && rateLimitedPct < 80; // some 429s but not all

    // Check for premature bursts (429s appearing before hitting expected limit)
    const first429Index = catSamples.findIndex(s => s.status === 429);
    const requestsBeforeFirst429 = first429Index >= 0 ? first429Index : catSamples.length;
    const burstDetected = requestsBeforeFirst429 < expectedLimitPerMin * 0.5; // way too early

    results.push({
      category,
      totalRequests: catSamples.length,
      successCount: successes.length,
      rateLimitedCount: rateLimited.length,
      otherErrorCount: otherErrors.length,
      avgLatencyMs: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
      rateLimitedPercentage: rateLimitedPct,
      expectedLimitPerMin,
      actualThroughputPerMin,
      burstDetected,
      limitWorkingCorrectly: limitWorking && !burstDetected,
    });
  }

  return results;
}

// ─── Report Generation ─────────────────────────────────────────────
function generateReport(results: RateLimitResult[], samples: RateLimitSample[]): void {
  if (!existsSync(CONFIG.outputDir)) {
    mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Console Report
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          ACCOUNTING RATE LIMIT LOAD TEST RESULTS           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("┌──────────────────────────────────────────────────────────────────────────┐");
  console.log("│ Category            │ Req/min │ 200s │ 429s │ 429%  │ Limit OK │ Burst │");
  console.log("├──────────────────────────────────────────────────────────────────────────┤");

  for (const r of results) {
    const cat = r.category.padEnd(20);
    const throughput = r.actualThroughputPerMin.toFixed(1).padStart(6);
    const okCount = String(r.successCount).padStart(5);
    const rlCount = String(r.rateLimitedCount).padStart(5);
    const rlPct = r.rateLimitedPercentage.toFixed(1).padStart(5);
    const limitOk = r.limitWorkingCorrectly ? "  ✅ " : "  ❌ ";
    const burst = r.burstDetected ? " ⚠️ " : " ✅ ";

    console.log(`│ ${cat} │ ${throughput} │ ${okCount} │ ${rlCount} │ ${rlPct}% │ ${limitOk} │ ${burst} │`);
  }

  console.log("└──────────────────────────────────────────────────────────────────────────┘\n");

  // Validation Summary
  const allWorking = results.every(r => r.limitWorkingCorrectly);
  const anyBurst = results.some(r => r.burstDetected);

  console.log("Validation Summary:");
  for (const r of results) {
    const status = r.limitWorkingCorrectly ? "✅ PASS" : (r.burstDetected ? "❌ FAIL (burst)" : "❌ FAIL (no 429s)");
    console.log(`  ${status} — ${r.category}: expected ~${r.expectedLimitPerMin}/min, actual ${r.actualThroughputPerMin.toFixed(1)}/min, ${r.rateLimitedCount} 429s out of ${r.totalRequests}`);
  }

  console.log(`\nOverall: ${allWorking && !anyBurst ? "✅ ALL RATE LIMITS WORKING CORRECTLY" : "❌ RATE LIMIT ISSUES DETECTED"}\n`);

  // Save JSON Report
  const reportData = {
    metadata: {
      version: "12.1.0",
      timestamp: new Date().toISOString(),
      config: CONFIG,
      rateLimits: RATE_LIMITS,
    },
    results,
    samples: samples.slice(0, 5000), // Limit stored samples to keep file manageable
  };

  writeFileSync(
    `${CONFIG.outputDir}/accounting-rate-limit-test-${timestamp}.json`,
    JSON.stringify(reportData, null, 2),
  );

  console.log(`💾 Full report saved to: ${CONFIG.outputDir}/accounting-rate-limit-test-${timestamp}.json`);

  // Exit code
  if (!allWorking || anyBurst) {
    console.log("\n⚠️  Rate limit validation FAILED — review results above.");
    process.exit(1);
  } else {
    console.log("\n✅ Rate limit validation PASSED — all limits working as expected.");
    process.exit(0);
  }
}

// ─── Main Execution ────────────────────────────────────────────────
async function main() {
  try {
    // Check if server is running
    console.log("Checking target server...\n");
    const healthCheck = await fetchWithTiming(`${CONFIG.baseUrl}/api/health`, {}, "health");

    if (healthCheck.status === 0) {
      console.error("❌ Server is not reachable at", CONFIG.baseUrl);
      console.error("   Start the server with: bun run dev");
      process.exit(1);
    }

    // Run the rate limit burst test
    const samples = await runRateLimitTest();

    // Analyze results
    const results = analyzeResults(samples);

    // Generate and display report
    generateReport(results, samples);
  } catch (error) {
    console.error("\n❌ Rate limit test failed:", error);
    process.exit(1);
  }
}

main();
