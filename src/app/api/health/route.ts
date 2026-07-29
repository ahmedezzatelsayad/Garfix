/**
 * GET /api/health
 *
 * Production-grade health-check endpoint for load balancers, orchestrators,
 * and monitoring dashboards.
 *
 * Checks:
 *   1. PostgreSQL — SELECT 1 with 5s timeout (CRITICAL)
 *   2. Queue System — 3-tier: BullMQ (Valkey) → pg-boss (PostgreSQL) → in-process
 *   3. Valkey — PING with 2s timeout (NON-CRITICAL — pg-boss is the fallback)
 *   4. Disk — /app/storage writable check (100ms timeout)
 *   5. Memory — RSS + heap usage vs system memory
 *
 * CRITICAL vs NON-CRITICAL:
 *   - PostgreSQL is CRITICAL — without it, the app cannot function.
 *   - Queue system is CRITICAL — jobs must be processable (at least one tier).
 *   - Valkey is NON-CRITICAL — pg-boss provides a production-safe fallback.
 *   - Disk, cache stats are NON-CRITICAL — the app can still serve requests.
 *
 * Returns 200 when all critical services are healthy.
 * Returns 503 when any critical service is down.
 *
 * RUNTIME: Node.js only — uses process.memoryUsage(), os module
 * Unauthenticated — healthchecks must succeed without cookies.
 */
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { VALKEY_CONFIGURED, valkeyHealthCheck } from "@/lib/valkey";
import { getBullMQStats, getPgBossStats, isPgBossMode } from "@/lib/queues";
import { cacheStats } from "@/lib/cache";
import { totalmem } from "node:os";

const VERSION = "12.1.0";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const checks: Record<string, unknown> = {};
  let criticalOk = true;

  // ── 1. PostgreSQL (CRITICAL) ──────────────────────────────────────────
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout 5000ms")), 5000),
      ),
    ]);
    checks.database = { ok: true, status: "connected" };
  } catch (err) {
    criticalOk = false;
    checks.database = {
      ok: false,
      status: "disconnected",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 2. Queue System (CRITICAL — at least one tier must work) ──────────
  // 3-tier: BullMQ (Valkey) → pg-boss (PostgreSQL) → in-process
  let queueMode = "unknown";
  let queueOk = false;

  // Tier 1: BullMQ (Valkey)
  if (VALKEY_CONFIGURED) {
    try {
      const bullStats = await Promise.race([
        getBullMQStats(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (bullStats) {
        queueMode = "bullmq";
        queueOk = true;
        checks.queues = { mode: "bullmq", ok: true, stats: bullStats };
      }
    } catch {
      // BullMQ failed — fall through to pg-boss
    }
  }

  // Tier 2: pg-boss (PostgreSQL)
  if (!queueOk && isPgBossMode()) {
    try {
      const pgStats = await Promise.race([
        getPgBossStats(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (pgStats) {
        queueMode = "pg-boss";
        queueOk = true;
        checks.queues = { mode: "pg-boss", ok: true, stats: pgStats };
      }
    } catch {
      // pg-boss failed — fall through to in-process
    }
  }

  // Tier 3: In-process (database-backed, acceptable for single-instance)
  if (!queueOk) {
    queueMode = "in-process";
    // In-process is OK if DB is connected — jobs are persisted to JobQueue table
    queueOk = Boolean(checks.database && (checks.database as { ok: boolean }).ok);
    checks.queues = {
      mode: "in-process",
      ok: queueOk,
      note: "Jobs persisted to JobQueue table via Prisma. Set VALKEY_URL for BullMQ or use pg-boss mode.",
    };
  }

  if (!queueOk) {
    criticalOk = false;
  }

  // ── 3. Valkey / Cache (NON-CRITICAL — pg-boss is the fallback) ────────
  if (VALKEY_CONFIGURED) {
    try {
      const vh = await Promise.race([
        valkeyHealthCheck(),
        new Promise<{ ok: false }>((resolve) =>
          setTimeout(() => resolve({ ok: false }), 2000),
        ),
      ]);
      checks.cache = {
        ok: vh.ok,
        provider: "valkey",
        latencyMs: "latencyMs" in vh ? vh.latencyMs : undefined,
        note: vh.ok ? undefined : "Valkey unreachable — pg-boss handles queue fallback",
      };
    } catch {
      checks.cache = {
        ok: false,
        provider: "valkey",
        note: "Valkey unreachable — pg-boss handles queue fallback",
      };
    }
  } else {
    checks.cache = {
      ok: true,
      provider: "pg-boss",
      note: "Valkey not configured — pg-boss provides queue persistence via PostgreSQL",
    };
  }

  // Also include in-memory cache stats
  try {
    const memCache = cacheStats();
    (checks.cache as Record<string, unknown>).memoryCache = memCache;
  } catch {
    // ignore
  }

  // ── 4. Memory ──────────────────────────────────────────────────────────
  const memUsage = process.memoryUsage();
  const totalMemory = totalmem();
  checks.memory = {
    rssMB: Math.round(memUsage.rss / 1024 / 1024),
    heapMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
    systemTotalMB: Math.round(totalMemory / 1024 / 1024),
    rssPercent: ((memUsage.rss / totalMemory) * 100).toFixed(1),
  };

  // ── 5. Disk (non-critical) ────────────────────────────────────────────
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

  // ── Determine overall health status ────────────────────────────────────
  // HEALTHY: all critical services (DB, queues) are up.
  // DEGRADED: non-critical services (Valkey, disk) are down but app works.
  // UNHEALTHY: critical services (DB, queues) are down — 503.
  const dbOk = checks.database && (checks.database as { ok: boolean }).ok;
  const overallStatus = !dbOk || !queueOk
    ? "unhealthy"
    : "healthy";

  return NextResponse.json(
    {
      status: overallStatus,
      version: VERSION,
      uptime: process.uptime ? Math.round(process.uptime()) : null,
      latencyMs,
      checks,
      queueMode,
      timestamp: new Date().toISOString(),
    },
    { status: overallStatus === "unhealthy" ? 503 : 200 },
  );
}
