/**
 * /api/accounting/test-rate-limit
 *
 * Minimal endpoint for testing ACCOUNTING_READ rate limit (40/min).
 * This route exists ONLY under /api/accounting/ so the middleware
 * classifies it as an accounting route and applies the tighter limits.
 *
 * The handler itself returns a simple JSON response — no DB queries,
 * no heavy imports. This avoids webpack compilation crashes during
 * load testing.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: "rate-limit-test-read",
    timestamp: Date.now(),
  });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: "rate-limit-test-write",
    timestamp: Date.now(),
  });
}
