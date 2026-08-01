/**
 * invoice-brain/smartSplit.ts — Multi-rule intelligent batch splitting
 *
 * ═══════════════════════════════════════════════════════════════
 *  IMPROVEMENT: Multi-rule Smart Splitting (User's Suggestion)
 * ═══════════════════════════════════════════════════════════════
 *
 * OLD PROBLEM:
 *   - Only split at "---" separator
 *   - Users who use newlines or other separators get ONE big chunk
 *   - Single chunk may contain 100+ invoices (bad for AI processing)
 *
 * NEW SOLUTION:
 *   - Multiple splitting rules with priority ordering
 *   - Detects invoice boundaries intelligently
 *   - Handles Arabic and English formats
 *   - Falls back gracefully when no clear boundary found
 *
 * SPLITTING RULES (in priority order):
 * ─────────────────────────────────────────────────────────────
 * 1. EXPLICIT: "---" or "***" or "==="
 * 2. DOUBLE_NEWLINE: \n\n or more
 * 3. INVOICE_MARKER: "فاتورة ضريبية", "Tax Invoice", "Invoice #"
 * 4. NEW_SUPPLIER: New supplier/customer name detected
 * 5. STRUCTURAL: Repeated header patterns (Date, Total, etc.)
 * ═══════════════════════════════════════════════════════════════
 */

import { normalizeLine } from "./normalize";

// ─── Types ───────────────────────────────────────────────────

export interface SplitResult {
  /** Individual invoice/document chunks */
  chunks: string[];
  /** Which rule was used for primary split */
  primaryRule: SplitRule;
  /** Confidence in the split quality (0-1) */
  confidence: number;
  /** Metadata about the split operation */
  metadata: SplitMetadata;
}

export interface SplitMetadata {
  totalChunks: number;
  averageChunkLength: number;
  maxChunkLength: number;
  minChunkLength: number;
  rulesDetected: SplitRule[];
  warnings: string[];
}

export type SplitRule =
  | "explicit_separator"    // ---, ***, ===
  | "double_newline"        // \n\n or more
  | "invoice_marker"        // "فاتورة", "Invoice #", etc.
  | "supplier_change"       // New supplier name detected
  | "structural_repeat"     // Repeated header patterns
  | "no_split"              // No clear boundary found
  | "fallback";             // Used heuristics

// ─── Split Rule Patterns ─────────────────────────────────────

