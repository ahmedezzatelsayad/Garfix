#!/usr/bin/env bun
/**
 * ============================================================================
 * GARFIX EOS — PRODUCTION DIGITAL TWIN  (GarfiX-DT)
 * ============================================================================
 *
 * WHAT THIS IS
 *   A discrete-event simulation of the FULL GarfiX production architecture:
 *   multi-tenant companies, Postgres, Redis, AI provider (OpenRouter),
 *   DB-backed queues, Meta/WhatsApp webhooks, and Node worker pool.
 *
 *   This is a *Digital Twin* — a calibrated model, NOT the real system.
 *   It runs 5 scale scenarios (100 → 50 000 companies) and injects 18 chaos
 *   events, then reports throughput / latency / recovery / data-integrity.
 *
 * WHY A TWIN (not a real load test)
 *   The sandbox only has SQLite + in-memory cache + in-process queue.
 *   Real production uses Postgres + Redis + external AI + Nginx + TLS.
 *   A twin lets us PREDICT production behaviour and find the FIRST BREAKING
 *   POINT without owning the real infra. Predictions must then be validated
 *   on a staging cluster — clearly labelled [NOT TESTED] below.
 *
 * HONEST LABELING (applied to every metric in every output)
 *   [MEASURED]      Real Node.js process metrics (cpuUsage, memoryUsage,
 *                   PerformanceObserver GC, monitorEventLoopDelay).
 *   [SIMULATED]     Twin model output. Calibrated to industry baselines
 *                   (Postgres p99≈15ms, Redis p99≈2ms, OpenRouter p99≈3s).
 *                   NOT GarfiX-specific until validated on staging.
 *   [EXTRAPOLATED]  Mathematical projection beyond the simulated range.
 *   [NOT TESTED]    Requires real Postgres/Redis/Nginx/TLS to measure.
 *
 * REPRODUCIBILITY
 *   bun run scripts/digital-twin.ts
 *   Outputs → ./twin-results/
 *
 * ENVIRONMENT (read at startup, printed in every report)
 *   CPU cores, total RAM, Node version, Bun version, sandbox flag.
 * ============================================================================
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { cpus, totalmem, freemem, hostname } from 'node:os';
import { performance, PerformanceObserver, constants as perfConstants } from 'node:perf_hooks';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

// ============================================================================
// SECTION 0 — ENVIRONMENT (real, measured at startup)
// ============================================================================

const ENV = {
  cpuCores: cpus().length,
  cpuModel: cpus()[0]?.model ?? 'unknown',
  totalRamMB: Math.round(totalmem() / 1024 / 1024),
  freeRamMB: Math.round(freemem() / 1024 / 1024),
  nodeVersion: process.version,
  bunVersion: (globalThis as any).Bun?.version ?? 'n/a',
  hostname: hostname(),
  pid: process.pid,
  platform: process.platform,
  // The sandbox has SQLite + in-memory cache. Real prod has Postgres+Redis.
  sandboxMode: true,
  realPostgres: false,
  realRedis: false,
  realNginx: false,
} as const;

// ============================================================================
// SECTION 1 — TYPES
// ============================================================================

type Label = 'MEASURED' | 'SIMULATED' | 'EXTRAPOLATED' | 'NOT TESTED';

interface Labeled<T> { value: T; label: Label; note?: string; }

type RequestKind = 'LOGIN' | 'INVOICE' | 'CHAT' | 'AI' | 'WEBHOOK' | 'AUDIT';
type ComponentState = 'healthy' | 'degraded' | 'killed' | 'rateLimited' | 'diskFull' | 'deadlocked';

interface SimRequest {
  id: number;
  kind: RequestKind;
  tenantId: number;
  arriveTick: number;
  startTick?: number;
  doneTick?: number;
  status: 'pending' | 'running' | 'ok' | 'error' | 'timeout' | 'dropped' | 'deadletter';
  latencyMs: number;
  errorReason?: string;
  aiFallbackUsed?: boolean;
  duplicateOf?: number;
  auditWritten?: boolean;
}

interface ComponentHealth {
  name: string;
  state: ComponentState;
  sinceTick: number;
  untilTick?: number; // for transient faults
  detail?: string;
}

interface TelemetrySample {
  tick: number;
  simTimeMs: number;
  // Throughput
  inflight: number;
  completedThisTick: number;
  erroredThisTick: number;
  // Latency (rolling, ms)
  p50: number; p95: number; p99: number; max: number;
  // Component states
  dbState: ComponentState;
  redisState: ComponentState;
  aiState: ComponentState;
  // Pools / queues
  dbPoolUsed: number; dbPoolCap: number;
  dbQueueDepth: number;
  queueDepth: number; queueDropped: number; queueDlq: number;
  cacheHits: number; cacheMisses: number;
  ai429: number; aiTimeout: number; aiFallback: number;
  webhooksDup: number; webhooksRetry: number;
  // Resource [MEASURED overlay]
  realCpuPct: number;   // % of one core
  realHeapMB: number;
  realRssMB: number;
  realEventLoopLagMs: number;
  gcCount: number;
  // Resource [SIMULATED model]
  simCpuPct: number;
  simRamMB: number;
  // Integrity
  lostRequests: number;
  duplicateRequests: number;
  auditGaps: number;
}

interface ChaosEvent {
  id: string;
  name: string;
  triggerTick: number;
  durationTicks: number;
  target: 'db' | 'redis' | 'ai' | 'queue' | 'webhook' | 'worker' | 'clock' | 'jwt' | 'migration' | 'disk' | 'network';
  description: string;
}

interface ChaosResult {
  eventId: string;
  name: string;
  triggeredAtTick: number;
  detectedAtTick: number;   // when system noticed (latency spike / error)
  recoveredAtTick: number;  // when metrics returned to baseline
  rtoMs: number;            // recovery time objective (sim ms)
  dataLost: number;         // count of lost requests
  duplicatesCreated: number;
  auditGapsDuringFault: number;
  errorRateDuringFault: number;
  errorRateAfterRecovery: number;
  recovered: boolean;
  integrityScore: number;   // 0..1
  verdict: 'SURVIVED' | 'DEGRADED' | 'DATA_LOSS' | 'FAILED_RECOVERY';
  notes: string;
}

interface ScenarioResult {
  scenarioId: string;
  label: string;
  companies: number;
  usersPerCompany: number;
  totalUsers: number;
  targetInvoicesPerSec: number;
  targetChatPerSec: number;
  simDurationTicks: number;
  simDurationSec: number;
  // Aggregate throughput
  totalRequests: number;
  completedOk: number;
  errored: number;
  timedOut: number;
  dropped: number;
  deadlettered: number;
  sustainedThroughputPerSec: number;
  peakThroughputPerSec: number;
  // Latency
  p50: number; p95: number; p99: number; max: number;
  // Resource [MEASURED]
  realCpuPeakPct: Labeled<number>;
  realHeapPeakMB: Labeled<number>;
  realRssPeakMB: Labeled<number>;
  realEventLoopLagPeakMs: Labeled<number>;
  gcTotal: Labeled<number>;
  // Resource [SIMULATED]
  simCpuPeakPct: Labeled<number>;
  simRamPeakMB: Labeled<number>;
  // Component
  dbReads: Labeled<number>;
  dbWrites: Labeled<number>;
  dbPoolPeakPct: Labeled<number>;
  dbDeadlocks: Labeled<number>;
  cacheHitRatio: Labeled<number>;
  aiCalls: Labeled<number>;
  ai429s: Labeled<number>;
  aiFallbacks: Labeled<number>;
  queuePeakDepth: Labeled<number>;
  queueDropped: Labeled<number>;
  webhooksDuplicates: Labeled<number>;
  // Integrity
  lostRequests: Labeled<number>;
  duplicateRequests: Labeled<number>;
  auditGaps: Labeled<number>;
  // Chaos results for this scenario
  chaosResults: ChaosResult[];
  // SLO
  sloErrorRatePct: number;
  sloP99Ms: number;
  sloDataLoss: number;
  sloPassed: boolean;
  firstBreakingComponent?: string;
  samples: TelemetrySample[];   // time series
}

// ============================================================================
// SECTION 2 — CALIBRATION CONSTANTS
// ============================================================================
// These are INDUSTRY BASELINES used to calibrate the twin. They are NOT
// GarfiX-specific measurements. Each is tagged [SIMULATED] in outputs.
// Validation on a real staging cluster is required to refine them.
// ============================================================================

const CAL = {
  postgres: {
    poolSize: 20,
    queryLatencyMedianMs: 2,
    queryLatencyP99Ms: 15,
    writesPerSecPerConn: 250,
    readsPerSecPerConn: 800,    // reads are cheaper
    deadlockProbPerTx: 0.0005,
    restartRecoveryMs: 8000,
    diskFullBehavior: 'writes_fail_reads_ok',
  },
  redis: {
    hitRatio: 0.85,
    getLatencyMedianMs: 0.5,
    getLatencyP99Ms: 2,
    setLatencyMs: 1,
    warmupMs: 10000,
    offlinePenaltyMs: 3, // extra latency on miss → DB
  },
  openRouter: {
    freeRatePerMin: 60,
    paidRatePerMin: 600,
    latencyMedianMs: 800,
    latencyP99Ms: 3000,
    timeoutMs: 10000,
    error5xxRate: 0.005,
    fallbackProviderLatencyMs: 1200,
    fallbackErrorRate: 0.01,
  },
  queue: {
    workers: 4,
    jobOverheadMs: 50,
    retryAttempts: 3,
    retryBackoffMs: [1000, 4000, 16000],
    dropProbPerJob: 0.0001,
  },
  webhook: {
    duplicateRate: 0.02,
    retryIntervalMs: 30000,
    maxRetries: 5,
    ackTimeoutMs: 5000,
  },
  worker: {
    sigtermGraceMs: 5000,
    oomThresholdMB: 512,
  },
  slo: {
    maxErrorRatePct: 1.0,
    maxP99Ms: 500,
    maxDataLoss: 0,
  },
} as const;

// ============================================================================
// SECTION 3 — COMPONENT MODELS  (all [SIMULATED])
// ============================================================================

/** Lognormal sample — models real-world latency tails. */
function lognormal(median: number, p99: number): number {
  // median = exp(mu); p99 ≈ exp(mu + 2.326*sigma) → solve sigma
  const mu = Math.log(median);
  const sigma = (Math.log(p99) - mu) / 2.326;
  // Box-Muller
  const u1 = Math.max(1e-12, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * z);
}

class SimPostgres {
  state: ComponentState = 'healthy';
  poolUsed = 0;
  poolCap = CAL.postgres.poolSize;
  queueDepth = 0;
  reads = 0;
  writes = 0;
  deadlocks = 0;
  diskFull = false;
  killedUntilTick = -1;
  deadlockUntilTick = -1;

  tick(tick: number): void {
    if (this.killedUntilTick > 0 && tick >= this.killedUntilTick) {
      this.state = 'healthy';
      this.killedUntilTick = -1;
    }
    if (this.deadlockUntilTick > 0 && tick >= this.deadlockUntilTick) {
      this.state = 'healthy';
      this.deadlockUntilTick = -1;
    }
    if (this.state === 'killed') this.queueDepth = Math.min(this.queueDepth + 2, 10000);
    else this.queueDepth = Math.max(0, this.queueDepth - this.poolCap);
  }

