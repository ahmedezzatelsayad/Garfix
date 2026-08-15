/**
 * productLearningStore.ts — ML Training Store for User Corrections
 *
 * يخزن تصحيحات المستخدم ويستخدمها لتدريب النظام على تحسين المطابقة.
 *
 * Architecture:
 * - In-memory cache for fast lookups (per companySlug)
 * - Persistent storage via Prisma (ProductMatchAudit + new ML tables)
 * - Incremental learning: each correction updates the model immediately
 *
 * Features:
 * 1. Record user corrections (override / confirm / reject)
 * 2. Extract patterns from corrections (alias mappings, normalization rules)
 * 3. Maintain confidence scores per pattern
 * 4. Support batch training from historical data
 */

import { dbTyped as db } from "../db";
import { logger } from "../logger";

// ─── Types ───────────────────────────────────────────────────────────────

export interface UserCorrection {
  /** النص الأصلي من الفاتورة */
  inputText: string;
  /** المنتج الذي اختاره المستخدم (التصحيح) */
  correctedProductId: string;
  /** اسم المنتج المصحح */
  correctedProductName: string;
  /** ما كان النظام قد اقترحه قبل التصحيح */
  originalSuggestion?: {
    productId: string;
    productName: string;
    method: string;
    confidence: number;
  };
  /** سياق الشركة */
  companySlug: string;
  /** معرف المستخدم الذي أجرى التصحيح */
  userId?: string;
  /** نوع التصحيح */
  correctionType: "override" | "confirm" | "reject" | "new-alias";
}

export interface LearnedPattern {
  id: string;
  /** النمط المدخل (regex أو normalized text) */
  inputPattern: string;
  /** المنتج الصحيح لهذا النمط */
  targetProductId: string;
  /** اسم المنتج الهدف */
  targetProductName: string;
  /** عدد مرات التأكيد */
  confirmCount: number;
  /** عدد مرات الرفض/التغيير */
  rejectCount: number;
  /** الثقة المحسوبة (0-1) */
  confidence: number;
  /** مصدر التعلم */
  source: "user-correction" | "batch-training" | "ai-suggestion";
  /** آخر تحديث */
  lastAppliedAt: Date;
  /** الشركة */
  companySlug: string;
  /** الأسماء البديلة المستخرجة */
  extractedAliases: string[];
}

export interface MLModelStats {
  totalCorrections: number;
  totalPatterns: number;
  patternsByCompany: Record<string, number>;
  averageConfidence: number;
  topPatterns: LearnedPattern[];
  recentCorrections: UserCorrection[];
  learningRate: number;
}

// ─── In-Memory Cache ────────────────────────────────────────────────────

/**
 * Cache structure: companySlug → Map<inputPattern, LearnedPattern>
 * This provides O(1) lookup for known patterns during matching.
 */
const patternCache = new Map<string, Map<string, LearnedPattern>>();

/** Maximum cache size per company (LRU eviction would be ideal, but simple for now) */
const MAX_PATTERNS_PER_COMPANY = 1000;

/** Global stats counter */
const globalStats: MLModelStats = {
  totalCorrections: 0,
  totalPatterns: 0,
  patternsByCompany: {},
  averageConfidence: 0,
  topPatterns: [],
  recentCorrections: [],
  learningRate: 0.1, // Default learning rate
};

// ─── Core Functions ──────────────────────────────────────────────────────

/**
 * Record a user correction and update the ML model.
 * This is the PRIMARY entry point for learning from user actions.
 */
