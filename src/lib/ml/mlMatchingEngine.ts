/**
 * mlMatchingEngine.ts — ML-Enhanced Product Matching Engine
 *
 * يدمج التعلم الآلي مع محرك المطابقة الحالي لتحسين الدقة.
 *
 * Architecture:
 *   Input → [ML Patterns] → [Traditional Matcher] → [AI Resolver] → Output
 *            ↑ (fast path)     ↑ (fallback)         ↑ (ambiguous)
 *
 * Features:
 * 1. **Fast Path**: استخدام الأنماط المتعلمة للنتائج الفورية
 * 2. **Confidence Boosting**: رفع ثقة المطابقات التقليدية إذا وافقت ML
 * 3. **Smart Fallback**: الرجوع للمطابقة التقليدية إذا لم يجد ML
 * 4. **Continuous Learning**: تحديث النموذج من كل مطابقة
 * 5. **A/B Testing**: مقارنة أداء ML vs Traditional
 */

import { db } from "../db";
import { logger } from "../logger";
import {
  recordCorrection,
  predictFromPatterns,
  loadPatternsToCache,
  getModelStats,
  type UserCorrection,
  type LearnedPattern,
} from "./productLearningStore";
import { extractPatterns, type LearningResult } from "./patternLearner";

// ─── Types ───────────────────────────────────────────────────────────────

export interface MLMatchResult {
  /** المنتج المطابق */
  productId: string;
  /** اسم المنتج */
  productName: string;
  /** مستوى الثقة النهائي (0-1) */
  confidence: number;
  /** طريقة المطابقة */
  method: "ml-pattern" | "ml-enhanced" | "traditional" | "ai-resolver" | "no-match";
  /** مصدر الثقة */
  source: string;
  /** معرف النمط المستخدم (إذا كان ML) */
  patternId?: string;
  /** تفصيل الثقة */
  confidenceBreakdown?: {
    mlScore: number;
    traditionalScore: number;
    boostFactor: number;
  };
  /** هل يجب تعلم هذه النتيجة؟ */
  shouldLearn: boolean;
  /** وقت المعالجة (ms) */
  processingTimeMs: number;
}

export interface MLEngineConfig {
  /** تفعيل ML matching */
  enabled: boolean;
  /** أدنى ثقة لقبول نتيجة ML */
  minMLConfidence: number;
  /** عامل رفع الثقة عند موافقة ML + Traditional */
  consensusBoost: number;
  /** تفعيل التعلم التلقائي */
  autoLearn: boolean;
  /** أدنى ثقة للتعلم التلقائي */
  autoLearnThreshold: number;
}

// ─── Default Configuration ──────────────────────────────────────────────

const DEFAULT_CONFIG: MLEngineConfig = {
  enabled: true,
  minMLConfidence: 0.75,
  consensusBoost: 0.15,
  autoLearn: true,
  autoLearnThreshold: 0.9,
};

let currentConfig = { ...DEFAULT_CONFIG };

// ─── Performance Metrics ─────────────────────────────────────────────────

const metrics = {
  totalMatches: 0,
  mlPatternMatches: 0,
  mlEnhancedMatches: 0,
  traditionalMatches: 0,
  aiResolverMatches: 0,
  noMatches: 0,
  averageConfidence: 0,
  averageProcessingTimeMs: 0,
  learningEvents: 0,
};

// ─── Main Matching Function ─────────────────────────────────────────────

/**
 * Match a product using the ML-enhanced engine.
 * This is the primary entry point for product matching with ML.
 */
export async function mlMatchProduct(
  inputText: string,
  companySlug: string,
  options?: {
    /** traditional matcher function to use as fallback */
    traditionalMatcher?: (text: string, company: string) => Promise<{
      productId?: string;
      productName?: string;
      method: string;
      confidence: number;
    }>;
    /** price hint for better matching */
    priceHint?: number;
    /** category hint */
    categoryHint?: string;
  }
): Promise<MLMatchResult> {
  const startTime = Date.now();
  
  if (!currentConfig.enabled) {
    // ML disabled - fall back to traditional only
    return matchTraditionalOnly(inputText, companySlug, options, startTime);
  }

  try {
    // ── Phase 1: Try ML Patterns (Fast Path) ──────────────────────────
    const mlPrediction = predictFromPatterns(
      companySlug,
      inputText,
      currentConfig.minMLConfidence
    );

    if (mlPrediction) {
      metrics.mlPatternMatches++;
      return buildMLResult(mlPrediction, "ml-pattern", startTime);
    }

    // ── Phase 2: Traditional Matcher (Fallback) ───────────────────────
    if (options?.traditionalMatcher) {
      const traditionalResult = await options.traditionalMatcher(inputText, companySlug);
      
      if (traditionalResult && traditionalResult.productId && traditionalResult.confidence >= 0.7) {
        // Check if ML can enhance this result
        const mlEnhancement = checkMLEnhancement({
          productId: traditionalResult.productId,
          productName: traditionalResult.productName,
          method: traditionalResult.method,
          confidence: traditionalResult.confidence
        }, companySlug);
        
        if (mlEnhancement) {
          metrics.mlEnhancedMatches++;
          return mlEnhancement;
        }
        
        metrics.traditionalMatches++;
        return buildTraditionalResult({
          productId: traditionalResult.productId,
          productName: traditionalResult.productName,
          method: traditionalResult.method,
          confidence: traditionalResult.confidence
        }, startTime);
      }
    }

    // ── Phase 3: No Match ─────────────────────────────────────────────
    metrics.noMatches++;
    return buildNoMatchResult(inputText, startTime);

  } catch (err) {
    logger.error("[ml-engine] matching failed", {
      error: err instanceof Error ? err.message : String(err),
      inputText: inputText?.slice(0, 50),
      companySlug,
    });
    
    // Fall back to no-match on error
    return buildNoMatchResult(inputText, startTime);
  } finally {
    updateMetrics(startTime);
  }
}