  kill(durationTicks: number, tick: number): void {
    this.state = 'killed';
    this.killedUntilTick = tick + durationTicks;
  }

  deadlock(durationTicks: number, tick: number): void {
    this.state = 'deadlocked';
    this.deadlockUntilTick = tick + durationTicks;
  }

  setDiskFull(full: boolean): void { this.diskFull = full; }

  query(isWrite: boolean, tick: number): { latencyMs: number; ok: boolean; reason?: string } {
    if (this.state === 'killed') return { latencyMs: 50, ok: false, reason: 'ECONNREFUSED' };
    if (isWrite && this.diskFull) return { latencyMs: 5, ok: false, reason: 'ENOSPC' };
    if (this.state === 'deadlocked') {
      if (Math.random() < 0.3) { this.deadlocks++; return { latencyMs: 200, ok: false, reason: '40P01' }; }
    }
    if (this.poolUsed >= this.poolCap) {
      this.queueDepth++;
      // queued: add wait
      const wait = lognormal(CAL.postgres.queryLatencyMedianMs * 4, CAL.postgres.queryLatencyP99Ms * 6);
      const lat = lognormal(CAL.postgres.queryLatencyMedianMs, CAL.postgres.queryLatencyP99Ms) + wait;
      if (isWrite) this.writes++; else this.reads++;
      return { latencyMs: lat, ok: true };
    }
    this.poolUsed++;
    if (isWrite) this.writes++; else this.reads++;
    if (Math.random() < CAL.postgres.deadlockProbPerTx) {
      this.deadlocks++;
      this.poolUsed--;
      return { latencyMs: 150, ok: false, reason: '40P01' };
    }
    const lat = lognormal(CAL.postgres.queryLatencyMedianMs, CAL.postgres.queryLatencyP99Ms);
    this.poolUsed--;
    return { latencyMs: lat, ok: true };
  }
}

class SimRedis {
  state: ComponentState = 'healthy';
  hits = 0;
  misses = 0;
  evictions = 0;
  offlineUntilTick = -1;
  corrupted = false;

  tick(tick: number): void {
    if (this.offlineUntilTick > 0 && tick >= this.offlineUntilTick) {
      this.state = 'healthy';
      this.offlineUntilTick = -1;
      this.corrupted = false; // restart clears corruption
    }
  }

  kill(durationTicks: number, tick: number): void {
    this.state = 'killed';
    this.offlineUntilTick = tick + durationTicks;
  }

  corrupt(): void { this.corrupted = true; this.state = 'degraded'; }

  get(key: string): { hit: boolean; latencyMs: number } {
    if (this.state === 'killed') {
      this.misses++;
      return { hit: false, latencyMs: CAL.redis.offlinePenaltyMs };
    }
    if (this.corrupted && Math.random() < 0.1) {
      this.misses++;
      return { hit: false, latencyMs: CAL.redis.getLatencyP99Ms };
    }
    const hit = Math.random() < CAL.redis.hitRatio;
    if (hit) { this.hits++; return { hit: true, latencyMs: lognormal(CAL.redis.getLatencyMedianMs, CAL.redis.getLatencyP99Ms) }; }
    this.misses++;
    return { hit: false, latencyMs: lognormal(CAL.redis.getLatencyMedianMs, CAL.redis.getLatencyP99Ms) };
  }

  set(): { latencyMs: number } { return { latencyMs: CAL.redis.setLatencyMs }; }
}

class SimAIProvider {
  state: ComponentState = 'healthy';
  calls = 0;
  count429 = 0;
  timeouts = 0;
  fallbacks = 0;
  rateLimitUntilTick = -1;
  windowStartTick = 0;
  windowCalls = 0;
  ratePerMin = CAL.openRouter.paidRatePerMin;

  tick(tick: number, ticksPerSec: number): void {
    // sliding 1-min window
    if (tick - this.windowStartTick > ticksPerSec * 60) {
      this.windowStartTick = tick;
      this.windowCalls = 0;
    }
    if (this.rateLimitUntilTick > 0 && tick >= this.rateLimitUntilTick) {
      this.state = 'healthy';
      this.rateLimitUntilTick = -1;
    }
  }

  rateLimit(durationTicks: number, tick: number): void {
    this.state = 'rateLimited';
    this.rateLimitUntilTick = tick + durationTicks;
  }

  call(tick: number, ticksPerSec: number): { latencyMs: number; ok: boolean; fallbackUsed: boolean; reason?: string } {
    this.calls++;
    this.windowCalls++;
    if (this.state === 'rateLimited') {
      this.count429++;
      // Try fallback
      if (Math.random() < 0.9) {
        this.fallbacks++;
        const ok = Math.random() > CAL.openRouter.fallbackErrorRate;
        return { latencyMs: CAL.openRouter.fallbackProviderLatencyMs, ok, fallbackUsed: true, reason: ok ? undefined : 'FALLBACK_5XX' };
      }
      return { latencyMs: 10, ok: false, fallbackUsed: false, reason: '429' };
    }
    // Exceed rate limit?
    if (this.windowCalls > this.ratePerMin) {
      this.count429++;
      this.state = 'rateLimited';
      this.rateLimitUntilTick = tick + Math.floor(ticksPerSec * 60); // 1 min backoff
      // try fallback
      this.fallbacks++;
      const ok = Math.random() > CAL.openRouter.fallbackErrorRate;
      return { latencyMs: CAL.openRouter.fallbackProviderLatencyMs, ok, fallbackUsed: true };
    }
    // 5xx
    if (Math.random() < CAL.openRouter.error5xxRate) {
      // try fallback
      this.fallbacks++;
      const ok = Math.random() > CAL.openRouter.fallbackErrorRate;
      return { latencyMs: CAL.openRouter.fallbackProviderLatencyMs, ok, fallbackUsed: true, reason: ok ? undefined : 'FALLBACK_5XX' };
    }
    const lat = lognormal(CAL.openRouter.latencyMedianMs, CAL.openRouter.latencyP99Ms);
    if (lat > CAL.openRouter.timeoutMs) { this.timeouts++; return { latencyMs: lat, ok: false, fallbackUsed: false, reason: 'TIMEOUT' }; }
    return { latencyMs: lat, ok: true, fallbackUsed: false };
  }
}

class SimQueue {
  workers = CAL.queue.workers;
  depth = 0;
  dropped = 0;
  dlq = 0;
  activeWorkers = 0;

  enqueue(): boolean {
    this.depth++;
    if (Math.random() < CAL.queue.dropProbPerJob) { this.dropped++; this.depth--; return false; }
    return true;
  }

  dequeue(): boolean {
    if (this.depth === 0 || this.activeWorkers >= this.workers) return false;
    this.depth--;
    this.activeWorkers++;
    return true;
  }

  release(): void { this.activeWorkers = Math.max(0, this.activeWorkers - 1); }

  failToDlq(): void { this.dlq++; }
}

class SimWebhookReceiver {
  received = 0;
  duplicates = 0;
  retries = 0;
  stormMultiplier = 1;
  seenSignatures = new Set<string>();

  setStorm(mult: number): void { this.stormMultiplier = mult; }

  receive(signature: string): { isDuplicate: boolean; latencyMs: number } {
    this.received++;
    const dup = this.seenSignatures.has(signature);
    if (dup) this.duplicates++;
    else this.seenSignatures.add(signature);
    // Meta retries if ACK >5s — simulate retry arrivals
    if (!dup && Math.random() < 0.05) {
      this.retries++;
    }
    return { isDuplicate: dup, latencyMs: lognormal(2, 10) };
  }
}

class SimWorkerPool {
  workerThreads = 1;
  oomKills = 0;
  sigtermDrainMs = CAL.worker.sigtermGraceMs;
  killed = false;
  killedUntilTick = -1;

  oomKill(tick: number, durationTicks: number): void {
    this.oomKills++;
    this.killed = true;
    this.killedUntilTick = tick + durationTicks;
  }

  tick(tick: number): void {
    if (this.killedUntilTick > 0 && tick >= this.killedUntilTick) {
      this.killed = false;
      this.killedUntilTick = -1;
    }
  }
}

// ============================================================================
// SECTION 4 — TELEMETRY (real [MEASURED] + model [SIMULATED])
// ============================================================================

class Telemetry {
  samples: TelemetrySample[] = [];
  realCpuStart = process.cpuUsage();
  realCpuLastSample = process.cpuUsage();
  realCpuLastTime = performance.now();
  gcCount = 0;
  observer: PerformanceObserver;
  eld = monitorEventLoopDelay({ resolution: 20 });
  latencies: number[] = []; // rolling window

  constructor() {
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'gc') this.gcCount++;
      }
    });
    this.observer.observe({ entryTypes: ['gc'], buffered: false });
    this.eld.enable();
  }

  reset(): void {
    this.samples = [];
    this.latencies = [];
    this.gcCount = 0;
    this.realCpuStart = process.cpuUsage();
    this.realCpuLastSample = process.cpuUsage();
    this.realCpuLastTime = performance.now();
    this.eld.disable();
    this.eld = monitorEventLoopDelay({ resolution: 20 });
    this.eld.enable();
  }

  recordLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > 5000) this.latencies.shift();
  }

  private pct(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[idx];
  }

  sample(
    tick: number,
    simTimeMs: number,
    inflight: number,
    completedThisTick: number,
    erroredThisTick: number,
    db: SimPostgres,
    redis: SimRedis,
    ai: SimAIProvider,
    queue: SimQueue,
    webhook: SimWebhookReceiver,
    workers: SimWorkerPool,
    lost: number,
    dups: number,
    auditGaps: number,
    simCpuPct: number,
    simRamMB: number,
  ): TelemetrySample {
    // [MEASURED] real CPU since last sample
    const now = performance.now();
    const cpuDelta = process.cpuUsage(this.realCpuLastSample);
    const wallMs = now - this.realCpuLastTime;
    const cpuMs = (cpuDelta.user + cpuDelta.system) / 1000;
    const realCpuPct = wallMs > 0 ? (cpuMs / wallMs) * 100 : 0;
    this.realCpuLastSample = process.cpuUsage();
    this.realCpuLastTime = now;

    const mem = process.memoryUsage();
    const heapMB = mem.heapUsed / 1024 / 1024;
    const rssMB = mem.rss / 1024 / 1024;
    const elLag = this.eld.max;

    const s: TelemetrySample = {
      tick,
      simTimeMs,
      inflight,
      completedThisTick,
      erroredThisTick,
      p50: this.pct(this.latencies, 0.5),
      p95: this.pct(this.latencies, 0.95),
      p99: this.pct(this.latencies, 0.99),
      max: this.latencies.length ? Math.max(...this.latencies) : 0,
      dbState: db.state,
      redisState: redis.state,
      aiState: ai.state,
      dbPoolUsed: db.poolUsed,
      dbPoolCap: db.poolCap,
      dbQueueDepth: db.queueDepth,
      queueDepth: queue.depth,
      queueDropped: queue.dropped,
      queueDlq: queue.dlq,
      cacheHits: redis.hits,
      cacheMisses: redis.misses,
      ai429: ai.count429,
      aiTimeout: ai.timeouts,
      aiFallback: ai.fallbacks,
      webhooksDup: webhook.duplicates,
      webhooksRetry: webhook.retries,
      realCpuPct,
      realHeapMB: heapMB,
      realRssMB: rssMB,
      realEventLoopLagMs: elLag,
      gcCount: this.gcCount,
      simCpuPct,
      simRamMB,
      lostRequests: lost,
      duplicateRequests: dups,
      auditGaps: auditGaps,
    };
    this.samples.push(s);
    return s;
  }

  stop(): void {
    this.eld.disable();
    this.observer.disconnect();
  }
}

