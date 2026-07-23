/**
 * GET /api/internal/ai-fabric/savings
 *
 * Internal endpoint for the Founder Panel's AI savings display.
 * Returns cascade breakdown + cost savings for a company or platform-wide.
 *
 * Query params:
 *   companySlug (optional) — specific company, omit for platform-wide
 *   period (optional) — "7d" | "30d" | "90d" (default: "30d")
 *
 * Source: AIRequestLog (all numbers from real data, no mocks)
 * Access: Founder Panel only (not exposed to tenants)
 */

import { NextRequest, NextResponse } from "next/server";
import { calculateSavedCost, getPlatformSavings, getCascadeBreakdown } from "@/lib/ai-fabric/cost-optimizer";
import { requireFounder } from "@/lib/middleware";

const PERIOD_MAP: Record<string, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

export async function GET(request: NextRequest) {
  // SEC-C11 (Cycle 4): close missing-auth — despite the header comment "Access:
  // Founder Panel only", the handler had zero auth. Returns per-company AI cost
  // savings breakdowns + platform-wide totals.
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get("companySlug") || undefined;
    const periodKey = searchParams.get("period") || "30d";
    const periodMs = PERIOD_MAP[periodKey] || PERIOD_MAP["30d"];

    const periodEnd = new Date();
    const periodStart = new Date(Date.now() - periodMs);

    if (companySlug) {
      const [savings, breakdown] = await Promise.all([
        calculateSavedCost(companySlug, periodStart, periodEnd),
        getCascadeBreakdown(companySlug, periodStart, periodEnd),
      ]);

      return NextResponse.json({ savings, breakdown });
    }

    const [savings, breakdown] = await Promise.all([
      getPlatformSavings(periodStart, periodEnd),
      // For platform-wide, we aggregate breakdown from calculateSavedCost
      getCascadeBreakdown("_all_", periodStart, periodEnd).catch(() => []),
    ]);

    return NextResponse.json({
      savings,
      // Use the breakdown from savings report (platform-wide)
      breakdown: savings.breakdown,
    });
  } catch (err) {
    console.error("[ai-fabric/savings] error:", err);
    return NextResponse.json(
      { error: "Failed to compute savings" },
      { status: 500 },
    );
  }
}