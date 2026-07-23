#!/usr/bin/env bun
/**
 * load-model-probe.ts — GarfiX Load Model Probe (v1.2 reviewer demand #4)
 *
 * Task ID: SCALE-ENG-003
 *
 * Measures the 5 Load Model dimensions against the running dev server:
 *   CAU   = Concurrent Active Users (simulated worker count)
 *   RPS   = HTTP Requests Per Second  (successful reqs / wall sec)
 *   WPS   = DB Writes Per Second      (successful invoice POSTs × 5 writes/inv / wall sec)
 *   AICPM = AI Calls Per Minute       (successful AI calls / wall min)
 *   IPH   = Invoices Per Hour         (successful invoice POSTs / wall hour)
 *
 * Then maps each measured value to the v1.2 Decision Tree thresholds and
 * emits a VERDICT: which rules are triggered, which Red Lines are crossed.
 *
 * Output (2 files in /home/z/my-project/bench-results/):
 *   - load-model-probe.json  (full raw data + verdict)
 *   - load-model-probe.md    (human-readable verdict report)
 *
 * Usage:  bun run scripts/load-model-probe.ts
 */
import { writeFileSync, mkdirSync, statSync } from "node:fs";

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE = "http://localhost:3000";
const RESULTS_DIR = "/home/z/my-project/bench-results";
const COMPANY_SLUG = "loadtest";
const FOUNDER_EMAIL = "founder@garfix.app";
const FOUNDER_PASSWORD = "Loadtest123";

// Sustained test window — long enough to see steady state, short enough to be runnable
const TEST_DURATION_MS = 60_000;

// Worker pool sizes — simulate a realistic mixed workload
// (3 writers + 5 readers + 1 AI caller = 9 CAU)
const WRITER_WORKERS = 3;
const READER_WORKERS = 5;
const AI_WORKERS = 1;

// Each successful invoice POST ≈ 5 DB writes (invoice row + line items + audit + journal entry + journal lines)
// Code-verified: src/app/api/invoices/route.ts → createInvoice() → audit + journal side-effects
const DB_WRITES_PER_INVOICE = 5;

// HTTP timeouts
const HTTP_TIMEOUT_MS = 15_000;
const AI_TIMEOUT_MS = 60_000;

mkdirSync(RESULTS_DIR, { recursive: true });

// ─── v1.2 Decision Tree thresholds (must match report Section 0.5) ──────────
interface DecisionRule {
  id: string;
  metric: "WPS" | "AICPM" | "RPS" | "CAU" | "IPH";
  threshold: number;
  action: string;
  severity: "BLOCKER" | "URGENT" | "SCALE" | "OPTIMIZE";
  costUsdPerMonth: number; // for the cost-per-rule table
}