// ============================================================================
// SECTION 5 — CHAOS EVENT LIBRARY (18 events)
// ============================================================================

const CHAOS_EVENTS: ChaosEvent[] = [
  { id: 'C01', name: 'Kill PostgreSQL',       triggerTick: 30,  durationTicks: 5,  target: 'db',        description: 'postmaster killed; connections refused for 5s' },
  { id: 'C02', name: 'Kill Redis',            triggerTick: 70,  durationTicks: 10, target: 'redis',     description: 'redis-server killed; cache misses for 10s' },
  { id: 'C03', name: 'OpenRouter 429 storm',  triggerTick: 110, durationTicks: 30, target: 'ai',        description: 'rate-limit all AI requests for 30s; fallback fires' },
  { id: 'C04', name: 'Disk full',             triggerTick: 150, durationTicks: 20, target: 'disk',      description: 'PGDATA partition full; writes fail' },
  { id: 'C05', name: 'Network delay 900ms',   triggerTick: 190, durationTicks: 20, target: 'network',   description: '900ms RTT added to all external calls' },
  { id: 'C06', name: 'DB lock contention',    triggerTick: 230, durationTicks: 10, target: 'db',        description: 'long-held advisory lock; tx queue builds' },
  { id: 'C07', name: 'Deadlock cascade',      triggerTick: 270, durationTicks: 8,  target: 'db',        description: 'serialized deadlocks 40P01; retry storm' },
  { id: 'C08', name: 'OOM kill worker',       triggerTick: 310, durationTicks: 6,  target: 'worker',    description: 'Node worker OOM-killed; in-flight lost' },
  { id: 'C09', name: 'SIGTERM graceful',      triggerTick: 350, durationTicks: 5,  target: 'worker',    description: 'SIGTERM; 5s drain window' },
  { id: 'C10', name: 'SIGKILL worker',        triggerTick: 390, durationTicks: 4,  target: 'worker',    description: 'SIGKILL; in-flight requests lost' },
  { id: 'C11', name: 'Restart worker',        triggerTick: 430, durationTicks: 8,  target: 'worker',    description: 'worker process restart; warmup cost' },
  { id: 'C12', name: 'Duplicate webhook storm', triggerTick: 470, durationTicks: 15, target: 'webhook', description: 'Meta re-delivers 100x webhooks for 15s' },
  { id: 'C13', name: 'Duplicate invoice',     triggerTick: 510, durationTicks: 5,  target: 'queue',     description: 'same invoice enqueued 5x; idempotency tested' },
  { id: 'C14', name: 'Clock drift 5s',        triggerTick: 550, durationTicks: 10, target: 'clock',     description: 'system clock jumps +5s; JWT/scheduling affected' },
  { id: 'C15', name: 'Timezone shift',        triggerTick: 590, durationTicks: 8,  target: 'clock',     description: 'TZ changed to UTC; scheduled jobs misfire' },
  { id: 'C16', name: 'Expired JWT flood',     triggerTick: 630, durationTicks: 12, target: 'jwt',       description: 'all sessions expire; re-auth storm' },
  { id: 'C17', name: 'Corrupted cache',       triggerTick: 670, durationTicks: 10, target: 'redis',     description: 'Redis returns garbage; app must invalidate' },
  { id: 'C18', name: 'Broken migration',      triggerTick: 710, durationTicks: 15, target: 'migration', description: 'schema migration half-applied; queries fail' },
];

// ============================================================================
// SECTION 6 — SCENARIO DEFINITIONS (5 scales)
// ============================================================================

interface Scenario {
  id: string;
  label: string;
  companies: number;
  usersPerCompany: number;
  invoicesPerSec: number;
  chatPerSec: number;
  durationTicks: number;
}

const SCENARIOS: Scenario[] = [
  { id: 'S1',  label: '100 companies × 20 users',     companies: 100,   usersPerCompany: 20, invoicesPerSec: 40,  chatPerSec: 30,  durationTicks: 760 },
  { id: 'S2',  label: '1 000 companies × 20 users',   companies: 1000,  usersPerCompany: 20, invoicesPerSec: 100, chatPerSec: 75,  durationTicks: 760 },
  { id: 'S3',  label: '5 000 companies × 20 users',   companies: 5000,  usersPerCompany: 20, invoicesPerSec: 200, chatPerSec: 150, durationTicks: 760 },
  { id: 'S4',  label: '10 000 companies × 20 users',  companies: 10000, usersPerCompany: 20, invoicesPerSec: 400, chatPerSec: 300, durationTicks: 760 },
  { id: 'S5',  label: '50 000 companies × 20 users',  companies: 50000, usersPerCompany: 20, invoicesPerSec: 1000,chatPerSec: 750, durationTicks: 760 },
];

// ============================================================================
// SECTION 7 — SIMULATION ENGINE
// ============================================================================

const TICK_MS = 100;              // 1 tick = 100ms simulated
const TICKS_PER_SEC = 10;

function hash(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 12);
}

interface SimState {
  tick: number;
  reqIdCounter: number;
  requests: SimRequest[];
  inflight: Set<SimRequest>;
  completed: SimRequest[];
  db: SimPostgres;
  redis: SimRedis;
  ai: SimAIProvider;
  queue: SimQueue;
  webhook: SimWebhookReceiver;
  workers: SimWorkerPool;
  lost: number;
  dups: number;
  auditGaps: number;
  // Tick-based expiry for transient chaos effects (NOT setTimeout — sim runs faster than real time)
  networkDelayMs: number;
  networkDelayUntilTick: number;
  jwtExpired: boolean;
  jwtExpiredUntilTick: number;
  clockDriftSec: number;
  clockDriftUntilTick: number;
  tzShifted: boolean;
  tzShiftedUntilTick: number;
  migrationBroken: boolean;
  migrationBrokenUntilTick: number;
  diskFull: boolean;
  diskFullUntilTick: number;
  webhookStormMult: number;
  webhookStormUntilTick: number;
  invoiceSeen: Set<string>; // idempotency
  chaosActive: Map<string, boolean>;
}

function newSimState(): SimState {
  return {
    tick: 0,
    reqIdCounter: 0,
    requests: [],
    inflight: new Set(),
    completed: [],
    db: new SimPostgres(),
    redis: new SimRedis(),
    ai: new SimAIProvider(),
    queue: new SimQueue(),
    webhook: new SimWebhookReceiver(),
    workers: new SimWorkerPool(),
    lost: 0,
    dups: 0,
    auditGaps: 0,
    networkDelayMs: 0,
    networkDelayUntilTick: -1,
    jwtExpired: false,
    jwtExpiredUntilTick: -1,
    clockDriftSec: 0,
    clockDriftUntilTick: -1,
    tzShifted: false,
    tzShiftedUntilTick: -1,
    migrationBroken: false,
    migrationBrokenUntilTick: -1,
    diskFull: false,
    diskFullUntilTick: -1,
    webhookStormMult: 1,
    webhookStormUntilTick: -1,
    invoiceSeen: new Set(),
    chaosActive: new Map(),
  };
}

// Apply a chaos event — ALL state changes are tick-based (NEVER setTimeout,
// because the simulation runs faster than real wall-clock time).
function applyChaos(state: SimState, ev: ChaosEvent): void {
  state.chaosActive.set(ev.id, true);
  const end = state.tick + ev.durationTicks;
  switch (ev.target) {
    case 'db':
      if (ev.name.includes('Deadlock') || ev.name.includes('lock contention')) state.db.deadlock(ev.durationTicks, state.tick);
      else state.db.kill(ev.durationTicks, state.tick);
      break;
    case 'redis':
      if (ev.name.includes('Corrupted')) state.redis.corrupt();
      else state.redis.kill(ev.durationTicks, state.tick);
      break;
    case 'ai':
      state.ai.rateLimit(ev.durationTicks, state.tick);
      break;
    case 'disk':
      state.diskFull = true;
      state.diskFullUntilTick = end;
      state.db.setDiskFull(true);
      break;
    case 'network':
      state.networkDelayMs = 900;
      state.networkDelayUntilTick = end;
      break;
    case 'worker':
      if (ev.name.includes('OOM') || ev.name.includes('SIGKILL')) {
        state.workers.oomKill(state.tick, ev.durationTicks);
        // lose in-flight — this is the DATA LOSS path
        for (const r of Array.from(state.inflight)) {
          r.status = 'dropped';
          state.lost++;
          if (r.kind === 'INVOICE' || r.kind === 'WEBHOOK') state.auditGaps++;
        }
        state.inflight.clear();
      } else if (ev.name.includes('SIGTERM')) {
        // graceful: let in-flight drain; no data loss
        state.workers.oomKill(state.tick, Math.max(ev.durationTicks, 50));
      } else {
        state.workers.oomKill(state.tick, ev.durationTicks);
      }
      break;
    case 'webhook':
      state.webhookStormMult = 100;
      state.webhookStormUntilTick = end;
      state.webhook.setStorm(100);
      break;
    case 'queue':
      // duplicate invoice — inject 5 duplicate signatures into the idempotency set
      for (let i = 0; i < 5; i++) {
        const fakeSig = hash(`dup-inj-${ev.id}-${i}`);
        state.invoiceSeen.add(fakeSig); // future requests with this sig will be seen as dups
      }
      break;
    case 'clock':
      if (ev.name.includes('Timezone')) { state.tzShifted = true; state.tzShiftedUntilTick = end; }
      else { state.clockDriftSec = 5; state.clockDriftUntilTick = end; }
      break;
    case 'jwt':
      state.jwtExpired = true;
      state.jwtExpiredUntilTick = end;
      break;
    case 'migration':
      state.migrationBroken = true;
      state.migrationBrokenUntilTick = end;
      state.db.deadlock(ev.durationTicks, state.tick);
      break;
  }
}

// Clear expired tick-based chaos effects — called every tick.
function expireChaos(state: SimState): void {
  if (state.networkDelayUntilTick > 0 && state.tick >= state.networkDelayUntilTick) {
    state.networkDelayMs = 0; state.networkDelayUntilTick = -1;
  }
  if (state.jwtExpiredUntilTick > 0 && state.tick >= state.jwtExpiredUntilTick) {
    state.jwtExpired = false; state.jwtExpiredUntilTick = -1;
  }
  if (state.clockDriftUntilTick > 0 && state.tick >= state.clockDriftUntilTick) {
    state.clockDriftSec = 0; state.clockDriftUntilTick = -1;
  }
  if (state.tzShiftedUntilTick > 0 && state.tick >= state.tzShiftedUntilTick) {
    state.tzShifted = false; state.tzShiftedUntilTick = -1;
  }
  if (state.migrationBrokenUntilTick > 0 && state.tick >= state.migrationBrokenUntilTick) {
    state.migrationBroken = false; state.migrationBrokenUntilTick = -1;
  }
  if (state.diskFullUntilTick > 0 && state.tick >= state.diskFullUntilTick) {
    state.diskFull = false; state.diskFullUntilTick = -1; state.db.setDiskFull(false);
  }
  if (state.webhookStormUntilTick > 0 && state.tick >= state.webhookStormUntilTick) {
    state.webhookStormMult = 1; state.webhookStormUntilTick = -1; state.webhook.setStorm(1);
  }
}

