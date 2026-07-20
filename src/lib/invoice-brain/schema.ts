/**
 * invoice-brain/schema.ts — Zod schema for the brain's generic invoice fields.
 *
 * The brain is source-agnostic: it extracts a flat invoice shape (name, address,
 * price, currency, discount, tax, total, notes) from text/image/excel. The
 * GarfiX adapter (garfixAdapter.ts) maps this to GarfiX's item-based ParsedOrder
 * and normalizes currency to the company's currency — the brain itself stays
 * generic and never assumes a specific currency (the old "EGP" default was a
 * vector for the fKWD bug and is removed here).
 *
 * N-05: price/discount/tax/total now use z.preprocess(normalizeArabicIndicDigits)
 * as a safety net. z.coerce.number() returns NaN on Arabic-Indic digit strings
 * ("٥٠" → NaN) regardless of how the extraction path produced them. Even if
 * normalize.ts is bypassed (e.g. an AI provider returns raw Arabic-Indic digits
 * in its JSON output, or a future code path skips patternParser), the schema
 * itself coerces them to ASCII before z.coerce.number() sees them. This is a
 * defense-in-depth measure — the primary normalization is in normalize.ts, but
 * the schema is the last gate before the value reaches the rest of the system.
 */
import { z } from "zod";
import { normalizeArabicIndicDigits } from "./normalize";

/**
 * Preprocess numeric fields so Arabic-Indic digits coerce correctly.
 *
 * Note: z.preprocess returns a ZodEffects, NOT a ZodNumber, so .nonnegative()
 * and .default() must be applied to the INNER z.coerce.number() BEFORE
 * wrapping. We export two flavors: one plain (for fields without a default)
 * and one with default(0) baked in (for discount/tax which default to 0).
 */
const arabicIndicSafeNumber = z.preprocess(
  (v) => (typeof v === "string" ? normalizeArabicIndicDigits(v) : v),
  z.coerce.number().nonnegative(),
);

const arabicIndicSafeNumberDefault0 = z.preprocess(
  (v) => (typeof v === "string" ? normalizeArabicIndicDigits(v) : v),
  z.coerce.number().nonnegative().default(0),
);

export const InvoiceSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  address: z.string().default(""),
  price: arabicIndicSafeNumber,
  currency: z.string().max(8).default(""), // empty = "unspecified"; adapter normalizes to company currency
  discount: arabicIndicSafeNumberDefault0,
  tax: arabicIndicSafeNumberDefault0,
  total: arabicIndicSafeNumber,
  notes: z.string().default(""),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

export const INVOICE_FIELDS = [
  "name",
  "address",
  "price",
  "currency",
  "discount",
  "tax",
  "total",
  "notes",
] as const;

export type InvoiceField = (typeof INVOICE_FIELDS)[number];
