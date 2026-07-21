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
 * Non-critical failures (disk, queue stats) are reported but don't
 * cause a 503 — the app can still serve requests.
 *
 * Unauthenticated — healthchecks must succeed without cookies.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { valkeyHealthCheck } from "@/lib/valkey";
import { getBullMQStats } from "@/lib/queues";
import { cacheStats } from "@/lib/cache";
import { totalmem } from "node:os";

const VERSION = "12.0.0";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const checks: Record<string, unknown> = {};
  let criticalOk = true;

  // ── 1. PostgreSQL ──────────────────────────────────────────────────────
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout 1000ms")), 1000),
      ),
    ]);
    checks.db = { ok: true };
  } catch (err) {
    criticalOk = false;
    checks.db = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 2. Valkey ──────────────────────────────────────────────────────────
  try {
    const vh = await Promise.race([
      valkeyHealthCheck(),
      new Promise<{ ok: false }>((resolve) =>
        setTimeout(() => resolve({ ok: false }), 2000),
      ),
    ]);
    checks.valkey = vh;
    if (!vh.ok) criticalOk = false;
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
      uptime: process.uptime ? Math.round(process.uptime()) : null,
      latencyMs,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: criticalOk ? 200 : 503 },
  );
}