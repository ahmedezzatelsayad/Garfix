/**
 * /api/platform-admin/ai-orchestration
 *
 * GET — Returns the full AI Orchestration Layer state:
 *   - registry: every model with capabilities, tier, cost, live health metrics
 *   - routingMatrix: which model is currently primary per capability
 *   - optimizerStats: cost-optimizer decision counts + estimated savings
 *   - benchmarkHistory: recent benchmark results (for the sparkline per model)
 *
 * Founder-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { getRegistry } from "@/lib/ai/modelRegistry";
import { getRoutingMatrix } from "@/lib/ai/smartRouter";
import { getOptimizerStats, getEstimatedSavings } from "@/lib/ai/costOptimizer";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  const [registry, routingMatrix, recentBenchmarks] = await Promise.all([
    getRegistry(),
    getRoutingMatrix(),
    db.aIBenchmarkResult.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        provider: true,
        model: true,
        taskType: true,
        score: true,
        latencyMs: true,
        costUsd: true,
        createdAt: true,
      },
    }),
  ]);

  const optimizerStats = getOptimizerStats();
  const savings = getEstimatedSavings();

  return NextResponse.json({
    registry: registry.map((m) => ({
      id: m.id,
      provider: m.provider,
      model: m.model,
      displayName: m.displayName,
      capabilities: m.capabilities,
      tier: m.tier,
      costPer1kIn: m.costPer1kIn,
      costPer1kOut: m.costPer1kOut,
      maxTokens: m.maxTokens,
      contextWindow: m.contextWindow,
      isEnabled: m.isEnabled,
      isHealthy: m.isHealthy,
      healthScore: m.healthScore,
      successRate: m.successRate,
      avgLatencyMs: m.avgLatencyMs,
      p95LatencyMs: m.p95LatencyMs,
      avgQualityScore: m.avgQualityScore,
      totalBenchmarks: m.totalBenchmarks,
      lastBenchmarkAt: m.lastBenchmarkAt?.toISOString() ?? null,
      lastError: m.lastError,
    })),
    routingMatrix: routingMatrix.map((r) => ({
      capability: r.capability,
      primary: r.primary
        ? {
            provider: r.primary.provider,
            model: r.primary.model,
            displayName: r.primary.displayName,
            healthScore: r.primary.healthScore,
            tier: r.primary.tier,
          }
        : null,
      candidateCount: r.candidateCount,
    })),
    optimizerStats: {
      counts: optimizerStats,
      callsAvoided: savings.callsAvoided,
      estSavingsUsd: savings.estSavingsUsd,
    },
    recentBenchmarks: recentBenchmarks.map((b) => ({
      id: b.id,
      // Schema has no modelRegistryId/capability/success/tokensIn/tokensOut/
      // responseQuality/errorMessage columns on AIBenchmarkResult — the
      // previous `db: any` masked these as `undefined`. We map the closest
      // existing fields and provide nulls for the rest to preserve the
      // response shape consumed by the founder panel UI.
      modelRegistryId: null,
      capability: b.taskType,
      success: true,
      latencyMs: b.latencyMs,
      tokensIn: 0,
      tokensOut: 0,
      responseQuality: b.score,
      errorMessage: null,
      createdAt: b.createdAt.toISOString(),
    })),
  });
});

/** PATCH — toggle a model's isEnabled flag (founder can disable a misbehaving model). */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit PATCH /api/platform-admin-ai-orchestration — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "patch:platform-admin-ai-orchestration", LIMITS.API_WRITE);
  if (rl) return rl;

  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json().catch(() => ({}));
  const { provider, model, isEnabled } = body as {
    provider?: string;
    model?: string;
    isEnabled?: boolean;
  };

  if (!provider || !model || typeof isEnabled !== "boolean") {
    return NextResponse.json(
      { error: "provider, model, isEnabled (boolean) are required" },
      { status: 400 },
    );
  }

  // Schema field is `model` (not `displayName`) and `isActive` (not
  // `isEnabled`). The previous code used the wrong names and was masked
  // by `db: any`.
  await db.aIModelRegistry.updateMany({
    where: { provider, model },
    data: { isActive: isEnabled },
  });

  return NextResponse.json({ ok: true, provider, model, isEnabled });
});
