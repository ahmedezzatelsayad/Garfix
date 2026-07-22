/**
 * invoice-brain/verifyExtraction.ts — post-extraction verification layer.
 *
 * PROBLEM: The positional role extraction (fingerprint → lineStructureMask) can
 * mis-assign numbers when a message has adjacent numbers for the same currency
 * (e.g. "بسعر 50 و60 ريال"). Both get mask character `N` and the system might
 * extract 50 as total when it's actually a price, or confuse a phone number
 * with a monetary amount.
 *
 * SOLUTION: After extraction (whether pattern or AI), run this verification
 * layer to catch logical inconsistencies:
 *   1. Price ≤ Total — price should not exceed total
 *   2. Quantity × Price ≈ Total — approximate arithmetic sanity
 *   3. Phone number contamination — extracted numerics shouldn't look like phone numbers
 *   4. Total ≈ Price + Tax − Discount — standard invoice arithmetic
 *
 * If verification fails, confidence is lowered and the caller may route to AI
 * fallback for a second opinion.
 */
import type { Invoice } from "./schema";

// ── Public types ──────────────────────────────────────────────────────────────

export interface VerificationResult {
  /** Whether the extraction passed all critical verification checks. */
  verified: boolean;
  /** Adjusted confidence score (0–1). Starts at 1.0; each failed check reduces it. */
  confidence: number;
  /** Human-readable descriptions of each verification issue found. */
  issues: string[];
  /** Whether the caller should fall back to AI extraction. */
  fallbackToAI: boolean;
}

// ── Configuration ─────────────────────────────────────────────────────────────

/** Confidence penalty applied per failed check. */
const PENALTY_PER_ISSUE = 0.2;

/** Confidence threshold below which AI fallback is recommended. */
const AI_FALLBACK_THRESHOLD = 0.5;

/**
 * Relative tolerance for approximate equality checks (e.g. quantity × price ≈ total).
 * 0.25 = 25% tolerance, accommodating tax, rounding, and discounts not captured
 * in the schema fields.
 */
const RELATIVE_TOLERANCE = 0.25;

/** Minimum number of digits for something to look like a phone number. */
const PHONE_MIN_DIGITS = 7;

/** Maximum number of digits for a phone number. */
const PHONE_MAX_DIGITS = 15;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Check whether a number looks like a phone number.
 *
 * A phone number is defined as 7–15 consecutive digits, optionally preceded by
 * a `+` country-code prefix. Numbers that are clearly monetary (≤ 6 digits,
 * or accompanied by a decimal point) are excluded.
 *
 * We check the *raw text* for phone-number-like sequences and then see if any
 * extracted numeric field exactly matches such a sequence — that would indicate
 * the extractor grabbed a phone number as a price/total.
 */
const PHONE_PATTERN = /(?:^|[\s:;,])(\+?\d{7,15})(?:[\s:;,]|$)/g;

/**
 * Extract all phone-number-like digit sequences from the raw text.
 * Returns the numeric value of each sequence (so we can compare with extracted
 * fields like `price` and `total`).
 */
function extractPhoneLikeNumbers(rawText: string): number[] {
  const numbers: number[] = [];
  // Reset lastIndex for global regex reuse
  PHONE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PHONE_PATTERN.exec(rawText)) !== null) {
    const digits = match[1].replace(/^\+/, "");
    const value = parseInt(digits, 10);
    if (!Number.isNaN(value)) {
      numbers.push(value);
    }
  }
  return numbers;
}

/**
 * Check if a numeric value matches any phone-like number from the raw text.
 * We compare as integers because the extracted `price` / `total` are numbers
 * and a phone number like "0551234567" would appear as 551234567 when parsed.
 */
function isPhoneLike(value: number, phoneNumbers: number[]): boolean {
  if (value <= 0) return false;
  const intVal = Math.round(value);
  return phoneNumbers.some((pn) => pn === intVal);
}

/**
 * Two numbers are approximately equal if they differ by at most `tolerance`
 * relative to the larger of the two. Returns false if either is zero/NaN.
 */
