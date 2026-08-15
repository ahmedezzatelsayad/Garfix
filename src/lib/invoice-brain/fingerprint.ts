/**
 * invoice-brain/fingerprint.ts — LAYOUT-BASED structural fingerprint
 *
 * ═══════════════════════════════════════════════════════════════
 *  IMPROVEMENT: Layout-based Fingerprint (User's Suggestion)
 * ═══════════════════════════════════════════════════════════════
 *
 * OLD PROBLEM:
 *   - Content-based fingerprint hashed the ENTIRE text including values
 *   - Any change in date, amount, invoice number → NEW fingerprint
 *   - Result: Thousands of duplicate templates for same supplier format
 *
 * NEW SOLUTION:
 *   - Extract LAYOUT STRUCTURE only (field labels, positions)
 *   - Ignore actual VALUES (dates, amounts, numbers)
 *   - Same supplier format = Same fingerprint regardless of data
 *
 * EXAMPLE:
 * ─────────────────────────────────────────────────────────────
 * Input:
 *   Invoice #45892          →  Pattern: INVOICE_NUM
 *   Date: 1/8/2026          →  Pattern: DATE
 *   Total: 525.200 KWD      →  Pattern: AMOUNT
 *   Supplier: Ahmed Co.     →  Pattern: TEXT
 *
 * Old Hash: SHA256("Invoice #45892\nDate: 1/8/2026...") → UNIQUE per invoice
 * New Hash: SHA256("INVOICE_NUM|DATE|AMOUNT|TEXT") → SAME for all similar invoices
 * ═══════════════════════════════════════════════════════════════
 */

import { createHash } from "node:crypto";
import { normalizeLine } from "./normalize";

// ─── Pattern Types for Layout Detection ──────────────────────

