/**
 * /api/accounting/balance-sheet/test-rate-limit
 *
 * Minimal endpoint for testing REPORT_GENERATION rate limit (5/5min).
 * Placed under the balance-sheet route path so the middleware's
 * isAccountingReportRoute() function detects it.
 *
 * Note: The actual balance-sheet route uses DB queries and heavy imports
 * which crash webpack during dev compilation. This test variant avoids that.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: "rate-limit-test-report",
    timestamp: Date.now(),
  });
}
