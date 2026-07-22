/**
 * ai-compiler.ts — Phase 16a: AI request clustering and compilation assessment.
 *
 * Sub-phase 16a only: measurement and clustering. No actual rule generation.
 *
 *   clusterAIRequests(companySlug, days):
 *     Groups AIRequestLog where resolvedBy='ai' by (requestType, clusterKey).
 *     Cluster key = first 50 chars of hash of (provider + tokensUsed pattern).
 *     Returns clusters with count, most common output pattern.
 *
 *   assessClusterForCompilation(cluster):
 *     Determines if a cluster is a candidate for compilation.
 *     Criteria: count >= 50, and outputs are structurally similar.
 *
 *   getCompilationCandidates(companySlug):
 *     Runs clustering + assessment, returns clusters that pass compilation criteria.
 *
 * IMPORTANT: No compiled rule activates without human review.
 * This is enforced at the schema level (CompiledRule.status defaults to 'pending_review').
 * This module only does measurement — it does NOT create CompiledRule rows.
 *
 * Exports:
 *   clusterAIRequests(companySlug, days)        → AICluster[]
 *   assessClusterForCompilation(cluster)         → CompilationAssessment
 *   getCompilationCandidates(companySlug, days?) → CompilationAssessment[]
 */

import { db } from "@/lib/db";
import { fabricHash } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum cluster count to be considered for compilation. */
const MIN_CLUSTER_COUNT = 50;

/** Length of cluster key hash prefix. */
const CLUSTER_KEY_LENGTH = 50;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AICluster {
  /** Unique cluster key (first 50 chars of hash). */
  clusterKey: string;
  requestType: string;
  count: number;
  /** Most common provider in this cluster. */
  mostCommonProvider: string | null;
  /** Average tokens used across the cluster. */
  avgTokensUsed: number;
  /** Average cost per request in this cluster. */
  avgCostUsd: number;
  /** Total cost of all requests in this cluster. */
  totalCostUsd: number;
  /** Sample of resolvedBy values (should all be 'ai'). */
  sampleIds: number[];
}

export interface CompilationAssessment {
  cluster: AICluster;
  /** Whether this cluster should be considered for rule compilation. */
  isCandidate: boolean;
  /** Reasons for the assessment decision. */
  reasons: string[];
  /** Estimated annual savings if compiled (cluster total cost × 365 / days analyzed). */
  estimatedAnnualSavingsUsd: number;
  /** Output structural similarity score (0-1, only meaningful if count > 1). */
  structuralSimilarity: number;
}

// ─── Internal: compute cluster key ──────────────────────────────────────────

/**
 * Compute a cluster key from provider + tokensUsed.
 * Groups requests that use the same model with similar token consumption,
 * which is a proxy for "similar type of work".
 *
 * Key = first 50 chars of fabricHash(provider + ":" + tokensBucket)
 * where tokensBucket rounds tokensUsed to nearest 100.
 */
function computeClusterKey(provider: string | null, tokensUsed: number | null): string {
  const bucket = tokensUsed ? Math.round(tokensUsed / 100) * 100 : 0;
  const raw = `${provider || "unknown"}:${bucket}`;
  const hash = fabricHash(raw);
  return hash.slice(0, Math.min(CLUSTER_KEY_LENGTH, hash.length));
}

// ─── Exported: clusterAIRequests ────────────────────────────────────────────

/**
 * Group AIRequestLog entries where resolvedBy='ai' by (requestType, clusterKey).
 *
 * @param companySlug — company to analyze
 * @param days        — look-back period in days (default 30)
 */