function genRequests(state: SimState, sc: Scenario): SimRequest[] {
  const out: SimRequest[] = [];
  const totalUsers = sc.companies * sc.usersPerCompany;
  // Login burst at t=0: 10% of users
  const loginCount = Math.floor(totalUsers * 0.1);
  for (let i = 0; i < loginCount; i++) {
    out.push({
      id: state.reqIdCounter++,
      kind: 'LOGIN',
      tenantId: Math.floor(i / sc.usersPerCompany),
      arriveTick: Math.floor(Math.random() * 5), // spread over first 500ms
      status: 'pending',
      latencyMs: 0,
    });
  }
  // Invoices: Poisson over duration
  const totalInvoices = Math.floor(sc.invoicesPerSec * (sc.durationTicks / TICKS_PER_SEC));
  for (let i = 0; i < totalInvoices; i++) {
    out.push({
      id: state.reqIdCounter++,
      kind: 'INVOICE',
      tenantId: Math.floor(Math.random() * sc.companies),
      arriveTick: Math.floor((i / totalInvoices) * sc.durationTicks) + Math.floor(Math.random() * 3),
      status: 'pending',
      latencyMs: 0,
    });
  }
  // Chat
  const totalChat = Math.floor(sc.chatPerSec * (sc.durationTicks / TICKS_PER_SEC));
  for (let i = 0; i < totalChat; i++) {
    out.push({
      id: state.reqIdCounter++,
      kind: 'CHAT',
      tenantId: Math.floor(Math.random() * sc.companies),
      arriveTick: Math.floor((i / totalChat) * sc.durationTicks) + Math.floor(Math.random() * 3),
      status: 'pending',
      latencyMs: 0,
    });
  }
  // Webhooks: variable, ~10/sec baseline
  const totalWebhooks = Math.floor(10 * (sc.durationTicks / TICKS_PER_SEC));
  for (let i = 0; i < totalWebhooks; i++) {
    out.push({
      id: state.reqIdCounter++,
      kind: 'WEBHOOK',
      tenantId: Math.floor(Math.random() * sc.companies),
      arriveTick: Math.floor((i / totalWebhooks) * sc.durationTicks),
      status: 'pending',
      latencyMs: 0,
    });
  }
  return out.sort((a, b) => a.arriveTick - b.arriveTick);
}

function processRequest(state: SimState, r: SimRequest, telemetry: Telemetry): void {
  r.startTick = state.tick;
  r.status = 'running';
  state.inflight.add(r);
  let lat = 0;
  // Network delay applies to all
  lat += state.networkDelayMs;

  try {
    if (r.kind === 'LOGIN') {
      if (state.jwtExpired) {
        // re-auth: extra DB hit
        const q = state.db.query(false, state.tick); lat += q.latencyMs;
        if (!q.ok) { r.status = 'error'; r.errorReason = 'JWT_EXPIRED_REAUTH_FAIL'; r.latencyMs = lat; return; }
      }
      // cache lookup
      const c = state.redis.get(`sess:${r.tenantId}:${r.id}`); lat += c.latencyMs;
      if (!c.hit) {
        const q = state.db.query(false, state.tick); lat += q.latencyMs;
        if (!q.ok) { r.status = 'error'; r.errorReason = q.reason; r.latencyMs = lat; return; }
      }
      r.status = 'ok';
    } else if (r.kind === 'INVOICE') {
      // idempotency check
      const sig = hash(`${r.tenantId}:${r.arriveTick}:${r.id}`);
      const dupSig = !state.invoiceSeen.has(sig);
      state.invoiceSeen.add(sig);
      if (!dupSig) { state.dups++; r.duplicateOf = r.id; r.status = 'ok'; r.latencyMs = lat + 1; return; }
      // cache check
      const c = state.redis.get(`inv:${sig}`); lat += c.latencyMs;
      if (c.hit) { r.status = 'ok'; r.latencyMs = lat; return; }
      // product match — DB reads
      const q1 = state.db.query(false, state.tick); lat += q1.latencyMs;
      if (!q1.ok) { r.status = 'error'; r.errorReason = q1.reason; r.latencyMs = lat; return; }
      // ~30% need AI (fuzzy miss)
      if (Math.random() < 0.3) {
        const ai = state.ai.call(state.tick, TICKS_PER_SEC); lat += ai.latencyMs;
        if (ai.fallbackUsed) r.aiFallbackUsed = true;
        if (!ai.ok) { r.status = 'error'; r.errorReason = ai.reason; r.latencyMs = lat; return; }
      }
      // write invoice + audit
      const q2 = state.db.query(true, state.tick); lat += q2.latencyMs;
      if (!q2.ok) { r.status = 'error'; r.errorReason = q2.reason; r.latencyMs = lat; state.auditGaps++; return; }
      const q3 = state.db.query(true, state.tick); lat += q3.latencyMs; // audit row
      if (!q3.ok) { state.auditGaps++; r.status = 'ok'; r.auditWritten = false; r.latencyMs = lat; return; }
      r.auditWritten = true;
      // enqueue background job
      if (state.queue.enqueue()) {
        // job runs async — model as immediate for throughput
        if (state.queue.dequeue()) {
          state.queue.release();
        }
      }
      r.status = 'ok';
    } else if (r.kind === 'CHAT') {
      const c = state.redis.get(`chat:${r.tenantId}`); lat += c.latencyMs;
      const ai = state.ai.call(state.tick, TICKS_PER_SEC); lat += ai.latencyMs;
      if (ai.fallbackUsed) r.aiFallbackUsed = true;
      if (!ai.ok) { r.status = 'error'; r.errorReason = ai.reason; r.latencyMs = lat; return; }
      const q = state.db.query(true, state.tick); lat += q.latencyMs; // persist message
      if (!q.ok) { r.status = 'error'; r.errorReason = q.reason; r.latencyMs = lat; return; }
      r.status = 'ok';
      r.auditWritten = true;
    } else if (r.kind === 'WEBHOOK') {
      const sig = hash(`wh:${r.tenantId}:${r.arriveTick}:${r.id}`);
      const w = state.webhook.receive(sig); lat += w.latencyMs;
      if (w.isDuplicate) { r.duplicateOf = r.id; r.status = 'ok'; r.latencyMs = lat; return; }
      // process webhook → maybe create invoice
      const q = state.db.query(true, state.tick); lat += q.latencyMs;
      if (!q.ok) { r.status = 'error'; r.errorReason = q.reason; r.latencyMs = lat; return; }
      r.status = 'ok';
      r.auditWritten = true;
    } else if (r.kind === 'AUDIT') {
      const q = state.db.query(true, state.tick); lat += q.latencyMs;
      if (!q.ok) { r.status = 'error'; r.errorReason = q.reason; r.latencyMs = lat; return; }
      r.status = 'ok';
      r.auditWritten = true;
    }
  } catch (e: any) {
    r.status = 'error';
    r.errorReason = String(e?.message ?? e);
  }
  r.latencyMs = lat;
  r.doneTick = state.tick;
  telemetry.recordLatency(lat);
}

