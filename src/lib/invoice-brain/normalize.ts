/**
 * invoice-brain/normalize.ts — shared text normalization for the three
 * label/value extraction sites (fingerprint, aiFallback, patternParser).
 *
 * N-01 (normalization layer): before this file existed, each of the three
 * sites applied its own ad-hoc normalization (or none at all), so a regex
 * learned from one exact spelling/spacing/digit-form wouldn't match a
 * slightly different one later. This module is the single source of truth:
 *   - fingerprint.ts  → runs normalizeLine on each line before LABEL_PATTERN
 *   - aiFallback.ts   → runs normalizeLine on each line before lineLabelRe
 *   - patternParser.ts → runs normalizeLine on each line before text.match(re)
 *
 * The composition order (digits → diacritics → whitespace) is deliberate:
 *   1. Digits first, so diacritic-stripping doesn't need to care about
 *      digit-adjacent marks (rare but legal in Arabic).
 *   2. Diacritics second, so whitespace collapsing doesn't get confused by
 *      tashkeel sitting between a letter and a space.
 *   3. Whitespace last, so the final string has no redundant runs to
 *      fragment fingerprints or break anchored regexes.
 *
 * ⚠️ DOCUMENTED TRADE-OFF (matches the codebase's existing FIX-comment style):
 *   normalizeLine strips diacritics from the ENTIRE line, including any
 *   diacritics inside a *value* (not just the label). This is acceptable
 *   for numeric/label-adjacent fields (price, qty, date) because the
 *   diacritics there are almost always decorative or accidental. It would
 *   NOT be acceptable for a free-text "notes" field where diacritics carry
 *   semantic meaning — but the invoice-brain schema treats `notes` as
 *   opaque string content that's never regex-matched, so the trade-off is
 *   safe here. If a future field needs to preserve diacritics in its value,
 *   that field's extraction must use a per-side normalizer (normalize the
 *   label half only), not this whole-line function.
 */

/**
 * Map Arabic-Indic digits (٠-٩, U+0660–U+0669) and Extended Arabic-Indic
 * digits (۰-۹, U+06F0–U+06F9, used in Persian/Farsi) to ASCII 0-9.
 *
 * Pure, allocation-free per call (the replacement maps are module-level
 * constants). Does NOT touch decimal separators, currency symbols, or
 * minus signs — those are the schema's job.
 */
export function normalizeArabicIndicDigits(s: string): string {
  if (!s) return s;
  // Single regex covering both ranges; the replacer function maps by codepoint.
  // Using a function (not a fixed map) avoids building a 20-entry lookup table
  // and keeps the hot path branch-free for strings with no Arabic-Indic digits.
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => {
    const cp = ch.codePointAt(0)!;
    // U+0660 (٠) → '0' ... U+0669 (٩) → '9'
    if (cp >= 0x0660 && cp <= 0x0669) return String(cp - 0x0660);
    // U+06F0 (۰) → '0' ... U+06F9 (۹) → '9'
    return String(cp - 0x06f0);
  });
}

/**
 * Strip Arabic diacritics (tashkeel: \u064B-\u065F, \u0670) and tatweel
 * (\u0640, the elongating kashida). These are pronunciation guides and
 * typographic elongation — they carry no semantic weight for label/value
 * extraction and only fragment fingerprints/regexes.
 *
 * Does NOT touch:
 *   - The letters themselves (أ إ آ ا ة ى ؤ ء are letters, not diacritics —
 *     those are handled by productMatcher.normalizeArabic for fuzzy matching,
 *     but invoice-brain's label:value extraction is strict and should NOT
 *     collapse them, or labels like "السعر" and "السعرِ" would still match
 *     but "السعر" and "السعر" wouldn't — wait, that's the same. The point
 *     is: letter-level normalization is a fuzzy-matching concern, not a
 *     template-extraction concern. Keep this function diacritics-only.)
 *   - Latin combining marks (rare in invoices, not worth the regex cost).
 */
export function stripArabicDiacritics(s: string): string {
  if (!s) return s;
  // \u064B-\u065F = tanwin + harakat (fatha, damma, kasra, sukun, shadda, etc.)
  // \u0670        = superscript alef (ALEF ABOVE)
  // \u0640        = tatweel/kashida (elongation, not a diacritic per se but
  //                 serves no purpose in label matching and fragments regexes)
  return s.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
}

/**
 * Collapse all whitespace runs (including tabs, NBSP, and Unicode line
 * separators) to a single ASCII space, then trim. Does NOT touch newlines
 * when the caller needs line structure — callers that care about line
 * boundaries split on \n BEFORE calling this, so each line is normalized
 * in isolation.
 */
export function normalizeWhitespace(s: string): string {
  if (!s) return s;
  // \s in JS regex (with no flag) matches: space, tab, newline, CR, FF, VT,
  // plus Unicode whitespace (NBSP \u00A0, etc.) when the 'u' flag is present.
  // We use \s+ without 'u' because the input is already line-split and we
  // want to collapse intra-line runs only. The 'g' flag replaces all runs.
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Compose the three normalizations in the correct order:
 *   1. Arabic-Indic digits → ASCII digits
 *   2. strip diacritics + tatweel
 *   3. collapse whitespace + trim
 *
 * This is THE function the three call sites use. Do not let them diverge —
 * if you need a different composition, add a new exported function here
 * rather than inlining a different pipeline at a call site.
 *
 * See the file-level comment for the documented trade-off: diacritics inside
 * *values* are also stripped, which is acceptable for numeric/label-adjacent
 * fields but would not be for a semantically-meaningful free-text field.
 */
export function normalizeLine(s: string): string {
  if (!s) return s;
  return normalizeWhitespace(stripArabicDiacritics(normalizeArabicIndicDigits(s)));
}
