/**
 * invoice-brain/patternConfidence.ts — Confidence Score System for Patterns
 *
 * ═══════════════════════════════════════════════════════════════
 *  IMPROVEMENT: Confidence-Based Decision Making (User's Suggestion)
 * ═══════════════════════════════════════════════════════════════
 *
 * OLD APPROACH (Flawed):
 *   - "First 100 invoices = Learning Phase"
 *   - Hard cutoff, not intelligent
 *   - Stops learning after arbitrary limit
 *   - Fails when new suppliers/formats introduced
 *
 * NEW APPROACH (Intelligent):
 *   - Each Pattern has a dynamic Confidence Score (0-1)
 *   - Decision based on confidence, not counters:
 *     • > 0.98: Use Pattern directly (auto-extract)
 *     • 0.70-0.98: Use Pattern + verify result
 *     • < 0.70: Fall back to AI + learn new pattern
 *   - Self-learning system that never stops improving
 *   - Adapts to new suppliers/formats automatically
 *
 * CONFIDENCE CALCULATION:
 * ─────────────────────────────────────────────────────────────
 * Base factors:
 *   - Success rate: successful extractions / total uses
 *   - Sample size: more samples = higher confidence (with diminishing returns)
 *   - Recency: recent successes boost confidence
 *   - Consistency: low variance in extraction quality
 *
 * Example:
 * ─────────────────────────────────────────────────────────────
 * Pattern A:
 *   Seen:    2841 times
 *   Success: 2826 times (99.47%)
 *   Recent:  Last 100 uses all successful
 *   Score:   0.997 → Use directly ✅
 *
 * Pattern B:
 *   Seen:    15 times
 *   Success: 12 times (80%)
 *   Recent:  2 failures in last 10 uses
 *   Score:   0.62 → Use AI ❌
 * ═══════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";
import type { InvoiceTemplate } from "./patternStore";

// ─── Types ───────────────────────────────────────────────────

export interface ConfidenceMetrics {
  /** Overall confidence score (0-1) */
  score: number;
  
  /** Which tier this pattern falls into */
  tier: ConfidenceTier;
  
  /** Recommended action based on confidence */
  recommendedAction: "use_directly" | "verify" | "use_ai";
  
  /** Breakdown of how score was calculated */
  breakdown: ConfidenceBreakdown;
  
  /** Whether this pattern should be used at all */
  isUsable: boolean;
}

export type ConfidenceTier =
  | "excellent"   // > 0.98: Use without verification
  | "good"        // 0.85-0.98: Use with light verification
  | "moderate"    // 0.70-0.85: Use with full verification
  | "low"         // < 0.70: Don't use, fall back to AI
  | "unknown";    // No data yet

export interface ConfidenceBreakdown {
  /** Success rate (successful / total) */
  successRate: number;
  
  /** Number of times this pattern has been used */
  sampleSize: number;
  
  /** Recency factor (0-1, based on recent performance) */
  recencyFactor: number;
  
  /** Consistency factor (0-1, low variance = high consistency) */
  consistencyFactor: number;
  
  /** Age factor (0-1, newer patterns start lower) */
  ageFactor: number;
}

/** Extended template data including confidence tracking */
export interface TrackedTemplate extends InvoiceTemplate {
  /** Total number of extraction attempts */
  totalUses: number;
  
  /** Number of successful extractions */
  successCount: number;
  
  /** Number of failed extractions (verification failures) */
  failureCount: number;
  
  /** Timestamps of last N uses (for recency calculation) */
  recentUses: Array<{
    timestamp: string;
    success: boolean;
    confidence: number; // Verification confidence if available
  }>;
  
  /** Current calculated confidence score */
  confidenceScore: number;
  
  /** When this pattern was last updated */
  lastCalculatedAt: string;
  
  /** Version number (for pattern evolution tracking) */
  version: number;
}

