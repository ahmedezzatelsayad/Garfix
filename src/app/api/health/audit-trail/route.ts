/**
 * Event Bus Audit Trail API.
 *
 * GET /api/health/audit-trail — Query audit events with filters
 * GET /api/health/audit-trail/stats — Get audit statistics
 * GET /api/health/audit-trail/verify — Verify audit chain integrity
 *
 * Query parameters (GET /api/health/audit-trail):
 *   - channel: Filter by channel name
 *   - correlationId: Filter by correlation ID
 *   - publisher: Filter by publisher
 *   - from: Unix timestamp (start time)
 *   - to: Unix timestamp (end time)
 *   - limit: Max events to return (default: 50)
 *   - offset: Pagination offset
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { queryAuditEvents, getAuditStats, verifyAuditChain } from "@/lib/telemetry/event-bus-audit";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const pathSegment = url.pathname.split("/").pop();

    // /api/health/audit-trail/stats
    if (pathSegment === "stats") {
      const stats = getAuditStats();
      return NextResponse.json(stats);
    }

    // /api/health/audit-trail/verify
    if (pathSegment === "verify") {
      const integrity = verifyAuditChain();
      return NextResponse.json(integrity);
    }

    // /api/health/audit-trail (default — query events)
    const query = {
      channel: url.searchParams.get("channel") || undefined,
      correlationId: url.searchParams.get("correlationId") || undefined,
      publisher: url.searchParams.get("publisher") || undefined,
      fromTimestamp: url.searchParams.has("from")
        ? parseInt(url.searchParams.get("from")!) : undefined,
      toTimestamp: url.searchParams.has("to")
        ? parseInt(url.searchParams.get("to")!) : undefined,
      limit: url.searchParams.has("limit")
        ? parseInt(url.searchParams.get("limit")!) : 50,
      offset: url.searchParams.has("offset")
        ? parseInt(url.searchParams.get("offset")!) : 0,
    };

    const result = queryAuditEvents(query);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