export async function recordCorrection(correction: UserCorrection): Promise<LearnedPattern | null> {
  const startTime = Date.now();
  
  try {
    // 1. Normalize the input text for pattern matching
    const normalizedInput = normalizeForPattern(correction.inputText);
    
    // 2. Check if we already have a pattern for this input
    const existingPattern = await findPattern(correction.companySlug, normalizedInput);
    
    let pattern: LearnedPattern;
    
    if (existingPattern) {
      // Update existing pattern
      pattern = await updatePattern(existingPattern, correction);
    } else {
      // Create new pattern
      pattern = await createNewPattern(correction, normalizedInput);
    }
    
    // 3. Update in-memory cache
    updateCache(pattern);
    
    // 4. Persist to database
    await persistPattern(pattern);
    
    // 5. Update global stats
    globalStats.totalCorrections++;
    globalStats.recentCorrections.unshift(correction);
    if (globalStats.recentCorrections.length > 100) {
      globalStats.recentCorrections.pop();
    }
    
    const duration = Date.now() - startTime;
    logger.info("[ml-store] correction recorded", {
      companySlug: correction.companySlug,
      inputText: correction.inputText.slice(0, 50),
      correctedProduct: correction.correctedProductName,
      patternId: pattern.id,
      confidence: pattern.confidence,
      durationMs: duration,
    });
    
    return pattern;
  } catch (err) {
    logger.error("[ml-store] failed to record correction", {
      error: err instanceof Error ? err.message : String(err),
      inputText: correction.inputText?.slice(0, 50),
    });
    return null;
  }
}

/**
 * Find the best matching product using learned patterns.
 * This integrates with the main productMatcher pipeline.
 */
export function predictFromPatterns(
  companySlug: string,
  inputText: string,
  minConfidence: number = 0.7
): { productId: string; productName: string; confidence: number; patternId: string } | null {
  const normalizedInput = normalizeForPattern(inputText);
  const companyPatterns = patternCache.get(companySlug);
  
  if (!companyPatterns || companyPatterns.size === 0) {
    return null; // No learned patterns for this company yet
  }
  
  // 1. Exact match first (fastest)
  const exactMatch = companyPatterns.get(normalizedInput);
  if (exactMatch && exactMatch.confidence >= minConfidence) {
    return {
      productId: exactMatch.targetProductId,
      productName: exactMatch.targetProductName,
      confidence: exactMatch.confidence,
      patternId: exactMatch.id,
    };
  }
  
  // 2. Fuzzy match against all patterns (slower but more flexible)
  let bestMatch: { pattern: LearnedPattern; score: number } | null = null;
  
  for (const pattern of companyPatterns.values()) {
    if (pattern.confidence < minConfidence) continue;
    
    const score = calculatePatternScore(normalizedInput, pattern.inputPattern);
    
    if (score >= minConfidence && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { pattern, score };
    }
  }
  
  if (bestMatch) {
    return {
      productId: bestMatch.pattern.targetProductId,
      productName: bestMatch.pattern.targetProductName,
      confidence: Math.min(bestMatch.score, bestMatch.pattern.confidence), // Cap by pattern confidence
      patternId: bestMatch.pattern.id,
    };
  }
  
  return null;
}

/**
 * Batch train the model from historical correction data.
 * Useful for initial setup or periodic retraining.
 */