// ─── Configuration ───────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  // Tier thresholds
  thresholds: {
    excellent: 0.98,  // Auto-use threshold
    good: 0.85,       // Light verification
    moderate: 0.70,   // Full verification
  },
  
  // Weights for score calculation (must sum to ~1)
  weights: {
    successRate: 0.40,      // Most important: does it work?
    sampleSize: 0.20,       // More samples = more trust
    recency: 0.15,          // Recent performance matters
    consistency: 0.15,      // Stable results are better
    age: 0.10,             // Older patterns slightly more trusted
  },
  
  // Sample size adjustments
  sampleSize: {
    minimumForTrust: 5,     // Need at least 5 to calculate
    optimal: 50,            // After this, diminishing returns
    maximumBenefit: 100,    // Cap benefit after this
  },
  
  // Recency window (how many recent uses to track)
  recentWindow: 20,
  
  // Decay factor for old patterns (per day)
  dailyDecay: 0.001,       // Very slow decay
};

// ─── Main Confidence Calculation ──────────────────────────────

/**
 * Calculate confidence score for a tracked template.
 * 
 * @param template - The tracked template with usage history
 * @returns ConfidenceMetrics with score and recommendation
 */
export function calculateConfidence(template: TrackedTemplate): ConfidenceMetrics {
  const breakdown = calculateBreakdown(template);
  const score = computeWeightedScore(breakdown);
  const tier = determineTier(score);
  const action = determineAction(tier, breakdown);
  
  return {
    score: Math.round(score * 1000) / 1000, // Round to 3 decimals
    tier,
    recommendedAction: action,
    breakdown,
    isUsable: tier !== "low" && tier !== "unknown",
  };
}

/**
 * Calculate individual components of confidence score.
 */
function calculateBreakdown(template: TrackedTemplate): ConfidenceBreakdown {
  // Success Rate
  const successRate = template.totalUses > 0 
    ? template.successCount / template.totalUses 
    : 0;
  
  // Sample Size Factor (diminishing returns)
  const _sampleSizeFactor = calculateSampleSizeFactor(template.totalUses);
  
  // Recency Factor (based on last N uses)
  const recencyFactor = calculateRecencyFactor(template.recentUses);
  
  // Consistency Factor (low variance = high consistency)
  const consistencyFactor = calculateConsistencyFactor(template.recentUses);
  
  // Age Factor (slight boost for older, proven patterns)
  const ageFactor = calculateAgeFactor(template.createdAt);
  
  return {
    successRate,
    sampleSize: template.totalUses,
    recencyFactor,
    consistencyFactor,
    ageFactor,
  };
}

/**
 * Compute final weighted score from breakdown components.
 */
function computeWeightedScore(breakdown: ConfidenceBreakdown): number {
  const { weights } = CONFIDENCE_CONFIG;
  
  const weightedSum = 
    breakdown.successRate * weights.successRate +
    calculateSampleSizeFactor(breakdown.sampleSize) * weights.sampleSize +
    breakdown.recencyFactor * weights.recency +
    breakdown.consistencyFactor * weights.consistency +
    breakdown.ageFactor * weights.age;
  
  // Clamp to valid range
  return Math.max(0, Math.min(1, weightedSum));
}

// ─── Factor Calculations ─────────────────────────────────────

/**
 * Sample Size Factor: How much we trust based on number of uses.
 * Uses logarithmic scaling with diminishing returns.
 */
function calculateSampleSizeFactor(sampleSize: number): number {
  const { minimumForTrust, optimal, maximumBenefit } = CONFIDENCE_CONFIG.sampleSize;
  
  if (sampleSize < minimumForTrust) {
    // Not enough data - scale linearly from 0 to 0.5
    return (sampleSize / minimumForTrust) * 0.5;
  }
  
  if (sampleSize <= optimal) {
    // Good range - scale from 0.5 to 0.9
    const progress = (sampleSize - minimumForTrust) / (optimal - minimumForTrust);
    return 0.5 + (progress * 0.4);
  }
  
  if (sampleSize <= maximumBenefit) {
    // Diminishing returns - scale from 0.9 to 0.98
    const progress = (sampleSize - optimal) / (maximumBenefit - optimal);
    return 0.9 + (progress * 0.08);
  }
  
  // Maximum benefit reached
  return 0.98;
}

/**
 * Recency Factor: Based on performance in last N uses.
 * Recent failures reduce confidence significantly.
 */
