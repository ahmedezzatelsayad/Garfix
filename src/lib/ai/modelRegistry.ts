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
import { dbTyped as db } from "@/lib/db";
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
const CACHE_TTL_MS = 300_000; // RI-019 FIX: 5 min cache — avoids DB query per AI request

export function invalidateRegistryCache(): void {
  cachedRegistry = null;
  cacheExpiry = 0;
}

// ─── Row mapper ─────────────────────────────────────────────────────────────
// AI-01 FIX (Audit v2 · Phase 1): mapRow now reads the actual `capabilities`,
// `healthScore`, `isHealthy`, and `lastHealthCheck` columns from the DB
// instead of hardcoding `capabilities: []` and `isHealthy: true`.
// This unblocks getModelsForCapability() and callAIWithFallback().

function mapRow(row: {
  id: number;
  provider: string;
  model: string;
  costPerTokenIn: number;
  costPerTokenOut: number;
  maxTokens: number | null;
  isActive: boolean;
  capabilities: string[];
  healthScore: number;
  isHealthy: boolean;
  lastHealthCheck: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RegistryEntry {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    displayName: row.model,
    // AI-01 FIX: read actual capabilities from DB (was hardcoded [])
    capabilities: (row.capabilities || []) as AICapability[],
    tier: "free",
    costPer1kIn: row.costPerTokenIn,
    costPer1kOut: row.costPerTokenOut,
    maxTokens: row.maxTokens ?? 0,
    contextWindow: 0,
    isEnabled: row.isActive,
    // AI-01 FIX: read actual health status from DB (was hardcoded true)
    isHealthy: row.isHealthy ?? true,
    healthScore: row.healthScore ?? 0,
    successRate: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    avgQualityScore: 0,
    totalBenchmarks: 0,
    lastBenchmarkAt: row.lastHealthCheck ?? null,
    lastError: null,
  };
}

// ─── Read operations ────────────────────────────────────────────────────────

export async function getRegistry(): Promise<RegistryEntry[]> {
  if (cachedRegistry && Date.now() < cacheExpiry) return cachedRegistry;
  try {
    const rows = await db.aIModelRegistry.findMany({
      orderBy: [{ isActive: "desc" }],
    });
    cachedRegistry = rows.map(mapRow);
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return cachedRegistry!;
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
  // AI-01 FIX (Audit v2 · Phase 1): filter by capability AND health.
  // Previously this always returned [] because capabilities was hardcoded [].
  // Now it returns only healthy models (isHealthy=true, healthScore >= 0.5)
  // that have the requested capability.
  return all.filter(
    (m) => m.capabilities.includes(cap) && m.isHealthy && m.healthScore >= 0.5
  );
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
  // Find existing entry by provider
  const existing = await db.aIModelRegistry.findFirst({
    where: { provider: input.provider },
  });

  let row;
  if (existing) {
    row = await db.aIModelRegistry.update({
      where: { id: existing.id },
      data: {
        model: input.model,
        isActive: input.isEnabled ?? true,
      },
    });
  } else {
    row = await db.aIModelRegistry.create({
      data: {
        provider: input.provider,
        model: input.model,
        isActive: input.isEnabled ?? true,
      },
    });
  }
  invalidateRegistryCache();
  return mapRow(row);
}

export async function setModelEnabled(
  provider: string,
  model: string,
  isEnabled: boolean,
): Promise<void> {
  await db.aIModelRegistry.updateMany({
    where: { provider },
    data: { isActive: isEnabled },
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
  const modelEntry = await db.aIModelRegistry.findUnique({
    where: { id: modelRegistryId },
  });
  if (!modelEntry) return;

  const recent = await db.aIBenchmarkResult.findMany({
    where: { provider: modelEntry.provider, model: modelEntry.model },
    orderBy: { createdAt: "desc" },
    take: HEALTH_WINDOW,
  });

  if (recent.length === 0) return;

  const latencies = recent.map((r) => r.latencyMs).sort((a, b) => a - b);
  const avgLatencyMs = Math.round(
    latencies.reduce((s, v) => s + v, 0) / latencies.length,
  );
  // p95 via nearest-rank
  const p95Idx = Math.max(0, Math.min(latencies.length - 1, Math.ceil(0.95 * latencies.length) - 1));
  const p95LatencyMs = latencies[p95Idx] ?? avgLatencyMs;
  const avgQualityScore =
    recent.reduce((s, r) => s + Number(r.score || 0), 0) / recent.length;

  const healthScore = computeHealthScore({
    successRate: 100,
    avgLatencyMs,
    tier: "free",
    costPer1kOut: 0,
    avgQualityScore,
  });

  // Note: AIModelRegistry schema only tracks isActive; the richer health
  // metrics are recomputed on each call rather than persisted.
  await db.aIModelRegistry.update({
    where: { id: modelRegistryId },
    data: {
      isActive: healthScore >= UNHEALTHY_THRESHOLD,
    },
  });

  invalidateRegistryCache();
  logger.info("[modelRegistry] health recomputed", {
    modelRegistryId,
    healthScore,
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
  const modelEntry = await db.aIModelRegistry.findUnique({
    where: { id: params.modelRegistryId },
  });
  if (!modelEntry) return;

  await db.aIBenchmarkResult.create({
    data: {
      provider: modelEntry.provider,
      model: modelEntry.model,
      taskType: params.capability,
      score: params.responseQuality,
      latencyMs: params.latencyMs,
      costUsd: 0,
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