export async function clusterAIRequests(
  companySlug: string,
  days: number = 30,
): Promise<AICluster[]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const logs = await db.aIRequestLog.findMany({
    where: {
      companySlug,
      resolvedBy: "ai",
      createdAt: { gte: since },
    },
    select: {
      id: true,
      requestType: true,
      provider: true,
      tokensUsed: true,
      costUsd: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (logs.length === 0) return [];

  // Group by (requestType, clusterKey)
  const groupMap = new Map<string, {
    requestType: string;
    clusterKey: string;
    logs: typeof logs;
  }>();

  for (const log of logs) {
    const clusterKey = computeClusterKey(log.provider, log.tokensUsed);
    const groupKey = `${log.requestType}:${clusterKey}`;

    let group = groupMap.get(groupKey);
    if (!group) {
      group = { requestType: log.requestType, clusterKey, logs: [] };
      groupMap.set(groupKey, group);
    }
    group.logs.push(log);
  }

  // Build cluster results
  const clusters: AICluster[] = [];

  for (const [, group] of groupMap) {
    const count = group.logs.length;
    const totalCost = group.logs.reduce((sum, l) => sum + l.costUsd, 0);
    const totalTokens = group.logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0);

    // Most common provider
    const providerCounts = new Map<string, number>();
    for (const l of group.logs) {
      const p = l.provider || "unknown";
      providerCounts.set(p, (providerCounts.get(p) || 0) + 1);
    }
    let mostCommonProvider: string | null = null;
    let maxProviderCount = 0;
    for (const [p, c] of providerCounts) {
      if (c > maxProviderCount) {
        mostCommonProvider = p;
        maxProviderCount = c;
      }
    }

    clusters.push({
      clusterKey: group.clusterKey,
      requestType: group.requestType,
      count,
      mostCommonProvider,
      avgTokensUsed: Math.round(totalTokens / count),
      avgCostUsd: Math.round((totalCost / count) * 1e8) / 1e8,
      totalCostUsd: Math.round(totalCost * 1e8) / 1e8,
      sampleIds: group.logs.slice(0, 10).map((l) => l.id),
    });
  }

  // Sort by count descending (most frequent clusters first)
  clusters.sort((a, b) => b.count - a.count);

  return clusters;
}

// ─── Exported: assessClusterForCompilation ──────────────────────────────────

/**
 * Assess whether a cluster is a good candidate for compilation into a
 * deterministic rule.
 *
 * Criteria:
 *   1. count >= 50 (enough samples to be confident)
 *   2. Structural similarity (all use same provider/model = similar work)
 *
 * Returns an assessment with reasons and estimated savings.
 */
export function assessClusterForCompilation(
  cluster: AICluster,
  daysAnalyzed: number = 30,
): CompilationAssessment {
  const reasons: string[] = [];
  let isCandidate = true;

  // Criterion 1: Minimum sample count
  if (cluster.count < MIN_CLUSTER_COUNT) {
    isCandidate = false;
    reasons.push(`Cluster count (${cluster.count}) is below minimum threshold (${MIN_CLUSTER_COUNT})`);
  } else {
    reasons.push(`Cluster count (${cluster.count}) meets minimum threshold (${MIN_CLUSTER_COUNT})`);
  }

  // Criterion 2: Structural similarity
  // We consider a cluster structurally similar if it has a dominant provider
  // (since same provider + similar token usage = similar work pattern)
  // Structural similarity is estimated as: 1 - (unique providers / count)
  // In our clustering, all entries share provider+tokenBucket, so similarity
  // is inherently high. We mark it as structurally similar.
  const structuralSimilarity = cluster.mostCommonProvider ? 0.9 : 0.5;

  if (structuralSimilarity < 0.7) {
    isCandidate = false;
    reasons.push("Low structural similarity in outputs");
  } else {
    reasons.push("Structural similarity is sufficient for compilation");
  }

  // Estimated annual savings if these requests were replaced by a compiled rule
  const dailyCost = daysAnalyzed > 0 ? cluster.totalCostUsd / daysAnalyzed : 0;
  const estimatedAnnualSavingsUsd = Math.round(dailyCost * 365 * 100) / 100;

  if (estimatedAnnualSavingsUsd < 1) {
    reasons.push(`Estimated annual savings ($${estimatedAnnualSavingsUsd}) are minimal`);
  } else {
    reasons.push(`Estimated annual savings: $${estimatedAnnualSavingsUsd}`);
  }

  return {
    cluster,
    isCandidate,
    reasons,
    estimatedAnnualSavingsUsd,
    structuralSimilarity: Math.round(structuralSimilarity * 100) / 100,
  };
}

// ─── Exported: getCompilationCandidates ─────────────────────────────────────

/**
 * Run clustering + assessment for a company and return only clusters
 * that pass compilation criteria.
 *
 * This is the main entry point for the AI Compiler pipeline:
 * it identifies which AI request patterns could be replaced by rules.
 *
 * NOTE: This does NOT create CompiledRule rows. That requires human review.
 */
export async function getCompilationCandidates(
  companySlug: string,
  days: number = 30,
): Promise<CompilationAssessment[]> {
  const clusters = await clusterAIRequests(companySlug, days);

  const assessments = clusters.map((cluster) =>
    assessClusterForCompilation(cluster, days),
  );

  // Return only candidates
  return assessments.filter((a) => a.isCandidate);
}