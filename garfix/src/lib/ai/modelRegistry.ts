/**
 * modelRegistry.ts — AI Orchestration Layer: Model Registry.
 *
 * A live, self-tuning catalog of every AI model GarfiX knows about. Each model
 * declares which capabilities it supports (chat, invoice-extraction, reasoning,
 * vision), its tier (free/paid), and its cost. A periodic auto-benchmark rolls
 * real success-rate / latency / quality measurements into a single 0-10
 * `healthScore`.
 *
 * The Smart Router queries this registry at request time to pick the best
 * healthy model for the requested capability — so the system NEVER hard-binds
 * to a model name that might be removed from OpenRouter next month.
 *
 * Health score formula (0-10):
 *   successRate   × 0.50   (0-100  → scaled to 0-10)
 *   latencyScore  × 0.30   (lower is better: 10 - min(avgLatency/1000, 10))
 *   costScore     × 0.10   (free=10, paid scaled inversely by cost)
 *   qualityScore  × 0.10   (0-10 heuristic from benchmark)
 */
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export type AICapability = "chat" | "invoice-extraction" | "reasoning" | "vision";

export const ALL_CAPABILITIES: AICapability[] = [
  "chat",
  "invoice-extraction",
  "reasoning",
  "vision",
];

export interface RegistryEntry {
  id: number;
  provider: string;
  model: string;
  displayName: string;
  capabilities: AICapability[];
  tier: "free" | "paid";
  costPer1kIn: number;
  costPer1kOut: number;
  maxTokens: number;
  contextWindow: number;
  isEnabled: boolean;
  isHealthy: boolean;
  healthScore: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgQualityScore: number;
  totalBenchmarks: number;
  lastBenchmarkAt: Date | null;
  lastError: string | null;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

let cachedRegistry: RegistryEntry[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000; // 30s — short because health scores change during benchmarks

export function invalidateRegistryCache(): void {
  cachedRegistry = null;
  cacheExpiry = 0;
}

// ─── Row mapper ──────────────────────────────────────────────────────────────

function mapRow(row: {
  id: number;
  provider: string;
  model: string;
  displayName: string;
  capabilities: string;
  tier: string;
  costPer1kIn: number;
  costPer1kOut: number;
  maxTokens: number;
  contextWindow: number;
  isEnabled: boolean;
  isHealthy: boolean;
  healthScore: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgQualityScore: number;
  totalBenchmarks: number;
  lastBenchmarkAt: Date | null;
  lastError: string | null;
}): RegistryEntry {
  let caps: AICapability[] = [];
  try {
    caps = JSON.parse(row.capabilities) as AICapability[];
  } catch {
    caps = [];
  }
  return {
    ...row,
    capabilities: caps,
    tier: row.tier === "paid" ? "paid" : "free",
    lastBenchmarkAt: row.lastBenchmarkAt,
  };
}

// ─── Read operations ────────────────────────────────────────────────────────

export async function getRegistry(): Promise<RegistryEntry[]> {
  if (cachedRegistry && Date.now() < cacheExpiry) return cachedRegistry;
  try {
    const rows = await db.aIModelRegistry.findMany({
      orderBy: [{ isEnabled: "desc" }, { healthScore: "desc" }, { tier: "asc" }],
    });
    cachedRegistry = rows.map(mapRow);
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return cachedRegistry;
  } catch (err) {
    logger.error("[modelRegistry] getRegistry failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function getEnabledModels(): Promise<RegistryEntry[]> {
  const all = await getRegistry();
  return all.filter((m) => m.isEnabled);
}

export async function getModelsForCapability(cap: AICapability): Promise<RegistryEntry[]> {
  const all = await getEnabledModels();
  return all.filter((m) => m.capabilities.includes(cap) && m.isHealthy);
}

export async function findByProviderModel(
  provider: string,
  model: string,
): Promise<RegistryEntry | null> {
  const all = await getRegistry();
  return all.find((m) => m.provider === provider && m.model === model) ?? null;
}

// ─── Write operations ───────────────────────────────────────────────────────

export interface UpsertRegistryInput {
  provider: string;
  model: string;
  displayName: string;
  capabilities: AICapability[];
  tier?: "free" | "paid";
  costPer1kIn?: number;
  costPer1kOut?: number;
  maxTokens?: number;
  contextWindow?: number;
  isEnabled?: boolean;
}

export async function upsertModel(input: UpsertRegistryInput): Promise<RegistryEntry> {
  const row = await db.aIModelRegistry.upsert({
    where: { provider_model: { provider: input.provider, model: input.model } },
    create: {
      provider: input.provider,
      model: input.model,
      displayName: input.displayName,
      capabilities: JSON.stringify(input.capabilities),
      tier: input.tier ?? "free",
      costPer1kIn: input.costPer1kIn ?? 0,
      costPer1kOut: input.costPer1kOut ?? 0,
      maxTokens: input.maxTokens ?? 4096,
      contextWindow: input.contextWindow ?? 8192,
      isEnabled: input.isEnabled ?? true,
    },
    update: {
      displayName: input.displayName,
      capabilities: JSON.stringify(input.capabilities),
      tier: input.tier ?? "free",
      costPer1kIn: input.costPer1kIn ?? 0,
      costPer1kOut: input.costPer1kOut ?? 0,
      maxTokens: input.maxTokens ?? 4096,
      contextWindow: input.contextWindow ?? 8192,
    },
  });
  invalidateRegistryCache();
  return mapRow(row);
}

export async function setModelEnabled(
  provider: string,
  model: string,
  isEnabled: boolean,
): Promise<void> {
  await db.aIModelRegistry.updateMany({
    where: { provider, model },
    data: { isEnabled },
  });
  invalidateRegistryCache();
}

// ─── Health score computation ───────────────────────────────────────────────
//
// Composite 0-10 score from the last N benchmark results for a model.
// Weights chosen so that a model with 100% success + <2s latency + free +
// good quality scores ~9-10, and a model with <80% success or >8s latency
// scores <5 and gets marked unhealthy.

const HEALTH_WINDOW = 20; // last N benchmarks per model
const UNHEALTHY_THRESHOLD = 4.0; // below this → isHealthy = false

export function computeHealthScore(metrics: {
  successRate: number; // 0-100
  avgLatencyMs: number;
  tier: "free" | "paid";
  costPer1kOut: number;
  avgQualityScore: number; // 0-10
}): number {
  // Success: 0-100 → 0-10
  const successComponent = Math.min(10, metrics.successRate / 10);

  // Latency: 10 - min(avgLatencySec, 10). 0s→10, 5s→5, 10s+→0
  const latencySec = metrics.avgLatencyMs / 1000;
  const latencyComponent = Math.max(0, 10 - Math.min(latencySec, 10));

  // Cost: free=10, paid scaled inversely (cheaper paid = higher)
  // $0.01/1k → ~9, $0.10/1k → ~8, $1/1k → ~5, $5+/1k → ~0
  const costComponent =
    metrics.tier === "free"
      ? 10
      : Math.max(0, 10 - Math.log10(Math.max(metrics.costPer1kOut, 0.0001) * 100));

  // Quality: already 0-10
  const qualityComponent = Math.min(10, Math.max(0, metrics.avgQualityScore));

  const score =
    successComponent * 0.5 +
    latencyComponent * 0.3 +
    costComponent * 0.1 +
    qualityComponent * 0.1;

  return Math.round(score * 100) / 100;
}

/**
 * Recompute health metrics for a model from its recent benchmark results.
 * Called by the auto-benchmark runner after each round.
 */
export async function recomputeHealth(modelRegistryId: number): Promise<void> {
  const recent = await db.aIBenchmarkResult.findMany({
    where: { modelRegistryId },
    orderBy: { createdAt: "desc" },
    take: HEALTH_WINDOW,
  });

  if (recent.length === 0) return;

  const successCount = recent.filter((r) => r.success).length;
  const successRate = (successCount / recent.length) * 100;
  const latencies = recent.map((r) => r.latencyMs).sort((a, b) => a - b);
  const avgLatencyMs = Math.round(
    latencies.reduce((s, v) => s + v, 0) / latencies.length,
  );
  // p95 via nearest-rank
  const p95Idx = Math.max(0, Math.min(latencies.length - 1, Math.ceil(0.95 * latencies.length) - 1));
  const p95LatencyMs = latencies[p95Idx] ?? avgLatencyMs;
  const avgQualityScore =
    recent.reduce((s, r) => s + (r.responseQuality || 0), 0) / recent.length;
  const lastErrorRow = recent.find((r) => !r.success);

  const model = await db.aIModelRegistry.findUnique({
    where: { id: modelRegistryId },
    select: { tier: true, costPer1kOut: true },
  });
  if (!model) return;

  const healthScore = computeHealthScore({
    successRate,
    avgLatencyMs,
    tier: model.tier === "paid" ? "paid" : "free",
    costPer1kOut: model.costPer1kOut,
    avgQualityScore,
  });

  await db.aIModelRegistry.update({
    where: { id: modelRegistryId },
    data: {
      healthScore,
      successRate: Math.round(successRate * 100) / 100,
      avgLatencyMs,
      p95LatencyMs,
      avgQualityScore: Math.round(avgQualityScore * 100) / 100,
      totalBenchmarks: { increment: recent.length },
      lastBenchmarkAt: new Date(),
      lastError: lastErrorRow?.errorMessage?.slice(0, 500) ?? null,
      isHealthy: healthScore >= UNHEALTHY_THRESHOLD,
    },
  });

  invalidateRegistryCache();
  logger.info("[modelRegistry] health recomputed", {
    modelRegistryId,
    healthScore,
    successRate,
    avgLatencyMs,
    isHealthy: healthScore >= UNHEALTHY_THRESHOLD,
  });
}

/**
 * Record a benchmark result and trigger health recomputation.
 */
export async function recordBenchmarkResult(params: {
  modelRegistryId: number;
  capability: AICapability;
  success: boolean;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  responseQuality: number;
  responseSample?: string;
  errorMessage?: string;
}): Promise<void> {
  await db.aIBenchmarkResult.create({
    data: {
      modelRegistryId: params.modelRegistryId,
      capability: params.capability,
      success: params.success,
      latencyMs: params.latencyMs,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      responseQuality: params.responseQuality,
      responseSample: params.responseSample?.slice(0, 500) ?? null,
      errorMessage: params.errorMessage?.slice(0, 500) ?? null,
    },
  });
  await recomputeHealth(params.modelRegistryId);
}

// ─── Registry → aiProvider config bridge ────────────────────────────────────
//
// The Smart Router selects a RegistryEntry; we then need to resolve its
// decrypted API key + baseUrl from the existing PlatformSetting store so the
// existing OpenAICompatibleProvider / ZaiProvider classes can call it without
// changes. This keeps the orchestration layer additive — no rewrite of the
// provider call path.

export async function resolveProviderConfigForModel(
  entry: RegistryEntry,
): Promise<{
  provider: string;
  model: string;
  apiKey: string | null;
  baseUrl?: string;
  isEnabled: boolean;
  priority: number;
} | null> {
  // Defer the import to avoid a circular dependency at module-load time
  // (aiProvider.ts imports from db; this file imports from db; both fine,
  // but getAiProviders is heavy and only needed here).
  const { getAiProviders } = await import("@/lib/aiProvider");
  const providers = await getAiProviders();
  const match = providers.find((p) => p.provider === entry.provider);
  if (!match) return null;
  return {
    provider: match.provider,
    model: entry.model,
    apiKey: match.apiKey,
    baseUrl: match.baseUrl,
    isEnabled: true,
    priority: 1,
  };
}
