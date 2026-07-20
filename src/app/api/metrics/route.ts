/**
 * GET /api/metrics
 *
 * Observability endpoint for production monitoring dashboards (Prometheus, Grafana, etc.).
 * Returns operational metrics for all Valkey-backed subsystems.
 *
 * Unauthenticated — metrics endpoints must not require auth for scraping.
 */
import { NextResponse } from "next/server";
import { cacheStats } from "@/lib/cache";
import { getBullMQStats } from "@/lib/queues";
import { valkeyHealthCheck, VALKEY_CONFIGURED, getValkeyUrl } from "@/lib/valkey";

export const dynamic = "force-dynamic";

export async function GET() {
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