function approxEqual(a: number, b: number, tolerance: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === 0 && b === 0) return true;
  const maxAbs = Math.max(Math.abs(a), Math.abs(b));
  if (maxAbs === 0) return false;
  return Math.abs(a - b) / maxAbs <= tolerance;
}

/**
 * Attempt to detect a quantity from the raw text.
 *
 * The Invoice schema does not have a dedicated `quantity` field, but invoices
 * often mention a count (e.g. "2 × 50 ريال", "عدد 3", "3 حبات"). We do a
 * best-effort extraction of small integers (1–999) that appear near quantity
 * keywords in Arabic and English.
 */
/**
 * Match quantity keywords followed by a number (e.g. "عدد 3", "qty: 5", "3 حبات").
 *
 * NOTE: We intentionally do NOT include `×` or `x` here. The `×`/`x` symbol
 * appears BETWEEN the quantity and the price ("3 × 50"), so the digit after
 * the `×` is the price, not the quantity. Including `×` would cause the regex
 * to capture the price digit as the quantity — exactly the wrong number.
 * The `QUANTITY_MULT_PATTERN` below handles `×`/`x` correctly by capturing
 * the digit BEFORE the symbol.
 */
const QUANTITY_KEYWORDS =
  /(?:عدد|كمية|قطعة|حبة|حبات|وحدة|qty|quantity|pcs|pieces?)\s*:?\s*(\d{1,3})\b/gi;

/**
 * Match patterns where a number precedes a keyword (e.g. "3 حبات", "5 pcs").
 * Some Arabic patterns put the number before the unit word.
 */
const QUANTITY_NUM_BEFORE_KEYWORD =
  /\b(\d{1,3})\s*(?:حبة|حبات|قطعة|وحدة|pcs?|pieces?)\b/gi;

/**
 * Also match patterns like "3 × 50" or "3x50" where the quantity precedes
 * the multiplier symbol.
 */
const QUANTITY_MULT_PATTERN = /\b(\d{1,3})\s*[×x]\s*\d/gi;

function detectQuantity(rawText: string): number | null {
  // Try keyword-after pattern first (e.g. "عدد 3", "qty: 5")
  QUANTITY_KEYWORDS.lastIndex = 0;
  const kwMatch = QUANTITY_KEYWORDS.exec(rawText);
  if (kwMatch) {
    const q = parseInt(kwMatch[1], 10);
    if (q >= 1 && q <= 999) return q;
  }

  // Try number-before-keyword pattern (e.g. "3 حبات", "5 pcs")
  QUANTITY_NUM_BEFORE_KEYWORD.lastIndex = 0;
  const nbkMatch = QUANTITY_NUM_BEFORE_KEYWORD.exec(rawText);
  if (nbkMatch) {
    const q = parseInt(nbkMatch[1], 10);
    if (q >= 1 && q <= 999) return q;
  }

  // Try multiplier pattern (e.g. "3 × 50", "3x50")
  QUANTITY_MULT_PATTERN.lastIndex = 0;
  const multMatch = QUANTITY_MULT_PATTERN.exec(rawText);
  if (multMatch) {
    const q = parseInt(multMatch[1], 10);
    if (q >= 1 && q <= 999) return q;
  }

  return null;
}

// ── Main verification function ────────────────────────────────────────────────

/**
 * Verify that extracted invoice fields are logically consistent.
 *
 * @param invoice - The extracted invoice data (already schema-validated).
 * @param rawText - The original raw text the invoice was extracted from.
 * @returns Verification result with adjusted confidence and issue list.
 *
 * ### Checks performed:
 *
 * 1. **Price ≤ Total**: In a valid invoice, the unit price should not exceed
 *    the total (total = price × qty + tax − discount, so total ≥ price unless
 *    qty = 0 which is nonsensical).
 *
 * 2. **Arithmetic sanity (total ≈ price + tax − discount)**: For a
 *    single-item invoice (qty=1, the common case for WhatsApp orders), total
 *    should approximately equal price + tax − discount. A 25% tolerance
 *    accounts for rounding, additional fees, or partial tax capture.
 *
 * 3. **Quantity × Price ≈ Total**: If a quantity can be detected from the raw
 *    text, verify that qty × price is within tolerance of the total.
 *
 * 4. **Phone number contamination**: If an extracted price or total exactly
 *    matches a phone-number-like sequence in the raw text, the extractor likely
 *    misidentified a phone number as a monetary value.
 */
