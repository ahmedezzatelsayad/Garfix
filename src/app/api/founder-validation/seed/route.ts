/**
 * POST /api/founder-validation/seed
 *
 * Seeds synthetic enterprise data and telemetry into the in-process cache.
 * Body: { count?: 100, seed?: 42 }
 */
import { NextRequest, NextResponse } from "next/server";
import {
  seedEnterpriseData,
  TelemetryCollector,
  SeededRandom,
} from "@/lib/founder-validation";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { setCache } from "@/lib/founder-validation/cache";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const rl = await rateLimitResponse(request, "post:founder-validation-seed", LIMITS.API_WRITE);
  if (rl) return rl;

  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const count = body.count ?? 100;
  const seed = body.seed ?? 42;

  const validCounts = [10, 100, 1000, 5000, 10000, 25000] as const;
  const companyCount = validCounts.includes(count as (typeof validCounts)[number])
    ? (count as (typeof validCounts)[number])
    : 100;

  const companies = seedEnterpriseData({ companyCount, seed });
  const collector = new TelemetryCollector(companies);
  const telemetry = collector.generateAll(new SeededRandom(seed + 1));

  setCache(companies, telemetry, seed);

  return NextResponse.json({
    ok: true,
    action: "seed",
    companyCount: companies.length,
    totalInvoices: companies.reduce((s, c) => s + c.invoices.length, 0),
    totalProducts: companies.reduce((s, c) => s + c.products.length, 0),
    totalClients: companies.reduce((s, c) => s + c.clients.length, 0),
    telemetryEntries: telemetry.length,
    seed,
  });
});
