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
import {
  getHealthDashboard,
  getAllBreakers,
} from "@/lib/circuit-breaker/circuit-breaker";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // requireAuth returns `{ user }` on success or `NextResponse` on failure —
    // never null. The previous `if (!user)` check was a no-op (auth bypass).
    const r = await requireAuth(req);
    if (r instanceof NextResponse) return r;

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
    // Same auth fix as GET — was a no-op `if (!user)` check (auth bypass).
    const r = await requireAuth(req);
    if (r instanceof NextResponse) return r;
    // Founder/admin-only — the previous comment claimed this but no check enforced it.
    // AuthPayload doesn't have an isFounder field, so we check role + email.
    const founderEmails = (process.env.FOUNDER_EMAIL || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const isFounder = r.user.role === "founder" || founderEmails.includes(r.user.email.toLowerCase());
    if (r.user.role !== "admin" && !isFounder) {
      return NextResponse.json({ error: "Forbidden: admin/founder only" }, { status: 403 });
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