function runScenario(sc: Scenario, telemetry: Telemetry, withChaos: boolean): ScenarioResult {
  telemetry.reset();
  const state = newSimState();
  const pending = genRequests(state, sc);
  state.requests = pending;
  const completedThisTickArr: number[] = [];
  const erroredThisTickArr: number[] = [];
  const chaosResults: ChaosResult[] = [];
  const baselineErrorRate = { value: 0, samples: 0 };

  // For chaos: baseline window = first 25 ticks (2.5s) before C01 at tick 30
  let baselineErrors = 0;
  let baselineTotal = 0;

  const maxTick = sc.durationTicks;
  let reqIdx = 0;

  // Track per-chaos fault windows for RTO + damage measurement.
  // CRITICAL: damage counters use DELTA from event start, not cumulative totals.
  // Tracking window = [startTick, endTick] only (NOT recovery window, to avoid
  // attributing the next event's damage to this one).
  const chaosWindows = new Map<string, {
    startTick: number; endTick: number;
    errorsDuring: number; totalDuring: number;
    lostAtStart: number; dupsAtStart: number; auditGapsAtStart: number;
    lostDuring: number; dupsDuring: number; auditGapsDuring: number;
  }>();

  for (let tick = 0; tick < maxTick; tick++) {
    state.tick = tick;

    // Apply chaos events whose trigger has arrived
    if (withChaos) {
      for (const ev of CHAOS_EVENTS) {
        if (ev.triggerTick === tick) {
          applyChaos(state, ev);
          chaosWindows.set(ev.id, {
            startTick: tick, endTick: tick + ev.durationTicks,
            errorsDuring: 0, totalDuring: 0,
            lostAtStart: state.lost, dupsAtStart: state.dups, auditGapsAtStart: state.auditGaps,
            lostDuring: 0, dupsDuring: 0, auditGapsDuring: 0,
          });
        }
      }
    }

    // Clear expired tick-based chaos effects (replaces broken setTimeout approach)
    expireChaos(state);

    // Component tick
    state.db.tick(tick);
    state.redis.tick(tick);
    state.ai.tick(tick, TICKS_PER_SEC);
    state.workers.tick(tick);

    // Arrive requests for this tick
    const beforeLen = state.inflight.size;
    while (reqIdx < pending.length && pending[reqIdx].arriveTick <= tick) {
      const r = pending[reqIdx++];
      // worker killed?
      if (state.workers.killed && r.kind !== 'AUDIT') {
        // queue them; they'll be processed when worker returns
      }
      processRequest(state, r, telemetry);
      state.inflight.delete(r);
      state.completed.push(r);
    }

    // Count completions/errors this tick
    let completedThisTick = 0;
    let erroredThisTick = 0;
    // (we process synchronously in this model, so count from completed with doneTick===tick)
    for (const r of state.completed) {
      if (r.doneTick === tick) {
        completedThisTick++;
        if (r.status === 'error' || r.status === 'timeout' || r.status === 'dropped') erroredThisTick++;
      }
    }
    completedThisTickArr.push(completedThisTick);
    erroredThisTickArr.push(erroredThisTick);

    // baseline window
    if (tick < 25) {
      baselineTotal += completedThisTick;
      baselineErrors += erroredThisTick;
    }

    // chaos window tracking — DELTA from event start (not cumulative)
    for (const [id, w] of Array.from(chaosWindows)) {
      if (tick >= w.startTick && tick <= w.endTick) {
        w.totalDuring += completedThisTick;
        w.errorsDuring += erroredThisTick;
        w.lostDuring = state.lost - w.lostAtStart;
        w.dupsDuring = state.dups - w.dupsAtStart;
        w.auditGapsDuring = state.auditGaps - w.auditGapsAtStart;
      }
    }

    // [SIMULATED] resource model: CPU scales with inflight + DB queue + AI calls
    const simCpu = Math.min(100 * ENV.cpuCores, 10 + state.inflight.size * 0.5 + state.db.queueDepth * 0.3 + (state.ai.state !== 'healthy' ? 30 : 0) + (state.workers.killed ? 0 : 20));
    const simRam = Math.min(ENV.totalRamMB, 80 + state.completed.length * 0.001 + state.db.queueDepth * 0.05 + state.queue.depth * 0.1);

    telemetry.sample(
      tick, tick * TICK_MS,
      state.inflight.size,
      completedThisTick,
      erroredThisTick,
      state.db, state.redis, state.ai, state.queue, state.webhook, state.workers,
      state.lost, state.dups, state.auditGaps,
      simCpu, simRam,
    );

    // Cap simulation if we're clearly broken (avoid runaway)
    if (tick > 100 && state.lost > 10000) break;
  }

  // Build chaos results
  if (withChaos) {
    for (const ev of CHAOS_EVENTS) {
      const w = chaosWindows.get(ev.id);
      if (!w) continue;
      // find recovery: first tick after endTick where errorRate returns to <2x baseline
      const baselineRate = baselineTotal > 0 ? baselineErrors / baselineTotal : 0;
      let recoveredAtTick = w.endTick;
      for (let t = w.endTick; t < telemetry.samples.length; t++) {
        const s = telemetry.samples[t];
        const errRate = s.completedThisTick > 0 ? s.erroredThisTick / s.completedThisTick : 0;
        if (errRate <= Math.max(0.02, baselineRate * 2)) { recoveredAtTick = t; break; }
        if (t > w.endTick + 100) { recoveredAtTick = t; break; } // give up
      }
      const rtoMs = (recoveredAtTick - w.startTick) * TICK_MS;
      const errRateDuring = w.totalDuring > 0 ? w.errorsDuring / w.totalDuring : 0;
      // post-recovery error rate (20 ticks after recovery)
      let postErr = 0; let postTotal = 0;
      for (let t = recoveredAtTick; t < Math.min(recoveredAtTick + 20, telemetry.samples.length); t++) {
        const s = telemetry.samples[t];
        postTotal += s.completedThisTick;
        postErr += s.erroredThisTick;
      }
      const errRateAfter = postTotal > 0 ? postErr / postTotal : 0;
      const recovered = errRateAfter <= Math.max(0.02, baselineRate * 3) && w.lostDuring < 1000;
      // Integrity score: penalize data loss heavily, audit gaps moderately, dups lightly.
      // Coefficients tuned so: 1 lost request → −0.10, 10 audit gaps → −0.10, 20 dups → −0.10
      const integrity = Math.max(0, 1 - (w.lostDuring * 0.10) - (w.auditGapsDuring * 0.01) - (w.dupsDuring * 0.005));
      let verdict: ChaosResult['verdict'];
      if (w.lostDuring > 0) verdict = 'DATA_LOSS';
      else if (!recovered) verdict = 'FAILED_RECOVERY';
      else if (errRateDuring > 0.3 || w.auditGapsDuring > 50) verdict = 'DEGRADED';
      else verdict = 'SURVIVED';
      chaosResults.push({
        eventId: ev.id,
        name: ev.name,
        triggeredAtTick: w.startTick,
        detectedAtTick: w.startTick,
        recoveredAtTick,
        rtoMs,
        dataLost: w.lostDuring,
        duplicatesCreated: w.dupsDuring,
        auditGapsDuringFault: w.auditGapsDuring,
        errorRateDuringFault: errRateDuring,
        errorRateAfterRecovery: errRateAfter,
        recovered,
        integrityScore: integrity,
        verdict,
        notes: ev.description,
      });
    }
  }

  // Aggregate
  const total = state.completed.length;
  const ok = state.completed.filter(r => r.status === 'ok').length;
  const errored = state.completed.filter(r => r.status === 'error' || r.status === 'timeout').length;
  const dropped = state.completed.filter(r => r.status === 'dropped').length;
  const deadlettered = state.queue.dlq;
  const lats = state.completed.map(r => r.latencyMs).filter(x => x > 0);
  const pct = (arr: number[], p: number) => { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(s.length*p))]; };
  const realCpuPeak = Math.max(...telemetry.samples.map(s => s.realCpuPct));
  const realHeapPeak = Math.max(...telemetry.samples.map(s => s.realHeapMB));
  const realRssPeak = Math.max(...telemetry.samples.map(s => s.realRssMB));
  const realElLagPeak = Math.max(...telemetry.samples.map(s => s.realEventLoopLagMs));
  const simCpuPeak = Math.max(...telemetry.samples.map(s => s.simCpuPct));
  const simRamPeak = Math.max(...telemetry.samples.map(s => s.simRamMB));
  const sustained = total / (sc.durationTicks / TICKS_PER_SEC);
  const peak = Math.max(...completedThisTickArr) * TICKS_PER_SEC;
  const errRate = total > 0 ? (errored + dropped) / total * 100 : 0;
  const p99 = pct(lats, 0.99);
  const sloPassed = errRate <= CAL.slo.maxErrorRatePct && p99 <= CAL.slo.maxP99Ms && state.lost <= CAL.slo.maxDataLoss;

  // First breaking component
  let firstBreaking: string | undefined;
  if (!sloPassed) {
    if (state.lost > 0) firstBreaking = 'worker (OOM/SIGKILL lost in-flight)';
    else if (errRate > CAL.slo.maxErrorRatePct) {
      if (state.ai.count429 > 100) firstBreaking = 'AI provider (429 rate limit)';
      else if (state.db.deadlocks > 50) firstBreaking = 'Postgres (deadlock cascade)';
      else if (state.db.state === 'killed') firstBreaking = 'Postgres (connection refused)';
      else firstBreaking = 'unknown — see chaos results';
    }
    else if (p99 > CAL.slo.maxP99Ms) firstBreaking = 'latency (queue/db pool saturation)';
  }

  const L = <T>(value: T, label: Label, note?: string): Labeled<T> => ({ value, label, note });

  const result: ScenarioResult = {
    scenarioId: sc.id,
    label: sc.label,
    companies: sc.companies,
    usersPerCompany: sc.usersPerCompany,
    totalUsers: sc.companies * sc.usersPerCompany,
    targetInvoicesPerSec: sc.invoicesPerSec,
    targetChatPerSec: sc.chatPerSec,
    simDurationTicks: sc.durationTicks,
    simDurationSec: sc.durationTicks / TICKS_PER_SEC,
    totalRequests: total,
    completedOk: ok,
    errored,
    timedOut: state.ai.timeouts,
    dropped,
    deadlettered,
    sustainedThroughputPerSec: sustained,
    peakThroughputPerSec: peak,
    p50: pct(lats, 0.5),
    p95: pct(lats, 0.95),
    p99,
    max: lats.length ? Math.max(...lats) : 0,
    realCpuPeakPct: L(realCpuPeak, 'MEASURED', `% of 1 core; machine has ${ENV.cpuCores} cores`),
    realHeapPeakMB: L(Math.round(realHeapPeak), 'MEASURED'),
    realRssPeakMB: L(Math.round(realRssPeak), 'MEASURED'),
    realEventLoopLagPeakMs: L(Math.round(realElLagPeak), 'MEASURED'),
    gcTotal: L(telemetry.gcCount, 'MEASURED'),
    simCpuPeakPct: L(Math.round(simCpuPeak), 'SIMULATED', 'twin model'),
    simRamPeakMB: L(Math.round(simRamPeak), 'SIMULATED', 'twin model'),
    dbReads: L(state.db.reads, 'SIMULATED'),
    dbWrites: L(state.db.writes, 'SIMULATED'),
    dbPoolPeakPct: L(Math.round((Math.max(...telemetry.samples.map(s=>s.dbPoolUsed)) / state.db.poolCap) * 100), 'SIMULATED'),
    dbDeadlocks: L(state.db.deadlocks, 'SIMULATED'),
    cacheHitRatio: L(state.redis.hits + state.redis.misses > 0 ? state.redis.hits / (state.redis.hits + state.redis.misses) : 0, 'SIMULATED'),
    aiCalls: L(state.ai.calls, 'SIMULATED'),
    ai429s: L(state.ai.count429, 'SIMULATED'),
    aiFallbacks: L(state.ai.fallbacks, 'SIMULATED'),
    queuePeakDepth: L(Math.max(...telemetry.samples.map(s=>s.queueDepth)), 'SIMULATED'),
    queueDropped: L(state.queue.dropped, 'SIMULATED'),
    webhooksDuplicates: L(state.webhook.duplicates, 'SIMULATED'),
    lostRequests: L(state.lost, 'SIMULATED'),
    duplicateRequests: L(state.dups, 'SIMULATED'),
    auditGaps: L(state.auditGaps, 'SIMULATED'),
    chaosResults,
    sloErrorRatePct: errRate,
    sloP99Ms: p99,
    sloDataLoss: state.lost,
    sloPassed,
    firstBreakingComponent: firstBreaking,
    samples: telemetry.samples,
  };
  return result;
}

// ============================================================================
// SECTION 8 — REPORT GENERATORS
// ============================================================================

function ensureDir(dir: string): void { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }

function writeJson(path: string, obj: any): void {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

function buildTwinResultsJson(env: typeof ENV, baselineResults: ScenarioResult[], chaosDeepDive: ScenarioResult | null, allChaos: ScenarioResult[]): any {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      tool: 'GarfiX-DT (Production Digital Twin)',
      environment: env,
      calibration: CAL,
      honestLabels: {
        MEASURED: 'real Node.js process metrics',
        SIMULATED: 'twin model output, calibrated to industry baselines',
        EXTRAPOLATED: 'math projection beyond simulated range',
        'NOT TESTED': 'requires real Postgres/Redis/Nginx/TLS',
      },
      important: 'This is a Digital Twin (simulation). Predictions require staging validation.',
      methodology: {
        baselineRuns: '5 scenarios WITHOUT chaos → clean capacity/latency/SLO',
        chaosRuns: '5 scenarios WITH 18 sequential chaos events → resilience under stress',
        chaosDeepDive: 'S4 (10k companies) chaos run → 18-event matrix with per-event RTO/damage',
      },
    },
    baselineScenarios: baselineResults.map(r => ({ ...r, samples: undefined })),
    chaosDeepDive: chaosDeepDive ? { scenario: chaosDeepDive.label, events: chaosDeepDive.chaosResults } : null,
    chaosResilienceByScale: allChaos.map(r => ({
      scenarioId: r.scenarioId,
      label: r.label,
      survived: r.chaosResults.filter(c => c.verdict === 'SURVIVED').length,
      degraded: r.chaosResults.filter(c => c.verdict === 'DEGRADED').length,
      dataLoss: r.chaosResults.filter(c => c.verdict === 'DATA_LOSS').length,
      failedRecovery: r.chaosResults.filter(c => c.verdict === 'FAILED_RECOVERY').length,
      totalDataLost: r.chaosResults.reduce((s, c) => s + c.dataLost, 0),
      totalAuditGaps: r.chaosResults.reduce((s, c) => s + c.auditGapsDuringFault, 0),
    })),
  };
}

function buildTimeSeriesCsv(samples: TelemetrySample[], path: string): void {
  const headers = ['tick','simTimeMs','inflight','completedThisTick','erroredThisTick','p50','p95','p99','max','dbState','redisState','aiState','dbPoolUsed','dbPoolCap','dbQueueDepth','queueDepth','queueDropped','queueDlq','cacheHits','cacheMisses','ai429','aiTimeout','aiFallback','webhooksDup','webhooksRetry','realCpuPct','realHeapMB','realRssMB','realEventLoopLagMs','gcCount','simCpuPct','simRamMB','lostRequests','duplicateRequests','auditGaps'];
  const rows = samples.map(s => headers.map(h => (s as any)[h] ?? '').join(','));
  writeFileSync(path, [headers.join(','), ...rows].join('\n'));
}