const SPLIT_RULES = {
  // Rule 1: Explicit separators (highest priority)
  explicitSeparator: {
    patterns: [
      /\n\s*-{3,}\s*\n/,           // ---
      /\n\s*\*{3,}\s*\n/,          // ***
      /\n\s*={3,}\s*\n/,           // ===
      /\n\s*~{3,}\s*\n/,           // ~~~
    ],
    name: "explicit_separator" as SplitRule,
    priority: 1,
    confidence: 0.98,              // Very reliable
  },

  // Rule 2: Double or more newlines
  doubleNewline: {
    pattern: /\n{2,}/,
    name: "double_newline" as SplitRule,
    priority: 2,
    confidence: 0.85,              // Usually correct
  },

  // Rule 3: Invoice document markers (Arabic + English)
  invoiceMarker: {
    patterns: [
      // Arabic markers
      /(?:^|\n)\s*(?:فاتورة\s+(?:ضريبية|مبيعات|شراء)|إيصال|أمر\s+توريد|طلب\s+شراء)/i,
      // English markers  
      /(?:^|\n)\s*(?:Tax\s+Invoice|Sales\s+Invoice|Purchase\s+Order|Proforma\s+Invoice)/i,
      // Invoice number pattern
      /(?:^|\n)\s*(?:Invoice|Inv\.?|FV|SI|PI)\s*[#\-]?\s*\d+/i,
      // Arabic invoice number
      /(?:^|\n)\s*(?:رقم\s+الفاتورة|ف\.?\s*ن)\s*[:\#]?\s*\d+/i,
    ],
    name: "invoice_marker" as SplitRule,
    priority: 3,
    confidence: 0.90,
  },

  // Rule 4: Supplier/Customer name change detection
  supplierChange: {
    patterns: [
      // From/To patterns
      /(?:^|\n)\s*(?:من|From|المورد|Supplier|Vendor)\s*:/i,
      /(?:^|\n)\s*(?:إلى|To|العميل|Customer|Client)\s*:/i,
      // Company name followed by address
      /(?:^|\n)\s*[\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z\s&]+(?:ش\.?م|mme|ltd|co\.?|corp\.?|inc\.?)/i,
    ],
    name: "supplier_change" as SplitRule,
    priority: 4,
    confidence: 0.75,
  },

  // Rule 5: Structural repetition (same headers appearing again)
  structuralRepeat: {
    // Detect repeated date/total patterns that indicate new invoice
    patterns: [
      /(?:^|\n)\s*(?:التاريخ|Date|تاريخ)\s*[:\s]*\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g,
      /(?:^|\n)\s*(?:الإجمالي|المجموع|Total)\s*[:\s]*[\d,]+(?:\.\d{2})?/g,
    ],
    name: "structural_repeat" as SplitRule,
    priority: 5,
    confidence: 0.65,
  },
};

// ─── Main Smart Split Function ──────────────────────────────

/**
 * 🆕 SMART SPLIT - Multi-rule intelligent batch splitting
 * 
 * Intelligently splits bulk text into individual invoice chunks
 * using multiple detection rules with priority ordering.
 * 
 * @param rawText - Raw text containing potentially multiple invoices
 * @returns SplitResult with chunks and metadata
 * 
 * @example
 * const result = smartSplit(text);
 * console.log(result.chunks.length); // Number of invoices detected
 * console.log(result.primaryRule);   // Which rule was used
 * console.log(result.confidence);    // How confident we are
 */
export function smartSplit(rawText: string): SplitResult {
  if (!rawText || !rawText.trim()) {
    return createEmptyResult();
  }

  const text = rawText.trim();
  const rulesDetected: SplitRule[] = [];
  
  // Try each rule in priority order
  for (const priority of [1, 2, 3, 4, 5]) {
    const result = trySplitWithRule(text, priority, rulesDetected);
    
    if (result && isValidSplit(result.chunks, text)) {
      rulesDetected.push(result.rule);
      
      return {
        chunks: result.chunks,
        primaryRule: result.rule,
        confidence: getRuleConfidence(result.rule),
        metadata: buildMetadata(result.chunks, rulesDetected),
      };
    }
  }

  // Fallback: Return as single chunk with warning
  return {
    chunks: [text],
    primaryRule: "no_split",
    confidence: 0.3,
    metadata: buildMetadata([text], ["no_split"], [
      "No clear invoice boundaries detected",
      "Text will be processed as single document",
      "Consider using explicit '---' separators between invoices",
    ]),
  };
}

// ─── Rule-Based Splitting Logic ─────────────────────────────

interface RuleSplitResult {
  chunks: string[];
  rule: SplitRule;
}

function trySplitWithRule(
  text: string, 
  priority: number, 
  alreadyDetected: SplitRule[]
): RuleSplitResult | null {
  switch (priority) {
    case 1:
      return tryExplicitSeparator(text);
    case 2:
      return tryDoubleNewline(text);
    case 3:
      return tryInvoiceMarker(text);
    case 4:
      return trySupplierChange(text);
    case 5:
      return tryStructuralRepeat(text);
    default:
      return null;
  }
}

/**
 * Rule 1: Explicit separator (---, ***, ===)
 */
function tryExplicitSeparator(text: string): RuleSplitResult | null {
  const { patterns, name } = SPLIT_RULES.explicitSeparator;
  
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      const chunks = text
        .split(pattern)
        .map(chunk => chunk.trim())
        .filter(chunk => chunk.length > 10); // Filter tiny fragments
      
      if (chunks.length >= 2) {
        return { chunks, rule: name };
      }
    }
  }
  
  return null;
}