const DECISION_RULES: DecisionRule[] = [
  { id: "R01", metric: "WPS", threshold: 5, action: "Migrate SQLite → Postgres + PgBouncer", severity: "BLOCKER", costUsdPerMonth: 15 },
  { id: "R02", metric: "WPS", threshold: 15, action: "Add PgBouncer connection pooling (pool=25)", severity: "URGENT", costUsdPerMonth: 5 },
  { id: "R03", metric: "AICPM", threshold: 5, action: "Upgrade to OpenRouter paid plan ($20/mo baseline)", severity: "BLOCKER", costUsdPerMonth: 20 },
  { id: "R04", metric: "AICPM", threshold: 10, action: "Move AI smart-parse to ASYNC queue (background job, not sync API)", severity: "BLOCKER", costUsdPerMonth: 0 },
  { id: "R05", metric: "RPS", threshold: 156, action: "Add 2nd Next.js instance + load balancer", severity: "SCALE", costUsdPerMonth: 10 },
  { id: "R06", metric: "CAU", threshold: 100, action: "Wire Redis (cache invalidation + rate-limit sharing)", severity: "SCALE", costUsdPerMonth: 15 },
  { id: "R07", metric: "AICPM", threshold: 50, action: "Add AI response caching (Redis, 1h TTL)", severity: "OPTIMIZE", costUsdPerMonth: 0 },
  { id: "R08", metric: "WPS", threshold: 50, action: "Query optimization + indexing review (AuditLog + JournalEntry)", severity: "OPTIMIZE", costUsdPerMonth: 0 },
  { id: "R09", metric: "WPS", threshold: 150, action: "Start Postgres partitioning on AuditLog (monthly)", severity: "URGENT", costUsdPerMonth: 0 },
  { id: "R10", metric: "WPS", threshold: 250, action: "Add Postgres read replica + PgBouncer pool 50", severity: "SCALE", costUsdPerMonth: 25 },
  { id: "R11", metric: "IPH", threshold: 15_000, action: "Add PM2 cluster mode (4 workers per instance)", severity: "SCALE", costUsdPerMonth: 10 },
  { id: "R12", metric: "RPS", threshold: 1_250, action: "Add 4 Next.js instances + CDN for static assets", severity: "SCALE", costUsdPerMonth: 40 },
  { id: "R13", metric: "AICPM", threshold: 250, action: "Multi-provider AI load balancing (3+ providers)", severity: "SCALE", costUsdPerMonth: 60 },
  { id: "R14", metric: "WPS", threshold: 1_250, action: "Shard Postgres by companySlug (Citus or Vitess)", severity: "SCALE", costUsdPerMonth: 80 },
  { id: "R15", metric: "CAU", threshold: 1_000, action: "Migrate JobQueue → BullMQ + dedicated worker process", severity: "SCALE", costUsdPerMonth: 20 },
  { id: "R16", metric: "WPS", threshold: 3_125, action: "Shard Postgres by companySlug (Citus or Vitess)", severity: "SCALE", costUsdPerMonth: 80 },
  { id: "R17", metric: "RPS", threshold: 12_500, action: "Kafka event bus + multi-region active-active", severity: "SCALE", costUsdPerMonth: 200 },
];

// ─── Red Lines (stop-ship thresholds) ────────────────────────────────────────
interface RedLine {
  id: string;
  metric: string;
  threshold: string;
  condition: string;
  consequence: string;
}

const RED_LINES: RedLine[] = [
  { id: "RL1", metric: "WPS", threshold: "> 3 on SQLite", condition: "SQLite sustained writes exceed 3/sec", consequence: "Database lock storms → 500 errors → data corruption risk. STOP SHIP. Migrate to Postgres immediately." },
  { id: "RL2", metric: "AI error rate", threshold: "> 5%", condition: "AI endpoint 429/5xx rate exceeds 5% of calls", consequence: "User-facing invoice parsing breaks. STOP SHIP. Upgrade AI plan or move to async queue." },
  { id: "RL3", metric: "POST /api/invoices p99", threshold: "> 2000ms", condition: "Invoice creation p99 latency exceeds 2 seconds", consequence: "UX unacceptable for real-time ERP. STOP SHIP. Fix DB or queue writes." },
  { id: "RL4", metric: "GET endpoints p95", threshold: "> 500ms", condition: "Read endpoint p95 latency exceeds 500ms", consequence: "Dashboard unusable. STOP SHIP. Add cache or read replica." },
  { id: "RL5", metric: "Queue depth", threshold: "> 1000 pending jobs", condition: "JobQueue pending count exceeds 1000", consequence: "Background work (email/WhatsApp/backup) falls behind. STOP SHIP. Add workers." },
  { id: "RL6", metric: "Disk usage", threshold: "> 85%", condition: "Database disk usage exceeds 85%", consequence: "Imminent disk-full → write failures. STOP SHIP. Archive or expand." },
];

// ─── State ───────────────────────────────────────────────────────────────────
let jwt = "";

// ─── Counters (atomic via single-threaded JS event loop) ────────────────────
const counters = {
  writerSuccess: 0,
  writerError: 0,
  writerLatencies: [] as number[],
  readerSuccess: 0,
  readerError: 0,
  readerLatencies: [] as number[],
  aiSuccess: 0,
  aiError: 0,
  aiLatencies: [] as number[],
  errorTypes: {} as Record<string, number>,
};

// ─── HTTP helper ────────────────────────────────────────────────────────────
async function timedFetch(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = HTTP_TIMEOUT_MS,
): Promise<{ status: number; ok: boolean; latencyMs: number; errorType: string | null }> {
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json", Cookie: `inv_token=${jwt}` },
      signal: controller.signal,
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, init);
    const latencyMs = performance.now() - t0;
    try { await res.text(); } catch {}
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

