/**
 * invoice-brain/patternParser.ts — fast/free extraction using saved regex.
 *
 * Returns null if ANY required field fails → caller falls back to AI.
 * (No correctness change from original; the .trim() on capture already
 *  handles trailing whitespace. Kept as-is — audited, no bug.)
 *
 * N-04: the input `text` is now normalized line-by-line (via normalizeLine
 * from ./normalize) BEFORE running text.match(re). This is the critical fix
 * — matching must happen against the same normalized shape the regex was
 * learned from (aiFallback.ts:parseLabelValuePairs, N-03), or N-03 alone
 * does nothing. A regex learned from "السعر: ٥٠" (Arabic-Indic) wouldn't
 * match input "السعر: 50" (ASCII) without this normalization at match time.
 *
 * Lines are split on \r?\n, normalized individually, then joined back with
 * \n so the RegExp `m` flag and `^` anchors still work correctly — each
 * normalized line becomes a regex-line for matching purposes.
 */
import type { InvoiceTemplate } from "./patternStore";
import { normalizeLine } from "./normalize";

export function extractWithTemplate(
  text: string,
  template: InvoiceTemplate
): Record<string, string> | null {
  // N-04: normalize the input text line-by-line so the match-time shape
  // equals the learn-time shape. Join with \n (not the original line endings)
  // so the `m` flag and `^` anchors work uniformly regardless of whether the
  // original text used \n, \r\n, or \r.
  const normalizedText = text
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .join("\n");

  const result: Record<string, string> = {};

  for (const f of template.fields) {
    let re: RegExp;
    try {
      re = new RegExp(f.regex, "m");
    } catch {
      return null; // corrupted regex in storage — let AI handle it
    }

    const match = normalizedText.match(re);
    if (!match || !match[1] || !match[1].trim()) {
      return null;
    }
    // Keep .trim() on the captured value — unchanged behavior. The captured
    // value is already from a normalized line, so trailing whitespace is rare,
    // but .trim() is belt-and-suspenders against regex `(.+)` greedily
    // capturing a trailing space before the line-end.
    result[f.field] = match[1].trim();
  }

  return result;
}
