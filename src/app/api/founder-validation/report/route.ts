/**
 * POST /api/founder-validation/report
 *
 * Generates a founder report from previously seeded data.
 * Requires a prior POST /api/founder-validation/seed call.
 */
import { NextRequest, NextResponse } from "next/server";
import { generateFounderReport } from "@/lib/founder-validation";
import { getCache } from "../seed/route";
import { requireFounder } from "@/lib/middleware";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // SEC-C14 (Cycle 4): close missing-auth — exposes platform metrics shape and
  // bypasses the intended founder-only gating.
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Founder Validation /report] POST error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