const LAYOUT_PATTERNS = {
  // Arabic patterns
  AR_INVOICE_NUM: /(?:فاتورة|إيصال|رقم\s*الفاتورة|invoice?\s*#?|No\.?)\s*[:\s]*[\d\-\/A-Z]+/i,
  AR_DATE: /(?:التاريخ|تاريخ\s*الفاتورة|Date|date)\s*[:\s]*[\d\-\/\.]+/i,
  AR_AMOUNT: /(?:الإجمالي|المجموع|المبلغ|السعر|Total|Amount)\s*[:\s]*[\d,\.]+\s*(?:KWD|SAR|USD|د\.ك|ر\.س|\$)?/i,
  AR_SUPPLIER: /(?:المورد|الشركة|العميل|Supplier|Vendor|Customer|From|To)\s*[:\s].+/i,
  AR_QTY: /(?:الكمية|العدد|Qty|Quantity)\s*[:\s]*\d+/i,
  AR_TAX: /(?:الضريبة|Tax|VAT)\s*[:\s]*[\d,\.]+%?/i,
  
  // Generic field patterns
  GENERIC_FIELD: /^([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z\s]{1,30})\s*[:：]/,
  
  // Structural markers
  LINE_ITEM: /^\s*[-•·]\s*.+/,
  SECTION_HEADER: /^[=\-*]{3,}$/,
};

// ─── Token Types for Layout Extraction ───────────────────────

type TokenType =
  | "INVOICE_NUM"
  | "DATE"
  | "AMOUNT"
  | "CURRENCY_AMOUNT"
  | "SUPPLIER_NAME"
  | "CUSTOMER_NAME"
  | "QTY"
  | "TAX"
  | "LABEL"           // Generic labeled field
  | "LINE_ITEM"
  | "SECTION_HEADER"
  | "TEXT"            // Free text line
  | "EMPTY";

interface LayoutToken {
  type: TokenType;
  position: number;    // Line position in document
  original?: string;   // For debugging
}

// ─── Value Normalization (Strip actual values) ───────────────

/**
 * Normalize a line to its LAYOUT PATTERN by removing actual values.
 * 
 * Examples:
 *   "Invoice #45892"     → "INVOICE_NUM"
 *   "Date: 1/8/2026"     → "DATE_FIELD"
 *   "Total: 525.200 KWD" → "AMOUNT_FIELD"
 *   "Supplier: Ahmed Co." → "SUPPLIER_FIELD"
 */
function extractLayoutToken(line: string, lineNumber: number): LayoutToken {
  const normalized = normalizeLine(line).trim();
  
  if (!normalized) {
    return { type: "EMPTY", position: lineNumber };
  }
  
  // Check for section headers (===, ---, ***)
  if (LAYOUT_PATTERNS.SECTION_HEADER.test(normalized)) {
    return { type: "SECTION_HEADER", position: lineNumber, original: normalized };
  }
  
  // Check for line items (- item, • item)
  if (LAYOUT_PATTERNS.LINE_ITEM.test(normalized)) {
    return { type: "LINE_ITEM", position: lineNumber, original: normalized };
  }
  
  // Check for invoice number patterns
  if (LAYOUT_PATTERNS.AR_INVOICE_NUM.test(normalized)) {
    return { type: "INVOICE_NUM", position: lineNumber };
  }
  
  // Check for date patterns
  if (LAYOUT_PATTERNS.AR_DATE.test(normalized)) {
    return { type: "DATE", position: lineNumber };
  }
  
  // Check for amount patterns (most specific first - with currency)
  if (/[\d,\.]+\s*(?:KWD|SAR|USD|د\.ك|ر\.س|\$|€|£)/.test(normalized)) {
    return { type: "CURRENCY_AMOUNT", position: lineNumber };
  }
  
  // Check for generic amount
  if (LAYOUT_PATTERNS.AR_AMOUNT.test(normalized)) {
    return { type: "AMOUNT", position: lineNumber };
  }
  
  // Check for tax
  if (LAYOUT_PATTERNS.AR_TAX.test(normalized)) {
    return { type: "TAX", position: lineNumber };
  }
  
  // Check for quantity
  if (LAYOUT_PATTERNS.AR_QTY.test(normalized)) {
    return { type: "QTY", position: lineNumber };
  }
  
  // Check for supplier/customer fields
  if (LAYOUT_PATTERNS.AR_SUPPLIER.test(normalized)) {
    // Determine if it's supplier or customer based on context
    const isFromField = /^(?:من|from|المورد|supplier|vendor)/i.test(normalized);
    const isToField = /^(?:إلى|to|العميل|customer)/i.test(normalized);
    
    if (isFromField) {
      return { type: "SUPPLIER_NAME", position: lineNumber };
    }
    if (isToField) {
      return { type: "CUSTOMER_NAME", position: lineNumber };
    }
    return { type: "SUPPLIER_NAME", position: lineNumber }; // Default to supplier
  }
  
  // Check for generic "Label: Value" pattern
  const labelMatch = normalized.match(LAYOUT_PATTERNS.GENERIC_FIELD);
  if (labelMatch) {
    return { 
      type: "LABEL", 
      position: lineNumber,
      original: normalizeLabel(labelMatch[1])
    };
  }
  
  // Default: free text
  return { type: "TEXT", position: lineNumber };
}

/**
 * Normalize a label to canonical form.
 */
export function normalizeLabel(label: string): string {
  return label.trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// ─── Layout Extraction ───────────────────────────────────────

/**
 * Extract the LAYOUT STRUCTURE from invoice text.
 * Returns array of tokens representing the structural pattern.
 * 
 * IMPORTANT: This ignores actual VALUES and captures only the shape/layout.
 */
function extractLayoutStructure(text: string): LayoutToken[] {
  const lines = text.split(/\r?\n/);
  
  return lines.map((line, index) => extractLayoutToken(line, index));
}

/**
 * Convert layout tokens to a hashable string representation.
 * Only includes TYPE and POSITION, not actual values.
 */
function layoutToHashableString(tokens: LayoutToken[]): string {
  // Group consecutive same-type tokens to reduce noise
  const compressed: string[] = [];
  let lastType: TokenType | null = null;
  
  for (const token of tokens) {
    // Skip empty tokens at start/end
    if (token.type === "EMPTY") {
      if (compressed.length > 0) continue;
      continue;
    }
    
    // For LABEL tokens, include the normalized label name
    if (token.type === "LABEL" && token.original) {
      const key = `LABEL:${token.original}`;
      if (lastType !== "LABEL" || !compressed.includes(key)) {
        compressed.push(key);
        lastType = "LABEL";
      }
      continue;
    }
    
    // For other types, just use the type name
    if (token.type !== lastType) {
      compressed.push(token.type);
      lastType = token.type;
    }
  }
  
  return compressed.join("|");
}

// ─── Main Fingerprint Functions ──────────────────────────────

/**
 * ORIGINAL function (kept for backward compatibility).
 * Uses content-based fallback for free-text documents.
 * 
 * @deprecated Use fingerprintTextLayout() instead for better pattern matching.
 */
export function fingerprintText(text: string): string {
  const labels = text
    .split(/\r?\n/)
    .map((line) => {
      const normalized = normalizeLine(line);
      const match = normalized.match(LABEL_PATTERN);
      return match ? normalizeLabel(match[1]) : null;
    })
    .filter((l): l is string => Boolean(l))
    .sort();

  const key =
    labels.length > 0
      ? `lbl:${labels.join("|")}`
      : `txt:${normalizeContent(text)}`;

  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** Legacy LABEL_PATTERN constant (for backward compat) */
const LABEL_PATTERN = /^[^\S\r\n]*([\u0600-\u06FFA-Za-z][\u0600-\u06FF\sA-Za-z]{1,30})[:：]/;

/**
 * Legacy content normalization (for backward compat).
 */
function normalizeContent(text: string): string {
  return normalizeLine(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

// ─── NEW: Layout-Based Fingerprint ───────────────────────────

/**
 * 🆕 LAYOUT-BASED FINGERPRINT (Recommended)
 * 
 * Generates a fingerprint based on DOCUMENT STRUCTURE/LAYOUT,
 * not on actual content values.
 * 
 * Benefits:
 * - Same supplier format = Same fingerprint (even with different data)
 * - Thousands of invoices can share one learned template
 * - Robust to changes in dates, amounts, invoice numbers
 * 
 * @param text - Raw invoice text
 * @returns 16-character hex fingerprint
 * 
 * @example
 * // These two invoices will produce the SAME fingerprint:
 * fingerprintTextLayout("Invoice #001\nDate: 1/1/2026\nTotal: $100")
 * // => "a1b2c3d4e5f6..."
 * 
 * fingerprintTextLayout("Invoice #999\nDate: 12/31/2026\nTotal: $9999")
 * // => "a1b2c3d4e5f6..." (SAME!)
 */
export function fingerprintTextLayout(text: string): string {
  // Step 1: Extract layout structure
  const layoutTokens = extractLayoutStructure(text);
  
  // Step 2: Convert to hashable string (types + positions only)
  const layoutString = layoutToHashableString(layoutTokens);
  
  // Step 3: Add structural metadata for disambiguation
  const metadata = buildLayoutMetadata(layoutTokens);
  
  // Step 4: Create final hash key
  const hashKey = `layout:${layoutString}|meta:${metadata}`;
  
  return createHash("sha256").update(hashKey).digest("hex").slice(0, 16);
}

/**
 * Build metadata string from layout for additional disambiguation.
 * Captures things like: total number of fields, presence of certain types, etc.
 */
function buildLayoutMetadata(tokens: LayoutToken[]): string {
  const typeCounts: Record<string, number> = {};
  const hasTypes: string[] = [];
  
  for (const token of tokens) {
    if (token.type === "EMPTY") continue;
    
    typeCounts[token.type] = (typeCounts[token.type] || 0) + 1;
    if (!hasTypes.includes(token.type)) {
      hasTypes.push(token.type);
    }
  }
  
  // Create compact metadata: unique_types_count:total_tokens
  const totalNonEmpty = tokens.filter(t => t.type !== "EMPTY").length;
  return `${hasTypes.length}:${totalNonEmpty}`;
}

// ─── Hybrid Fingerprint (Best of Both Worlds) ────────────────

/**
 * 🆕 HYBRID FINGERPRINT (Most Robust)
 * 
 * Combines layout-based AND label-based fingerprinting.
 * Uses layout as primary, falls back to labels for edge cases.
 * 
 * @param text - Raw invoice text
 * @returns Object with both fingerprints and confidence score
 */
export interface FingerprintResult {
  /** Layout-based fingerprint (recommended) */
  layoutFP: string;
  /** Legacy label-based fingerprint (fallback) */
  labelFP: string;
  /** Confidence score (0-1) of how reliable this fingerprint is */
  confidence: number;
  /** Which method was primary */
  primaryMethod: "layout" | "label" | "content";
  /** Number of structural tokens detected */
  tokenCount: number;
}

/**
 * Generate hybrid fingerprint with confidence scoring.
 * 
 * Confidence is HIGH when:
 * - Clear structural elements found (labels, fields)
 * - Multiple different token types detected
 * - Layout looks like a standard invoice format
 * 
 * Confidence is LOW when:
 * - Mostly free text (WhatsApp messages, notes)
 * - No clear structure detected
 * - Very short or very long unusual formats
 */
export function fingerprintTextHybrid(text: string): FingerprintResult {
  // Generate both fingerprints
  const layoutFP = fingerprintTextLayout(text);
  const labelFP = fingerprintText(text); // legacy
  
  // Analyze structure for confidence
  const tokens = extractLayoutStructure(text);
  const nonEmptyTokens = tokens.filter(t => t.type !== "EMPTY");
  const uniqueTypes = new Set(nonEmptyTokens.map(t => t.type));
  
  // Calculate confidence based on structural clarity
  let confidence = 0.5; // Base confidence
  
  // Boost for clear structure
  if (uniqueTypes.size >= 3) confidence += 0.2;     // Multiple field types
  if (uniqueTypes.has("INVOICE_NUM")) confidence += 0.1;  // Has invoice number
  if (uniqueTypes.has("AMOUNT") || uniqueTypes.has("CURRENCY_AMOUNT")) confidence += 0.15; // Has amount
  if (uniqueTypes.has("DATE")) confidence += 0.05;    // Has date
  
  // Penalize for ambiguous structures
  if (nonEmptyTokens.length < 3) confidence -= 0.2;   // Too short
  if (uniqueTypes.size <= 1 && nonEmptyTokens.length > 10) confidence -= 0.3; // Long free text
  
  // Clamp to valid range
  confidence = Math.max(0.1, Math.min(1.0, confidence));
  
  // Decide primary method
  let primaryMethod: "layout" | "label" | "content";
  if (confidence >= 0.6 && uniqueTypes.size >= 2) {
    primaryMethod = "layout";
  } else if (labelFP !== createHash("sha256").update("").digest("hex").slice(0, 16)) {
    primaryMethod = "label";
  } else {
    primaryMethod = "content";
  }
  
  return {
    layoutFP,
    labelFP,
    confidence,
    primaryMethod,
    tokenCount: nonEmptyTokens.length,
  };
}

// ─── Exports ─────────────────────────────────────────────────

export {
  extractLayoutStructure,
  layoutToHashableString,
  extractLayoutToken,
  type LayoutToken,
  type TokenType,
};

// Re-export for convenience
export { LAYOUT_PATTERNS };
