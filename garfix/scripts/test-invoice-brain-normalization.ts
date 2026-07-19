/**
 * test-invoice-brain-normalization.ts — targeted test for N-01 through N-05.
 *
 * WHY THIS EXISTS:
 *   The acceptance test `scripts/test-invoice-brain-100.ts` exercises
 *   `matchProduct()` from `src/lib/productMatcher.ts` (fuzzy product-name
 *   matching), NOT the `invoice-brain/` label:value extraction code that
 *   N-01…N-05 modify. Running it before/after the normalization changes
 *   therefore shows unchanged `arabic_normalization` and `fuzzy_typo` numbers
 *   — those categories fail due to productMatcher confidence calibration,
 *   not invoice-brain normalization gaps.
 *
 *   This script tests the invoice-brain normalization directly: it verifies
 *   that a template learned from one spelling/digit-form/spacing/diacritic
 *   variant matches input in a different variant — the exact bug the
 *   normalization layer fixes.
 *
 * Test matrix (each row = one round-trip):
 *   1. Learn a template from "raw" text using deriveTemplateFields (N-03).
 *   2. Extract from "variant" text using extractWithTemplate (N-04).
 *   3. Assert the extracted value equals the learned value.
 *   4. Also assert fingerprint stability (N-02) — raw and variant must
 *      produce the same fingerprint, so a template learned for raw is found
 *      when variant arrives.
 *
 * Variants tested per category:
 *   - arabic_indic_digits:   "السعر: ٥٠"  ↔  "السعر: 50"
 *   - persian_indic_digits:  "السعر: ۵۰"  ↔  "السعر: 50"   (Persian extended)
 *   - diacritics:            "السَّعْر: 50"  ↔  "السعر: 50"
 *   - tatweel:               "السـعر: 50"  ↔  "السعر: 50"
 *   - whitespace:            "السعر  :  50"  ↔  "السعر: 50"
 *   - mixed:                 "السَّعْر : ٥٠"  ↔  "السعر: 50"   (all four at once)
 *   - schema_safety_net:     AI returns {"price": "٥٠"} → schema parses to 50
 *
 * Run:  cd /home/z/my-project && bun run scripts/test-invoice-brain-normalization.ts
 */
import { fingerprintText } from "@/lib/invoice-brain/fingerprint";
import { deriveTemplateFields } from "@/lib/invoice-brain/aiFallback";
import { extractWithTemplate } from "@/lib/invoice-brain/patternParser";
import { InvoiceSchema } from "@/lib/invoice-brain/schema";
import type { Invoice } from "@/lib/invoice-brain/schema";
import type { InvoiceTemplate } from "@/lib/invoice-brain/patternStore";

interface VariantCase {
  name: string;
  raw: string;       // text the template is learned from
  variant: string;   // text the template must still match
  field: "price" | "discount" | "tax" | "total";
  expectedValue: string;
}

const CASES: VariantCase[] = [
  {
    name: "arabic_indic_digits",
    raw: "السعر: ٥٠",
    variant: "السعر: 50",
    field: "price",
    expectedValue: "50",
  },
  {
    name: "persian_indic_digits",
    raw: "السعر: ۵۰",
    variant: "السعر: 50",
    field: "price",
    expectedValue: "50",
  },
  {
    name: "diacritics",
    raw: "السَّعْر: 50",
    variant: "السعر: 50",
    field: "price",
    expectedValue: "50",
  },
  {
    name: "tatweel",
    raw: "السـعر: 50",  // tatweel U+0640 between س and ع
    variant: "السعر: 50",
    field: "price",
    expectedValue: "50",
  },
  {
    name: "whitespace",
    raw: "السعر  :  50",
    variant: "السعر: 50",
    field: "price",
    expectedValue: "50",
  },
  {
    name: "mixed_all_variants",
    raw: "السَّعْر : ٥٠",   // diacritics + extra space + Arabic-Indic digit
    variant: "السعر: 50",
    field: "price",
    expectedValue: "50",
  },
  {
    name: "total_arabic_indic",
    raw: "الإجمالي: ١٢٥٠",
    variant: "الإجمالي: 1250",
    field: "total",
    expectedValue: "1250",
  },
  {
    name: "tax_arabic_indic",
    raw: "الضريبة: ٧٥",
    variant: "الضريبة: 75",
    field: "tax",
    expectedValue: "75",
  },
];

function buildFakeInvoice(field: string, value: string): Invoice {
  // Build a minimal Invoice object so deriveTemplateFields can match the
  // value to the right line.
  const base = {
    name: "test product",
    address: "",
    price: 0,
    currency: "",
    discount: 0,
    tax: 0,
    total: 0,
    notes: "",
  };
  return { ...base, [field]: Number(value) } as Invoice;
}

