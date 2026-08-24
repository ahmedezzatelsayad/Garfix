/**
 * src/app/api/metrics/route.ts — P5-O2: Prometheus /metrics endpoint
 * P5-O2 FIX (Audit v2 · Phase 5)
 *
 * Exposes Prometheus-format metrics:
 * - request_count_total
 * - request_duration_ms_histogram
 * - ai_tokens_total
 * - ai_cost_usd_total
 * - db_query_count_total
 * - valkey_hit_rate
 *
 * C5 FIX (Review / 2026-08-24): this endpoint used to return Math.random()
 * PLACEHOLDER values — random numbers on every scrape are worse than no
 * metrics at all (they poison dashboards and alerting). It now renders the
 * REAL accumulated values from the in-process MetricsRegistry (populated by
 * trackApiRequest / AI fabric instrumentation / DB wrapper). On serverless,
 * counters are per-instance since the last cold start — documented in the
 * output via the garfix_metrics_scope gauge.
 */

import { NextRequest, NextResponse } from "next/server";
import { metrics } from "@/lib/observability";
import { timingSafeEqualStr } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // SEC-004 FIX: Enforce METRICS_TOKEN auth as documented in .env.example.
  // Fail-closed: if METRICS_TOKEN is not set, return 503.
  const metricsToken = process.env.METRICS_TOKEN;
  if (!metricsToken) {
    return new NextResponse("Service Unavailable: METRICS_TOKEN not configured", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const authHeader = req.headers.get("authorization");
  const providedToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.headers.get("x-metrics-token");
  // L2 FIX: constant-time comparison — no timing leak of the secret.
  if (!providedToken || !timingSafeEqualStr(providedToken, metricsToken)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const lines: string[] = [];
  const labelStr = (labels: Record<string, string>) => {
    const entries = Object.entries(labels ?? {});
    if (entries.length === 0) return "";
    return `{${entries.map(([k, v]) => `${k}="${String(v).replace(/"/g, "'")}"`).join(",")}}`;
  };

  try {
    const snap = metrics.snapshot();

    // ── Counters ────────────────────────────────────────────────────────
    lines.push("# HELP garfix_counter Accumulated counter metrics (per instance, since cold start)");
    lines.push("# TYPE garfix_counter counter");
    for (const c of snap.counters) {
      lines.push(`garfix_counter{metric="${c.name}",${Object.entries(c.labels).map(([k, v]) => `${k}="${String(v).replace(/"/g, "'")}"`).join(",")}} ${c.value}`);
    }

    // ── Gauges ──────────────────────────────────────────────────────────
    lines.push("");
    lines.push("# HELP garfix_gauge Current gauge values");
    lines.push("# TYPE garfix_gauge gauge");
    for (const g of snap.gauges) {
      lines.push(`garfix_gauge{metric="${g.name}"${Object.keys(g.labels).length ? "," + Object.entries(g.labels).map(([k, v]) => `${k}="${String(v).replace(/"/g, "'")}"`).join(",") : ""}} ${g.value}`);
    }

    // ── Histograms ──────────────────────────────────────────────────────
    lines.push("");
    lines.push("# HELP garfix_histogram Latency/size histograms: count, sum, avg, p50, p95, p99");
    lines.push("# TYPE garfix_histogram summary");
    for (const h of snap.histograms) {
      const lbl = labelStr(h.labels);
      lines.push(`garfix_histogram{metric="${h.name}",stat="count"${lbl ? "," + lbl.slice(1, -1) : ""}} ${h.count}`);
      lines.push(`garfix_histogram{metric="${h.name}",stat="sum"${lbl ? "," + lbl.slice(1, -1) : ""}} ${h.sum}`);
      lines.push(`garfix_histogram{metric="${h.name}",stat="avg"${lbl ? "," + lbl.slice(1, -1) : ""}} ${h.avg.toFixed(2)}`);
      lines.push(`garfix_histogram{metric="${h.name}",stat="p50"${lbl ? "," + lbl.slice(1, -1) : ""}} ${h.p50}`);
      lines.push(`garfix_histogram{metric="${h.name}",stat="p95"${lbl ? "," + lbl.slice(1, -1) : ""}} ${h.p95}`);
      lines.push(`garfix_histogram{metric="${h.name}",stat="p99"${lbl ? "," + lbl.slice(1, -1) : ""}} ${h.p99}`);
    }

    // ── Scope marker ────────────────────────────────────────────────────
    lines.push("");
    lines.push("# HELP garfix_metrics_scope 0 = process-local (serverless instance since cold start), 1 = global aggregator");
    lines.push("# TYPE garfix_metrics_scope gauge");
    lines.push(`garfix_metrics_scope ${process.env.VERCEL === "1" ? 0 : 1}`);

    lines.push("");
    lines.push("# HELP garfix_up Liveness marker");
    lines.push("# TYPE garfix_up gauge");
    lines.push("garfix_up 1");
  } catch (err) {
    logger.error("[metrics] failed to render snapshot", {
      err: err instanceof Error ? err.message : String(err),
    });
    lines.push("# registry snapshot failed");
    lines.push("garfix_up 0");
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
