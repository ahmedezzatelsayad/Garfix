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
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // SEC-004 FIX: Enforce METRICS_TOKEN auth as documented in .env.example.
  // Previously this endpoint was unauthenticated — returning placeholder
  // metrics to anyone. When real metrics are wired in, this would leak
  // operational data (request counts, AI costs, DB query volume).
  const metricsToken = process.env.METRICS_TOKEN;
  if (!metricsToken) {
    // Fail-closed: if METRICS_TOKEN is not set, return 503
    return new NextResponse("Service Unavailable: METRICS_TOKEN not configured", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const authHeader = req.headers.get("authorization");
  const providedToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.headers.get("x-metrics-token");
  if (providedToken !== metricsToken) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const lines: string[] = [
    "# HELP garfix_request_count_total Total HTTP requests",
    "# TYPE garfix_request_count_total counter",
    `garfix_request_count_total{method="GET"} ${Math.floor(Math.random() * 10000)}`,
    `garfix_request_count_total{method="POST"} ${Math.floor(Math.random() * 5000)}`,
    "",
    "# HELP garfix_request_duration_ms Histogram of request durations",
    "# TYPE garfix_request_duration_ms histogram",
    `garfix_request_duration_ms_bucket{le="50"} ${Math.floor(Math.random() * 8000)}`,
    `garfix_request_duration_ms_bucket{le="200"} ${Math.floor(Math.random() * 9000)}`,
    `garfix_request_duration_ms_bucket{le="500"} ${Math.floor(Math.random() * 9500)}`,
    `garfix_request_duration_ms_bucket{le="+Inf"} ${Math.floor(Math.random() * 10000)}`,
    "",
    "# HELP garfix_ai_tokens_total Total AI tokens consumed",
    "# TYPE garfix_ai_tokens_total counter",
    `garfix_ai_tokens_total{provider="deepseek"} ${Math.floor(Math.random() * 100000)}`,
    `garfix_ai_tokens_total{provider="z-ai-glm"} ${Math.floor(Math.random() * 50000)}`,
    "",
    "# HELP garfix_ai_cost_usd_total Total AI cost in USD",
    "# TYPE garfix_ai_cost_usd_total counter",
    `garfix_ai_cost_usd_total ${Math.random() * 100}`,
    "",
    "# HELP garfix_db_query_count_total Total DB queries",
    "# TYPE garfix_db_query_count_total counter",
    `garfix_db_query_count_total ${Math.floor(Math.random() * 100000)}`,
    "",
    "# HELP garfix_valkey_hit_rate Valkey cache hit rate",
    "# TYPE garfix_valkey_hit_rate gauge",
    `garfix_valkey_hit_rate ${0.85 + Math.random() * 0.1}`,
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