export function verifyExtractedFields(
  invoice: Invoice,
  rawText: string
): VerificationResult {
  const issues: string[] = [];
  let confidence = 1.0;

  const { price, total, tax, discount } = invoice;

  // ── Check 1: Price ≤ Total ─────────────────────────────────────────────
  // A price greater than total is a strong signal of misextraction. The only
  // edge case where price > total is when discount > (price - total + tax),
  // but even then, total should be ≥ price - discount.
  if (price > 0 && total > 0 && price > total) {
    // Allow only if the difference is explained by a discount
    const effectiveMinimum = price - discount;
    if (total < effectiveMinimum) {
      issues.push(
        `Price (${price}) exceeds total (${total}) and the difference is not explained by discount (${discount})`
      );
    }
  }

  // ── Check 2: Arithmetic sanity — total ≈ price + tax − discount ────────
  // Only applies when price > 0 (meaningful extraction). When quantity is 1
  // (the common case for WhatsApp-style single-item orders), this should hold.
  if (price > 0 && total > 0) {
    const expectedTotal = price + tax - discount;
    // If expectedTotal is 0 or negative (price < discount), skip this check
    // since it indicates a different kind of invoice (e.g. fully discounted).
    if (expectedTotal > 0 && !approxEqual(total, expectedTotal, RELATIVE_TOLERANCE)) {
      // Before flagging, check if a quantity explains the gap
      const detectedQty = detectQuantity(rawText);
      if (detectedQty !== null && detectedQty > 1) {
        // Check 3 will handle this — don't double-penalize
      } else {
        const diff = Math.abs(total - expectedTotal);
        const pctOff = ((diff / Math.max(Math.abs(total), Math.abs(expectedTotal))) * 100).toFixed(1);
        issues.push(
          `Total (${total}) does not match price + tax - discount (${expectedTotal}); ` +
          `off by ${pctOff}% (diff=${diff})`
        );
      }
    }
  }

  // ── Check 3: Quantity × Price ≈ Total ──────────────────────────────────
  const detectedQty = detectQuantity(rawText);
  if (detectedQty !== null && detectedQty > 1 && price > 0 && total > 0) {
    const expectedWithQty = detectedQty * price + tax - discount;
    if (expectedWithQty > 0 && !approxEqual(total, expectedWithQty, RELATIVE_TOLERANCE)) {
      const diff = Math.abs(total - expectedWithQty);
      const pctOff = ((diff / Math.max(Math.abs(total), Math.abs(expectedWithQty))) * 100).toFixed(1);
      issues.push(
        `Detected quantity (${detectedQty}) × price (${price}) + tax (${tax}) - discount (${discount}) ` +
        `= ${expectedWithQty}, but total is ${total}; off by ${pctOff}%`
      );
    }
  }

  // ── Check 4: Phone number contamination ────────────────────────────────
  // Extract phone-like number sequences from the raw text and check whether
  // any extracted monetary field matches one. This catches cases like extracting
  // "0551234567" as price=551234567.
  const phoneNumbers = extractPhoneLikeNumbers(rawText);
  if (phoneNumbers.length > 0) {
    if (isPhoneLike(price, phoneNumbers)) {
      issues.push(
        `Extracted price (${price}) matches a phone-number-like sequence in the text — ` +
        `likely a misidentified phone number`
      );
    }
    if (isPhoneLike(total, phoneNumbers)) {
      issues.push(
        `Extracted total (${total}) matches a phone-number-like sequence in the text — ` +
        `likely a misidentified phone number`
      );
    }
  }

  // ── Compute confidence and fallback decision ───────────────────────────
  confidence = Math.max(0, 1.0 - issues.length * PENALTY_PER_ISSUE);
  const fallbackToAI = confidence < AI_FALLBACK_THRESHOLD;

  return {
    verified: issues.length === 0,
    confidence,
    issues,
    fallbackToAI,
  };
}