function calculateRecencyFactor(recentUses: TrackedTemplate["recentUses"]): number {
  const { recentWindow } = CONFIDENCE_CONFIG;
  
  if (recentUses.length === 0) {
    return 0.8; // Neutral if no recent data
  }
  
  // Get only the most recent N uses
  const relevantUses = recentUses.slice(-recentWindow);
  
  // Weight more recent uses higher
  let weightedSuccess = 0;
  let totalWeight = 0;
  
  relevantUses.forEach((use, index) => {
    const weight = (index + 1) / relevantUses.length; // Newer = higher weight
    weightedSuccess += use.success ? weight : 0;
    totalWeight += weight;
  });
  
  return totalWeight > 0 ? weightedSuccess / totalWeight : 0.8;
}

/**
 * Consistency Factor: Low variance in results = high consistency.
 */
function calculateConsistencyFactor(recentUses: TrackedTemplate["recentUses"]): number {
  if (recentUses.length < 3) {
    return 0.7; // Not enough data for variance calculation
  }
  
  // Calculate variance in success/confidence
  const confidences = recentUses.map(u => u.confidence || (u.success ? 1 : 0));
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  
  if (mean === 0 || mean === 1) {
    return mean; // All same = perfect consistency
  }
  
  // Calculate variance
  const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
  const stdDev = Math.sqrt(variance);
  
  // Convert to consistency (inverse of variance, scaled)
  // Low stdDev = high consistency
  const maxStdDev = 0.5; // Expected maximum standard deviation
  const consistency = Math.max(0, 1 - (stdDev / maxStdDev));
  
  return consistency;
}

/**
 * Age Factor: Slight boost for older, proven patterns.
 * Very slow decay for unused old patterns.
 */
function calculateAgeFactor(createdAt: string): number {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const ageDays = (now - created) / (1000 * 60 * 60 * 24);
  
  if (ageDays < 1) {
    return 0.5; // Brand new pattern - cautious
  }
  
  if (ageDays < 7) {
    return 0.7; // Less than a week - still learning
  }
  
  if (ageDays < 30) {
    return 0.85; // Proven over a month
  }
  
  // Apply very slow decay for very old patterns
  const decayDays = ageDays - 30;
  const decayAmount = decayDays * CONFIDENCE_CONFIG.dailyDecay;
  return Math.max(0.85, 0.95 - decayAmount); // Floor at 0.85
}

// ─── Tier & Action Determination ─────────────────────────────

/**
 * Determine confidence tier from score.
 */
