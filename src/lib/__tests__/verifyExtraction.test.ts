// @ts-nocheck
/**
 * verifyExtraction.test.ts — tests for the post-extraction verification layer.
 *
 * Covers:
 *  - Price ≤ Total check (with and without discount explaining the gap)
 *  - Arithmetic sanity (total ≈ price + tax − discount)
 *  - Quantity × Price ≈ Total (when quantity is detected in text)
 *  - Phone number contamination
 *  - Confidence adjustment and fallbackToAI decision
 *  - Clean extraction (no issues → verified=true, confidence=1.0)
 */
import { describe, it, expect } from "bun:test";
import { verifyExtractedFields } from "../invoice-brain/verifyExtraction";
import type { Invoice } from "../invoice-brain/schema";

/** Helper to build a valid Invoice object with sensible defaults. */
function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    name: "Test Order",
    address: "",
    price: 100,
    currency: "SAR",
    discount: 0,
    tax: 0,
    total: 100,
    notes: "",
    ...overrides,
  };
}

describe("verifyExtractedFields", () => {
  // ── Clean extractions ────────────────────────────────────────────────────

  it("passes verification for a clean single-item extraction", () => {
    const invoice = makeInvoice({ price: 50, total: 50 });
    const result = verifyExtractedFields(invoice, "طلب بسعر 50 ريال");
    expect(result.verified).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.issues).toHaveLength(0);
    expect(result.fallbackToAI).toBe(false);
  });

  it("passes verification when total = price + tax - discount", () => {
    const invoice = makeInvoice({ price: 100, tax: 15, discount: 10, total: 105 });
    const result = verifyExtractedFields(invoice, "السعر 100 والضريبة 15 والخصم 10");
    expect(result.verified).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  // ── Price > Total check ──────────────────────────────────────────────────

  it("flags when price exceeds total without discount explaining it", () => {
    const invoice = makeInvoice({ price: 200, total: 100, discount: 0 });
    const result = verifyExtractedFields(invoice, "بسعر 200 و60 ريال");
    expect(result.verified).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    expect(result.issues[0]).toContain("Price (200) exceeds total (100)");
    expect(result.confidence).toBeLessThan(1.0);
  });

  it("does NOT flag when price > total but discount explains the gap", () => {
    const invoice = makeInvoice({ price: 200, total: 150, discount: 50, tax: 0 });
    const result = verifyExtractedFields(invoice, "السعر 200 خصم 50");
    // price (200) > total (150) BUT total >= price - discount (200-50=150), so no flag
    // However arithmetic check: total=150 ≈ price+tax-discount = 200+0-50=150 → pass
    expect(result.verified).toBe(true);
  });

  // ── Arithmetic sanity check ──────────────────────────────────────────────

  it("flags when total is far from price + tax - discount", () => {
    const invoice = makeInvoice({ price: 100, tax: 0, discount: 0, total: 500 });
    const result = verifyExtractedFields(invoice, "السعر 100 الإجمالي 500");
    expect(result.verified).toBe(false);
    expect(result.issues.some((i) => i.includes("does not match"))).toBe(true);
  });

  it("does not flag when total is within 25% tolerance of expected", () => {
    // expected = 100 + 10 - 5 = 105; total = 120 → 14.3% off → within 25% tolerance
    const invoice = makeInvoice({ price: 100, tax: 10, discount: 5, total: 120 });
    const result = verifyExtractedFields(invoice, "السعر 100 الضريبة 10 خصم 5");
    // The arithmetic check should pass within tolerance
    const arithIssue = result.issues.find((i) => i.includes("does not match"));
    expect(arithIssue).toBeUndefined();
  });

  // ── Quantity × Price ≈ Total ─────────────────────────────────────────────

  it("verifies quantity × price ≈ total when quantity is in text", () => {
    const invoice = makeInvoice({ price: 50, total: 150, tax: 0, discount: 0 });
    const result = verifyExtractedFields(invoice, "عدد 3 بسعر 50 ريال");
    // qty=3, price=50 → expected=150, total=150 → should pass
    expect(result.verified).toBe(true);
  });

  it("flags when quantity × price does not match total", () => {
    const invoice = makeInvoice({ price: 50, total: 300, tax: 0, discount: 0 });
    const result = verifyExtractedFields(invoice, "عدد 3 بسعر 50 ريال");
    // qty=3, price=50 → expected=150, total=300 → 100% off → should flag
    expect(result.verified).toBe(false);
    expect(result.issues.some((i) => i.includes("Detected quantity"))).toBe(true);
  });

  it("detects quantity from multiplier pattern like 3×50", () => {
    const invoice = makeInvoice({ price: 50, total: 150, tax: 0, discount: 0 });
    const result = verifyExtractedFields(invoice, "3 × 50 ريال");
    expect(result.verified).toBe(true);
  });

  // ── Phone number contamination ───────────────────────────────────────────

  it("flags when extracted price matches a phone number in text", () => {
    // Phone: "0551234567" → numeric value 551234567
    const invoice = makeInvoice({ price: 551234567, total: 551234567 });
    const result = verifyExtractedFields(invoice, "اتصل 0551234567");
    expect(result.verified).toBe(false);
    expect(result.issues.some((i) => i.includes("phone-number-like"))).toBe(true);
  });

  it("does not flag normal prices that are not phone-like", () => {
    const invoice = makeInvoice({ price: 50, total: 50 });
    const result = verifyExtractedFields(invoice, "بسعر 50 ريال");
    expect(result.issues.some((i) => i.includes("phone-number-like"))).toBe(false);
  });

  // ── Confidence and fallback ──────────────────────────────────────────────

  it("reduces confidence by 0.2 per issue and triggers AI fallback at threshold", () => {
    // Construct an invoice that fails 3+ checks: price > total, arithmetic mismatch,
    // and phone contamination — all at once to push confidence below 0.5.
    const invoice = makeInvoice({ price: 551234567, total: 100, discount: 0, tax: 0 });
    const result = verifyExtractedFields(invoice, "بسعر 551234567 واتصل 0551234567");
    // price > total (551234567 > 100) + arithmetic mismatch + phone contamination
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    expect(result.confidence).toBeLessThanOrEqual(0.4);
    expect(result.fallbackToAI).toBe(true);
  });

  it("does not trigger AI fallback for minor issues", () => {
    // One minor issue → confidence 0.8 → above 0.5 threshold → no fallback
    const invoice = makeInvoice({ price: 100, total: 100, discount: 0, tax: 0 });
    // Add a phone-like number in the text but don't extract it as a field
    const result = verifyExtractedFields(invoice, "السعر 100 اتصل 0551234567");
    // Price (100) is not phone-like → should pass
    expect(result.verified).toBe(true);
    expect(result.fallbackToAI).toBe(false);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it("handles zero price and total gracefully", () => {
    const invoice = makeInvoice({ price: 0, total: 0, tax: 0, discount: 0 });
    const result = verifyExtractedFields(invoice, "مجاني");
    expect(result.verified).toBe(true);
  });

  it("handles the 'بسعر 50 و60 ريال' ambiguity scenario", () => {
    // This is the specific scenario from the task: two adjacent numbers for the
    // same currency. If the system mistakenly extracts 50 as total and 60 as
    // price (or vice versa), verification should catch it.
    const wrongExtraction = makeInvoice({ price: 60, total: 50, discount: 0 });
    const result = verifyExtractedFields(wrongExtraction, "بسعر 50 و60 ريال");
    // price (60) > total (50) with no discount explaining it → flagged
    expect(result.verified).toBe(false);
    expect(result.issues.some((i) => i.includes("exceeds total"))).toBe(true);
  });

  it("verifies correctly for the right extraction of the same text", () => {
    const rightExtraction = makeInvoice({ price: 50, total: 60, discount: 0, tax: 10 });
    const result = verifyExtractedFields(rightExtraction, "بسعر 50 و60 ريال والضريبة 10");
    // price=50, tax=10, discount=0 → expected total=60, actual total=60 → passes
    expect(result.verified).toBe(true);
  });
});
