/**
 * invoice-brain/driftDetection.ts — Pattern Drift Detection System
 *
 * ═══════════════════════════════════════════════════════════════
 *  DRIFT DETECTION (Critical for Production Readiness)
 * ═══════════════════════════════════════════════════════════════
 *
 * PROBLEM (User's Observation):
 *   - Supplier changes invoice format gradually
 *   - Fingerprint still matches (same layout structure)
 *   - BUT extracted fields become wrong/inaccurate
 *   - Silent quality degradation
 *
 * SOLUTION:
 *   - Calculate Drift Score for each extraction
 *   - Compare current extraction with historical baseline
 *   - If drift > threshold → Fall back to AI
 *   - Trigger pattern re-learning
 *
 * DRIFT INDICATORS:
 * ─────────────────────────────────────────────────────────────
 * 1. Field Value Distribution Shift:
 *    - Sudden change in value ranges (e.g., totals jump 10x)
 *    - New characters/encodings appear
 *    
 * 2. Structural Anomalies:
 *    - Expected fields missing
 *    - Unexpected extra fields
 *    - Field order changes
    
 * 3. Confidence Degradation:
 *    - Verification confidence drops over time
 *    - Success rate decreases
 *    
 * 4. Temporal Patterns:
 *    - Multiple failures in short time window
 *    - User corrections increase
 * ═══════════════════════════════════════════════════════════════
 */

import { logger } from "@/lib/logger";
import type { Invoice } from "./schema";
import type { VerificationResult } from "./verifyExtraction";

// ─── Types ───────────────────────────────────────────────────

export interface DriftDetectionResult {
  /** Overall drift score (0-1, higher = more drift) */
  driftScore: number;
  
  /** Whether drift exceeds threshold */
  isDrifted: boolean;
  
  /** Which indicators triggered */
  triggeredIndicators: DriftIndicator[];
  
  /** Recommended action */
  recommendedAction: "use_pattern" | "verify" | "fallback_to_ai" | "relearn_pattern";
  
  /** Details about each indicator */
  indicatorDetails: IndicatorDetail[];
  
  /** Historical context */
  historicalContext: {
    baselineExtractions: number;
    recentFailures: number;
    avgConfidenceTrend: "stable" | "improving" | "degrading";
  };
}

export type DriftIndicator =
  | "value_distribution_shift"
  | "structural_anomaly"
  | "confidence_degradation"
  | "temporal_failure_cluster"
  | "field_absence"
  | "encoding_change";

export interface IndicatorDetail {
  indicator: DriftIndicator;
  score: number; // 0-1 contribution to overall score
  threshold: number;
  triggered: boolean;
  details: string;
}

export interface DriftBaseline {
  fingerprint: string;
  
  // Value baselines (for numeric fields)
  valueBaselines: {
    [fieldName: string]: {
      mean: number;
      stdDev: number;
      min: number;
      max: number;
      sampleCount: number;
      lastUpdated: string;
    };
  };
  
  // Structural baseline
  expectedFields: string[];
  fieldOrderConfidence: number;
  
  // Performance baseline
  historicalSuccessRate: number;
  historicalAvgConfidence: number;
  sampleSize: number;
  
  // Metadata
  createdAt: string;
  lastUpdated: string;
}

export interface DriftConfig {
  /** Global threshold for considering something "drifted" */
  driftThreshold: number;
  
  /** Individual indicator thresholds */
  indicatorThresholds: {
    [key in DriftIndicator]: number;
  };
  
  /** Time window for temporal analysis (in ms) */
  temporalWindowMs: number;
  
  /** Minimum samples before establishing baseline */
  minSamplesForBaseline: number;
  
  /** How much weight to give recent vs historical data */
  recencyWeight: number; // 0-1, higher = more weight to recent
}

// ─── Default Configuration ──────────────────────────────────

const DEFAULT_CONFIG: DriftConfig = {
  driftThreshold: 0.20, // 20% drift score = action needed
  
  indicatorThresholds: {
    value_distribution_shift: 0.25,
    structural_anomaly: 0.30,
    confidence_degradation: 0.20,
    temporal_failure_cluster: 0.35,
    field_absence: 0.40,
    encoding_change: 0.50,
  },
  
  temporalWindowMs: 24 * 60 * 60 * 1000, // 24 hours
  minSamplesForBaseline: 10,
  recencyWeight: 0.3,
};