function determineTier(score: number): ConfidenceTier {
  const { thresholds } = CONFIDENCE_CONFIG;
  
  if (score >= thresholds.excellent) return "excellent";
  if (score >= thresholds.good) return "good";
  if (score >= thresholds.moderate) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

/**
 * Determine recommended action based on tier and breakdown.
 */
function determineAction(
  tier: ConfidenceTier, 
  breakdown: ConfidenceBreakdown
): "use_directly" | "verify" | "use_ai" {
  switch (tier) {
    case "excellent":
      return "use_directly";
    
    case "good":
      // Even good patterns should be verified if recent failures exist
      if (breakdown.recencyFactor < 0.8) {
        return "verify";
      }
      return "use_directly";
    
    case "moderate":
      return "verify";
    
    case "low":
    case "unknown":
      return "use_ai";
    
    default:
      return "use_ai";
  }
}

// ─── Template Tracking & Updates ─────────────────────────────

/**
 * Create a new tracked template from a basic template.
 */
export function createTrackedTemplate(
  baseTemplate: InvoiceTemplate
): TrackedTemplate {
  return {
    ...baseTemplate,
    totalUses: 0,
    successCount: 0,
    failureCount: 0,
    recentUses: [],
    confidenceScore: 0.5, // Start neutral
    lastCalculatedAt: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Record a successful extraction using this template.
 */
export function recordSuccess(
  template: TrackedTemplate,
  verificationConfidence?: number
): TrackedTemplate {
  const now = new Date().toISOString();
  
  return {
    ...template,
    totalUses: template.totalUses + 1,
    successCount: template.successCount + 1,
    recentUses: addRecentUse(template.recentUses, true, verificationConfidence),
    lastCalculatedAt: now,
  };
}

/**
 * Record a failed extraction using this template.
 */
export function recordFailure(
  template: TrackedTemplate,
  reason?: string
): TrackedTemplate {
  const now = new Date().toISOString();
  
  logger.warn("[confidence] Pattern extraction failed", {
    fingerprint: template.fingerprint,
    reason,
    currentScore: template.confidenceScore,
  });
  
  return {
    ...template,
    totalUses: template.totalUses + 1,
    failureCount: template.failureCount + 1,
    recentUses: addRecentUse(template.recentUses, false),
    lastCalculatedAt: now,
  };
}

/**
 * Add a use record to recent uses, maintaining window size.
 */
function addRecentUse(
  recentUses: TrackedTemplate["recentUses"],
  success: boolean,
  confidence?: number
): TrackedTemplate["recentUses"] {
  const newUse = {
    timestamp: new Date().toISOString(),
    success,
    confidence: confidence ?? (success ? 0.95 : 0.1),
  };
  
  const updated = [...recentUses, newUse];
  
  // Keep only the most recent N uses
  if (updated.length > CONFIDENCE_CONFIG.recentWindow) {
    return updated.slice(-CONFIDENCE_CONFIG.recentWindow);
  }
  
  return updated;
}

// ─── Pattern Evolution & Versioning ──────────────────────────

/**
 * Check if pattern should be evolved (significant drift detected).
 */
export function shouldEvolvePattern(
  template: TrackedTemplate,
  recentFailureRate: number
): boolean {
  // Evolve if:
  // 1. Recent failure rate > 30%
  // 2. Template has been used at least 20 times
  // 3. Current version is getting stale
  
  const shouldEvolve = 
    recentFailureRate > 0.3 &&
    template.totalUses >= 20 &&
    template.version < 10; // Max version cap
  
  if (shouldEvolve) {
    logger.info("[confidence] Pattern evolution suggested", {
      fingerprint: template.fingerprint,
      currentVersion: template.version,
      recentFailureRate,
      totalUses: template.totalUses,
    });
  }
  
  return shouldEvolve;
}

/**
 * Create a new version of the template.
 */
export function evolvePattern(
  template: TrackedTemplate,
  newFields: typeof template.fields
): TrackedTemplate {
  return {
    ...template,
    fields: newFields,
    version: template.version + 1,
    createdAt: new Date().toISOString(), // Reset creation date
    // Keep usage stats but reset recent history for fresh start
    recentUses: [],
    confidenceScore: Math.max(template.confidenceScore * 0.8, 0.3), // Penalty for evolution
  };
}

// ─── Batch Analysis ──────────────────────────────────────────

/**
 * Analyze confidence across multiple templates.
 * Useful for dashboard/admin views.
 */
export interface CompanyPatternHealth {
  companySlug: string;
  totalPatterns: number;
  excellentPatterns: number;
  goodPatterns: number;
  moderatePatterns: number;
  lowPatterns: number;
  averageConfidence: number;
  recommendations: string[];
}

/**
 * Analyze health of all patterns for a company.
 */
export function analyzeCompanyPatternHealth(
  templates: TrackedTemplate[],
  companySlug: string
): CompanyPatternHealth {
  const metrics = templates.map(t => calculateConfidence(t));
  
  const excellent = metrics.filter(m => m.tier === "excellent").length;
  const good = metrics.filter(m => m.tier === "good").length;
  const moderate = metrics.filter(m => m.tier === "moderate").length;
  const low = metrics.filter(m => m.tier === "low" || m.tier === "unknown").length;
  
  const avgConfidence = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length
    : 0;
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (low > templates.length * 0.3) {
    recommendations.push("Consider re-training low-confidence patterns with AI");
  }
  
  if (templates.length < 5) {
    recommendations.push("More invoice variety needed for robust pattern learning");
  }
  
  if (avgConfidence < 0.7) {
    recommendations.push("Overall pattern quality is below target - review extraction accuracy");
  }
  
  return {
    companySlug,
    totalPatterns: templates.length,
    excellentPatterns: excellent,
    goodPatterns: good,
    moderatePatterns: moderate,
    lowPatterns: low,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    recommendations,
  };
}

// ─── Exports ─────────────────────────────────────────────────

export { CONFIDENCE_CONFIG };
