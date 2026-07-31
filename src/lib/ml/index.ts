/**
 * ML Module Index — Unified exports for Machine Learning features
 *
 * This module provides:
 * - Product Learning Store: Record and learn from user corrections
 * - Pattern Learner: Extract patterns from correction data
 * - ML Matching Engine: Enhanced product matching with ML
 */

// Core Learning Store
export {
  recordCorrection,
  predictFromPatterns,
  batchTrain,
  getModelStats,
  loadPatternsToCache,
  clearCache,
  normalizeForPattern,
  calculatePatternScore,
} from "./productLearningStore";

export type {
  UserCorrection,
  LearnedPattern,
  MLModelStats,
} from "./productLearningStore";

// Pattern Learner
export {
  extractPatterns,
  extractAliasPatterns,
  learnNormalizationRules,
  extractBrandAssociations,
  learnContextualPatterns,
  classifyAlias,
  similarityScore,
} from "./patternLearner";

export type {
  ExtractedRule,
  NormalizationRule,
  BrandProductAssociation,
  LearningResult,
} from "./patternLearner";

// ML Matching Engine
export {
  mlMatchProduct,
  recordUserFeedback,
  trainFromHistory,
  initializeMLEngine,
  updateConfig,
  getConfig,
  getMetrics,
  resetMetrics,
} from "./mlMatchingEngine";

export type {
  MLEngineConfig,
  MLMatchResult,
} from "./mlMatchingEngine";
