/**
 * invoice-brain/index.ts — public API of the invoice-brain module.
 * 
 * 🆕 ENHANCED: Now includes Layout-based Fingerprinting, Smart Splitting,
 * and Confidence-Based Pattern Learning (User's suggestions implemented).
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
