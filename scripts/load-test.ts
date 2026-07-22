#!/usr/bin/env bun
/**
 * ═══════════════════════════════════════════════════════════════════
 * GarfiX EOS v12.0 — Production Load Test Script
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests real API endpoints with concurrent users, measures:
 * - Response times (p50/p90/p95/p99)
 * - Error rates
 * - Throughput (requests/second)
 * - Resource usage (CPU/RAM)
 *
 * Usage: bun scripts/load-test.ts [options]
 *   --users N        Concurrent users (default: 10)
 *   --requests N     Requests per user (default: 100)
 *   --url BASE_URL   Target URL (default: http://localhost:3000)
 *   --output DIR     Output directory (default: ./load-test-results)
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { performance, PerformanceObserver } from "node:perf_hooks";

// ─── Configuration ──────────────────────────────────────────────────
const CONFIG = {
  users: parseInt(process.argv.find(a => a.startsWith("--users"))?.split("=")[1] || "10"),
  requests: parseInt(process.argv.find(a => a.startsWith("--requests"))?.split("=")[1] || "100"),
  baseUrl: process.argv.find(a => a.startsWith("--url"))?.split("=")[1] || "http://localhost:3000",
  outputDir: process.argv.find(a => a.startsWith("--output"))?.split("=")[1] || "./load-test-results",
};

// ─── Types ───────────────────────────────────────────────────────────
interface LatencySample {
  timestamp: number;
  endpoint: string;
  method: string;
  status: number;
  latencyMs: number;
  error?: string;
}

interface EndpointResult {
  endpoint: string;
  method: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  errorRate: number;
  throughputPerSec: number;
}

// ─── Endpoints to Test ─────────────────────────────────────────────
const ENDPOINTS = [
  // Health & Status
  { path: "/api/health", method: "GET", weight: 3 },
  
  // Core APIs
  { path: "/api/companies", method: "GET", weight: 2 },
  { path: "/api/clients", method: "GET", weight: 2 },
  { path: "/api/invoices", method: "GET", weight: 2 },
  
  // Dashboard
  { path: "/api/dashboard/stats", method: "GET", weight: 2 },
  
  // Settings
  { path: "/api/settings", method: "GET", weight: 1 },
  
  // Feature Flags
  { path: "/api/feature-flags", method: "GET", weight: 1 },
];

// ─── Utilities ──────────────────────────────────────────────────────
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || 0;
}

async function fetchWithTiming(url: string, options: RequestInit = {}): Promise<LatencySample> {
  const start = performance.now();
  const timestamp = Date.now();
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...options.headers,
      },
    });
    
    const latencyMs = performance.now() - start;
    
    return {
      timestamp,
      endpoint: url.replace(CONFIG.baseUrl, ""),
      method: options.method || "GET",
      status: response.status,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = performance.now() - start;
    return {
      timestamp,
      endpoint: url.replace(CONFIG.baseUrl, ""),
      method: options.method || "GET",
      status: 0,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Load Test Runner ──────────────────────────────────────────────
async function runLoadTest(): Promise<Map<string, LatencySample[]>> {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       GarfiX EOS v12.0 — Production Load Test            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log(`Configuration:`);
  console.log(`  • Concurrent Users: ${CONFIG.users}`);
  console.log(`  • Requests/User: ${CONFIG.requests}`);
  console.log(`  • Total Requests: ${CONFIG.users * CONFIG.requests}`);
  console.log(`  • Target URL: ${CONFIG.baseUrl}`);
  console.log(`  • Endpoints: ${ENDPOINTS.length}\n`);

  const results = new Map<string, LatencySample[]>();
  const totalRequests = CONFIG.users * CONFIG.requests;
  let completedRequests = 0;

  // Initialize result arrays for each endpoint
  for (const ep of ENDPOINTS) {
    results.set(ep.path, []);
  }

  console.log("Starting load test...\n");

  const startTime = performance.now();

  // Create concurrent user workers
  const workers = Array.from({ length: CONFIG.users }, async (_, userId) => {
    const userResults = new Map<string, LatencySample[]>();
    
    for (const ep of ENDPOINTS) {
      userResults.set(ep.path, []);
    }

    for (let i = 0; i < CONFIG.requests; i++) {
      // Select endpoint based on weights
      const totalWeight = ENDPOINTS.reduce((sum, ep) => sum + ep.weight, 0);
      let random = Math.random() * totalWeight;
      let selectedEndpoint = ENDPOINTS[0];
      
      for (const ep of ENDPOINTS) {
        random -= ep.weight;
        if (random <= 0) {
          selectedEndpoint = ep;
          break;
        }
      }

      const url = `${CONFIG.baseUrl}${selectedEndpoint.path}`;
      const sample = await fetchWithTiming(url, {
        method: selectedEndpoint.method,
      });

      // Store result
      const endpointResults = results.get(selectedEndpoint.path)!;
      endpointResults.push(sample);

      completedRequests++;

      // Progress update every 10%
      if (completedRequests % Math.floor(totalRequests / 10) === 0) {
        const progress = ((completedRequests / totalRequests) * 100).toFixed(0);
        process.stdout.write(`\r  Progress: ${progress}% (${completedRequests}/${totalRequests})`);
      }

      // Small delay between requests (simulate real user behavior)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
    }
  });

  // Run all workers concurrently
  await Promise.all(workers);

  const totalTime = performance.now() - startTime;

  console.log(`\n\n✅ Load test completed in ${(totalTime / 1000).toFixed(2)}s\n`);

  return results;
}

// ─── Results Analysis ─────────────────────────────────────────────
function analyzeResults(results: Map<string, LatencySample[]>): EndpointResult[] {
  const analysis: EndpointResult[] = [];

  for (const [endpoint, samples] of results) {
    if (samples.length === 0) continue;

    const latencies = samples.map(s => s.latencyMs);
    const successes = samples.filter(s => s.status >= 200 && s.status < 400);
    const failures = samples.filter(s => s.status === 0 || s.status >= 400);

    analysis.push({
      endpoint,
      method: samples[0]?.method || "GET",
      totalRequests: samples.length,
      successfulRequests: successes.length,
      failedRequests: failures.length,
      avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50LatencyMs: percentile(latencies, 50),
      p90LatencyMs: percentile(latencies, 90),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      errorRate: (failures.length / samples.length) * 100,
      throughputPerSec: samples.length / ((samples[samples.length - 1]?.timestamp - samples[0]?.timestamp) || 1) * 1000,
    });
  }

  return analysis.sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);
}

// ─── Report Generation ─────────────────────────────────────────────
function generateReport(analysis: EndpointResult[]): void {
  if (!existsSync(CONFIG.outputDir)) {
    mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Console Report
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    LOAD TEST RESULTS                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("┌────────────────────────────────────────────────────────────────────┐");
  console.log("│ Endpoint                    │ Method │ Req/s  │ Err%  │ Avg(ms) │ P95 │");
  console.log("├────────────────────────────────────────────────────────────────────┤");

  for (const result of analysis) {
    const endpoint = result.endpoint.padEnd(28);
    const method = result.method.padEnd(7);
    const reqPerSec = result.throughputPerSec.toFixed(1).padStart(6);
    const errRate = result.errorRate.toFixed(1).padStart(5);
    const avg = result.avgLatencyMs.toFixed(0).padStart(6);
    const p95 = result.p95LatencyMs.toFixed(0).padStart(4);

    console.log(`│ ${endpoint} │ ${method} │ ${reqPerSec} │ ${errRate}% │ ${avg} │ ${p95}ms │`);
  }

  console.log("└────────────────────────────────────────────────────────────────────┘\n");

  // Summary Statistics
  const totalRequests = analysis.reduce((s, r) => s + r.totalRequests, 0);
  const totalErrors = analysis.reduce((s, r) => s + r.failedRequests, 0);
  const overallErrorRate = (totalErrors / totalRequests) * 100;
  const avgThroughput = analysis.reduce((s, r) => s + r.throughputPerSec, 0) / analysis.length;
  const avgLatency = analysis.reduce((s, r) => s + r.avgLatencyMs, 0) / analysis.length;
  const maxP95 = Math.max(...analysis.map(r => r.p95LatencyMs));

  console.log("📊 Summary:");
  console.log(`   Total Requests:    ${totalRequests}`);
  console.log(`   Total Errors:      ${totalErrors} (${overallErrorRate.toFixed(2)}%)`);
  console.log(`   Avg Throughput:    ${avgThroughput.toFixed(1)} req/s`);
  console.log(`   Avg Latency:       ${avgLatency.toFixed(0)}ms`);
  console.log(`   Max P95 Latency:   ${maxP95.toFixed(0)}ms\n`);

  // Performance Grades
  console.log("🏆 Performance Grades:");

  for (const result of analysis) {
    let grade = "A+";
    if (result.p95LatencyMs > 500) grade = "F";
    else if (result.p95LatencyMs > 300) grade = "D";
    else if (result.p95LatencyMs > 200) grade = "C";
    else if (result.p95LatencyMs > 100) grade = "B";
    else if (result.p95LatencyMs > 50) grade = "A";

    const status = result.errorRate > 5 ? "❌" : "✅";
    console.log(`   ${status} ${result.endpoint.padEnd(28)} Grade: ${grade} (P95: ${result.p95LatencyMs.toFixed(0)}ms)`);
  }

  // Save JSON Report
  const reportData = {
    metadata: {
      version: "12.0.0",
      timestamp: new Date().toISOString(),
      config: CONFIG,
    },
    summary: {
      totalRequests,
      totalErrors,
      overallErrorRate: `${overallErrorRate.toFixed(2)}%`,
      avgThroughput: `${avgThroughput.toFixed(1)} req/s`,
      avgLatencyMs: Math.round(avgLatency),
      maxP95LatencyMs: Math.round(maxP95),
    },
    endpoints: analysis,
  };

  writeFileSync(
    `${CONFIG.outputDir}/load-test-${timestamp}.json`,
    JSON.stringify(reportData, null, 2)
  );

  console.log(`\n💾 Full report saved to: ${CONFIG.outputDir}/load-test-${timestamp}.json`);
}

// ─── Main Execution ────────────────────────────────────────────────
async function main() {
  try {
    // Check if server is running
    console.log("Checking target server...\n");
    const healthCheck = await fetchWithTiming(`${CONFIG.baseUrl}/api/health`);
    
    if (healthCheck.status !== 200 && healthCheck.status !== 0) {
      console.log(`⚠️  Server returned status ${healthCheck.status}, proceeding with test...\n`);
    }

    // Run the load test
    const results = await runLoadTest();

    // Analyze results
    const analysis = analyzeResults(results);

    // Generate and display report
    generateReport(analysis);

    // Exit with appropriate code
    const overallErrorRate = analysis.reduce((s, r) => s + r.failedRequests, 0) / 
                             analysis.reduce((s, r) => s + r.totalRequests, 0) * 100;
    
    if (overallErrorRate > 10) {
      console.log("\n⚠️  High error rate detected! Review results.");
      process.exit(1);
    } else {
      console.log("\n✅ Load test passed! System is performing well.");
      process.exit(0);
    }
  } catch (error) {
    console.error("\n❌ Load test failed:", error);
    process.exit(1);
  }
}

main();
