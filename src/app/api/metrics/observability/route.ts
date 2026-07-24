/**
 * GET /api/metrics/observability — OpenTelemetry-compatible metrics export.
 *
 * Returns all collected metrics in OTLP JSON format.
 * Founder-only — metrics contain sensitive operational data.
 *
 * Provides:
 *   - Counter metrics (request counts, error counts)
 *   - Gauge metrics (current values)
 *   - Histogram metrics (latency distributions with percentile calculations)
 *   - Resource attributes (service info)
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { metrics } from "@/lib/observability";
import { logger } from "@/lib/logger";

export const GET = async (req: NextRequest) => {
  const authResult = await resolveAuth(req);
  if (!authResult.ok || !authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFounderEmail(authResult.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }

  const otlpPayload = metrics.exportOTLP();
  const stats = metrics.stats();

  logger.info("[observability] metrics exported", {
    counters: stats.counters,
    gauges: stats.gauges,
    histograms: stats.histograms,
    totalObservations: stats.totalObservations,
    requester: authResult.user.email,
  });

  return NextResponse.json({
    ...otlpPayload,
    stats,
  });
};
