/**
 * GET /api/metrics/slo — SLO compliance report.
 *
 * Returns current SLO compliance status for each defined service level objective.
 * Founder-only — SLO data is operational intelligence.
 *
 * Provides:
 *   - SLO definition (name, target, metricName)
 *   - Current measurement value
 *   - Compliance status (compliant or not)
 *   - Burn rate (how quickly error budget is consumed)
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { checkSLOCompliance, SLOs } from "@/lib/observability";
import { logger } from "@/lib/logger";

export const GET = async (req: NextRequest) => {
  const authResult = await resolveAuth(req);
  if (!authResult.ok || !authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFounderEmail(authResult.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }

  const compliance = checkSLOCompliance();
  const allCompliant = Object.values(compliance).every((r) => r.compliant);
  const failingSLOs = Object.values(compliance).filter((r) => !r.compliant);

  logger.info("[slo] compliance check", {
    totalSLOs: Object.keys(compliance).length,
    allCompliant,
    failingCount: failingSLOs.length,
  });

  return NextResponse.json({
    overallStatus: allCompliant ? "compliant" : "breach",
    totalSLOs: Object.keys(compliance).length,
    compliant: Object.values(compliance).filter((r) => r.compliant).length,
    failing: failingSLOs.length,
    failingSLOs: failingSLOs.map((r) => ({
      name: r.slo.name,
      target: r.slo.target,
      current: r.current,
      burnRate: r.burnRate,
    })),
    details: compliance,
    definitions: SLOs,
    timestamp: new Date().toISOString(),
  });
};