export async function batchTrain(
  companySlug: string,
  corrections: UserCorrection[]
): Promise<{ trained: number; failed: number; patternsCreated: number }> {
  let trained = 0;
  let failed = 0;
  let patternsCreated = 0;
  
  logger.info("[ml-store] starting batch training", {
    companySlug,
    correctionsCount: corrections.length,
  });
  
  for (const correction of corrections) {
    try {
      const result = await recordCorrection(correction);
      if (result) {
        trained++;
        // Check if this created a new pattern (not just updated)
        if (result.confirmCount === 1 && result.rejectCount === 0) {
          patternsCreated++;
        }
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      logger.warn("[ml-store] batch training item failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  logger.info("[ml-store] batch training complete", {
    companySlug,
    trained,
    failed,
    patternsCreated,
  });
  
  return { trained, failed, patternsCreated };
}

/**
 * Get statistics about the current ML model state.
 */
export function getModelStats(): MLModelStats {
  return { ...globalStats };
}

/**
 * Load patterns from database into memory cache.
 * Called on application startup.
 */
export async function loadPatternsToCache(companySlug?: string): Promise<number> {
  try {
    const where = companySlug ? { companySlug } : {};
    
    // Query learned patterns from DB (we'll use ProductMatchAudit with resolvedBy='user')
    const audits = await db.productMatchAudit.findMany({
      where: {
        ...where,
        resolvedBy: "user",
        isUndone: false,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PATTERNS_PER_COMPANY * 2, // Get more than needed, we'll filter
    });
    
    let loadedCount = 0;
    
    for (const audit of audits) {
      if (!audit.matchedAlias || !audit.matchedProductId) continue;
      
      const pattern: LearnedPattern = {
        id: audit.id,
        inputPattern: audit.inputText,
        targetProductId: audit.matchedProductId,
        targetProductName: audit.matchedAlias, // Store the matched alias as name
        confirmCount: audit.tier === "auto-match" ? 1 : 0,
        rejectCount: audit.tier === "no_match" ? 1 : 0,
        confidence: Number(audit.confidence) || 0.5,
        source: "user-correction",
        lastAppliedAt: audit.updatedAt || audit.createdAt,
        companySlug: audit.companySlug,
        extractedAliases: [],
      };
      
      updateCache(pattern);
      loadedCount++;
    }
    
    globalStats.totalPatterns = loadedCount;
    
    logger.info("[ml-store] patterns loaded to cache", {
      companySlug: companySlug || "all",
      loadedCount,
    });
    
    return loadedCount;
  } catch (err) {
    logger.error("[ml-store] failed to load patterns to cache", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Clear the in-memory cache (useful for testing or forced refresh).
 */
export function clearCache(companySlug?: string): void {
  if (companySlug) {
    patternCache.delete(companySlug);
  } else {
    patternCache.clear();
  }
  logger.info("[ml-store] cache cleared", { companySlug: companySlug || "all" });
}

// ─── Helper Functions ────────────────────────────────────────────────────

/**
 * Normalize text for pattern matching.
 * More aggressive than Arabic normalization - optimized for ML patterns.
 */
function normalizeForPattern(text: string): string {
  if (!text) return "";
  
  return text
    .toLowerCase()
    .trim()
    // Remove extra whitespace
    .replace(/\s+/g, " ")
    // Remove common punctuation that doesn't affect meaning
    .replace(/[.,;:!?()[\]{}]/g, "")
    // Normalize Arabic-Indic digits
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    // Remove leading/trailing whitespace again
    .trim();
}

/**
 * Find an existing pattern for the given input.
 */
async function findPattern(
  companySlug: string,
  normalizedInput: string
): Promise<LearnedPattern | null> {
  // Check cache first
  const companyPatterns = patternCache.get(companySlug);
  if (companyPatterns) {
    const cached = companyPatterns.get(normalizedInput);
    if (cached) return cached;
  }
  
  // Check database
  const audit = await db.productMatchAudit.findFirst({
    where: {
      companySlug,
      inputText: normalizedInput,
      resolvedBy: "user",
      isUndone: false,
    },
    orderBy: { updatedAt: "desc" },
  });
  
  if (audit && audit.matchedProductId) {
    return {
      id: audit.id,
      inputPattern: audit.inputText,
      targetProductId: audit.matchedProductId,
      targetProductName: audit.matchedAlias || "",
      confirmCount: audit.action === "user-confirmed" ? 1 : 0,
      rejectCount: audit.action === "user-overridden" ? 1 : 0,
      confidence: Number(audit.confidence) || 0.5,
      source: "user-correction",
      lastAppliedAt: audit.updatedAt || audit.createdAt,
      companySlug: audit.companySlug,
      extractedAliases: [],
    };
  }
  
  return null;
}

/**
 * Create a new pattern from a user correction.
 */
async function createNewPattern(
  correction: UserCorrection,
  normalizedInput: string
): Promise<LearnedPattern> {
  const id = `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Extract potential aliases from the input
  const aliases = extractPotentialAliases(correction.inputText, correction.correctedProductName);
  
  const pattern: LearnedPattern = {
    id,
    inputPattern: normalizedInput,
    targetProductId: correction.correctedProductId,
    targetProductName: correction.correctedProductName,
    confirmCount: correction.correctionType === "confirm" ? 1 : 0,
    rejectCount: correction.correctionType === "reject" ? 1 : 0,
    confidence: calculateInitialConfidence(correction),
    source: "user-correction",
    lastAppliedAt: new Date(),
    companySlug: correction.companySlug,
    extractedAliases: aliases,
  };
  
  return pattern;
}

/**
 * Update an existing pattern based on new correction.
 */
async function updatePattern(
  existing: LearnedPattern,
  correction: UserCorrection
): Promise<LearnedPattern> {
  // Update counts based on correction type
  switch (correction.correctionType) {
    case "confirm":
      existing.confirmCount++;
      break;
    case "reject":
    case "override":
      existing.rejectCount++;
      break;
    case "new-alias":
      // Add new alias if not already present
      const newAlias = correction.inputText.toLowerCase().trim();
      if (!existing.extractedAliases.includes(newAlias)) {
        existing.extractedAliases.push(newAlias);
      }
      existing.confirmCount++;
      break;
  }
  
  // Recalculate confidence
  existing.confidence = recalculateConfidence(existing);
  existing.lastAppliedAt = new Date();
  
  // If correction points to a different product, update the target
  if (existing.targetProductId !== correction.correctedProductId) {
    // This is a significant change - log it and update
    logger.info("[ml-store] pattern target changed", {
      patternId: existing.id,
      oldTarget: existing.targetProductId,
      newTarget: correction.correctedProductId,
      input: correction.inputText.slice(0, 50),
    });
    
    existing.targetProductId = correction.correctedProductId;
    existing.targetProductName = correction.correctedProductName;
    // Reset confidence when target changes significantly
    existing.confidence = Math.max(existing.confidence * 0.5, 0.3);
  }
  
  return existing;
}

/**
 * Calculate initial confidence for a new pattern.
 */
function calculateInitialConfidence(correction: UserCorrection): number {
  // Base confidence depends on correction type
  let baseConfidence: number;
  
  switch (correction.correctionType) {
    case "confirm":
      baseConfidence = 0.8; // High confidence for confirmations
      break;
    case "new-alias":
      baseConfidence = 0.75; // Good confidence for new aliases
      break;
    case "override":
      baseConfidence = 0.6; // Moderate confidence for overrides (might be edge case)
      break;
    case "reject":
      baseConfidence = 0.4; // Low confidence for rejections
      break;
    default:
      baseConfidence = 0.5;
  }
  
  // Boost if there was an original suggestion that was wrong
  // (means user actively chose something different)
  if (correction.originalSuggestion && 
      correction.originalSuggestion.productId !== correction.correctedProductId) {
    baseConfidence *= 1.1; // 10% boost
  }
  
  // Cap at 0.95 (never 100% certain for new patterns)
  return Math.min(baseConfidence, 0.95);
}

/**
 * Recalculate confidence based on confirmation/rejection history.
 * Uses a Bayesian-inspired approach.
 */
function recalculateConfidence(pattern: LearnedPattern): number {
  const total = pattern.confirmCount + pattern.rejectCount;
  
  if (total === 0) return pattern.confidence;
  
  // Simple success rate with smoothing
  const successRate = pattern.confirmCount / total;
  
  // Apply learning rate (recent corrections matter more)
  const smoothedConfidence = (
    pattern.confidence * (1 - globalStats.learningRate) +
    successRate * globalStats.learningRate
  );
  
  // Boost for patterns with many confirmations
  const experienceBoost = Math.min(pattern.confirmCount * 0.02, 0.15); // Max 15% boost
  
  return Math.min(Math.max(smoothedConfidence + experienceBoost, 0), 1);
}

/**
 * Calculate similarity score between input and pattern.
 */
function calculatePatternScore(input: string, pattern: string): number {
  if (input === pattern) return 1.0;
  
  // Exact substring match
  if (input.includes(pattern) || pattern.includes(input)) {
    return 0.9;
  }
  
  // Word-level overlap
  const inputWords = new Set(input.split(" ").filter(w => w.length > 1));
  const patternWords = new Set(pattern.split(" ").filter(w => w.length > 1));
  
  if (inputWords.size === 0 && patternWords.size === 0) return 1.0;
  if (inputWords.size === 0 || patternWords.size === 0) return 0.0;
  
  let intersection = 0;
  for (const word of inputWords) {
    if (patternWords.has(word)) intersection++;
  }
  
  const union = inputWords.size + patternWords.size - intersection;
  const jaccard = intersection / union;
  
  // Levenshtein for short strings
  if (input.length < 30 && pattern.length < 30) {
    const levSim = levenshteinSimilarity(input, pattern);
    return Math.max(jaccard, levSim);
  }
  
  return jaccard;
}

/**
 * Simple Levenshtein similarity (0-1).
 */
function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return 1 - matrix[a.length][b.length] / maxLen;
}

/**
 * Extract potential aliases from input text.
 */
function extractPotentialAliases(inputText: string, productName: string): string[] {
  const aliases: string[] = [];
  const normalizedInput = normalizeForPattern(inputText);
  const normalizedProduct = normalizeForPattern(productName);
  
  // Don't add if they're too similar
  if (normalizedInput === normalizedProduct || 
      normalizedInput.includes(normalizedProduct) ||
      normalizedProduct.includes(normalizedInput)) {
    return aliases;
  }
  
  // Add the original input as a potential alias
  aliases.push(normalizedInput);
  
  // Extract shortened versions (e.g., "filter oil" from "oil filter for car")
  const words = normalizedInput.split(" ");
  if (words.length > 2) {
    // Try bigrams and trigrams
    for (let len = 2; len <= Math.min(words.length, 3); len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const ngram = words.slice(i, i + len).join(" ");
        if (ngram !== normalizedProduct && !aliases.includes(ngram)) {
          aliases.push(ngram);
        }
      }
    }
  }
  
  return aliases;
}

/**
 * Update the in-memory cache with a pattern.
 */
function updateCache(pattern: LearnedPattern): void {
  let companyPatterns = patternCache.get(pattern.companySlug);
  
  if (!companyPatterns) {
    companyPatterns = new Map();
    patternCache.set(pattern.companySlug, companyPatterns);
  }
  
  // Evict oldest if at capacity
  if (companyPatterns.size >= MAX_PATTERNS_PER_COMPANY && !companyPatterns.has(pattern.inputPattern)) {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, value] of companyPatterns.entries()) {
      if (value.lastAppliedAt.getTime() < oldestTime) {
        oldestTime = value.lastAppliedAt.getTime();
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      companyPatterns.delete(oldestKey);
    }
  }
  
  companyPatterns.set(pattern.inputPattern, pattern);
}

/**
 * Persist pattern to database (creates/updates audit record).
 */
async function persistPattern(pattern: LearnedPattern): Promise<void> {
  try {
    // Upsert into ProductMatchAudit as a user-resolved record
    await db.productMatchAudit.upsert({
      where: { id: pattern.id },
      create: {
        id: pattern.id,
        companySlug: pattern.companySlug,
        inputText: pattern.inputPattern,
        matchedProductId: pattern.targetProductId,
        matchTier: "auto-match", // Learned patterns are treated as auto-matches
        tier: "auto-match",
        confidence: pattern.confidence,
        action: "user-confirmed",
        resolvedBy: "user",
        matchedAlias: pattern.targetProductName,
        isUndone: false,
      },
      update: {
        matchedProductId: pattern.targetProductId,
        matchTier: "auto-match",
        tier: "auto-match",
        confidence: pattern.confidence,
        action: pattern.confirmCount > pattern.rejectCount ? "user-confirmed" : "user-overridden",
        matchedAlias: pattern.targetProductName,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    // Log but don't throw - cache is still valid
    logger.warn("[ml-store] failed to persist pattern to DB", {
      patternId: pattern.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────

// Note: Main functions (recordCorrection, predictFromPatterns, etc.) are exported individually above
// clearCache is exported both individually and in the default export for convenience

export {
  normalizeForPattern,
  calculatePatternScore,
};

const productLearningStore = {
  recordCorrection,
  predictFromPatterns,
  batchTrain,
  getModelStats,
  loadPatternsToCache,
  clearCache,
};

export default productLearningStore;
