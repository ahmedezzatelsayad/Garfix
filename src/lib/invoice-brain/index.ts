/**
 * invoice-brain/index.ts — public API of the invoice-brain module.
 * 
 * 🚀 PRODUCTION-READY: Includes all 6 critical systems:
 * 1. Layout-based Fingerprinting (v2)
 * 2. Smart Multi-rule Splitting
 * 3. Confidence-Based Pattern Learning
 * 4. Pattern Versioning System
 * 5. Drift Detection
 * 6. Human Review Loop
 * 7. High-Performance Fingerprint Cache
 * 8. Comprehensive Telemetry & Metrics
 */
export { InvoiceSchema, INVOICE_FIELDS } from "./schema";
export type { Invoice, InvoiceField } from "./schema";

// ─── Fingerprinting (Enhanced) ──────────────────────────────
export { 
  fingerprintText,           // Legacy content-based (kept for compat)
  fingerprintTextLayout,     // NEW: Layout-based (recommended)
  fingerprintTextHybrid,     // NEW: Hybrid with confidence scoring
  normalizeLabel,
  // Internal exports for advanced usage
  extractLayoutStructure,
  layoutToHashableString,
} from "./fingerprint";
export type { 
  FingerprintResult,
  LayoutToken,
  TokenType,
} from "./fingerprint";

// ─── Pattern Store ──────────────────────────────────────────
export {
  type PatternStore,
  type InvoiceTemplate,
  type FieldTemplate,
  JsonFilePatternStore,
  PrismaPatternStore,
} from "./patternStore";

// ─── Header Mapping ─────────────────────────────────────────
export {
  type HeaderMapStore,
  type HeaderMapping,
  fingerprintHeaders,
  JsonFileHeaderMapStore,
  PrismaHeaderMapStore,
} from "./headerMapStore";

// ─── Pattern Parsing & AI ───────────────────────────────────
export { extractWithTemplate } from "./patternParser";
export { extractWithAI, resolveUnknownHeadersWithAI, deriveTemplateFields } from "./aiFallback";

// ─── Verification ───────────────────────────────────────────
export { verifyExtractedFields } from "./verifyExtraction";
export type { VerificationResult } from "./verifyExtraction";

// ─── Main Extraction (Enhanced) ─────────────────────────────
export { 
  extractInvoice,            // Enhanced with confidence-based flow
  extractBatch,              // NEW: Batch processing with smart split
  extractInvoiceLegacy,      // Legacy alias for backward compatibility
} from "./extractInvoice";
export type { 
  ExtractionResult,          // Enhanced with new source types
  ExtractionSource,          // Now includes pattern-excellent, pattern-verified
} from "./extractInvoice";

// ─── Smart Splitting (NEW) ──────────────────────────────────
export {
  smartSplit,                // Multi-rule intelligent splitting
  quickSplit,                // Quick version (returns chunks only)
  estimateInvoiceCount,      // Estimate count without full parsing
} from "./smartSplit";
export type {
  SplitResult,               // Detailed split result with metadata
  SplitMetadata,             // Metadata about the split operation
  SplitRule,                 // Which rule was used
} from "./smartSplit";

// ─── Confidence Scoring System (NEW) ────────────────────────
export {
  calculateConfidence,       // Calculate confidence for a pattern
  createTrackedTemplate,      // Create new tracked template
  recordSuccess,             // Record successful extraction
  recordFailure,             // Record failed extraction
  shouldEvolvePattern,       // Check if pattern needs evolution
  evolvePattern,             // Create new version of pattern
  analyzeCompanyPatternHealth, // Analyze all patterns for a company
} from "./patternConfidence";
export type {
  ConfidenceMetrics,         // Full confidence analysis
  ConfidenceTier,            // excellent/good/moderate/low/unknown
  ConfidenceBreakdown,       // Score components
  TrackedTemplate,            // Template with tracking data
  CompanyPatternHealth,      // Health report for company patterns
} from "./patternConfidence";
export {
  parseTabular,
  parseTabularAllSheets,
  autoMapHeaders,
  extractFromTabular,
  extractFromTabularBatched,
} from "./excelParser";
export type { ParsedSheet } from "./excelParser";
export { ocrImageToText } from "./ocrAdapter";
export { extractFromSource, detectSourceKind } from "./extractFromSource";
export type { RawSource, SourceKind, Stores } from "./extractFromSource";
export {
  OrderSchema,
  mapBrainToOrder,
  normalizeCurrency,
  buildCompanyContext,
} from "./garfixAdapter";
export type { ParsedOrder, CompanyContext } from "./garfixAdapter";

// ─── Benchmark Suite (NEW) ──────────────────────────────────
export {
  runBenchmark,
  quickBenchmark,
} from "./benchmark/runner";
export type {
  BenchmarkResult,
  MetricResult,
  ProcessingTimeMetrics,
  SupplierBreakdown,
  ConfidenceDistribution,
  SplitRuleStats,
} from "./benchmark/runner";

export type {
  BenchmarkDataset,
  GeneratedInvoice,
  SupplierProfile as BenchmarkSupplier,
  DatasetConfig,
} from "./benchmark/dataset";
export { generateBenchmarkDataset as generateBenchmarkDatasetFromGenerator } from "./benchmark/dataset";

// ─── Pattern Versioning (NEW) ─────────────────────────────
export {
  PatternVersionManager,
  getPatternVersionManager,
  migrateToVersioned,
} from "./patternVersioning";
export type {
  VersionedPattern,
  PatternVersion,
  VersionStats,
  VersionTransition,
  PatternMetadata,
} from "./patternVersioning";

// ─── Drift Detection (NEW) ─────────────────────────────────
export {
  DriftDetector,
  getDriftDetector,
} from "./driftDetection";
export type {
  DriftDetectionResult,
  DriftIndicator,
  IndicatorDetail,
  DriftBaseline,
  DriftConfig,
} from "./driftDetection";

// ─── Human Review Loop (NEW) ───────────────────────────────
export {
  HumanReviewManager,
  getHumanReviewManager,
} from "./humanReview";
export type {
  ReviewItem,
  ReviewStatus,
  ReviewReason,
  SuggestedAction,
  ReviewCorrection,
  ReviewQueueStats,
} from "./humanReview";

// ─── Fingerprint Cache (NEW) ──────────────────────────────
export {
  FingerprintCache,
  getFingerprintCache,
  getCachedOrCompute,
  batchFingerprints,
} from "./fingerprintCache";
export type {
  CacheEntry,
  FingerprintCacheConfig,
  CacheStats,
} from "./fingerprintCache";

// ─── Telemetry & Metrics (NEW) ─────────────────────────────
export {
  TelemetryCollector,
  getTelemetryCollector,
  recordExtraction,
  METRIC_DEFINITIONS,
} from "./telemetry";
export type {
  TelemetryEvent,
  TelemetryEventType,
  MetricDefinition,
  MetricsSnapshot,
  DashboardData,
  HealthStatus,
} from "./telemetry";
