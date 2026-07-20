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
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { getRegistry } from "@/lib/ai/modelRegistry";
import { getRoutingMatrix } from "@/lib/ai/smartRouter";
import { getOptimizerStats, getEstimatedSavings } from "@/lib/ai/costOptimizer";

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
        modelRegistryId: true,
        capability: true,
        success: true,
        latencyMs: true,
        tokensIn: true,
        tokensOut: true,
        responseQuality: true,
        errorMessage: true,
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
      modelRegistryId: b.modelRegistryId,
      capability: b.capability,
      success: b.success,
      latencyMs: b.latencyMs,
      tokensIn: b.tokensIn,
      tokensOut: b.tokensOut,
      responseQuality: b.responseQuality,
      errorMessage: b.errorMessage,
      createdAt: b.createdAt.toISOString(),
    })),
  });
});

/** PATCH — toggle a model's isEnabled flag (founder can disable a misbehaving model). */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
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

  await db.aIModelRegistry.updateMany({
    where: { provider, model },
    data: { isEnabled },
  });

  return NextResponse.json({ ok: true, provider, model, isEnabled });
});