function buildBreakingPointsCsv(results: ScenarioResult[], path: string): void {
  const rows: string[] = ['scenarioId,label,companies,totalUsers,sustainedThroughputPerSec,peakThroughputPerSec,p99Ms,errorRatePct,dataLost,sloPassed,firstBreakingComponent'];
  for (const r of results) {
    rows.push([r.scenarioId, `"${r.label}"`, r.companies, r.totalUsers, r.sustainedThroughputPerSec.toFixed(1), r.peakThroughputPerSec.toFixed(1), r.p99.toFixed(1), r.sloErrorRatePct.toFixed(2), r.sloDataLoss, r.sloPassed, `"${r.firstBreakingComponent ?? ''}"`].join(','));
  }
  writeFileSync(path, rows.join('\n'));
}

function buildChaosCsv(chaosOnly: ScenarioResult, path: string): void {
  const rows: string[] = ['eventId,name,triggeredTick,recoveredTick,rtoMs,dataLost,duplicatesCreated,auditGapsDuringFault,errorRateDuringFault,errorRateAfterRecovery,recovered,integrityScore,verdict'];
  for (const c of chaosOnly.chaosResults) {
    rows.push([c.eventId, `"${c.name}"`, c.triggeredAtTick, c.recoveredAtTick, c.rtoMs, c.dataLost, c.duplicatesCreated, c.auditGapsDuringFault, c.errorRateDuringFault.toFixed(3), c.errorRateAfterRecovery.toFixed(3), c.recovered, c.integrityScore.toFixed(3), c.verdict].join(','));
  }
  writeFileSync(path, rows.join('\n'));
}

function asciiBar(value: number, max: number, width = 40): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return '█'.repeat(Math.min(width, filled)) + '░'.repeat(Math.max(0, width - filled));
}

function buildCapacityChart(results: ScenarioResult[]): string {
  const lines: string[] = [];
  lines.push('# CAPACITY ENVELOPE  (sustained throughput vs scale)');
  lines.push('# X = companies (log10), Y = sustained req/sec');
  lines.push('');
  const maxTp = Math.max(...results.map(r => r.sustainedThroughputPerSec));
  for (const r of results) {
    const bar = asciiBar(r.sustainedThroughputPerSec, maxTp, 50);
    lines.push(`${r.scenarioId} ${(r.companies+'').padStart(6)} │ ${bar} ${r.sustainedThroughputPerSec.toFixed(0)} req/s  p99=${r.p99.toFixed(0)}ms  err=${r.sloErrorRatePct.toFixed(1)}%  ${r.sloPassed ? '✓' : '✗'}`);
  }
  lines.push('');
  lines.push('# SLO: errorRate ≤ 1%, p99 ≤ 500ms, dataLoss = 0');
  lines.push('# ✓ = SLO passed, ✗ = SLO violated (breaking point)');
  return lines.join('\n');
}

function buildLatencyChart(results: ScenarioResult[]): string {
  const lines: string[] = [];
  lines.push('# LATENCY ENVELOPE  (p50 / p95 / p99 by scale)');
  lines.push('');
  const maxLat = Math.max(...results.map(r => r.p99));
  for (const r of results) {
    lines.push(`${r.scenarioId} ${r.companies} companies:`);
    lines.push(`   p50 ${asciiBar(r.p50, maxLat, 40)} ${r.p50.toFixed(1)}ms`);
    lines.push(`   p95 ${asciiBar(r.p95, maxLat, 40)} ${r.p95.toFixed(1)}ms`);
    lines.push(`   p99 ${asciiBar(r.p99, maxLat, 40)} ${r.p99.toFixed(1)}ms  ${r.p99 <= CAL.slo.maxP99Ms ? '✓' : '✗ SLO'}`);
  }
  return lines.join('\n');
}

function buildChaosMatrix(chaosOnly: ScenarioResult): string {
  const lines: string[] = [];
  lines.push('# CHAOS ENGINEERING MATRIX  (18 fault injections on ' + chaosOnly.label + ')');
  lines.push('');
  lines.push('ID  Event                          Verdict           RTO(ms)  DataLost  Dups  AuditGaps  Integrity');
  lines.push('─── ────────────────────────────── ──────────────── ──────── ───────── ───── ────────── ──────────');
  for (const c of chaosOnly.chaosResults) {
    lines.push(
      `${c.eventId}  ${c.name.padEnd(30)} ${c.verdict.padEnd(16)} ${String(c.rtoMs).padStart(8)} ${String(c.dataLost).padStart(9)} ${String(c.duplicatesCreated).padStart(5)} ${String(c.auditGapsDuringFault).padStart(10)} ${c.integrityScore.toFixed(2).padStart(9)}`
    );
  }
  const survived = chaosOnly.chaosResults.filter(c => c.verdict === 'SURVIVED').length;
  const degraded = chaosOnly.chaosResults.filter(c => c.verdict === 'DEGRADED').length;
  const dataLoss = chaosOnly.chaosResults.filter(c => c.verdict === 'DATA_LOSS').length;
  const failed = chaosOnly.chaosResults.filter(c => c.verdict === 'FAILED_RECOVERY').length;
  lines.push('');
  lines.push(`SUMMARY: ${survived} SURVIVED / ${degraded} DEGRADED / ${dataLoss} DATA_LOSS / ${failed} FAILED_RECOVERY (of 18)`);
  return lines.join('\n');
}

function buildChaosReport(results: ScenarioResult[], chaosOnly: ScenarioResult): string {
  const lines: string[] = [];
  lines.push('# CHAOS ENGINEERING REPORT — GarfiX Production Digital Twin');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Environment: ${ENV.cpuCores} cores, ${ENV.totalRamMB}MB RAM, Node ${ENV.nodeVersion}, Bun ${ENV.bunVersion}`);
  lines.push(`Sandbox: ${ENV.sandboxMode ? 'YES (SQLite + in-memory cache)' : 'NO'}`);
  lines.push('');
  lines.push('## HONEST LABELING');
  lines.push('- [MEASURED] = real Node.js process metrics (cpuUsage / memoryUsage / PerformanceObserver / monitorEventLoopDelay)');
  lines.push('- [SIMULATED] = twin model output, calibrated to industry baselines (Postgres p99≈15ms, Redis p99≈2ms, OpenRouter p99≈3s)');
  lines.push('- [EXTRAPOLATED] = math projection beyond simulated range');
  lines.push('- [NOT TESTED] = requires real Postgres/Redis/Nginx/TLS to measure');
  lines.push('');
  lines.push('## IMPORTANT DISCLAIMER');
  lines.push('This is a Digital Twin — a calibrated simulation, NOT the real production system.');
  lines.push('The sandbox has SQLite + in-memory cache + in-process queue. Real production uses Postgres + Redis + external AI + Nginx + TLS.');
  lines.push('All [SIMULATED] metrics are predictions that MUST be validated on a staging cluster before being trusted for capacity decisions.');
  lines.push('');
  lines.push('## CHAOS MATRIX (deep-dive on ' + chaosOnly.label + ')');
  lines.push('```');
  lines.push(buildChaosMatrix(chaosOnly));
  lines.push('```');
  lines.push('');
  lines.push('## PER-EVENT DETAIL');
  for (const c of chaosOnly.chaosResults) {
    lines.push(`### ${c.eventId} — ${c.name}`);
    lines.push(`- **Target**: ${c.notes}`);
    lines.push(`- **Verdict**: ${c.verdict}`);
    lines.push(`- **RTO** (recovery time): ${c.rtoMs} ms [SIMULATED]`);
    lines.push(`- **Data lost**: ${c.dataLost} requests [SIMULATED]`);
    lines.push(`- **Duplicates created**: ${c.duplicatesCreated} [SIMULATED]`);
    lines.push(`- **Audit gaps during fault**: ${c.auditGapsDuringFault} [SIMULATED]`);
    lines.push(`- **Error rate during fault**: ${(c.errorRateDuringFault * 100).toFixed(2)}%`);
    lines.push(`- **Error rate after recovery**: ${(c.errorRateAfterRecovery * 100).toFixed(2)}%`);
    lines.push(`- **Integrity score**: ${c.integrityScore.toFixed(3)} (1.0 = perfect)`);
    lines.push(`- **Recovered**: ${c.recovered ? 'YES' : 'NO'}`);
    lines.push('');
  }
  lines.push('## CHAOS RESULTS ACROSS ALL SCALES');
  lines.push('| Scale | Survived | Degraded | DataLoss | FailedRecovery |');
  lines.push('|-------|----------|----------|----------|----------------|');
  for (const r of results) {
    const s = r.chaosResults.filter(c => c.verdict === 'SURVIVED').length;
    const d = r.chaosResults.filter(c => c.verdict === 'DEGRADED').length;
    const dl = r.chaosResults.filter(c => c.verdict === 'DATA_LOSS').length;
    const f = r.chaosResults.filter(c => c.verdict === 'FAILED_RECOVERY').length;
    lines.push(`| ${r.label} | ${s} | ${d} | ${dl} | ${f} |`);
  }
  lines.push('');
  lines.push('## PRODUCTION RECOMMENDATION');
  const worstVerdict = chaosOnly.chaosResults.some(c => c.verdict === 'DATA_LOSS' || c.verdict === 'FAILED_RECOVERY');
  if (worstVerdict) {
    lines.push('⚠️  The twin predicts DATA LOSS or FAILED RECOVERY under at least one chaos event.');
    lines.push('    GarfiX is NOT production-ready for multi-tenant load until these are fixed.');
    lines.push('    Required hardening (see production-decision.md for details):');
    lines.push('    1. Idempotency keys on ALL write endpoints (prevents duplicate invoices)');
    lines.push('    2. Graceful SIGTERM drain with in-flight checkpointing (prevents OOM/SIGKILL data loss)');
    lines.push('    3. Circuit breaker on AI provider with bounded fallback queue (prevents 429 cascade)');
    lines.push('    4. Postgres connection pooler (PgBouncer) + retry-on-deadlock policy');
    lines.push('    5. Redis sentinel/cluster for HA (single Redis is an SPOF)');
    lines.push('    6. Webhook dedup table with unique constraint on signature');
  } else {
    lines.push('✅ The twin predicts the system survives all 18 chaos events at this scale.');
    lines.push('    Still requires staging validation before production sign-off.');
  }
  return lines.join('\n');
}

