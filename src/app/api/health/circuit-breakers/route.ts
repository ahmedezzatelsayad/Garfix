/**
 * Circuit Breaker Health Dashboard API.
 *
 * GET /api/health/circuit-breakers — Returns real-time circuit breaker metrics
 *   for all registered external service breakers.
 *
 * POST /api/health/circuit-breakers — Administrative actions:
 *   - { action: "reset", breaker: "openrouter" } → Force-reset a breaker
 *   - { action: "trip", breaker: "openrouter" } → Force-trip a breaker
 *
 * Only accessible to founder/admin users.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { getHealthDashboard, getAllBreakers, externalBreakers } from "@/lib/circuit-breaker";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dashboard = getHealthDashboard();
    return NextResponse.json(dashboard);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || !body.action || !body.breaker) {
      return NextResponse.json(
        { error: "Missing action or breaker name" },
        { status: 400 },
      );
    }

    const breakerMap = getAllBreakers();
    const breaker = breakerMap.get(body.breaker);
    if (!breaker) {
      return NextResponse.json(
        { error: `Breaker "${body.breaker}" not found` },
        { status: 404 },
      );
    }

    if (body.action === "reset") {
      breaker.reset();
      return NextResponse.json({ ok: true, breaker: body.breaker, state: "closed" });
    }

    if (body.action === "trip") {
      breaker.trip();
      return NextResponse.json({ ok: true, breaker: body.breaker, state: "open" });
    }

    return NextResponse.json(
      { error: `Unknown action "${body.action}"` },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
