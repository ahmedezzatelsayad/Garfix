/**
 * POST /api/founder-validation/report
 *
 * Generates a founder report from previously seeded data.
 * Requires a prior POST /api/founder-validation/seed call.
 *
 * P3.1 (Cycle 5): wrapped in `withErrorHandler` to suppress raw `error.message`
 *   leaks.
 */
import { NextRequest, NextResponse } from "next/server";
import { generateFounderReport } from "@/lib/founder-validation";
import { getCache } from "../seed/route";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest) => {
  // P5-H2: Rate limit POST /api/founder-validation-report — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "post:founder-validation-report", LIMITS.API_WRITE);
  if (rl) return rl;

  // SEC-C14 (Cycle 4): close missing-auth — exposes platform metrics shape and
  // bypasses the intended founder-only gating.
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;

  const { cachedCompanies, cachedTelemetry, cachedSeed } = getCache();

  if (!cachedCompanies || !cachedTelemetry) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No seeded data available. Call POST /api/founder-validation/seed first.",
      },
      { status: 400 },
    );
  }

  const report = generateFounderReport(
    cachedCompanies,
    cachedTelemetry,
    cachedSeed ?? 42,
  );

  return NextResponse.json({
    ok: true,
    action: "report",
    seed: cachedSeed,
    companyCount: cachedCompanies.length,
    metrics: report.metrics,
    maxSustainableTenants: report.maxSustainableTenants,
    maxInvoicesPerDay: report.maxInvoicesPerDay,
    maxAiRequestsPerHour: report.maxAiRequestsPerHour,
    estimatedAwsCostMonthly: report.estimatedAwsCostMonthly,
    estimatedAiCostMonthly: report.estimatedAiCostMonthly,
    estimatedRevenueMonthly: report.estimatedRevenueMonthly,
    estimatedGrossMarginPct: report.estimatedGrossMarginPct,
    estimatedOperatingMarginPct: report.estimatedOperatingMarginPct,
    infrastructureBottlenecks: report.infrastructureBottlenecks,
    databaseBottlenecks: report.databaseBottlenecks,
    queueBottlenecks: report.queueBottlenecks,
    aiBottlenecks: report.aiBottlenecks,
    optimizationCount: report.optimizationOpportunities.length,
    topOptimizations: report.optimizationOpportunities.slice(0, 10),
  });
});