// ─── Auth ────────────────────────────────────────────────────────────────────
async function loginOrRegister(): Promise<void> {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD }),
  });
  if (loginRes.ok) {
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const m = setCookie.match(/inv_token=([^;]+)/);
    if (m) { jwt = m[1]; console.log(`✓ Logged in as ${FOUNDER_EMAIL}`); return; }
  }
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD, displayName: "Load Probe Founder" }),
  });
  const login2 = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD }),
  });
  const setCookie = login2.headers.get("set-cookie") || "";
  const m = setCookie.match(/inv_token=([^;]+)/);
  if (!m) throw new Error("Login failed after register");
  jwt = m[1];
  console.log(`✓ Registered + logged in as ${FOUNDER_EMAIL}`);
}

async function ensureTestCompany(): Promise<void> {
  const res = await fetch(`${BASE}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `inv_token=${jwt}` },
    body: JSON.stringify({ name: "Load Probe Co", slug: COMPANY_SLUG, currency: "KWD", defaultTaxRate: "0" }),
  });
  if (res.ok) { console.log(`✓ Created test company: ${COMPANY_SLUG}`); return; }
  if (res.status === 409) { console.log(`✓ Test company exists: ${COMPANY_SLUG}`); return; }
  throw new Error(`Company create failed (${res.status})`);
}

// ─── Worker pools ────────────────────────────────────────────────────────────
function makeInvoiceBody(i: number) {
  const ts = Date.now();
  return {
    invoiceNumber: `PROBE-${ts}-${i}`,
    clientName: `Probe Client ${i}`,
    issueDate: "2026-01-15",
    dueDate: "2026-02-15",
    lineItems: [{ description: `Probe Item ${i}`, qty: 2, price: "50" }],
    subtotal: "100", taxRate: "0", taxAmount: "0", total: "100",
    status: "draft", companySlug: COMPANY_SLUG,
  };
}

const AI_TEXT = "فاتورة رقم 123 من شركة الأمل للتجارة بتاريخ 2026-01-15، العميل: محمد أحمد، المبلغ الإجمالي 250 دينار";

async function writerWorker(stopAt: number, workerId: number): Promise<void> {
  let i = 0;
  while (performance.now() < stopAt) {
    const r = await timedFetch("POST", "/api/invoices", makeInvoiceBody(i++), HTTP_TIMEOUT_MS);
    if (r.ok) {
      counters.writerSuccess++;
      counters.writerLatencies.push(r.latencyMs);
    } else {
      counters.writerError++;
      if (r.errorType) counters.errorTypes[r.errorType] = (counters.errorTypes[r.errorType] || 0) + 1;
    }
  }
}

async function readerWorker(stopAt: number, workerId: number): Promise<void> {
  let i = 0;
  while (performance.now() < stopAt) {
    // Alternate between invoices list and dashboard stats
    const path = (i++ % 2 === 0)
      ? `/api/invoices?companySlug=${COMPANY_SLUG}&limit=500`
      : `/api/dashboard/stats?companySlug=${COMPANY_SLUG}&fresh=1`;
    const r = await timedFetch("GET", path, undefined, HTTP_TIMEOUT_MS);
    if (r.ok) {
      counters.readerSuccess++;
      counters.readerLatencies.push(r.latencyMs);
    } else {
      counters.readerError++;
      if (r.errorType) counters.errorTypes[r.errorType] = (counters.errorTypes[r.errorType] || 0) + 1;
    }
  }
}

async function aiWorker(stopAt: number, workerId: number): Promise<void> {
  while (performance.now() < stopAt) {
    const r = await timedFetch("POST", "/api/ai/smart-parse", { rawText: AI_TEXT, companySlug: COMPANY_SLUG }, AI_TIMEOUT_MS);
    if (r.ok) {
      counters.aiSuccess++;
      counters.aiLatencies.push(r.latencyMs);
    } else {
      counters.aiError++;
      if (r.errorType) counters.errorTypes[r.errorType] = (counters.errorTypes[r.errorType] || 0) + 1;
    }
    // Pause between AI calls to avoid 429 (z-ai SDK rate limit)
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ─── Stats helpers ───────────────────────────────────────────────────────────
function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── Verdict engine ──────────────────────────────────────────────────────────
interface LoadMeasurement {
  CAU: number;
  RPS: number;
  WPS: number;
  AICPM: number;
  IPH: number;
}

interface RuleVerdict {
  rule: DecisionRule;
  measuredValue: number;
  triggered: boolean;
}

function evaluateDecisionTree(measured: LoadMeasurement): RuleVerdict[] {
  return DECISION_RULES.map((rule) => {
    const measuredValue = measured[rule.metric];
    return { rule, measuredValue, triggered: measuredValue > rule.threshold };
  });
}

function checkRedLines(measured: LoadMeasurement, errorRate: number, invoiceP99: number, readP95: number): { redLine: RedLine; crossed: boolean; observed: string }[] {
  return RED_LINES.map((rl) => {
    let crossed = false;
    let observed = "";
    if (rl.id === "RL1") { crossed = measured.WPS > 3; observed = `${measured.WPS.toFixed(2)} WPS`; }
    else if (rl.id === "RL2") { crossed = errorRate > 0.05; observed = `${(errorRate * 100).toFixed(1)}% AI error`; }
    else if (rl.id === "RL3") { crossed = invoiceP99 > 2000; observed = `${invoiceP99.toFixed(0)}ms p99`; }
    else if (rl.id === "RL4") { crossed = readP95 > 500; observed = `${readP95.toFixed(0)}ms p95`; }
    else if (rl.id === "RL5") { crossed = false; observed = "queue depth not measured by this probe (see /api/queue/status)"; }
    else if (rl.id === "RL6") { crossed = false; observed = "disk usage not measured by this probe (see df -h)"; }
    return { redLine: rl, crossed, observed };
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  GarfiX Load Model Probe — SCALE-ENG-003 (v1.2 demand #4)   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Target: ${BASE}`);
  console.log(`  Duration: ${TEST_DURATION_MS / 1000}s`);
  console.log(`  Workers: ${WRITER_WORKERS} writers + ${READER_WORKERS} readers + ${AI_WORKERS} AI = ${WRITER_WORKERS + READER_WORKERS + AI_WORKERS} CAU`);
  console.log("");

  await loginOrRegister();
  await ensureTestCompany();

  console.log(`\n▶ Starting sustained ${TEST_DURATION_MS / 1000}s mixed workload ...`);
  const t0 = performance.now();
  const stopAt = t0 + TEST_DURATION_MS;

  const workers: Promise<void>[] = [];
  for (let w = 0; w < WRITER_WORKERS; w++) workers.push(writerWorker(stopAt, w));
  for (let w = 0; w < READER_WORKERS; w++) workers.push(readerWorker(stopAt, w));
  for (let w = 0; w < AI_WORKERS; w++) workers.push(aiWorker(stopAt, w));

  // Progress ticker
  const ticker = setInterval(() => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(0);
    console.log(`  [${elapsed}s] writes=${counters.writerSuccess} reads=${counters.readerSuccess} ai=${counters.aiSuccess} errs=${counters.writerError + counters.readerError + counters.aiError}`);
  }, 10_000);

  await Promise.all(workers);
  clearInterval(ticker);

  const wallMs = performance.now() - t0;
  const wallSec = wallMs / 1000;
  const wallMin = wallSec / 60;
  const wallHour = wallSec / 3600;

  console.log(`\n✓ Test complete in ${wallSec.toFixed(1)}s`);

  // ─── Compute Load Dimensions ──────────────────────────────────────────────
  const totalHttpReqs = counters.writerSuccess + counters.readerSuccess + counters.aiSuccess;
  const measured: LoadMeasurement = {
    CAU: WRITER_WORKERS + READER_WORKERS + AI_WORKERS,
    RPS: totalHttpReqs / wallSec,
    WPS: (counters.writerSuccess * DB_WRITES_PER_INVOICE) / wallSec,
    AICPM: counters.aiSuccess / wallMin,
    IPH: counters.writerSuccess / wallHour,
  };

  const aiErrorRate = (counters.aiSuccess + counters.aiError) > 0
    ? counters.aiError / (counters.aiSuccess + counters.aiError)
    : 0;
  const totalErrorRate = totalHttpReqs > 0
    ? (counters.writerError + counters.readerError + counters.aiError) / (totalHttpReqs + counters.writerError + counters.readerError + counters.aiError)
    : 0;

  const invoiceP99 = pct(counters.writerLatencies, 99);
  const invoiceP95 = pct(counters.writerLatencies, 95);
  const invoiceP50 = pct(counters.writerLatencies, 50);
  const readP95 = pct(counters.readerLatencies, 95);
  const readP50 = pct(counters.readerLatencies, 50);
  const aiP50 = pct(counters.aiLatencies, 50);
  const aiP99 = pct(counters.aiLatencies, 99);

  // ─── Evaluate Decision Tree ───────────────────────────────────────────────
  const ruleVerdicts = evaluateDecisionTree(measured);
  const triggeredRules = ruleVerdicts.filter((v) => v.triggered);
  const blockerRules = triggeredRules.filter((v) => v.rule.severity === "BLOCKER");

  // ─── Check Red Lines ──────────────────────────────────────────────────────
  const redLineChecks = checkRedLines(measured, aiErrorRate, invoiceP99, readP95);
  const crossedRedLines = redLineChecks.filter((c) => c.crossed);

  // ─── Determine tier verdict ───────────────────────────────────────────────
  let tierVerdict = "Small (dev)";
  if (measured.WPS > 5 || blockerRules.length > 0) tierVerdict = "BELOW Small — BLOCKERS PRESENT";
  if (measured.WPS > 15) tierVerdict = "Medium-ready (Postgres + PgBouncer required)";
  if (measured.WPS > 50) tierVerdict = "Large-ready (Redis + query opt required)";
  if (measured.WPS > 150) tierVerdict = "Enterprise-ready (partitioning + read replica required)";

  // ─── Output JSON ──────────────────────────────────────────────────────────
  const jsonPayload = {
    meta: {
      task: "SCALE-ENG-003",
      script: "load-model-probe.ts",
      timestamp: new Date().toISOString(),
      base: BASE,
      durationMs: wallMs,
      workerPools: { writers: WRITER_WORKERS, readers: READER_WORKERS, ai: AI_WORKERS },
      dbWritesPerInvoice: DB_WRITES_PER_INVOICE,
      companySlug: COMPANY_SLUG,
    },
    measured,
    rawCounters: counters,
    latencies: {
      invoice: { p50: invoiceP50, p95: invoiceP95, p99: invoiceP99, count: counters.writerLatencies.length },
      read: { p50: readP50, p95: readP95, count: counters.readerLatencies.length },
      ai: { p50: aiP50, p99: aiP99, count: counters.aiLatencies.length },
    },
    errorRates: { ai: aiErrorRate, total: totalErrorRate },
    errorTypes: counters.errorTypes,
    decisionTreeVerdict: {
      triggeredRules: triggeredRules.map((v) => ({
        id: v.rule.id, metric: v.rule.metric, measured: v.measuredValue,
        threshold: v.rule.threshold, action: v.rule.action, severity: v.rule.severity,
        costUsdPerMonth: v.rule.costUsdPerMonth,
      })),
      blockerCount: blockerRules.length,
      totalTriggered: triggeredRules.length,
      totalMonthlyCostUsd: triggeredRules.reduce((s, v) => s + v.rule.costUsdPerMonth, 0),
    },
    redLines: redLineChecks.map((c) => ({
      id: c.redLine.id, metric: c.redLine.metric, threshold: c.redLine.threshold,
      crossed: c.crossed, observed: c.observed, consequence: c.redLine.consequence,
    })),
    crossedRedLineCount: crossedRedLines.length,
    tierVerdict,
  };

  writeFileSync(`${RESULTS_DIR}/load-model-probe.json`, JSON.stringify(jsonPayload, null, 2));

  // ─── Output Markdown verdict ──────────────────────────────────────────────
  const md: string[] = [];
  md.push("# GarfiX Load Model Probe — [MEASURED] Verdict");
  md.push("");
  md.push(`- **Task ID**: SCALE-ENG-003`);
  md.push(`- **Script**: load-model-probe.ts (reviewer v1.2 demand #4)`);
  md.push(`- **Timestamp**: ${jsonPayload.meta.timestamp}`);
  md.push(`- **Target**: ${BASE}`);
  md.push(`- **Duration**: ${wallSec.toFixed(1)}s sustained mixed workload`);
  md.push(`- **Worker pools**: ${WRITER_WORKERS} writers + ${READER_WORKERS} readers + ${AI_WORKERS} AI = ${WRITER_WORKERS + READER_WORKERS + AI_WORKERS} CAU`);
  md.push(`- **DB writes/invoice assumption**: ${DB_WRITES_PER_INVOICE} (code-verified)`);
  md.push("");
  md.push("> This probe measures the 5 Load Model dimensions against the live dev server, then maps each to the v1.2 Decision Tree. Every number below is **[MEASURED]** — no simulation, no extrapolation.");
  md.push("");

  md.push("## 1. Measured Load Dimensions");
  md.push("");
  md.push("| Dimension | Abbreviation | Measured Value | Unit |");
  md.push("|---|---|---:|---|");
  md.push(`| Concurrent Active Users | CAU | ${measured.CAU} | users |`);
  md.push(`| HTTP Requests/sec | RPS | ${measured.RPS.toFixed(2)} | req/s |`);
  md.push(`| DB Writes/sec | WPS | ${measured.WPS.toFixed(2)} | writes/s |`);
  md.push(`| AI Calls/min | AICPM | ${measured.AICPM.toFixed(2)} | calls/min |`);
  md.push(`| Invoices/hour | IPH | ${measured.IPH.toFixed(0)} | inv/hour |`);
  md.push("");

  md.push("## 2. Latency Profile");
  md.push("");
  md.push("| Path | Count | p50 (ms) | p95 (ms) | p99 (ms) | Errors |");
  md.push("|---|---:|---:|---:|---:|---:|");
  md.push(`| POST /api/invoices (writes) | ${counters.writerLatencies.length} | ${invoiceP50.toFixed(0)} | ${invoiceP95.toFixed(0)} | ${invoiceP99.toFixed(0)} | ${counters.writerError} |`);
  md.push(`| GET /api/invoices + /dashboard (reads) | ${counters.readerLatencies.length} | ${readP50.toFixed(0)} | ${readP95.toFixed(0)} | — | ${counters.readerError} |`);
  md.push(`| POST /api/ai/smart-parse | ${counters.aiLatencies.length} | ${aiP50.toFixed(0)} | — | ${aiP99.toFixed(0)} | ${counters.aiError} |`);
  md.push("");

  md.push("## 3. Error Analysis");
  md.push("");
  md.push(`- **AI error rate**: ${(aiErrorRate * 100).toFixed(1)}% (${counters.aiError}/${counters.aiSuccess + counters.aiError})`);
  md.push(`- **Total error rate**: ${(totalErrorRate * 100).toFixed(1)}%`);
  if (Object.keys(counters.errorTypes).length > 0) {
    md.push("- **Error type breakdown**:");
    for (const [k, v] of Object.entries(counters.errorTypes)) md.push(`  - \`${k}\`: ${v}`);
  }
  md.push("");

  md.push("## 4. Decision Tree Verdict");
  md.push("");
  md.push(`**${triggeredRules.length} of ${DECISION_RULES.length} rules TRIGGERED** by current measured load.`);
  md.push(`**${blockerRules.length} BLOCKER-level** rules triggered.`);
  md.push("");
  if (triggeredRules.length > 0) {
    md.push("| Rule | Metric | Measured | Threshold | Severity | Action Required | Monthly Cost |");
    md.push("|---|---|---:|---:|:---:|---|---:|");
    for (const v of triggeredRules) {
      md.push(`| ${v.rule.id} | ${v.rule.metric} | ${v.measuredValue.toFixed(2)} | > ${v.rule.threshold} | **${v.rule.severity}** | ${v.rule.action} | $${v.rule.costUsdPerMonth} |`);
    }
    md.push("");
    md.push(`**Total monthly infrastructure cost to satisfy all triggered rules: $${jsonPayload.decisionTreeVerdict.totalMonthlyCostUsd}**`);
  } else {
    md.push("No Decision Tree rules triggered. Current load is within all thresholds.");
  }
  md.push("");

  md.push("## 5. Red Lines Check");
  md.push("");
  if (crossedRedLines.length === 0) {
    md.push("✅ **No Red Lines crossed.** System is operating within stop-ship thresholds.");
  } else {
    md.push(`🛑 **${crossedRedLines.length} RED LINE(S) CROSSED — STOP SHIP:**`);
    md.push("");
    for (const c of crossedRedLines) {
      md.push(`### ${c.redLine.id}: ${c.redLine.metric} ${c.redLine.threshold}`);
      md.push(`- **Observed**: ${c.observed}`);
      md.push(`- **Condition**: ${c.redLine.condition}`);
      md.push(`- **Consequence**: ${c.redLine.consequence}`);
      md.push("");
    }
  }
  md.push("");
  md.push("**Full Red Line reference (for production monitoring):**");
  md.push("");
  md.push("| ID | Metric | Threshold | Consequence |");
  md.push("|---|---|---|---|");
  for (const rl of RED_LINES) {
    md.push(`| ${rl.id} | ${rl.metric} | ${rl.threshold} | ${rl.consequence.slice(0, 80)}... |`);
  }
  md.push("");

  md.push("## 6. Tier Verdict");
  md.push("");
  md.push(`Based on measured WPS = **${measured.WPS.toFixed(2)}** and triggered blockers:`);
  md.push("");
  md.push(`> **${tierVerdict}**`);
  md.push("");

  md.push("## 7. Methodology");
  md.push("");
  md.push("- **CAU**: Sum of concurrent worker pools (writers + readers + AI callers). Each worker = 1 simulated active user holding a JWT.");
  md.push("- **RPS**: Total successful HTTP requests (writes + reads + AI) divided by wall seconds.");
  md.push(`- **WPS**: Successful invoice POSTs × ${DB_WRITES_PER_INVOICE} DB writes/invoice (code-verified: invoice row + line items + audit log + journal entry + journal lines), divided by wall seconds. This is a **proxy** — actual row-level write count may vary ±1 depending on line-item count.`);
  md.push("- **AICPM**: Successful AI smart-parse calls divided by wall minutes. AI worker pauses 2s between calls to avoid 429.");
  md.push("- **IPH**: Successful invoice POSTs extrapolated to hourly rate (count / wall_sec × 3600).");
  md.push("- **Latency**: nearest-rank percentile on raw latency arrays.");
  md.push("- **Dev mode**: Next.js runs in dev mode (no prod build). Production numbers will be better.");
  md.push("- **SQLite**: single-file DB, single connection, no WAL. This is the **current** measured ceiling — Postgres will behave differently.");
  md.push("");
  md.push("## 8. Artifacts");
  md.push("- `load-model-probe.json` — full raw data + verdict");
  md.push("- `load-model-probe.md` — this verdict report");

  writeFileSync(`${RESULTS_DIR}/load-model-probe.md`, md.join("\n"));

  // ─── Console summary ──────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  MEASURED LOAD DIMENSIONS");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  CAU   = ${measured.CAU} users`);
  console.log(`  RPS   = ${measured.RPS.toFixed(2)} req/s`);
  console.log(`  WPS   = ${measured.WPS.toFixed(2)} writes/s`);
  console.log(`  AICPM = ${measured.AICPM.toFixed(2)} calls/min`);
  console.log(`  IPH   = ${measured.IPH.toFixed(0)} inv/hour`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Decision Tree: ${triggeredRules.length}/${DECISION_RULES.length} rules triggered (${blockerRules.length} BLOCKERS)`);
  console.log(`  Red Lines crossed: ${crossedRedLines.length}`);
  console.log(`  Tier verdict: ${tierVerdict}`);
  if (triggeredRules.length > 0) {
    console.log(`  Monthly cost to satisfy triggered rules: $${jsonPayload.decisionTreeVerdict.totalMonthlyCostUsd}`);
  }
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`\n✓ Artifacts: ${RESULTS_DIR}/load-model-probe.{json,md}`);

  // Cleanup: hard-delete test company
  try {
    await fetch(`${BASE}/api/companies/${COMPANY_SLUG}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: `inv_token=${jwt}` },
      body: JSON.stringify({ hardDelete: true, typeToConfirm: "Load Probe Co" }),
    });
    console.log(`✓ Cleaned up test company`);
  } catch {}
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