function runOne(tc: VariantCase): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // N-02: fingerprint stability — raw and variant must produce the same fingerprint
  const fpRaw = fingerprintText(tc.raw);
  const fpVariant = fingerprintText(tc.variant);
  if (fpRaw !== fpVariant) {
    reasons.push(`fingerprint mismatch: raw="${fpRaw}" variant="${fpVariant}"`);
  }

  // N-03: learn a template from raw text
  const fakeInvoice = buildFakeInvoice(tc.field, tc.expectedValue);
  const fields = deriveTemplateFields(tc.raw, fakeInvoice);
  if (fields.length === 0) {
    reasons.push(`deriveTemplateFields returned 0 fields for raw="${tc.raw}"`);
    return { pass: false, reasons };
  }
  const learnedField = fields.find((f) => f.field === tc.field);
  if (!learnedField) {
    reasons.push(`deriveTemplateFields did not learn field "${tc.field}" (got: ${fields.map((f) => f.field).join(",")})`);
    return { pass: false, reasons };
  }

  // Build an InvoiceTemplate shape for extractWithTemplate
  const template: InvoiceTemplate = {
    fingerprint: fpRaw,
    fields,
    sampleCount: 1,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  // N-04: extract from variant text using the template learned from raw
  const extracted = extractWithTemplate(tc.variant, template);
  if (!extracted) {
    reasons.push(`extractWithTemplate returned null for variant="${tc.variant}" (template learned from raw="${tc.raw}")`);
    return { pass: false, reasons };
  }
  const extractedValue = extracted[tc.field];
  if (!extractedValue) {
    reasons.push(`extractWithTemplate did not extract field "${tc.field}" (got keys: ${Object.keys(extracted).join(",")})`);
    return { pass: false, reasons };
  }
  if (extractedValue.trim() !== tc.expectedValue) {
    reasons.push(`extracted value mismatch: expected "${tc.expectedValue}" but got "${extractedValue}"`);
  }

  return { pass: reasons.length === 0, reasons };
}

function runSchemaSafetyNet(): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  // N-05: AI returns Arabic-Indic digits in JSON — schema must coerce to number
  const aiOutput = { name: "test", price: "٥٠", total: "١٢٥٠", tax: "٧٥", discount: "٠" };
  try {
    const parsed = InvoiceSchema.parse(aiOutput);
    if (parsed.price !== 50) reasons.push(`price: expected 50, got ${parsed.price}`);
    if (parsed.total !== 1250) reasons.push(`total: expected 1250, got ${parsed.total}`);
    if (parsed.tax !== 75) reasons.push(`tax: expected 75, got ${parsed.tax}`);
    if (parsed.discount !== 0) reasons.push(`discount: expected 0, got ${parsed.discount}`);
  } catch (err) {
    reasons.push(`schema parse threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { pass: reasons.length === 0, reasons };
}

function main() {
  console.log("═".repeat(80));
  console.log("  Invoice-Brain Normalization (N-01…N-05) — Targeted Test");
  console.log("═".repeat(80));

  let pass = 0;
  let fail = 0;
  const failures: Array<{ name: string; reasons: string[] }> = [];

  for (const tc of CASES) {
    const result = runOne(tc);
    const status = result.pass ? "✓ PASS" : "✗ FAIL";
    console.log(`\n[${status}] ${tc.name}`);
    console.log(`  raw:     "${tc.raw}"`);
    console.log(`  variant: "${tc.variant}"`);
    if (!result.pass) {
      for (const r of result.reasons) console.log(`    ✗ ${r}`);
      fail++;
      failures.push({ name: tc.name, reasons: result.reasons });
    } else {
      pass++;
    }
  }

  // N-05: schema safety net
  console.log("\n── N-05: schema safety net (Arabic-Indic digits in AI JSON) ──");
  const schemaResult = runSchemaSafetyNet();
  const schemaStatus = schemaResult.pass ? "✓ PASS" : "✗ FAIL";
  console.log(`[${schemaStatus}] schema_safety_net`);
  if (!schemaResult.pass) {
    for (const r of schemaResult.reasons) console.log(`    ✗ ${r}`);
    fail++;
    failures.push({ name: "schema_safety_net", reasons: schemaResult.reasons });
  } else {
    pass++;
  }

  console.log("\n" + "═".repeat(80));
  console.log(`  Result: ${pass} passed, ${fail} failed (of ${CASES.length + 1} total)`);
  console.log("═".repeat(80));

  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  • ${f.name}:`);
      for (const r of f.reasons) console.log(`      - ${r}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main();