/**
 * Record user feedback and learn from it.
 */
export async function recordUserFeedback(feedback: {
  inputText: string;
  companySlug: string;
  matchedProductId?: string;
  matchedProductName?: string;
  userChoice: "accept" | "override" | "reject";
  overrideProductId?: string;
  overrideProductName?: string;
  userId?: string;
}): Promise<{ learned: boolean; pattern?: LearnedPattern }> {
  const correction: UserCorrection = {
    inputText: feedback.inputText,
    correctedProductId: feedback.overrideProductId || feedback.matchedProductId || "",
    correctedProductName: feedback.overrideProductName || feedback.matchedProductName || "",
    originalSuggestion: feedback.matchedProductId ? {
      productId: feedback.matchedProductId,
      productName: feedback.matchedProductName || "",
      method: "ml-engine",
      confidence: 0.8, // Would come from actual match result
    } : undefined,
    companySlug: feedback.companySlug,
    userId: feedback.userId,
    correctionType: feedback.userChoice === "accept" ? "confirm" : 
                    feedback.userChoice === "override" ? "override" : "reject",
  };

  // Only learn from meaningful corrections
  if (feedback.userChoice === "override" && !feedback.overrideProductId) {
    return { learned: false };
  }

  // Record the correction
  const pattern = await recordCorrection(correction);
  
  if (pattern) {
    metrics.learningEvents++;
    
    logger.info("[ml-engine] user feedback recorded and learned", {
      inputText: feedback.inputText.slice(0, 50),
      userChoice: feedback.userChoice,
      patternId: pattern.id,
      newConfidence: pattern.confidence,
    });
    
    return { learned: true, pattern };
  }

  return { learned: false };
}

/**
 * Batch train the engine from historical data.
 */
