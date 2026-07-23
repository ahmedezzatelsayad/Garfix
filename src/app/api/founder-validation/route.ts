/**
 * /api/founder-validation
 *
 * GET  — Run the full founder validation suite (query-driven).
 *        ?companies=10&realAI=false&duration=1
 *
 * POST — Dispatch body.action to sub-handlers (seed / report / ai-test)
 *        for single-file convenience, though dedicated sub-routes also exist.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  seedEnterpriseData,
  generateBusinessActivities,
  callOpenRouter,
  TelemetryCollector,
  calculateMetrics,
  generateFounderReport,
  simulateE2ETenantJourney,
  runFounderValidation,
  SeededRandom,
  type ValidationRunConfig,
  type SyntheticCompany,
  type TelemetryEntry,
} from "@/lib/founder-validation";
import { requireFounder } from "@/lib/middleware";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// In-process cache so POST /seed and POST /report can share state without DB
// ---------------------------------------------------------------------------
let cachedCompanies: SyntheticCompany[] | null = null;
let cachedTelemetry: TelemetryEntry[] | null = null;
let cachedSeed: number | null = null;

// ---------------------------------------------------------------------------
// GET /api/founder-validation?companies=10&realAI=false&duration=1
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  // SEC-C12 (Cycle 4): close missing-auth — GET runs the full validation suite
  // with caller-controlled config (?companies=25000&realAI=true) → DoS + OpenRouter spend.
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = request.nextUrl;
    const companiesParam = Number(searchParams.get("companies")) || 10;
    const realAI = searchParams.get("realAI") === "true";
    const durationSec = Number(searchParams.get("duration")) || 1;
    const durationMs = durationSec * 60_000; // convert minutes → ms

    // Clamp to valid enum values
    const validCounts = [10, 100, 1000, 5000, 10000, 25000] as const;
    const companyCount = validCounts.includes(companiesParam as (typeof validCounts)[number])
      ? (companiesParam as (typeof validCounts)[number])
      : 10;

    const apiKey = realAI ? (process.env.OPENROUTER_API_KEY ?? "") : undefined;

    const config: ValidationRunConfig = {
      companyCount,
      seed: 42,
      runE2E: true,
      generateTelemetry: true,
      apiKey,
      continuousActivityDurationMs: durationMs,
    };

    const result = await runFounderValidation(config);

    return NextResponse.json({
      ok: true,
      config: result.config,
      durationMs: result.durationMs,
      metrics: result.metrics,
      reportSummary: {
        maxSustainableTenants: result.report.maxSustainableTenants,
        maxInvoicesPerDay: result.report.maxInvoicesPerDay,
        estimatedAwsCostMonthly: result.report.estimatedAwsCostMonthly,
        estimatedAiCostMonthly: result.report.estimatedAiCostMonthly,
        estimatedRevenueMonthly: result.report.estimatedRevenueMonthly,
        estimatedGrossMarginPct: result.report.estimatedGrossMarginPct,
        estimatedOperatingMarginPct: result.report.estimatedOperatingMarginPct,
        infrastructureBottlenecks: result.report.infrastructureBottlenecks,
        databaseBottlenecks: result.report.databaseBottlenecks,
        queueBottlenecks: result.report.queueBottlenecks,
        aiBottlenecks: result.report.aiBottlenecks,
        optimizationCount: result.report.optimizationOpportunities.length,
      },
      e2eJourney: result.e2eResult
        ? {
            tenantSlug: result.e2eResult.tenantSlug,
            passed: result.e2eResult.passed,
            totalDurationMs: result.e2eResult.totalDurationMs,
            steps: result.e2eResult.steps.map((s) => ({
              step: s.step,
              name: s.name,
              status: s.status,
              durationMs: s.durationMs,
              details: s.details,
            })),
          }
        : null,
      summary: result.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Founder Validation] GET error:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/founder-validation
//
// Body: { action: "seed" | "report" | "ai-test", ...payload }
// Mirrors the dedicated sub-routes so callers can use either URL shape.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // SEC-C12 (Cycle 4): close missing-auth — POST dispatches seed/report/ai-test
  // actions. Seed with count=25000 → memory exhaustion. ai-test → OpenRouter spend.
  const authResult = await requireFounder(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ── Seed ────────────────────────────────────────────────────────────
      case "seed": {
        const count = body.count ?? 100;
        const seed = body.seed ?? 42;

        const validCounts = [10, 100, 1000, 5000, 10000, 25000] as const;
        const companyCount = validCounts.includes(count as (typeof validCounts)[number])
          ? (count as (typeof validCounts)[number])
          : 100;

        const companies = seedEnterpriseData({ companyCount, seed });
        const collector = new TelemetryCollector(companies);
        const telemetry = collector.generateAll(new SeededRandom(seed + 1));

        // Persist in process memory
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
      }

      // ── Report ──────────────────────────────────────────────────────────
      case "report": {
        if (!cachedCompanies || !cachedTelemetry) {
          return NextResponse.json(
            { ok: false, error: "No seeded data available. Call POST /api/founder-validation/seed (or action: 'seed') first." },
            { status: 400 },
          );
        }

        const report = generateFounderReport(
          cachedCompanies,
          cachedTelemetry,
          cachedSeed ?? 42,
        );

        // Strip overly verbose nested arrays for the HTTP response
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
      }

      // ── AI Test ─────────────────────────────────────────────────────────
      case "ai-test": {
        const { prompt, model } = body as { prompt?: string; model?: string };

        if (!prompt) {
          return NextResponse.json(
            { ok: false, error: "Missing required field: prompt" },
            { status: 400 },
          );
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return NextResponse.json(
            { ok: false, error: "OPENROUTER_API_KEY environment variable is not set" },
            { status: 500 },
          );
        }

        const startMs = Date.now();
        const result = await callOpenRouter(apiKey, prompt, model, false);
        const latencyMs = Date.now() - startMs;

        return NextResponse.json({
          ok: true,
          action: "ai-test",
          latencyMs,
          model: result.model,
          id: result.id,
          content: result.choices?.[0]?.message?.content ?? null,
          usage: result.usage ?? null,
        });
      }

      default: {
        return NextResponse.json(
          {
            ok: false,
            error: `Unknown action: "${action}". Must be one of: seed, report, ai-test`,
          },
          { status: 400 },
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Founder Validation] POST error:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}