/**
 * Rule 2: Double newline separation
 */
function tryDoubleNewline(text: string): RuleSplitResult | null {
  const { pattern, name } = SPLIT_RULES.doubleNewline;
  
  // Check if there are meaningful double newlines
  const matches = text.match(/\n{2,}/g);
  if (!matches || matches.length < 1) {
    return null;
  }
  
  const chunks = text
    .split(/\n{2,}/)
    .map(chunk => chunk.trim())
    .filter(chunk => {
      // Filter out very short chunks (likely formatting artifacts)
      return chunk.length > 20 && hasContent(chunk);
    });
  
  // Need at least 2 chunks to be a valid split
  if (chunks.length >= 2) {
    return { chunks, rule: name };
  }
  
  return null;
}

/**
 * Rule 3: Invoice marker detection
 */
function tryInvoiceMarker(text: string): RuleSplitResult | null {
  const { patterns, name } = SPLIT_RULES.invoiceMarker;
  
  // Find all positions of invoice markers
  const positions: number[] = [];
  
  for (const pattern of patterns) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Don't count if it's at position 0 (first invoice)
      if (match.index > 50) {
        positions.push(match.index);
      }
    }
  }
  
  // Sort and deduplicate positions
  const uniquePositions = [...new Set(positions)].sort((a, b) => a - b);
  
  // Need at least one marker to split
  if (uniquePositions.length < 1) {
    return null;
  }
  
  // Split at each marker position
  const chunks: string[] = [];
  let lastPos = 0;
  
  for (const pos of uniquePositions) {
    const chunk = text.slice(lastPos, pos).trim();
    if (chunk.length > 20 && hasContent(chunk)) {
      chunks.push(chunk);
    }
    lastPos = pos;
  }
  
  // Add final chunk
  const finalChunk = text.slice(lastPos).trim();
  if (finalChunk.length > 20 && hasContent(finalChunk)) {
    chunks.push(finalChunk);
  }
  
  if (chunks.length >= 2) {
    return { chunks, rule: name };
  }
  
  return null;
}

/**
 * Rule 4: Supplier/Customer change detection
 */
function trySupplierChange(text: string): RuleSplitResult | null {
  const { patterns, name } = SPLIT_RULES.supplierChange;
  
  // This is more complex - need to find supplier boundaries
  const lines = text.split(/\r?\n/);
  const chunkStarts = [0]; // First chunk always starts at line 0
  
  for (let i = 1; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Check if this looks like a new supplier section
        // (not just a mention within an existing invoice)
        const prevLines = lines.slice(Math.max(0, i - 3), i).join('\n');
        
        // If previous lines don't have similar pattern, likely new section
        const prevHasPattern = patterns.some(p => p.test(prevLines));
        
        if (!prevHasPattern || i > 10) {
          chunkStarts.push(i);
          break;
        }
      }
    }
  }
  
  // Need at least 2 chunks
  if (chunkStarts.length < 2) {
    return null;
  }
  
  // Create chunks from line ranges
  const chunks: string[] = [];
  for (let i = 0; i < chunkStarts.length; i++) {
    const start = chunkStarts[i];
    const end = i < chunkStarts.length - 1 ? chunkStarts[i + 1] : lines.length;
    const chunk = lines.slice(start, end).join('\n').trim();
    
    if (chunk.length > 20 && hasContent(chunk)) {
      chunks.push(chunk);
    }
  }
  
  if (chunks.length >= 2) {
    return { chunks, rule: name };
  }
  
  return null;
}

/**
 * Rule 5: Structural repetition (repeated dates/totals)
 */
