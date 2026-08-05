/**
 * GET /api/metrics
 *
 * Observability endpoint for production monitoring dashboards (Prometheus, Grafana, etc.).
 * Returns operational metrics for all Valkey-backed subsystems.
 *
 * Auth: requires a valid METRICS_TOKEN env var. The token may be supplied via
 *   - `?token=<METRICS_TOKEN>` query param, OR
 *   - `X-Prometheus-Token: <METRICS_TOKEN>` request header
 * Constant-time comparison (`crypto.timingSafeEqual`) is used to prevent timing
 * attacks. If `METRICS_TOKEN` is not configured, the endpoint fails closed (503).
 *
 * RUNTIME: Node.js only — imports queues.ts (BullMQ)
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { cacheStats } from "@/lib/cache";
import { getBullMQStats } from "@/lib/queues";
import { valkeyHealthCheck, VALKEY_CONFIGURED, getValkeyUrl } from "@/lib/valkey";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Constant-time token check. Returns true only when `METRICS_TOKEN` is set and
 * the request supplies a matching token via header or query param. Returns
 * false when the env var is unset (fail-closed) or the token doesn't match.
 */
function checkMetricsToken(req: NextRequest): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) {
    // Fail closed — no token configured means metrics endpoint is disabled.
    return false;
  }
  const provided =
    req.headers.get("x-prometheus-token") ||
    new URL(req.url).searchParams.get("token") ||
    "";
  if (!provided) return false;
  // Constant-time comparison
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  // Fail closed if METRICS_TOKEN is not configured.
  if (!process.env.METRICS_TOKEN) {
    logger.error("[metrics] METRICS_TOKEN env var not set — metrics endpoint disabled");
    return NextResponse.json({ error: "Metrics endpoint disabled" }, { status: 503 });
  }

  if (!checkMetricsToken(req)) {
    logger.warn("[metrics] unauthorized access attempt", {
      ip: req.headers.get("x-forwarded-for") || "unknown",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cache = cacheStats();
  const valkey = await valkeyHealthCheck();
  const queueStats = await getBullMQStats();
  const mem = process.memoryUsage();
  const os = await import("node:os");

  const metrics = {
    timestamp: new Date().toISOString(),
    cache: {
      l1Size: cache.l1Size,
      valkeyEnabled: cache.valkeyEnabled,
      pubSubReady: cache.pubSubReady,
    },
    valkey: {
      configured: VALKEY_CONFIGURED,
      url: getValkeyUrl()?.replace(/\/\/.*@/, "//****@") ?? null,
      ...valkey,
    },
    queues: queueStats ?? { mode: "in-process" as const, bullmq: false as const },
    rateLimiter: {
      mode: VALKEY_CONFIGURED ? "valkey" : "in-memory",
    },
    process: {
      uptime: process.uptime ? Math.round(process.uptime()) : null,
      memory: {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
      },
      platform: process.platform,
      nodeVersion: process.version,
    },
    system: {
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      cpuCount: os.cpus().length,
      loadAvg: os.loadavg(),
    },
  };

  return NextResponse.json(metrics);
}