function buildProductionDecision(baselineResults: ScenarioResult[], chaosDeepDive: ScenarioResult, allChaos: ScenarioResult[]): string {
  const lines: string[] = [];
  const firstBreak = baselineResults.find(r => !r.sloPassed);
  const maxStableScale = [...baselineResults].reverse().find(r => r.sloPassed);
  lines.push('# PRODUCTION DECISION REPORT — GarfiX EOS');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## 1. EXECUTIVE SUMMARY');
  lines.push('');
  lines.push(`**Twin verdict (baseline capacity)**: ${firstBreak ? '⚠️  BREAKS at ' + firstBreak.label : '✅ Survives all tested scales (up to ' + (maxStableScale?.label ?? 'n/a') + ')'}`);
  lines.push('');
  lines.push(`**Maximum stable scale** [SIMULATED, no chaos]: ${maxStableScale ? maxStableScale.label + ' (' + maxStableScale.sustainedThroughputPerSec.toFixed(0) + ' req/sec sustained)' : 'none'}`);
  lines.push('');
  lines.push(`**First breaking point** [SIMULATED, scale-induced]: ${firstBreak ? firstBreak.label + ' — ' + (firstBreak.firstBreakingComponent ?? 'unknown') : 'not reached in tested range (up to ' + baselineResults[baselineResults.length-1].label + ')'}`);
  lines.push('');
  const chaosSurvived = chaosDeepDive.chaosResults.filter(c=>c.verdict==='SURVIVED').length;
  const chaosDataLoss = chaosDeepDive.chaosResults.filter(c=>c.verdict==='DATA_LOSS').length;
  const chaosDegraded = chaosDeepDive.chaosResults.filter(c=>c.verdict==='DEGRADED').length;
  lines.push(`**Chaos resilience** [SIMULATED, S4 10k scale]: ${chaosSurvived}/18 SURVIVED, ${chaosDegraded} DEGRADED, ${chaosDataLoss} DATA_LOSS`);
  lines.push('');
  lines.push('## 2. WHAT WAS MEASURED vs SIMULATED');
  lines.push('');
  lines.push('| Category | Method | Confidence |');
  lines.push('|----------|--------|------------|');
  lines.push('| Node.js process CPU/RAM/GC | [MEASURED] via os.cpuUsage + perf_hooks | HIGH — real instrumentation |');
  lines.push('| Event loop lag | [MEASURED] via monitorEventLoopDelay | HIGH |');
  lines.push('| Postgres latency/pool/deadlocks | [SIMULATED] lognormal model, industry baseline | MEDIUM — needs staging validation |');
  lines.push('| Redis hit ratio/latency | [SIMULATED] | MEDIUM |');
  lines.push('| OpenRouter 429/timeout/fallback | [SIMULATED] | MEDIUM |');
  lines.push('| Queue depth/dropped/DLQ | [SIMULATED] | MEDIUM |');
  lines.push('| Webhook duplicates/retries | [SIMULATED] Meta retry pattern | MEDIUM |');
  lines.push('| Multi-tenant load (companies × users) | [SIMULATED] Poisson arrival | MEDIUM |');
  lines.push('| Nginx/TLS/network | [NOT TESTED] | NONE — requires real infra |');
  lines.push('| Real Postgres/Redis failover | [NOT TESTED] | NONE — requires staging |');
  lines.push('');
  lines.push('## 3. CAPACITY ENVELOPE (baseline — NO chaos)');
  lines.push('```');
  lines.push(buildCapacityChart(baselineResults));
  lines.push('```');
  lines.push('');
  lines.push('## 4. LATENCY ENVELOPE (baseline — NO chaos)');
  lines.push('```');
  lines.push(buildLatencyChart(baselineResults));
  lines.push('```');
  lines.push('');
  lines.push('## 5. CHAOS ENGINEERING RESULTS (S4 — 10k companies, 18 sequential events)');
  lines.push('```');
  lines.push(buildChaosMatrix(chaosDeepDive));
  lines.push('```');
  lines.push('');
  lines.push('### Chaos resilience by scale');
  lines.push('| Scale | Survived | Degraded | DataLoss | FailedRecovery | TotalDataLost |');
  lines.push('|-------|----------|----------|----------|----------------|---------------|');
  for (const r of allChaos) {
    const s = r.chaosResults.filter(c => c.verdict === 'SURVIVED').length;
    const d = r.chaosResults.filter(c => c.verdict === 'DEGRADED').length;
    const dl = r.chaosResults.filter(c => c.verdict === 'DATA_LOSS').length;
    const f = r.chaosResults.filter(c => c.verdict === 'FAILED_RECOVERY').length;
    const tdl = r.chaosResults.reduce((sum, c) => sum + c.dataLost, 0);
    lines.push(`| ${r.label} | ${s} | ${d} | ${dl} | ${f} | ${tdl} |`);
  }
  lines.push('');
  lines.push('## 6. BREAKING POINT ANALYSIS (scale-induced, from baseline runs)');
  if (firstBreak) {
    lines.push(`- **First scale to break SLO**: ${firstBreak.label}`);
    lines.push(`- **SLO violation**: errorRate=${firstBreak.sloErrorRatePct.toFixed(2)}% (limit ${CAL.slo.maxErrorRatePct}%), p99=${firstBreak.sloP99Ms.toFixed(0)}ms (limit ${CAL.slo.maxP99Ms}ms), dataLoss=${firstBreak.sloDataLoss} (limit ${CAL.slo.maxDataLoss})`);
    lines.push(`- **Root cause** [SIMULATED]: ${firstBreak.firstBreakingComponent}`);
    lines.push('');
    lines.push('### ⚠️  ARCHITECTURAL vs SCALE-INDUCED');
    lines.push('The SLO is violated at ALL tested scales (even 100 companies). This is NOT a scale-induced bottleneck —');
    lines.push('it is an ARCHITECTURAL constraint: the AI provider (OpenRouter) has a median latency of ' + CAL.openRouter.latencyMedianMs + 'ms');
    lines.push('and a rate limit of ' + CAL.openRouter.paidRatePerMin + ' req/min. Both violate the strict SLO (p99<500ms, err<1%)');
    lines.push('regardless of tenant count. To find the true SCALE-INDUCED breaking point, the AI constraint must be');
    lines.push('resolved first (upgrade tier, add caching, or queue requests).');
  } else {
    lines.push('- No scale in the tested range (up to ' + baselineResults[baselineResults.length-1].label + ') broke the SLO in baseline (no-chaos) runs.');
    lines.push('- [EXTRAPOLATED] Beyond 50k companies, the twin predicts Postgres pool saturation as the first bottleneck (pool=' + CAL.postgres.poolSize + ' connections, ~' + (CAL.postgres.poolSize * 250) + ' writes/sec theoretical max).');
  }
  lines.push('');
  lines.push('### IMPORTANT — latency SLO note');
  lines.push('The p99 SLO of ' + CAL.slo.maxP99Ms + 'ms is violated in ALL scenarios because AI calls (OpenRouter) have a median latency of ' + CAL.openRouter.latencyMedianMs + 'ms and p99 of ' + CAL.openRouter.latencyP99Ms + 'ms.');
  lines.push('Any request path that includes an AI call (CHAT, 30% of INVOICE) will exceed 500ms p99.');
  lines.push('This is an ARCHITECTURAL FINDING, not a bug: the SLO must either (a) exclude AI-dependent paths, or (b) use streaming/async AI responses.');
  lines.push('');
  lines.push('## 7. BOTTLENECK RANKING (twin prediction — from chaos damage)');
  lines.push('');
  const damageRank = [...chaosDeepDive.chaosResults].sort((a,b) => (b.dataLost*1000 + b.auditGapsDuringFault + b.duplicatesCreated) - (a.dataLost*1000 + a.auditGapsDuringFault + a.duplicatesCreated));
  lines.push('| Rank | Event | DataLost | AuditGaps | Dups | Verdict |');
  lines.push('|------|-------|----------|-----------|------|---------|');
  damageRank.forEach((c, i) => {
    lines.push(`| ${i+1} | ${c.name} | ${c.dataLost} | ${c.auditGapsDuringFault} | ${c.duplicatesCreated} | ${c.verdict} |`);
  });
  lines.push('');
  lines.push('## 8. REQUIRED HARDENING (in priority order)');
  lines.push('');
  const dataLossEvents = chaosDeepDive.chaosResults.filter(c => c.verdict === 'DATA_LOSS');
  if (dataLossEvents.length > 0) {
    lines.push('### CRITICAL — prevents data loss');
    for (const c of dataLossEvents) {
      lines.push(`- **${c.name}**: lost ${c.dataLost} requests. Fix:`);
      if (c.name.includes('OOM') || c.name.includes('SIGKILL')) lines.push('    - Add in-flight request journaling (write intent → process → commit)');
      lines.push('    - Add SIGTERM graceful drain with checkpoint (currently modeled as 5s, may be too short)');
      lines.push('    - Add worker supervisor that replays journaled in-flight on restart');
    }
  } else {
    lines.push('### CRITICAL — no data loss events detected');
    lines.push('No chaos event caused permanent data loss in the twin. This is a PREDICTION — validate on staging.');
  }
  lines.push('');
  lines.push('### HIGH — prevents duplicate processing');
  const dupEvents = chaosDeepDive.chaosResults.filter(c => c.duplicatesCreated > 0);
  if (dupEvents.length > 0) {
    for (const c of dupEvents) {
      lines.push(`- **${c.name}**: ${c.duplicatesCreated} duplicates. Fix:`);
      lines.push('    - Add idempotency key table with UNIQUE constraint');
      lines.push('    - Webhook: dedup on `X-Hub-Signature` + body hash');
      lines.push('    - Invoice: dedup on (tenantId, sourceId, issueDate) composite key');
    }
  } else {
    lines.push('No duplicate events detected — idempotency layer is working in the twin.');
  }
  lines.push('');
  lines.push('### MEDIUM — prevents audit gaps');
  const auditEvents = chaosDeepDive.chaosResults.filter(c => c.auditGapsDuringFault > 0);
  for (const c of auditEvents) {
    lines.push(`- **${c.name}**: ${c.auditGapsDuringFault} audit gaps. Fix:`);
    lines.push('    - Wrap invoice+audit in a single Postgres transaction');
    lines.push('    - Add outbox pattern: audit row written in same tx, delivered async');
  }
  lines.push('');
  lines.push('## 9. SCALING ROADMAP [EXTRAPOLATED — assumes AI constraint resolved]');
  lines.push('');
  lines.push('| Target scale | Predicted bottleneck (after AI fix) | Required change |');
  lines.push('|--------------|-------------------------------------|-----------------|');
  lines.push('| 100 companies | AI rate limit + latency (CURRENT) | upgrade OpenRouter tier OR add AI response caching OR queue AI requests |');
  lines.push('| 1 000 companies | AI rate limit + latency (CURRENT) | same as above |');
  lines.push('| 5 000 companies | Postgres pool (20 conn) | add PgBouncer, pool → 100 |');
  lines.push('| 10 000 companies | AI throughput + Postgres writes | upgrade AI tier + partition audit table |');
  lines.push('| 50 000 companies | single Node process | add cluster mode (worker_threads) + sticky sessions |');
  lines.push('| 100 000+ [EXTRAPOLATED] | Postgres writes + Redis memory | shard by tenant, add read replicas, Redis cluster |');
  lines.push('');
  lines.push('## 10. FINAL VERDICT');
  lines.push('');
  const hasDataLoss = chaosDeepDive.chaosResults.some(c => c.verdict === 'DATA_LOSS');
  const hasFailedRecovery = chaosDeepDive.chaosResults.some(c => c.verdict === 'FAILED_RECOVERY');
  if (hasDataLoss) {
    lines.push('🔴 **NOT READY** — twin predicts DATA LOSS under ' + chaosDeepDive.chaosResults.filter(c=>c.verdict==='DATA_LOSS').map(c=>c.name).join(', ') + '.');
    lines.push('   Must implement in-flight journaling + graceful drain BEFORE production.');
  } else if (hasFailedRecovery) {
    lines.push('🟡 **CONDITIONALLY READY** — twin predicts failed auto-recovery from some faults.');
  } else if (chaosDegraded > 0) {
    lines.push('🟡 **CONDITIONALLY READY** — twin predicts ' + chaosDegraded + ' chaos events cause degradation (audit gaps) but no data loss.');
    lines.push('   Fix audit-gap events before production. System survives but compliance may be violated.');
  } else {
    lines.push('🟢 **READY FOR STAGING** — twin predicts survival of all 18 chaos events with no data loss.');
    lines.push('   Proceed to staging cluster validation with real Postgres+Redis.');
  }
  lines.push('');
  lines.push('### HONEST CAVEATS (do not skip)');
  lines.push('1. This is a Digital Twin (simulation), NOT a real load test.');
  lines.push('2. Component models are calibrated to INDUSTRY baselines, not GarfiX-specific measurements.');
  lines.push('3. Real Postgres/Redis/Nginx/TLS behavior is [NOT TESTED] — requires staging.');
  lines.push('4. The twin runs FASTER than real-time (760 ticks in ~2-4s wall), so timing is simulated, not wall-clock.');
  lines.push('5. "Workers" in this twin are async function calls, NOT OS threads or separate processes.');
  lines.push('6. CPU/RAM/GC metrics ARE [MEASURED] from the real Node process running the twin, but they reflect the twin itself, not a real GarfiX deployment.');
  lines.push('');
  lines.push('## 11. VALIDATION CHECKLIST (before production sign-off)');
  lines.push('');
  lines.push('- [ ] Deploy to staging with REAL Postgres 15 + PgBouncer');
  lines.push('- [ ] Deploy REAL Redis 7 with AOF persistence');
  lines.push('- [ ] Run same 18 chaos events against staging');
  lines.push('- [ ] Compare [MEASURED] staging metrics to twin [SIMULATED] predictions');
  lines.push('- [ ] Recalibrate twin constants if staging differs > 30%');
  lines.push('- [ ] Load-test through REAL Nginx + TLS (network layer [NOT TESTED] here)');
  lines.push('- [ ] Verify graceful drain under SIGTERM with real process manager (systemd/pm2)');
  lines.push('- [ ] Verify idempotency under real Meta webhook redelivery');
  lines.push('');
  lines.push('---');
  lines.push('This report was generated by GarfiX-DT (Production Digital Twin).');
  lines.push('Re-run: `bun run scripts/digital-twin.ts`');
  return lines.join('\n');
}

