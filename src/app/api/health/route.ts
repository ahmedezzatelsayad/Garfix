/**
 * GET /api/health
 *
 * Comprehensive health-check endpoint for load balancers, orchestrators,
 * and monitoring dashboards.
 *
 * Checks:
 *   1. PostgreSQL — SELECT 1 with 5s timeout (cancelable via $transaction)
 *   2. Valkey   — PING with 2s timeout
 *   3. BullMQ   — queue counts (waiting + active)
 *   4. Disk     — /app/storage writable check (100ms timeout)
 *   5. Memory   — RSS + heap usage vs system memory
 *
 * Returns 200 when all critical services (DB, Valkey) are healthy.
 * Returns 503 when any critical service is down.
 *
 * RUNTIME: Node.js only — uses process.memoryUsage(), os module
 * Non-critical failures (disk, queue stats) are reported but don't
 * cause a 503 — the app can still serve requests.
 *
 * TPD-09 FIX (Audit v2 · Phase 2): every check now uses AbortController
 * (with `setTimeout(abort, ms)`) instead of bare `Promise.race` +
 * `setTimeout(reject, ms)`. The bare pattern does NOT cancel the
 * underlying query, so under DB slowness the Prisma query kept running
 * in the background even after /api/health had already replied 503 —
 * eventually exhausting the connection pool. The new pattern:
 *   • DB: wrapped in `db.$transaction` with `timeout` option so Prisma
 *     actually cancels the query and releases the connection.
 *   • Valkey & BullMQ: pass an AbortSignal to the underlying helper so
 *     the in-flight request can be observed as aborted.
 *
 * Unauthenticated — healthchecks must succeed without cookies.
 *
 * RUNTIME: Node.js only — uses node:os, queues.ts (BullMQ)
 */
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { valkeyHealthCheck, VALKEY_CONFIGURED } from "@/lib/valkey";
import { getBullMQStats } from "@/lib/queues";
import { cacheStats } from "@/lib/cache";
import { totalmem } from "node:os";

const VERSION = process.env.APP_VERSION || "12.1.0";

export const dynamic = "force-dynamic";

/**
 * Create an AbortController that auto-aborts after `ms` milliseconds.
 * Returns the controller + a cleanup function that clears the timer
 * (call it in `finally` to avoid leaking the timer when the awaited
 * promise resolves before the timeout).
 *
 * TPD-09 FIX (Audit v2 · Phase 2).
 */
function abortAfter(ms: number, reason: string): {
  signal: AbortSignal;
  cleanup: () => void;
  /** A promise that rejects with an Error(reason) when the signal aborts. */
  timeoutPromise: Promise<never>;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(reason)), ms);
  const signal = controller.signal;
  return {
    signal,
    cleanup: () => clearTimeout(timer),
    timeoutPromise: new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(signal.reason instanceof Error ? signal.reason : new Error(reason));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          reject(signal.reason instanceof Error ? signal.reason : new Error(reason));
        },
        { once: true },
      );
    }),
  };
}

