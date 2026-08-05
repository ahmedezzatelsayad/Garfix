/**
 * POST /api/founder-validation/seed
 *
 * Seeds synthetic enterprise data and telemetry into the in-process cache.
 * Body: { count?: 100, seed?: 42 }
 *
 * P3.1 (Cycle 5): wrapped in `withErrorHandler` to suppress raw `error.message`
 *   leaks (Prisma errors can include table/constraint/SQL fragments).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  seedEnterpriseData,
  TelemetryCollector,
  SeededRandom,
  type SyntheticCompany,
  type TelemetryEntry,
} from "@/lib/founder-validation";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Shared in-process cache — read from the parent module to stay consistent
let cachedCompanies: SyntheticCompany[] | null = null;
let cachedTelemetry: TelemetryEntry[] | null = null;
let cachedSeed: number | null = null;

export function getCache() {
  return { cachedCompanies, cachedTelemetry, cachedSeed };
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  // P5-H2: Rate limit POST /api/founder-validation-seed — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(request, "post:founder-validation-seed", LIMITS.API_WRITE);
  if (rl) return rl;

  // SEC-C13 (Cycle 4): close missing-auth — unauthenticated caller could seed
  // up to 25,000 synthetic companies into the in-process cache, exhausting Node memory.
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

  cachedCompanies = companies;
  cachedTelemetry = telemetry;
  cachedSeed = seed;

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