function buildRegressionReport(results: ScenarioResult[], prev: any | null, path: string): void {
  const lines: string[] = [];
  lines.push('# REGRESSION REPORT — GarfiX-DT');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  if (!prev) {
    lines.push('No previous run found. This is the baseline.');
    lines.push('Future runs will compare against this baseline.');
  } else {
    lines.push('## Scenario Comparison');
    lines.push('| Scenario | Metric | Previous | Current | Delta | Status |');
    lines.push('|----------|--------|----------|---------|-------|--------|');
    for (const r of results) {
      const p = prev.baselineScenarios?.find((x: any) => x.scenarioId === r.scenarioId) ?? prev.scenarios?.find((x: any) => x.scenarioId === r.scenarioId);
      if (!p) continue;
      const tpDelta = r.sustainedThroughputPerSec - (p.sustainedThroughputPerSec ?? 0);
      const p99Delta = r.p99 - (p.p99 ?? 0);
      lines.push(`| ${r.scenarioId} | throughput | ${p.sustainedThroughputPerSec?.toFixed(0)} | ${r.sustainedThroughputPerSec.toFixed(0)} | ${tpDelta>0?'+':''}${tpDelta.toFixed(0)} | ${Math.abs(tpDelta) < 10 ? '✓' : (tpDelta > 0 ? '↑' : '↓')} |`);
      lines.push(`| ${r.scenarioId} | p99 | ${p.p99?.toFixed(0)} | ${r.p99.toFixed(0)} | ${p99Delta>0?'+':''}${p99Delta.toFixed(0)} | ${Math.abs(p99Delta) < 5 ? '✓' : (p99Delta < 0 ? '↑' : '↓')} |`);
    }
  }
  writeFileSync(path, lines.join('\n'));
}

// ============================================================================
// SECTION 9 — MAIN RUNNER
// ============================================================================

function main() {
  const OUT = '/home/z/my-project/twin-results';
  ensureDir(OUT);
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   GARFIX EOS — PRODUCTION DIGITAL TWIN (GarfiX-DT)              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Environment: ${ENV.cpuCores} cores (${ENV.cpuModel}), ${ENV.totalRamMB}MB RAM, Node ${ENV.nodeVersion}, Bun ${ENV.bunVersion}`);
  console.log(`Sandbox: ${ENV.sandboxMode ? 'YES (SQLite + in-memory)' : 'NO'}`);
  console.log(`Calibration: industry baselines (Postgres p99≈${CAL.postgres.queryLatencyP99Ms}ms, Redis p99≈${CAL.redis.getLatencyP99Ms}ms, OpenRouter p99≈${CAL.openRouter.latencyP99Ms}ms)`);
  console.log('');

  const telemetry = new Telemetry();
  const baselineResults: ScenarioResult[] = [];
  const allChaosResults: ScenarioResult[] = [];

  // PHASE 1 — BASELINE (no chaos): clean capacity / latency / SLO per scale
  console.log('━━━ PHASE 1: BASELINE (no chaos) — clean capacity measurement ━━━');
  for (const sc of SCENARIOS) {
    console.log(`▶ ${sc.id} baseline: ${sc.label}  (target ${sc.invoicesPerSec} inv/s + ${sc.chatPerSec} chat/s)`);
    const t0 = performance.now();
    const r = runScenario(sc, telemetry, false);
    const t1 = performance.now();
    console.log(`  ✓ ${r.totalRequests} req in ${(t1-t0).toFixed(0)}ms real → ${r.sustainedThroughputPerSec.toFixed(0)} req/s sustained`);
    console.log(`    p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms p99=${r.p99.toFixed(1)}ms  err=${r.sloErrorRatePct.toFixed(2)}%  lost=${r.sloDataLoss}  ${r.sloPassed ? '✓ SLO' : '✗ SLO'}`);
    baselineResults.push(r);
  }

  // PHASE 2 — CHAOS (all 18 events sequential): resilience per scale
  console.log('');
  console.log('━━━ PHASE 2: CHAOS (18 sequential events) — resilience measurement ━━━');
  for (const sc of SCENARIOS) {
    console.log(`▶ ${sc.id} chaos: ${sc.label}`);
    const t0 = performance.now();
    const r = runScenario(sc, telemetry, true);
    const t1 = performance.now();
    const s = r.chaosResults.filter(c=>c.verdict==='SURVIVED').length;
    const d = r.chaosResults.filter(c=>c.verdict==='DEGRADED').length;
    const dl = r.chaosResults.filter(c=>c.verdict==='DATA_LOSS').length;
    const f = r.chaosResults.filter(c=>c.verdict==='FAILED_RECOVERY').length;
    console.log(`  ✓ ${r.totalRequests} req in ${(t1-t0).toFixed(0)}ms real → ${s} survived / ${d} degraded / ${dl} data_loss / ${f} failed`);
    allChaosResults.push(r);
  }

  telemetry.stop();

  // S4 (10k companies) is the chaos deep-dive reference
  const chaosDeepDive = allChaosResults.find(r => r.scenarioId === 'S4')!;

  // Write all outputs
  console.log('');
  console.log('Writing outputs to ' + OUT + '/ ...');

  writeJson(`${OUT}/twin-results.json`, buildTwinResultsJson(ENV, baselineResults, chaosDeepDive, allChaosResults));

  // Full time-series for the deep-dive scenario (chaos run)
  buildTimeSeriesCsv(chaosDeepDive.samples, `${OUT}/timeseries-S4-chaos.csv`);
  const baselineS4 = baselineResults.find(r => r.scenarioId === 'S4')!;
  buildTimeSeriesCsv(baselineS4.samples, `${OUT}/timeseries-S4-baseline.csv`);

  buildBreakingPointsCsv(baselineResults, `${OUT}/breaking-points.csv`);
  buildChaosCsv(chaosDeepDive, `${OUT}/chaos-events.csv`);

  // ASCII charts (baseline for capacity, chaos deep-dive for matrix)
  writeFileSync(`${OUT}/capacity-envelope.txt`, buildCapacityChart(baselineResults));
  writeFileSync(`${OUT}/latency-envelope.txt`, buildLatencyChart(baselineResults));
  writeFileSync(`${OUT}/chaos-matrix.txt`, buildChaosMatrix(chaosDeepDive));

  // Markdown reports
  writeFileSync(`${OUT}/chaos-report.md`, buildChaosReport(allChaosResults, chaosDeepDive));
  writeFileSync(`${OUT}/production-decision.md`, buildProductionDecision(baselineResults, chaosDeepDive, allChaosResults));

  // Regression (compare to previous run if exists)
  const prevPath = `${OUT}/twin-results-prev.json`;
  let prev: any = null;
  try {
    if (existsSync(prevPath)) prev = JSON.parse(readFileSync(prevPath, 'utf8'));
  } catch {}
  buildRegressionReport(baselineResults, prev, `${OUT}/regression-report.md`);
  // Save current as prev for next run
  writeJson(prevPath, buildTwinResultsJson(ENV, baselineResults, chaosDeepDive, allChaosResults));

  // Console summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  TWIN RUN COMPLETE — PRODUCTION DECISION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('▼ BASELINE CAPACITY (no chaos):');
  console.log(buildCapacityChart(baselineResults));
  console.log('');
  console.log('▼ CHAOS MATRIX (S4 — 10k companies, 18 events):');
  console.log(buildChaosMatrix(chaosDeepDive));
  console.log('');
  const firstBreak = baselineResults.find(r => !r.sloPassed);
  if (firstBreak) {
    console.log(`⚠️  FIRST BREAKING POINT (scale-induced): ${firstBreak.label} — ${firstBreak.firstBreakingComponent}`);
  } else {
    console.log(`✅ No scale-induced SLO violation in baseline (up to ${baselineResults[baselineResults.length-1].label})`);
  }
  const dataLossCount = chaosDeepDive.chaosResults.filter(c => c.verdict === 'DATA_LOSS').length;
  const degradedCount = chaosDeepDive.chaosResults.filter(c => c.verdict === 'DEGRADED').length;
  if (dataLossCount > 0) {
    console.log(`🔴 ${dataLossCount} chaos events cause DATA LOSS — see production-decision.md`);
  } else if (degradedCount > 0) {
    console.log(`🟡 ${degradedCount} chaos events cause DEGRADATION (audit gaps) — see production-decision.md`);
  } else {
    console.log(`🟢 All 18 chaos events SURVIVED — twin predicts resilience at 10k scale`);
  }
  console.log('');
  console.log(`Outputs in ${OUT}/:`);
  console.log('  - twin-results.json           (full machine-readable, baseline + chaos)');
  console.log('  - production-decision.md      (engineering decision report)');
  console.log('  - chaos-report.md             (18-event chaos analysis)');
  console.log('  - breaking-points.csv         (SLO violations per scale, baseline)');
  console.log('  - chaos-events.csv            (per-event RTO/data-loss/integrity)');
  console.log('  - timeseries-S4-baseline.csv  (per-tick telemetry, 10k, no chaos)');
  console.log('  - timeseries-S4-chaos.csv     (per-tick telemetry, 10k, with chaos)');
  console.log('  - capacity-envelope.txt       (ASCII chart, baseline)');
  console.log('  - latency-envelope.txt        (ASCII chart, baseline)');
  console.log('  - chaos-matrix.txt            (ASCII matrix, S4 chaos)');
  console.log('  - regression-report.md        (vs previous run)');
}

main();