function tryStructuralRepeat(text: string): RuleSplitResult | null {
  const { patterns, name } = SPLIT_RULES.structuralRepeat;
  
  // Find all date occurrences
  const datePattern = patterns[0];
  datePattern.lastIndex = 0;
  
  const datePositions: number[] = [];
  let match;
  while ((match = datePattern.exec(text)) !== null) {
    if (match.index > 100) { // Skip first occurrence (first invoice)
      datePositions.push(match.index);
    }
  }
  
  // Need at least 2 additional dates to suggest multiple invoices
  if (datePositions.length < 2) {
    return null;
  }
  
  // Split at date positions (each new date = potential new invoice)
  const chunks: string[] = [];
  let lastPos = 0;
  
  for (const pos of datePositions) {
    const chunk = text.slice(lastPos, pos).trim();
    if (chunk.length > 30 && hasContent(chunk)) {
      chunks.push(chunk);
    }
    lastPos = pos;
  }
  
  // Add final chunk
  const finalChunk = text.slice(lastPos).trim();
  if (finalChunk.length > 30 && hasContent(finalChunk)) {
    chunks.push(finalChunk);
  }
  
  if (chunks.length >= 2) {
    return { chunks, rule: name };
  }
  
  return null;
}

// ─── Validation & Helper Functions ──────────────────────────

/**
 * Validate that a split result is reasonable.
 */
function isValidSplit(chunks: string[], originalText: string): boolean {
  if (chunks.length === 0) return false;
  if (chunks.length === 1) return true; // Single chunk is always valid
  
  // Check that combined length is close to original
  const combinedLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const ratio = combinedLength / originalText.length;
  
  // Should be between 70% and 110% (accounting for trimmed whitespace)
  return ratio >= 0.7 && ratio <= 1.1;
}

/**
 * Check if text has meaningful content (not just whitespace/punctuation).
 */
function hasContent(text: string): boolean {
  const cleaned = text.replace(/[\s\-\*_#=]/g, '');
  return cleaned.length > 10; // At least 10 chars of actual content
}

/**
 * Get confidence score for a split rule.
 */
function getRuleConfidence(rule: SplitRule): number {
  switch (rule) {
    case "explicit_separator": return 0.98;
    case "double_newline": return 0.85;
    case "invoice_marker": return 0.90;
    case "supplier_change": return 0.75;
    case "structural_repeat": return 0.65;
    case "no_split": return 0.3;
    case "fallback": return 0.5;
    default: return 0.5;
  }
}

/**
 * Build metadata object for the split result.
 */
function buildMetadata(
  chunks: string[], 
  rulesDetected: SplitRule[],
  warnings: string[] = []
): SplitMetadata {
  const lengths = chunks.map(c => c.length);
  
  return {
    totalChunks: chunks.length,
    averageChunkLength: lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length),
    maxChunkLength: Math.max(...lengths, 0),
    minChunkLength: Math.min(...lengths, Infinity),
    rulesDetected,
    warnings,
  };
}

/**
 * Create empty result for empty input.
 */
function createEmptyResult(): SplitResult {
  return {
    chunks: [],
    primaryRule: "no_split",
    confidence: 0,
    metadata: {
      totalChunks: 0,
      averageChunkLength: 0,
      maxChunkLength: 0,
      minChunkLength: 0,
      rulesDetected: [],
      warnings: ["Empty input provided"],
    },
  };
}

// ─── Convenience Exports ─────────────────────────────────────

/**
 * Quick split - returns only chunks (for simple usage).
 */
export function quickSplit(rawText: string): string[] {
  return smartSplit(rawText).chunks;
}

/**
 * Estimate how many invoices are in the text.
 * Uses heuristic analysis without full parsing.
 */
export function estimateInvoiceCount(rawText: string): number {
  const result = smartSplit(rawText);
  
  // Adjust based on confidence
  if (result.confidence > 0.8) {
    return result.chunks.length;
  }
  
  // Low confidence - might be undercounting
  return Math.max(result.chunks.length, 1);
}