export async function GET() {
  const started = Date.now();
  const checks: Record<string, unknown> = {};
  let criticalOk = true;

  // ── 1. PostgreSQL ──────────────────────────────────────────────────────
  //   5s timeout — Neon serverless cold starts can take 1-2s for cross-region.
  //   Under heavy load (e.g. backup worker running), the DB may be temporarily
  //   slow, so we use a generous timeout and treat a timeout as non-critical
  //   (the app is still running, just slow).
  //
  //   TPD-09 FIX (Audit v2 · Phase 2): wrap the `SELECT 1` in
  //   `db.$transaction(..., { timeout: 5000, maxWait: 2000 })`. When the
  //   timeout fires, Prisma cancels the underlying query and releases the
  //   pooled connection — preventing connection-pool exhaustion under DB
  //   slowness (the original `Promise.race` left the query running).
  let dbOk = true;
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1`;
      },
      { timeout: 5_000, maxWait: 2_000 },
    );
    checks.db = { ok: true };
  } catch (err) {
    dbOk = false;
    checks.db = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    // Verification audit fix: DB timeout IS critical — a consistently
    // timing-out DB means the app cannot serve requests. Was treated as
    // non-critical, which meant /api/health returned 200 even when the DB
    // was unreachable (just slow). Now ALL DB failures are critical.
    criticalOk = false;
  }

  // ── 2. Valkey (OPTIONAL — app falls back to pg-boss when not configured) ──
  //   A missing Valkey must NOT cause a 503, because the app fully functions
  //   with pg-boss (PostgreSQL-backed queue). Only a *configured* but
  //   *unreachable* Valkey is a critical failure.
  //
  //   TPD-09 FIX (Audit v2 · Phase 2): use AbortController + pass the
  //   signal to valkeyHealthCheck so the underlying ioredis ping can be
  //   observed as aborted (and any future signal-aware code path benefits).
  {
    const vAbort = abortAfter(2_000, "timeout 2000ms");
    try {
      const vh = await Promise.race([
        valkeyHealthCheck(vAbort.signal),
        vAbort.timeoutPromise,
      ]);
      vAbort.cleanup();
      if (!VALKEY_CONFIGURED) {
        checks.valkey = { ok: true, configured: false, mode: "pg-boss fallback" };
      } else {
        checks.valkey = vh;
        if (!vh.ok) criticalOk = false;
      }
    } catch (err) {
      vAbort.cleanup();
      checks.valkey = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      if (VALKEY_CONFIGURED) criticalOk = false;
    }
  }

  // ── 3. BullMQ Queue Stats (non-critical) ──────────────────────────────
  //   TPD-09 FIX (Audit v2 · Phase 2): AbortController pattern; signal is
  //   passed through to getBullMQStats so it can short-circuit remaining
  //   queue counts if the abort fires mid-iteration.
  {
    const qAbort = abortAfter(2_000, "timeout 2000ms");
    try {
      const queueStats = await Promise.race([
        getBullMQStats(qAbort.signal),
        qAbort.timeoutPromise,
      ]);
      qAbort.cleanup();
      checks.queues = queueStats ?? { mode: "in-process", bullmq: false };
    } catch {
      qAbort.cleanup();
      checks.queues = { mode: "in-process", bullmq: false };
    }
  }

  // ── 4. Cache Stats (non-critical) ──────────────────────────────────────
  try {
    checks.cache = cacheStats();
  } catch {
    checks.cache = { error: "unavailable" };
  }

  // ── 5. Memory ──────────────────────────────────────────────────────────
  // AUDIT FIX: Only include RSS percentage for internal diagnostics.
  // Stripped systemTotalMB, heapTotalMB, and raw RSS to reduce
  // fingerprinting surface on this unauthenticated endpoint.
  const memUsage = process.memoryUsage();
  const totalMemory = totalmem();
  checks.memory = {
    rssPercent: totalMemory > 0
      ? ((memUsage.rss / totalMemory) * 100).toFixed(1)
      : "unknown",
  };

  // ── 6. Disk (non-critical) ────────────────────────────────────────────
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const storageDir = process.env.BACKUP_DIR || path.join(process.cwd(), "storage");
    await fs.mkdir(storageDir, { recursive: true });
    const testFile = path.join(storageDir, ".healthcheck-probe");
    await fs.writeFile(testFile, "ok");
    await fs.unlink(testFile);
    checks.disk = { ok: true };
  } catch (err) {
    checks.disk = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const latencyMs = Date.now() - started;

  return NextResponse.json(
    {
      status: criticalOk ? "ok" : "degraded",
      version: VERSION,
      // AUDIT FIX: Stripped commitSha and buildTime to reduce
      // fingerprinting surface on this unauthenticated endpoint.
      uptime: process.uptime ? Math.round(process.uptime()) : null,
      latencyMs,
      checks,
    },
    { status: criticalOk ? 200 : 503 },
  );
}