// ─── Main Drift Detector Class ───────────────────────────────

/**
 * Detects pattern drift by comparing extractions against historical baselines.
 */
export class DriftDetector {
  private baselines: Map<string, DriftBaseline> = new Map();
  private recentExtractions: Map<string, Array<{
    timestamp: number;
    success: boolean;
    confidence: number;
    extractedData: Partial<Invoice>;
  }>> = new Map();
  
  private config: DriftConfig;
  
  constructor(config?: Partial<DriftConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Analyze an extraction result for potential drift.
   */
  detectDrift(
    fingerprint: string,
    extractedData: Invoice,
    verificationResult: VerificationResult
  ): DriftDetectionResult {
    const now = Date.now();
    
    // Record this extraction
    this.recordExtraction(fingerprint, {
      success: verificationResult.verified,
      confidence: verificationResult.confidence,
      extractedData,
    });
    
    // Get or create baseline
    const baseline = this.getOrCreateBaseline(fingerprint);
    
    // Check all indicators
    const indicators: IndicatorDetail[] = [];
    
    // 1. Value distribution shift
    indicators.push(this.checkValueDistribution(baseline, extractedData));
    
    // 2. Structural anomaly
    indicators.push(this.checkStructuralAnomaly(baseline, extractedData));
    
    // 3. Confidence degradation
    indicators.push(this.checkConfidenceDegradation(baseline, verificationResult.confidence));
    
    // 4. Temporal failure cluster
    indicators.push(this.checkTemporalFailureCluster(fingerprint));
    
    // 5. Field absence
    indicators.push(this.checkFieldAbsence(baseline, extractedData));
    
    // 6. Encoding change
    indicators.push(this.checkEncodingChange(baseline, extractedData));
    
    // Calculate overall drift score (weighted average of triggered indicators)
    const triggeredIndicators = indicators.filter(i => i.triggered);
    const overallScore = this.calculateOverallScore(indicators);
    
    // Determine if drifted
    const isDrifted = overallScore >= this.config.driftThreshold;
    
    // Determine recommended action
    const recommendedAction = this.determineAction(overallScore, triggeredIndicators);
    
    // Get historical context
    const historicalContext = this.getHistoricalContext(fingerprint);
    
    const result: DriftDetectionResult = {
      driftScore: Math.round(overallScore * 1000) / 1000,
      isDrifted,
      triggeredIndicators: triggeredIndicators.map(i => i.indicator),
      recommendedAction,
      indicatorDetails: indicators,
      historicalContext,
    };
    
    // Log significant drift
    if (isDrifted) {
      logger.warn("[drift] Pattern drift detected", {
        fingerprint: fingerprint.slice(0, 12),
        driftScore: result.driftScore,
        triggeredIndicators: result.triggeredIndicators.length,
        recommendedAction: result.recommendedAction,
      });
    }
    
    return result;
  }
  
  /**
   * Update baseline with new extraction data.
   */
  updateBaseline(
    fingerprint: string,
    extractedData: Invoice,
    success: boolean
  ): void {
    let baseline = this.baselines.get(fingerprint);
    
    if (!baseline) {
      baseline = this.createBaseline(fingerprint);
    }
    
    // Update value baselines for numeric fields
    this.updateValueBaselines(baseline, extractedData);
    
    // Update performance metrics
    if (success) {
      baseline.historicalSuccessRate = 
        (baseline.historicalSuccessRate * baseline.sampleSize + 1) / (baseline.sampleSize + 1);
    } else {
      baseline.historicalSuccessRate = 
        (baseline.historicalSuccessRate * baseline.sampleSize) / (baseline.sampleSize + 1);
    }
    
    baseline.sampleSize++;
    baseline.lastUpdated = new Date().toISOString();
    
    this.baselines.set(fingerprint, baseline);
  }
  
  // ─── Private Methods ─────────────────────────────────────
  
  private recordExtraction(
    fingerprint: string,
    data: {
      success: boolean;
      confidence: number;
      extractedData: Partial<Invoice>;
    }
  ): void {
    if (!this.recentExtractions.has(fingerprint)) {
      this.recentExtractions.set(fingerprint, []);
    }
    
    const extractions = this.recentExtractions.get(fingerprint)!;
    extractions.push({
      timestamp: Date.now(),
      ...data,
    });
    
    // Keep only recent extractions within window
    const cutoff = Date.now() - this.config.temporalWindowMs;
    const filtered = extractions.filter(e => e.timestamp >= cutoff);
    this.recentExtractions.set(fingerprint, filtered);
  }
  
  private getOrCreateBaseline(fingerprint: string): DriftBaseline {
    let baseline = this.baselines.get(fingerprint);
    
    if (!baseline) {
      baseline = this.createBaseline(fingerprint);
      this.baselines.set(fingerprint, baseline);
    }
    
    return baseline;
  }
  
  private createBaseline(fingerprint: string): DriftBaseline {
    return {
      fingerprint,
      valueBaselines: {},
      expectedFields: [],
      fieldOrderConfidence: 0,
      historicalSuccessRate: 1.0, // Start optimistic
      historicalAvgConfidence: 0.9,
      sampleSize: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }
  
  private checkValueDistribution(
    baseline: DriftBaseline,
    data: Invoice
  ): IndicatorDetail {
    let maxDeviation = 0;
    const checkedFields = ["total", "subtotal", "tax"];
    
    for (const field of checkedFields) {
      const value = (data as Record<string, unknown>)[field];
      if (typeof value !== "number") continue;
      
      const fieldBaseline = baseline.valueBaselines[field];
      if (!fieldBaseline || fieldBaseline.sampleCount < this.config.minSamplesForBaseline) continue;
      
      // Calculate z-score-like deviation
      if (fieldBaseline.stdDev > 0) {
        const deviation = Math.abs(value - fieldBaseline.mean) / fieldBaseline.stdDev;
        maxDeviation = Math.max(maxDeviation, deviation / 3); // Normalize to ~0-1
      }
    }
    
    const threshold = this.config.indicatorThresholds.value_distribution_shift;
    const triggered = maxDeviation >= threshold;
    
    return {
      indicator: "value_distribution_shift",
      score: Math.min(1, maxDeviation),
      threshold,
      triggered,
      details: `Max value deviation: ${(maxDeviation * 100).toFixed(1)}%`,
    };
  }
  
  private checkStructuralAnomaly(
    baseline: DriftBaseline,
    data: Invoice
  ): IndicatorDetail {
    // Check if expected fields are present
    const dataFields = Object.keys(data).filter(k => 
      data[k as keyof Invoice] !== undefined && data[k as keyof Invoice] !== null
    );
    
    // Simple check: are we missing fields that should be there?
    const missingFields = baseline.expectedFields.filter(f => !dataFields.includes(f));
    const extraFields = dataFields.filter(f => !baseline.expectedFields.includes(f) && 
      !["id", "rawText", "metadata"].includes(f));
    
    const anomalyScore = (
      (missingFields.length * 0.3) + 
      (extraFields.length * 0.2)
    ) / Math.max(1, baseline.expectedFields.length);
    
    const threshold = this.config.indicatorThresholds.structural_anomaly;
    const triggered = anomalyScore >= threshold;
    
    return {
      indicator: "structural_anomaly",
      score: Math.min(1, anomalyScore),
      threshold,
      triggered,
      details: `Missing: ${missingFields.join(", ")}, Extra: ${extraFields.join(", ")}`,
    };
  }
  
  private checkConfidenceDegradation(
    baseline: DriftBaseline,
    currentConfidence: number
  ): IndicatorDetail {
    if (baseline.sampleSize < this.config.minSamplesForBaseline) {
      return {
        indicator: "confidence_degradation",
        score: 0,
        threshold: this.config.indicatorThresholds.confidence_degradation,
        triggered: false,
        details: "Insufficient baseline data",
      };
    }
    
    const degradation = baseline.historicalAvgConfidence - currentConfidence;
    const normalizedDegradation = Math.max(0, degradation); // Only positive degradation
    
    const threshold = this.config.indicatorThresholds.confidence_degradation;
    const triggered = normalizedDegradation >= threshold;
    
    return {
      indicator: "confidence_degradation",
      score: Math.min(1, normalizedDegradation * 2), // Amplify for visibility
      threshold,
      triggered,
      details: `Historical: ${(baseline.historicalAvgConfidence*100).toFixed(1)}%, Current: ${(currentConfidence*100).toFixed(1)}%`,
    };
  }
  
  private checkTemporalFailureCluster(
    fingerprint: string
  ): IndicatorDetail {
    const recentExtractions = this.recentExtractions.get(fingerprint) || [];
    
    if (recentExtractions.length < 5) {
      return {
        indicator: "temporal_failure_cluster",
        score: 0,
        threshold: this.config.indicatorThresholds.temporal_failure_cluster,
        triggered: false,
        details: "Insufficient recent data",
      };
    }
    
    // Check failure rate in recent window
    const recentFailures = recentExtractions.filter(e => !e.success).length;
    const failureRate = recentFailures / recentExtractions.length;
    
    // Also check for consecutive failures
    let maxConsecutiveFailures = 0;
    let currentStreak = 0;
    for (const e of recentExtractions.reverse()) {
      if (!e.success) {
        currentStreak++;
        maxConsecutiveFailures = Math.max(maxConsecutiveFailures, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    
    // Combine both metrics
    const clusterScore = (failureRate * 0.6) + ((maxConsecutiveFailures / 5) * 0.4);
    
    const threshold = this.config.indicatorThresholds.temporal_failure_cluster;
    const triggered = clusterScore >= threshold;
    
    return {
      indicator: "temporal_failure_cluster",
      score: Math.min(1, clusterScore),
      threshold,
      triggered,
      details: `Recent failure rate: ${(failureRate*100).toFixed(1)}%, Max consecutive: ${maxConsecutiveFailures}`,
    };
  }
  
  private checkFieldAbsence(
    baseline: DriftBaseline,
    data: Invoice
  ): IndicatorDetail {
    // Critical fields that should always be present
    const criticalFields = ["total", "date", "supplierName"];
    const missingCritical = criticalFields.filter(f => 
      data[f as keyof Invoice] === undefined || data[f as keyof Invoice] === null
    );
    
    const absenceScore = missingCritical.length / criticalFields.length;
    
    const threshold = this.config.indicatorThresholds.field_absence;
    const triggered = absenceScore >= threshold;
    
    return {
      indicator: "field_absence",
      score: absenceScore,
      threshold,
      triggered,
      details: `Missing critical fields: ${missingCritical.join(", ") || "none"}`,
    };
  }
  
  private checkEncodingChange(
    baseline: DriftBaseline,
    data: Invoice
  ): IndicatorDetail {
    // Check for unexpected encoding patterns
    const textFields = ["supplierName", "customerName", "notes"];
    let encodingAnomalies = 0;
    
    for (const field of textFields) {
      const value = (data as Record<string, unknown>)[field];
      if (typeof value !== "string") continue;
      
      // Check for mixed encodings or unusual characters
      const hasArabic = /[\u0600-\u06FF]/.test(value);
      const hasLatin = /[a-zA-Z]/.test(value);
      const hasUnusualChars = /[^\u0000-\u007F\u0600-\u06FF]/.test(value);
      
      if (hasUnusualChars) encodingAnomalies++;
      if (hasArabic && hasLatin && value.length < 10) encodingAnomalies += 0.5;
    }
    
    const encodingScore = Math.min(1, encodingAnomalies / textFields.length);
    
    const threshold = this.config.indicatorThresholds.encoding_change;
    const triggered = encodingScore >= threshold;
    
    return {
      indicator: "encoding_change",
      score: encodingScore,
      threshold,
      triggered,
      details: `${encodingAnomalies} encoding anomalies detected`,
    };
  }
  
  private calculateOverallScore(indicators: IndicatorDetail[]): number {
    if (indicators.length === 0) return 0;
    
    // Weighted sum of triggered indicators
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const indicator of indicators) {
      const weight = indicator.triggered ? 1 : 0.2; // Even non-triggered contribute slightly
      weightedSum += indicator.score * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }
  
  private determineAction(
    overallScore: number,
    triggeredIndicators: IndicatorDetail[]
  ): DriftDetectionResult["recommendedAction"] {
    // High drift → fallback to AI immediately
    if (overallScore >= 0.4) {
      return "fallback_to_ai";
    }
    
    // Medium drift with structural issues → relearn
    if (overallScore >= 0.25 && 
        triggeredIndicators.some(i => i.indicator === "structural_anomaly")) {
      return "relearn_pattern";
    }
    
    // Low-medium drift → verify carefully
    if (overallScore >= this.config.driftThreshold) {
      return "verify";
    }
    
    // No significant drift → use pattern normally
    return "use_pattern";
  }
  
  private getHistoricalContext(fingerprint: string): DriftDetectionResult["historicalContext"] {
    const baseline = this.baselines.get(fingerprint);
    const recentExtractions = this.recentExtractions.get(fingerprint) || [];
    
    const recentFailures = recentExtractions.filter(e => !e.success).length;
    
    // Determine trend (simplified)
    let trend: "stable" | "improving" | "degrading" = "stable";
    if (recentExtractions.length >= 10) {
      const firstHalf = recentExtractions.slice(0, Math.floor(recentExtractions.length / 2));
      const secondHalf = recentExtractions.slice(Math.floor(recentExtractions.length / 2));
      
      const firstHalfSuccess = firstHalf.filter(e => e.success).length / firstHalf.length;
      const secondHalfSuccess = secondHalf.filter(e => e.success).length / secondHalf.length;
      
      if (secondHalfSuccess > firstHalfSuccess + 0.1) trend = "improving";
      else if (secondHalfSuccess < firstHalfSuccess - 0.1) trend = "degrading";
    }
    
    return {
      baselineExtractions: baseline?.sampleSize || 0,
      recentFailures,
      avgConfidenceTrend: trend,
    };
  }
  
  private updateValueBaselines(baseline: DriftBaseline, data: Invoice): void {
    const numericFields = ["total", "subtotal", "tax", "discount"];
    
    for (const field of numericFields) {
      const value = (data as Record<string, unknown>)[field];
      if (typeof value !== "number" || isNaN(value)) continue;
      
      if (!baseline.valueBaselines[field]) {
        baseline.valueBaselines[field] = {
          mean: value,
          stdDev: 0,
          min: value,
          max: value,
          lastUpdated: new Date().toISOString(),
          sampleCount: 1,
        } as  { mean: number; stdDev: number; min: number; max: number; sampleCount: number; lastUpdated: string };
        continue;
      }
      
      const fieldBaseline = baseline.valueBaselines[field] as  { mean: number; stdDev: number; min: number; max: number; sampleCount: number; lastUpdated: string };
      const n = fieldBaseline.sampleCount;
      
      // Online mean/stddev update
      const delta = value - fieldBaseline.mean;
      fieldBaseline.mean += delta / (n + 1);
      
      // Simplified stddev update (not perfectly accurate but efficient)
      const delta2 = value - fieldBaseline.mean;
      fieldBaseline.stdDev = Math.sqrt(
        (fieldBaseline.stdDev * fieldBaseline.stdDev * n + delta * delta2) / (n + 1)
      );
      
      fieldBaseline.min = Math.min(fieldBaseline.min, value);
      fieldBaseline.max = Math.max(fieldBaseline.max, value);
      fieldBaseline.lastUpdated = new Date().toISOString();
      fieldBaseline.sampleCount++;
    }
    
    // Update expected fields list
    const currentFields = Object.keys(data).filter(k => 
      data[k as keyof Invoice] !== undefined && 
      data[k as keyof Invoice] !== null &&
      !["id", "rawText", "metadata"].includes(k)
    );
    
    if (baseline.expectedFields.length === 0) {
      baseline.expectedFields = currentFields;
    } else {
      // Add any new fields we haven't seen before
      for (const field of currentFields) {
        if (!baseline.expectedFields.includes(field)) {
          baseline.expectedFields.push(field);
        }
      }
    }
  }
}

// ─── Singleton Instance ─────────────────────────────────────

let globalDetector: DriftDetector | null = null;

/**
 * Get global drift detector instance.
 */
export function getDriftDetector(config?: Partial<DriftConfig>): DriftDetector {
  if (!globalDetector) {
    globalDetector = new DriftDetector(config);
  }
  return globalDetector;
}
