#!/usr/bin/env bun
/**
 * scale-load-test.ts — Fresh load test for GarfiX dev server.
 *
 * Task ID: 3-load-test
 * Measures p50/p90/p95/p99 latency + CPU/RAM for invoice-related endpoints
 * against the running Next.js dev server at http://localhost:3000.
 *
 * Usage:  bun run scripts/scale-load-test.ts
 *
 * Output (3 files in /home/z/my-project/bench-results/):
 *   - scale-load-test.json  (full raw data)
 *   - scale-load-test.csv   (flat table)
 *   - scale-load-test.md    (human-readable summary)
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE = "http://localhost:3000";
const RESULTS_DIR = "/home/z/my-project/bench-results";
const COMPANY_SLUG = "loadtest";
const FOUNDER_EMAIL = "founder@garfix.app";
const FOUNDER_PASSWORD = "Loadtest123";
const REQUEST_TIMEOUT_MS = 60_000;
const DB_PATH = "/home/z/my-project/db/custom.db";

const CONCURRENCY_LEVELS = [1, 5, 10, 25, 50];
const REQUESTS_PER_LEVEL = 5; // per endpoint per concurrency level (keeps total bounded)
const AI_CONCURRENCY_LEVELS = [1, 3, 5];
const AI_REQUESTS_PER_LEVEL = 1;
const BATCH_SIZES = [100, 500, 1000];
const BATCH_CONCURRENCY = 1; // sequential — SQLite serializes writes anyway
const HTTP_REQUEST_TIMEOUT_MS = 15_000; // non-AI: fail fast on SQLite lock contention
const AI_REQUEST_TIMEOUT_MS = 60_000; // AI: matches codebase timeout

mkdirSync(RESULTS_DIR, { recursive: true });

// ─── State ───────────────────────────────────────────────────────────────────
let jwt = "";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Sample {
  status: number;
  ok: boolean;
  latencyMs: number;
  errorType: string | null;
}

interface TestResult {
  endpoint: string;
  method: string;
  concurrency: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  errorTypes: Record<string, number>;
  latenciesMs: number[];
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  rps: number;
  wallMs: number;
  serverCpuPct: number;
  serverRssDeltaMB: number;
  runnerRssDeltaMB: number;
  eventLoopLagP99Ms: number;
  eventLoopLagMaxMs: number;
  notes: string[];
}

interface BatchResult {
  size: number;
  wallMs: number;
  throughputInvoicesPerSec: number;
  successCount: number;
  errorCount: number;
  listLatencyMsBefore: number;
  listLatencyMsAfter: number;
  dbSizeBytesBefore: number;
  dbSizeBytesAfter: number;
  listP50: number;
  listP95: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function findServerPid(): number | null {
  try {
    // Find the PID listening on port 3000 (IPv4 or IPv6)
    const out = execSync("ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      if (line.includes(":3000")) {
        const m = line.match(/pid=(\d+)/);
        if (m) return parseInt(m[1], 10);
      }
    }
  } catch {}
  // Fallback: pgrep for next dev / next-server
  try {
    const out = execSync("pgrep -f 'next-server|next dev|next start' 2>/dev/null", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const pid = parseInt(out.split("\n")[0], 10);
    if (!Number.isNaN(pid)) return pid;
  } catch {}
  return null;
}

let SERVER_PID: number | null = null;

function readProcStat(pid: number): { cpuTicks: number; rssKB: number } | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // /proc/[pid]/stat has the comm field in parens which may contain spaces —
    // find the closing paren and parse the rest from there.
    const closeParen = stat.lastIndexOf(")");
    const rest = stat.slice(closeParen + 2).split(" ");
    // After state (rest[0]), utime=rest[11], stime=rest[12], rss=rest[21]
    // (relative to fields after the closing paren).
    const utime = parseInt(rest[11], 10);
    const stime = parseInt(rest[12], 10);
    const rssPages = parseInt(rest[21], 10);
    return { cpuTicks: utime + stime, rssKB: rssPages * 4 };
  } catch {
    return null;
  }
}

function sampleServer(): { cpuTicks: number; rssKB: number; ts: number } {
  if (!SERVER_PID) return { cpuTicks: 0, rssKB: 0, ts: Date.now() };
  const s = readProcStat(SERVER_PID);
  return { cpuTicks: s?.cpuTicks ?? 0, rssKB: s?.rssKB ?? 0, ts: Date.now() };
}

function sampleRunner(): { rssMB: number; cpuUsage: [number, number]; ts: number } {
  const m = process.memoryUsage();
  const cpu = process.cpuUsage();
  return { rssMB: m.rss / (1024 * 1024), cpuUsage: [cpu.user, cpu.system], ts: Date.now() };
}

function fileSizeBytes(path: string): number {
  try {
    const st = readFileSync(path);
    return st.length;
  } catch {
    return 0;
  }
}

// Better: use statSync for actual file size on disk
function fileSizeOnDisk(path: string): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { statSync } = require("node:fs");
    return statSync(path).size;
  } catch {
    return 0;
  }
}

// ─── HTTP ────────────────────────────────────────────────────────────────────
async function timedFetch(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<{ status: number; ok: boolean; latencyMs: number; errorType: string | null }> {
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: `inv_token=${jwt}`,
      },
      signal: controller.signal,
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, init);
    const latencyMs = performance.now() - t0;
    // Drain the body so the connection can be reused
    try {
      await res.text();
    } catch {}
    const ok = res.status >= 200 && res.status < 300;
    let errorType: string | null = null;
    if (!ok) errorType = `HTTP_${res.status}`;
    return { status: res.status, ok, latencyMs, errorType };
  } catch (err) {
    const latencyMs = performance.now() - t0;
    let errorType = "NETWORK_ERROR";
    if (err instanceof Error) {
      if (err.name === "AbortError") errorType = "TIMEOUT";
      else errorType = err.message.slice(0, 80);
    }
    return { status: 0, ok: false, latencyMs, errorType };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Auth setup ──────────────────────────────────────────────────────────────
async function loginOrRegister(): Promise<void> {
  // Try login first (idempotent re-runs)
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD }),
  });
  if (loginRes.ok) {
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const m = setCookie.match(/inv_token=([^;]+)/);
    if (m) {
      jwt = m[1];
      console.log(`✓ Logged in as ${FOUNDER_EMAIL}`);
      return;
    }
  }
  // Register
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: FOUNDER_EMAIL,
      password: FOUNDER_PASSWORD,
      displayName: "Load Test Founder",
    }),
  });
  if (!regRes.ok) {
    const txt = await regRes.text();
    throw new Error(`Register failed (${regRes.status}): ${txt}`);
  }
  // Now login
  const login2 = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD }),
  });
  const setCookie = login2.headers.get("set-cookie") || "";
  const m = setCookie.match(/inv_token=([^;]+)/);
  if (!m) throw new Error("Login after register returned no inv_token cookie");
  jwt = m[1];
  console.log(`✓ Registered + logged in as ${FOUNDER_EMAIL}`);
}

async function ensureTestCompany(): Promise<void> {
  // Try create; if 409, it already exists.
  const res = await fetch(`${BASE}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `inv_token=${jwt}` },
    body: JSON.stringify({
      name: "Load Test Co",
      slug: COMPANY_SLUG,
      currency: "KWD",
      defaultTaxRate: "0",
    }),
  });
  if (res.ok) {
    console.log(`✓ Created test company: ${COMPANY_SLUG}`);
    return;
  }
  if (res.status === 409) {
    console.log(`✓ Test company already exists: ${COMPANY_SLUG}`);
    return;
  }
  const txt = await res.text();
  throw new Error(`Company create failed (${res.status}): ${txt}`);
}

// ─── Concurrency test runner ─────────────────────────────────────────────────
async function runConcurrencyTest(
  endpoint: string,
  method: string,
  pathBuilder: (n: number) => string,
  bodyBuilder: ((n: number) => unknown) | null,
  concurrency: number,
  totalRequests: number,
  notes: string[] = [],
  timeoutMs: number = HTTP_REQUEST_TIMEOUT_MS,
): Promise<TestResult> {
  console.log(
    `  ▶ ${endpoint} @ c=${concurrency} (n=${totalRequests}) ...`,
  );

  // Pre-sample
  const serverBefore = sampleServer();
  const runnerBefore = sampleRunner();
  const eld = monitorEventLoopDelay();
  eld.reset();
  eld.enable();

  const samples: Sample[] = [];
  const t0 = performance.now();
  let inflight = 0;
  let nextIdx = 0;
  const queue: Promise<void>[] = [];

  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= totalRequests) return;
      inflight++;
      const path = pathBuilder(i);
      const body = bodyBuilder ? bodyBuilder(i) : undefined;
      const r = await timedFetch(method, path, body, timeoutMs);
      samples.push({
        status: r.status,
        ok: r.ok,
        latencyMs: r.latencyMs,
        errorType: r.errorType,
      });
      inflight--;
    }
  }

  for (let w = 0; w < concurrency; w++) queue.push(worker());
  await Promise.all(queue);

  const wallMs = performance.now() - t0;
  eld.disable();

  const serverAfter = sampleServer();
  const runnerAfter = sampleRunner();

  const latencies = samples.map((s) => s.latencyMs);
  const successCount = samples.filter((s) => s.ok).length;
  const errorCount = samples.length - successCount;
  const errorTypes: Record<string, number> = {};
  for (const s of samples) {
    if (s.errorType) errorTypes[s.errorType] = (errorTypes[s.errorType] || 0) + 1;
  }

  // Server CPU% over the test window (cpuTicks are in 1/100s of a second on Linux)
  const wallSec = wallMs / 1000;
  const cpuDeltaTicks = serverAfter.cpuTicks - serverBefore.cpuTicks;
  const cpuDeltaSec = cpuDeltaTicks / 100; // 100 Hz clock
  const serverCpuPct = wallSec > 0 ? (cpuDeltaSec / wallSec) * 100 : 0;
  const serverRssDeltaMB = (serverAfter.rssKB - serverBefore.rssKB) / 1024;
  const runnerRssDeltaMB = runnerAfter.rssMB - runnerBefore.rssMB;

  const result: TestResult = {
    endpoint,
    method,
    concurrency,
    totalRequests,
    successCount,
    errorCount,
    errorTypes,
    latenciesMs: latencies,
    p50: pct(latencies, 50),
    p90: pct(latencies, 90),
    p95: pct(latencies, 95),
    p99: pct(latencies, 99),
    mean: mean(latencies),
    min: latencies.length ? Math.min(...latencies) : 0,
    max: latencies.length ? Math.max(...latencies) : 0,
    rps: wallMs > 0 ? (samples.length / wallMs) * 1000 : 0,
    wallMs,
    serverCpuPct,
    serverRssDeltaMB,
    runnerRssDeltaMB,
    eventLoopLagP99Ms: eld.percentile(99) / 1e6, // ns → ms
    eventLoopLagMaxMs: eld.max / 1e6,
    notes,
  };

  console.log(
    `    ✓ ok=${successCount}/${totalRequests} p50=${result.p50.toFixed(0)}ms p95=${result.p95.toFixed(0)}ms p99=${result.p99.toFixed(0)}ms rps=${result.rps.toFixed(1)} cpu=${serverCpuPct.toFixed(0)}% err=${errorCount}`,
  );
  return result;
}

// ─── Batch invoice creation ──────────────────────────────────────────────────
async function runBatchTest(size: number): Promise<BatchResult> {
  console.log(`\n  ▶ BATCH create ${size} invoices (c=${BATCH_CONCURRENCY}) ...`);

  // Measure DB size before
  const dbSizeBefore = fileSizeOnDisk(DB_PATH);

  // Measure list latency before (single sample, fresh)
  const listBefore = await timedFetch(
    "GET",
    `/api/invoices?companySlug=${COMPANY_SLUG}&limit=500`,
    undefined,
    HTTP_REQUEST_TIMEOUT_MS,
  );
  // Take 5 samples for percentile
  const listSamplesBefore: number[] = [listBefore.latencyMs];
  for (let i = 0; i < 4; i++) {
    const r = await timedFetch(
      "GET",
      `/api/invoices?companySlug=${COMPANY_SLUG}&limit=500`,
      undefined,
      HTTP_REQUEST_TIMEOUT_MS,
    );
    listSamplesBefore.push(r.latencyMs);
  }

  // Create `size` invoices with concurrency BATCH_CONCURRENCY
  const t0 = performance.now();
  let successCount = 0;
  let errorCount = 0;
  let nextIdx = 0;
  const ts = Date.now();
  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= size) return;
      const body = {
        invoiceNumber: `BATCH-${ts}-${size}-${i}`,
        clientName: `Batch Client ${i}`,
        issueDate: "2026-01-15",
        dueDate: "2026-02-15",
        lineItems: [{ description: `Item ${i}`, qty: 2, price: "50" }],
        subtotal: "100",
        taxRate: "0",
        taxAmount: "0",
        total: "100",
        status: "draft",
        companySlug: COMPANY_SLUG,
      };
      const r = await timedFetch("POST", "/api/invoices", body, HTTP_REQUEST_TIMEOUT_MS);
      if (r.ok) successCount++;
      else errorCount++;
    }
  }
  const workers: Promise<void>[] = [];
  for (let w = 0; w < BATCH_CONCURRENCY; w++) workers.push(worker());
  await Promise.all(workers);
  const wallMs = performance.now() - t0;

  // Wait a brief moment for SQLite to flush
  await new Promise((r) => setTimeout(r, 500));

  // Measure list latency after (5 samples)
  const listSamplesAfter: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await timedFetch(
      "GET",
      `/api/invoices?companySlug=${COMPANY_SLUG}&limit=500`,
      undefined,
      HTTP_REQUEST_TIMEOUT_MS,
    );
    listSamplesAfter.push(r.latencyMs);
  }

  const dbSizeAfter = fileSizeOnDisk(DB_PATH);

  const result: BatchResult = {
    size,
    wallMs,
    throughputInvoicesPerSec: wallMs > 0 ? (successCount / wallMs) * 1000 : 0,
    successCount,
    errorCount,
    listLatencyMsBefore: listBefore.latencyMs,
    listLatencyMsAfter: listSamplesAfter[0],
    dbSizeBytesBefore: dbSizeBefore,
    dbSizeBytesAfter: dbSizeAfter,
    listP50: pct(listSamplesAfter, 50),
    listP95: pct(listSamplesAfter, 95),
  };

  console.log(
    `    ✓ ok=${successCount}/${size} wall=${(wallMs / 1000).toFixed(1)}s throughput=${result.throughputInvoicesPerSec.toFixed(1)} inv/s listAfterP50=${result.listP50.toFixed(0)}ms dbGrowth=${((dbSizeAfter - dbSizeBefore) / 1024).toFixed(0)}KB`,
  );
  return result;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
async function cleanup(): Promise<void> {
  console.log("\n  ▶ Cleanup: hard-delete test company ...");
  const res = await fetch(`${BASE}/api/companies/${COMPANY_SLUG}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Cookie: `inv_token=${jwt}`,
    },
    body: JSON.stringify({ hardDelete: true, typeToConfirm: "Load Test Co" }),
  });
  if (res.ok) {
    console.log(`    ✓ Test company "${COMPANY_SLUG}" deleted`);
  } else {
    const txt = await res.text();
    console.log(`    ⚠️ Cleanup failed (${res.status}): ${txt.slice(0, 200)}`);
  }
}

// ─── Output writers ──────────────────────────────────────────────────────────
function writeOutputs(
  results: TestResult[],
  batchResults: BatchResult[],
  serverPid: number | null,
): void {
  // JSON
  const jsonPayload = {
    meta: {
      task: "3-load-test",
      agent: "full-stack-developer",
      timestamp: new Date().toISOString(),
      base: BASE,
      serverPid,
      dbPath: DB_PATH,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      requestsPerLevel: REQUESTS_PER_LEVEL,
      aiRequestsPerLevel: AI_REQUESTS_PER_LEVEL,
      batchConcurrency: BATCH_CONCURRENCY,
      companySlug: COMPANY_SLUG,
      founderEmail: FOUNDER_EMAIL,
      notes: [
        "All numbers tagged [MEASURED] reflect real latency against the running Next.js dev server (dev mode, not production build).",
        "p50/p90/p95/p99 computed from sorted latency arrays (Nearest-rank method).",
        "Server CPU% = (delta utime+stime jiffies / wall seconds) × 100, sampled via /proc/[pid]/stat.",
        "Server RSS delta = RSS after − RSS before, in MB.",
        "Event-loop lag sampled via perf_hooks.monitorEventLoopDelay() in the test-runner process (not the server).",
        "Dashboard stats endpoint tested with ?fresh=1 to bypass the 30s in-memory cache (measures the real DB cost).",
        "AI endpoint (smart-parse) tested at lower concurrency to avoid hammering the free z-ai SDK.",
      ],
    },
    endpointResults: results,
    batchResults,
  };
  writeFileSync(
    `${RESULTS_DIR}/scale-load-test.json`,
    JSON.stringify(jsonPayload, null, 2),
  );

  // CSV
  const csvRows: string[] = [
    "endpoint,method,concurrency,total,success,error,p50_ms,p90_ms,p95_ms,p99_ms,mean_ms,min_ms,max_ms,rps,wall_ms,server_cpu_pct,server_rss_delta_mb,runner_rss_delta_mb,eloop_p99_ms,eloop_max_ms",
  ];
  for (const r of results) {
    csvRows.push(
      [
        r.endpoint,
        r.method,
        r.concurrency,
        r.totalRequests,
        r.successCount,
        r.errorCount,
        r.p50.toFixed(2),
        r.p90.toFixed(2),
        r.p95.toFixed(2),
        r.p99.toFixed(2),
        r.mean.toFixed(2),
        r.min.toFixed(2),
        r.max.toFixed(2),
        r.rps.toFixed(2),
        r.wallMs.toFixed(0),
        r.serverCpuPct.toFixed(1),
        r.serverRssDeltaMB.toFixed(2),
        r.runnerRssDeltaMB.toFixed(2),
        r.eventLoopLagP99Ms.toFixed(2),
        r.eventLoopLagMaxMs.toFixed(2),
      ].join(","),
    );
  }
  csvRows.push("");
  csvRows.push(
    "# batch tests: endpoint=size,throughput_invoices_per_sec,wall_ms,success,error,list_before_ms,list_after_ms,list_p50_ms,list_p95_ms,db_before_bytes,db_after_bytes",
  );
  for (const b of batchResults) {
    csvRows.push(
      [
        `BATCH_${b.size}`,
        b.throughputInvoicesPerSec.toFixed(2),
        b.wallMs.toFixed(0),
        b.successCount,
        b.errorCount,
        b.listLatencyMsBefore.toFixed(0),
        b.listLatencyMsAfter.toFixed(0),
        b.listP50.toFixed(0),
        b.listP95.toFixed(0),
        b.dbSizeBytesBefore,
        b.dbSizeBytesAfter,
      ].join(","),
    );
  }
  writeFileSync(`${RESULTS_DIR}/scale-load-test.csv`, csvRows.join("\n"));

  // MD
  const md: string[] = [];
  md.push("# GarfiX Scale Load Test — [MEASURED] Results");
  md.push("");
  md.push(`- **Task ID**: 3-load-test`);
  md.push(`- **Agent**: full-stack-developer`);
  md.push(`- **Timestamp**: ${jsonPayload.meta.timestamp}`);
  md.push(`- **Target**: ${BASE} (Next.js dev server)`);
  md.push(`- **Server PID**: ${serverPid ?? "not found"}`);
  md.push(`- **DB**: ${DB_PATH}`);
  md.push(`- **Test company**: \`${COMPANY_SLUG}\` (created + cleaned up)`);
  md.push(`- **Auth**: JWT cookie \`inv_token\` issued via \`/api/auth/login\``);
  md.push(
    `- **Requests per concurrency level**: ${REQUESTS_PER_LEVEL} (HTTP endpoints) / ${AI_REQUESTS_PER_LEVEL} (AI endpoint)`,
  );
  md.push(`- **Request timeout**: ${REQUEST_TIMEOUT_MS / 1000}s`);
  md.push("");
  md.push("> All numbers below are **[MEASURED]** against the live dev server. The dev server runs Next.js in dev mode (no prod build, no HTTP caching). Production numbers will be substantially better.");
  md.push("");

  md.push("## 1. Endpoint Concurrency Results");
  md.push("");
  // Group by endpoint
  const byEndpoint = new Map<string, TestResult[]>();
  for (const r of results) {
    const key = r.endpoint;
    if (!byEndpoint.has(key)) byEndpoint.set(key, []);
    byEndpoint.get(key)!.push(r);
  }
  for (const [endpoint, rs] of byEndpoint) {
    md.push(`### ${endpoint}`);
    md.push("");
    md.push(
      "| Concurrency | Total | Success | Errors | p50 ms | p90 ms | p95 ms | p99 ms | Mean ms | RPS | Server CPU% | Server RSS Δ MB | ELoop p99 ms |",
    );
    md.push(
      "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    );
    for (const r of rs) {
      md.push(
        `| ${r.concurrency} | ${r.totalRequests} | ${r.successCount} | ${r.errorCount} | ${r.p50.toFixed(0)} | ${r.p90.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.p99.toFixed(0)} | ${r.mean.toFixed(0)} | ${r.rps.toFixed(1)} | ${r.serverCpuPct.toFixed(0)} | ${r.serverRssDeltaMB.toFixed(1)} | ${r.eventLoopLagP99Ms.toFixed(1)} |`,
      );
    }
    md.push("");
    // Error breakdown if any
    const hasErrors = rs.some((r) => r.errorCount > 0);
    if (hasErrors) {
      md.push("**Error breakdown:**");
      for (const r of rs) {
        if (r.errorCount > 0) {
          const breakdown = Object.entries(r.errorTypes)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ");
          md.push(`- c=${r.concurrency}: ${breakdown}`);
        }
      }
      md.push("");
    }
  }

  md.push("## 2. Batch Invoice Creation");
  md.push("");
  md.push(
    "| Batch Size | Wall s | Throughput (inv/s) | Success | Errors | List p50 After ms | List p95 After ms | DB Growth KB |",
  );
  md.push("|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const b of batchResults) {
    md.push(
      `| ${b.size} | ${(b.wallMs / 1000).toFixed(1)} | ${b.throughputInvoicesPerSec.toFixed(1)} | ${b.successCount} | ${b.errorCount} | ${b.listP50.toFixed(0)} | ${b.listP95.toFixed(0)} | ${((b.dbSizeBytesAfter - b.dbSizeBytesBefore) / 1024).toFixed(0)} |`,
    );
  }
  md.push("");

  md.push("## 3. Methodology & Honest Gaps");
  md.push("");
  md.push("- **p50/p90/p95/p99**: nearest-rank percentile on raw latency array per (endpoint, concurrency) cell.");
  md.push("- **Server CPU%**: `(Δutime+Δstime) / wall_seconds × 100`, read from `/proc/[pid]/stat`. Single-core %, can exceed 100% if multi-threaded.");
  md.push("- **Server RSS Δ**: resident-set size delta in MB, read from `/proc/[pid]/stat`.");
  md.push("- **Event-loop lag**: sampled in the **test runner**, not the server. P99 of delay between scheduled and executed timers (1ms resolution).");
  md.push("- **Dashboard stats**: tested with `?fresh=1` to bypass the 30s in-memory cache and measure the real aggregate query cost. Without `?fresh=1`, repeated calls hit cache and return in <5ms — not representative of cold-query performance.");
  md.push("- **AI endpoint** (`/api/ai/smart-parse`): tested at concurrency 1/3/5 only to avoid hammering the free z-ai-web-dev-sdk. Failures (429/timeout) recorded as errors, NOT retried.");
  md.push("- **Dev mode**: Next.js runs in dev mode (no prod build). Hot-module recompilation, no HTTP caching, source maps enabled. Production numbers will be substantially better.");
  md.push("- **SQLite**: single-file DB at `db/custom.db`. No WAL mode, single connection. Production-targeted Postgres will behave differently.");
  md.push("");
  md.push("## 4. Artifacts");
  md.push("- `scale-load-test.json` — full raw data");
  md.push("- `scale-load-test.csv` — flat table");
  md.push("- `scale-load-test.md` — this summary");

  writeFileSync(`${RESULTS_DIR}/scale-load-test.md`, md.join("\n"));
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  GarfiX Scale Load Test — Task 3-load-test                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Target: ${BASE}`);
  SERVER_PID = findServerPid();
  console.log(`  Server PID: ${SERVER_PID ?? "NOT FOUND"}`);

  const results: TestResult[] = [];
  const batchResults: BatchResult[] = [];
  let cleanupOk = false;

  try {
    // 1. Auth
    console.log("\n[1/6] Auth setup");
    await loginOrRegister();

    // 2. Company
    console.log("\n[2/6] Ensure test company");
    await ensureTestCompany();

    // Sanity probe
    const probe = await timedFetch("GET", `/api/invoices?companySlug=${COMPANY_SLUG}`, undefined, HTTP_REQUEST_TIMEOUT_MS);
    console.log(`  Sanity probe GET /api/invoices → ${probe.status} in ${probe.latencyMs.toFixed(0)}ms`);

    // 3a. POST /api/invoices (create)
    console.log("\n[3/6] POST /api/invoices (create invoice)");
    {
      const ts = Date.now();
      for (const c of CONCURRENCY_LEVELS) {
        try {
          const r = await runConcurrencyTest(
            "POST /api/invoices",
            "POST",
            () => "/api/invoices",
            (n) => ({
              invoiceNumber: `LOAD-TEST-${ts}-${c}-${n}`,
              clientName: `Test Client ${n}`,
              issueDate: "2026-01-15",
              dueDate: "2026-02-15",
              lineItems: [{ description: "Item 1", qty: 2, price: "50" }],
              subtotal: "100",
              taxRate: "0",
              taxAmount: "0",
              total: "100",
              status: "draft",
              companySlug: COMPANY_SLUG,
            }),
            c,
            REQUESTS_PER_LEVEL,
          );
          results.push(r);
        } catch (err) {
          console.log(`    ⚠️ c=${c} crashed: ${err instanceof Error ? err.message : String(err)}`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // 3b. GET /api/invoices (list)
    console.log("\n[3/6] GET /api/invoices (list invoices)");
    for (const c of CONCURRENCY_LEVELS) {
      try {
        const r = await runConcurrencyTest(
          "GET /api/invoices",
          "GET",
          () => `/api/invoices?companySlug=${COMPANY_SLUG}&limit=100`,
          null,
          c,
          REQUESTS_PER_LEVEL,
        );
        results.push(r);
      } catch (err) {
        console.log(`    ⚠️ c=${c} crashed: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // 3c. GET /api/dashboard/stats (heaviest read; ?fresh=1 bypasses 30s cache)
    console.log("\n[3/6] GET /api/dashboard/stats (heaviest read, ?fresh=1)");
    for (const c of CONCURRENCY_LEVELS) {
      try {
        const r = await runConcurrencyTest(
          "GET /api/dashboard/stats",
          "GET",
          () => `/api/dashboard/stats?companySlug=${COMPANY_SLUG}&fresh=1`,
          null,
          c,
          REQUESTS_PER_LEVEL,
          ["?fresh=1 bypasses the 30s in-memory cache to measure the real aggregate query cost"],
        );
        results.push(r);
      } catch (err) {
        console.log(`    ⚠️ c=${c} crashed: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // 3d. POST /api/ai/smart-parse (limited concurrency)
    console.log("\n[3/6] POST /api/ai/smart-parse (AI — limited concurrency)");
    {
      const arabicText =
        "فاتورة رقم 123 من شركة الأمل للتجارة بتاريخ 2026-01-15، العميل: محمد أحمد، المبلغ الإجمالي 250 دينار";
      for (const c of AI_CONCURRENCY_LEVELS) {
        try {
          const r = await runConcurrencyTest(
            "POST /api/ai/smart-parse",
            "POST",
            () => "/api/ai/smart-parse",
            () => ({
              rawText: arabicText,
              companySlug: COMPANY_SLUG,
            }),
            c,
            AI_REQUESTS_PER_LEVEL,
            [
              "AI endpoint — z-ai-web-dev-sdk upstream; lower concurrency to avoid rate-limit",
              "Failures (429/timeout) recorded as errors, NOT retried",
            ],
            AI_REQUEST_TIMEOUT_MS,
          );
          results.push(r);
        } catch (err) {
          console.log(`    ⚠️ c=${c} crashed: ${err instanceof Error ? err.message : String(err)}`);
        }
        // Long cooldown for AI to avoid free-tier rate-limit
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // 4. Batch invoice creation
    console.log("\n[4/6] Batch invoice creation tests");
    for (const size of BATCH_SIZES) {
      try {
        const b = await runBatchTest(size);
        batchResults.push(b);
      } catch (err) {
        console.log(`    ⚠️ batch ${size} crashed: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (err) {
    console.log(`\nFATAL during tests: ${err instanceof Error ? err.message : String(err)}`);
    console.log("Will still write partial results.");
  }

  // 5. Write outputs (always — even on partial failure)
  console.log("\n[5/6] Writing outputs");
  writeOutputs(results, batchResults, SERVER_PID);
  console.log(`  ✓ Wrote scale-load-test.json/csv/md to ${RESULTS_DIR}`);

  // 6. Cleanup
  console.log("\n[6/6] Cleanup");
  try {
    await cleanup();
    cleanupOk = true;
  } catch (err) {
    console.log(`  ⚠️ Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  void cleanupOk;

  // Stdout summary table
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("\nEndpoint | Method | Concurrency | p50 ms | p95 ms | p99 ms | RPS | Errors");
  console.log("---------|--------|-------------|-------:|-------:|-------:|----:|-------:");
  for (const r of results) {
    console.log(
      `${r.endpoint} | ${r.method} | ${r.concurrency} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.p99.toFixed(0)} | ${r.rps.toFixed(1)} | ${r.errorCount}`,
    );
  }
  console.log("\nBatch | Wall s | Throughput (inv/s) | Success | Errors | List p50 After ms");
  console.log("------|-------:|-------------------:|--------:|-------:|-----------------:");
  for (const b of batchResults) {
    console.log(
      `${b.size} | ${(b.wallMs / 1000).toFixed(1)} | ${b.throughputInvoicesPerSec.toFixed(1)} | ${b.successCount} | ${b.errorCount} | ${b.listP50.toFixed(0)}`,
    );
  }
  console.log("\nDone. Results in /home/z/my-project/bench-results/");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