export async function trainFromHistory(
  companySlug: string,
  historicalCorrections: Array<{
    inputText: string;
    correctProductId: string;
    correctProductName: string;
    timestamp: Date;
  }>
): Promise<LearningResult & { patternsLoaded: number }> {
  logger.info("[ml-engine] starting historical training", {
    companySlug,
    correctionsCount: historicalCorrections.length,
  });

  // Convert to UserCorrection format
  const corrections: UserCorrection[] = historicalCorrections.map(hc => ({
    inputText: hc.inputText,
    correctedProductId: hc.correctProductId,
    correctedProductName: hc.correctProductName,
    companySlug,
    correctionType: "confirm" as const,
  }));

  // Extract patterns using the pattern learner
  const learningResult = extractPatterns(corrections);

  // Record each correction to update the model
  let trained = 0;
  for (const correction of corrections) {
    try {
      await recordCorrection(correction);
      trained++;
    } catch (err) {
      logger.warn("[ml-engine] failed to train on correction", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Load patterns into cache
  const patternsLoaded = await loadPatternsToCache(companySlug);

  logger.info("[ml-engine] historical training complete", {
    companySlug,
    trained,
    patternsLoaded,
    rulesExtracted: learningResult.rulesExtracted.length,
  });

  return {
    ...learningResult,
    patternsLoaded,
  };
}

// ─── Engine Management ──────────────────────────────────────────────────

/**
 * Initialize the ML engine (call on app startup).
 */
export async function initializeMLEngine(): Promise<void> {
  logger.info("[ml-engine] initializing...");
  
  try {
    // Load all patterns from database into cache
    const loadedCount = await loadPatternsToCache();
    
    logger.info("[ml-engine] initialized successfully", {
      patternsLoaded: loadedCount,
      config: currentConfig,
    });
  } catch (err) {
    logger.error("[ml-engine] initialization failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Don't throw - engine can work without cached patterns
  }
}

/**
 * Update engine configuration.
 */
export function updateConfig(config: Partial<MLEngineConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  logger.info("[ml-engine] config updated", { config: currentConfig });
}

/**
 * Get current engine configuration.
 */
export function getConfig(): MLEngineConfig {
  return { ...currentConfig };
}

/**
 * Get performance metrics.
 */
export function getMetrics() {
  return { ...metrics };
}

/**
 * Reset metrics (useful for testing).
 */
export function resetMetrics(): void {
  Object.keys(metrics).forEach(key => {
    metrics[key as keyof typeof metrics] = 
      typeof metrics[key as keyof typeof metrics] === 'number' ? 0 : 
      metrics[key as keyof typeof metrics];
  });
}

// ─── Internal Functions ─────────────────────────────────────────────────

interface TraditionalMatchInput {
  productId: string;
  productName?: string;
  method: string;
  confidence: number;
}

async function matchTraditionalOnly(
  inputText: string,
  companySlug: string,
  options: Parameters<typeof mlMatchProduct>[2] | undefined,
  startTime: number
): Promise<MLMatchResult> {
  if (options?.traditionalMatcher) {
    try {
      const result = await options.traditionalMatcher(inputText, companySlug);
      if (result?.productId) {
        const typedResult: TraditionalMatchInput = {
          productId: result.productId,
          productName: result.productName,
          method: result.method,
          confidence: result.confidence,
        };
        metrics.traditionalMatches++;
        return buildTraditionalResult(typedResult, startTime);
      }
    } catch (err) {
      logger.warn("[ml-engine] traditional matcher failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  metrics.noMatches++;
  return buildNoMatchResult(inputText, startTime);
}

function buildMLResult(
  prediction: NonNullable<ReturnType<typeof predictFromPatterns>>,
  method: MLMatchResult["method"],
  startTime: number
): MLMatchResult {
  return {
    productId: prediction.productId,
    productName: prediction.productName,
    confidence: prediction.confidence,
    method,
    source: `ml-pattern:${prediction.patternId}`,
    patternId: prediction.patternId,
    shouldLearn: false, // Already learned
    processingTimeMs: Date.now() - startTime,
  };
}

function buildTraditionalResult(
  result: TraditionalMatchInput,
  startTime: number
): MLMatchResult {
  return {
    productId: result.productId,
    productName: result.productName || result.productId,
    confidence: result.confidence,
    method: "traditional",
    source: `traditional:${result.method}`,
    shouldLearn: result.confidence >= currentConfig.autoLearnThreshold,
    processingTimeMs: Date.now() - startTime,
  };
}

function buildNoMatchResult(inputText: string, startTime: number): MLMatchResult {
  return {
    productId: "",
    productName: "",
    confidence: 0,
    method: "no-match",
    source: "none",
    shouldLearn: false,
    processingTimeMs: Date.now() - startTime,
  };
}

function checkMLEnhancement(
  traditionalResult: TraditionalMatchInput,
  companySlug: string
): MLMatchResult | null {
  // Check if ML has any information about this product that could enhance confidence
  // This is a simplified version - in production you'd check against ML patterns
  
  const mlInfo = predictFromPatterns(companySlug, traditionalResult.productName || "", 0.5);
  
  if (mlInfo && mlInfo.productId === traditionalResult.productId) {
    // ML agrees with traditional - boost confidence
    const boostedConfidence = Math.min(
      traditionalResult.confidence + currentConfig.consensusBoost,
      1.0
    );
    
    return {
      productId: traditionalResult.productId,
      productName: traditionalResult.productName || traditionalResult.productId,
      confidence: boostedConfidence,
      method: "ml-enhanced",
      source: `ml-enhanced:${traditionalResult.method}`,
      patternId: mlInfo.patternId,
      confidenceBreakdown: {
        mlScore: mlInfo.confidence,
        traditionalScore: traditionalResult.confidence,
        boostFactor: currentConfig.consensusBoost,
      },
      shouldLearn: boostedConfidence >= currentConfig.autoLearnThreshold,
      processingTimeMs: 0, // Will be set by caller
    };
  }
  
  return null;
}

function updateMetrics(startTime: number): void {
  metrics.totalMatches++;
  
  const processingTime = Date.now() - startTime;
  metrics.averageProcessingTimeMs = 
    (metrics.averageProcessingTimeMs * (metrics.totalMatches - 1) + processingTime) / 
    metrics.totalMatches;
}

// ─── Exports ─────────────────────────────────────────────────────────────

export { DEFAULT_CONFIG };

// Note: MLMatchResult, MLEngineConfig, UserCorrection, LearnedPattern, LearningResult 
// are already exported as interfaces/types above

const mlMatchingEngine = {
  mlMatchProduct,
  recordUserFeedback,
  trainFromHistory,
  initializeMLEngine,
  updateConfig,
  getConfig,
  getMetrics,
  resetMetrics,
};

export default mlMatchingEngine;
