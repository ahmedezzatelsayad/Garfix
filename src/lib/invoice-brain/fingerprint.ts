/**
 * invoice-brain/fingerprint.ts — structural fingerprint of a document's SHAPE.
 *
 * FIX (bug #1 from audit): the original implementation hashed only the sorted
 * "label:" tokens. For free-text sources (WhatsApp chat, natural-language
 * orders) there are NO labels → `labels.join("|")` = "" → SHA256("") is the
 * SAME for every free-text document. That caused every free-text invoice to
 * collide on one fingerprint, so after the first was learned (badly), all
 * subsequent ones reused the wrong template and NEVER called AI. Critical.
 *
 * Fix: if NO labels are found, fall back to a content-based fingerprint
 * (normalized whitespace + lowercase + first N chars) so distinct free-text
 * documents get distinct fingerprints. This still lets identical-shaped
 * label-based invoices share a fingerprint (the learning win), while
 * preventing the free-text collision.
 */
import { createHash } from "node:crypto";
import { normalizeLine } from "./normalize";

const LABEL_PATTERN = /^[^\S\r\n]*([\u0600-\u06FFA-Za-z][\u0600-\u06FF\sA-Za-z]{1,30})[:：]/;

export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

/**
 * Normalize free-text content for a content-based fallback fingerprint.
 *
 * N-02: runs normalizeLine FIRST so Arabic-Indic digits collapse to ASCII
 * (a free-text invoice with "السعر ٥٠" and one with "السعر 50" produce the
 * same fingerprint), then applies the existing lowercase + punctuation-strip
 * pipeline. Without normalizeLine first, two invoices that differ only in
 * digit form would get distinct fingerprints and never share a learned
 * template — defeating the whole point of fingerprinting.
 */
function normalizeContent(text: string): string {
  return normalizeLine(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // keep letters/numbers (incl. Arabic), drop punctuation/emoji
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500); // cap length so tiny diffs at the end don't fragment templates
}

export function fingerprintText(text: string): string {
  // N-02: normalize each line BEFORE testing LABEL_PATTERN so that
  //   "السعر:" / "السعر :" / "السعر:" (with a stray diacritic) all produce
  //   the same label and thus the same fingerprint. Without this, a template
  //   learned from one spelling wouldn't match a later invoice with a slightly
  //   different spacing/diacritic form, forcing an unnecessary AI fallback.
  const labels = text
    .split(/\r?\n/)
    .map((line) => {
      const normalized = normalizeLine(line);
      const match = normalized.match(LABEL_PATTERN);
      return match ? normalizeLabel(match[1]) : null;
    })
    .filter((l): l is string => Boolean(l))
    .sort();

  // FIX: if labels were found, fingerprint the structure (shape-stable across
  // different values). If NOT found (free-text), fingerprint the content so
  // distinct documents don't collide on the empty-string hash.
  const key =
    labels.length > 0
      ? `lbl:${labels.join("|")}`
      : `txt:${normalizeContent(text)}`;

  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
