/**
 * GET /api/health
 *
 * Comprehensive health-check endpoint for load balancers, orchestrators,
 * and monitoring dashboards.
 *
 * Checks:
 *   1. PostgreSQL — SELECT 1 with 1s timeout
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
const COMMIT_SHA = process.env.COMMIT_SHA || "unknown";
const BUILD_TIME = process.env.BUILD_TIME || "unknown";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const checks: Record<string, unknown> = {};
  let criticalOk = true;

  // ── 1. PostgreSQL ──────────────────────────────────────────────────────
  //   5s timeout — Neon serverless cold starts can take 1-2s for cross-region.
  //   Under heavy load (e.g. backup worker running), the DB may be temporarily
  //   slow, so we use a generous timeout and treat a timeout as non-critical
  //   (the app is still running, just slow).
  let dbOk = true;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout 5000ms")), 5000),
      ),
    ]);
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
  try {
    const vh = await Promise.race([
      valkeyHealthCheck(),
      new Promise<{ ok: false; notConfigured?: boolean }>((resolve) =>
        setTimeout(() => resolve({ ok: false }), 2000),
      ),
    ]);
    if (!VALKEY_CONFIGURED) {
      checks.valkey = { ok: true, configured: false, mode: "pg-boss fallback" };
    } else {
      checks.valkey = vh;
      if (!vh.ok) criticalOk = false;
    }
  } catch {
    checks.valkey = { ok: false, error: "exception" };
  }

  // ── 3. BullMQ Queue Stats (non-critical) ──────────────────────────────
  try {
    const queueStats = await Promise.race([
      getBullMQStats(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    checks.queues = queueStats ?? { mode: "in-process", bullmq: false };
  } catch {
    checks.queues = { mode: "in-process", bullmq: false };
  }

  // ── 4. Cache Stats (non-critical) ──────────────────────────────────────
  try {
    checks.cache = cacheStats();
  } catch {
    checks.cache = { error: "unavailable" };
  }

  // ── 5. Memory ──────────────────────────────────────────────────────────
  const memUsage = process.memoryUsage();
  const totalMemory = totalmem();
  checks.memory = {
    rssMB: Math.round(memUsage.rss / 1024 / 1024),
    heapMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
    systemTotalMB: Math.round(totalMemory / 1024 / 1024),
    rssPercent: ((memUsage.rss / totalMemory) * 100).toFixed(1),
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
    checks.disk = { ok: true, storageDir };
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
      commitSha: COMMIT_SHA,
      buildTime: BUILD_TIME,
      uptime: process.uptime ? Math.round(process.uptime()) : null,
      latencyMs,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: criticalOk ? 200 : 503 },
  );
}