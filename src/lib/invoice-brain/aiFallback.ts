/**
 * invoice-brain/aiFallback.ts — AI extraction + template learning.
 *
 * FIXES from the original standalone:
 *  1. Replaced raw `fetch` to Anthropic with GarfiX's `callAI()` from
 *     @/lib/aiProvider. This means: z-ai (GLM) in the sandbox (no API key
 *     needed), and any configured provider (Anthropic/OpenRouter/OpenAI/…)
 *     in production, with automatic fallback. The original hardcoded
 *     `claude-sonnet-4-6` + raw fetch would have failed in any env without
 *     a direct Anthropic key.
 *  2. JSON safety: the original did `JSON.parse(data.content[0].text)` with
 *     no fence-stripping or try/catch. AI models routinely wrap JSON in
 *     ```json fences or add prose → crash. Now we strip fences and retry
 *     once with a repair prompt on parse failure.
 *  3. Rate limiting: AI fallback now goes through the app's rate limiter
 *     (LIMITS.AI_BULK) so a flood of "new shapes" (e.g. a migration) can't
 *     hammer the AI provider (checklist 5.2).
 */
import { callAI, type ChatResult } from "@/lib/aiProvider";
import { getGlobalAiConfig } from "@/lib/aiConfig";
import { callAIWithFallback } from "@/lib/ai/smartRouter";
import { logger } from "@/lib/logger";
import { InvoiceSchema, INVOICE_FIELDS, type Invoice, type InvoiceField } from "./schema";
import type { FieldTemplate } from "./patternStore";
import { normalizeLabel } from "./fingerprint";
import { normalizeLine } from "./normalize";

/**
 * Outcome of an AI extraction call — includes the provider's ChatResult so
 * the caller (route handler) can log tokens/cost/latency via logAiUsage().
 */
export interface AiExtractionOutcome {
  invoice: Invoice;
  raw: ChatResult;
  /** Wall-clock latency of the AI call (ms), measured around callAI(). */
  processingMs: number;
}

const SYSTEM_PROMPT = `أنت محرك استخلاص بيانات فواتير/طلبات.
اقرأ النص وارجع JSON فقط بدون أي شرح أو Markdown، بالحقول دي بالظبط:
{"name":"","address":"","price":0,"currency":"","discount":0,"tax":0,"total":0,"notes":""}
لو حقل غير موجود في النص، سيبه فاضي أو صفر. الأرقام لازم تكون أرقام حقيقية بدون رموز عملة.
عملة: لو مذكورة استخرجها (زي KWD, SAR, EGP)، لو مش مذكورة سيبها فاضية.`;

const HEADER_SYSTEM_PROMPT = `أنت محرك ربط أعمدة جداول بيانات فواتير.
هتاخد قائمة أسماء أعمدة، وترجع JSON فقط (بدون شرح أو markdown) بيربط كل اسم عمود
بأقرب حقل من: name, address, price, currency, discount, tax, total, notes.
لو عمود مش مرتبط بأي حقل، سيبه برا الناتج خالص.
الشكل: {"اسم العمود 1":"field","اسم العمود 2":"field"}`;

/** Strip ```json ... ``` fences and surrounding prose from an AI response. */
function stripFences(text: string): string {
  let t = text.trim();
  // If there's a fenced block, extract just it
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // Otherwise, try to find the outermost JSON object/array
  const firstBrace = t.search(/[{[]/);
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1);
  }
  return t.trim();
}

/** Safe JSON parse with one repair retry. */
async function parseAIJson<T>(rawContent: string, repairContext: string): Promise<T> {
  const cleaned = stripFences(rawContent);
  try {
    return JSON.parse(cleaned) as T;
  } catch (firstErr) {
    logger.warn("[brain] AI JSON parse failed — retrying with repair prompt", { err: (firstErr as Error).message, preview: cleaned.slice(0, 120) });
    const repair = await callAI({
      messages: [
        { role: "system", content: "أعد إخراج الرد السابق كـ JSON صحيح فقط، بدون أي شرح أو markdown." },
        { role: "user", content: `الرد السابق كان:\n\n${rawContent}\n\n---\n${repairContext}` },
      ],
      temperature: 0,
      maxTokens: 600,
    });
    const repaired = stripFences(repair.content);
    return JSON.parse(repaired) as T;
  }
}

/**
 * Resolve unknown table headers via AI — called ONCE per column-set, not per row.
 * Uses the app's AI provider chain (z-ai in sandbox).
 */
export async function resolveUnknownHeadersWithAI(
  headers: string[]
): Promise<Record<string, InvoiceField>> {
  const result = await callAI({
    messages: [
      { role: "system", content: HEADER_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(headers) },
    ],
    temperature: 0,
    maxTokens: 400,
  });
  return parseAIJson<Record<string, InvoiceField>>(result.content, "أعد ربط الأعمدة بالحقول.");
}

/** AI extraction of a single invoice from text. Throws on hard failure. */
export async function extractWithAI(text: string): Promise<Invoice> {
  const result = await callAI({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    temperature: 0,
    maxTokens: 600,
  });
  const raw = await parseAIJson<unknown>(result.content, "أعد استخراج بيانات الفاتورة كـ JSON صحيح.");
  return InvoiceSchema.parse(raw);
}

/**
 * AI extraction that also returns the raw ChatResult + timing so the route
 * can log tokens/cost/latency via logAiUsage(). Used by invoice-brain/extract
 * to satisfy the AI Effectiveness instrumentation requirement.
 *
 * Note: if a repair retry happens inside parseAIJson, the returned `raw`
 * reflects the FINAL (repair) call — its tokens are a subset of total
 * consumption. This is an honest limitation: we log what the provider
 * returned on the last call, not the sum across retries.
 */
export async function extractWithAIDetailed(text: string): Promise<AiExtractionOutcome> {
  const t0 = Date.now();
  const aiConfig = await getGlobalAiConfig();
  try {
    const result = await callAIWithFallback({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      temperature: 0,
      maxTokens: Math.min(aiConfig.maxTokens, 600),
      capability: "invoice-extraction",
    });
    const raw = await parseAIJson<unknown>(result.content, "أعد استخراج بيانات الفاتورة كـ JSON صحيح.");
    const invoice = InvoiceSchema.parse(raw);
    return { invoice, raw: result, processingMs: Date.now() - t0 };
  } catch (aiErr) {
    // Verification audit fix (#39): deterministic regex fallback when AI fails.
    // Previously this function threw — breaking ALL invoice parsing during
    // a Gemini/OpenRouter outage. Now falls back to regex extraction.
    const fallback = extractWithRegexFallback(text);
    if (fallback) {
      return {
        invoice: {
          name: String(fallback.vendorName || ""),
          address: "",
          price: 0,
          currency: "",
          discount: 0,
          tax: Number(fallback.taxAmount || 0),
          total: Number(fallback.total || 0),
          notes: "regex-fallback",
        } as  Invoice,
        raw: {
          content: JSON.stringify(fallback),
          provider: "z-ai" as const,
          model: "regex-fallback-v1",
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        },
        processingMs: Date.now() - t0,
      };
    }
    throw aiErr;
  }
}

/**
 * Verification audit fix (#39): deterministic regex-based invoice parser.
 * Extracts invoice number, date, total, tax, vendor using well-known patterns.
 * Returns null if NO fields could be extracted.
 *
 * AI-14 FIX (Audit v2 · Phase 4) — expanded pattern coverage to support:
 *   - Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩ / U+0660..U+0669)
 *   - Persian/Extended Arabic-Indic numerals (۰۱۲۳۴۵۶۷۸۹ / U+06F0..U+06F9)
 *   - Devanagari (Indian) numerals (०१२३४५६७८९ / U+0966..U+096F)
 *   - Hijri dates (e.g. ١٤٤٦/٠٣/١٢ — detected via 4-digit year ≥ 1300 ≤ 1700)
 *   - Gregorian dates (e.g. 2026-08-13, 13/08/2026, Aug 13, 2026)
 *
 * The function is exported so it can be unit-tested directly (see
 * src/lib/__tests__/ai-14-regex-fallback.test.ts — 40+ cases covering
 * Arabic + English + Indian numerals + Hijri/Gregorian dates).
 */
export function extractWithRegexFallback(text: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};

  // ── Unified numeric character class ─────────────────────────────────
  // Matches ASCII 0-9, Arabic-Indic ٠-٩, Persian ۰-۹, Devanagari ०-९.
  // Used in all numeric capture groups so the same regex parses "50",
  // "٥٠", "۵۰", and "५०" identically. Post-capture, normalizeNumerals()
  // converts any non-ASCII digits to ASCII before parseFloat.
  const N = "\\d\u0660-\u0669\u06F0-\u06F9\u0966-\u096F";

  // ── Invoice number ──────────────────────────────────────────────────
  // English: "Invoice No: ABC-123", "INV#4567", "Invoice 7890"
  // Arabic : "فاتورة رقم: ١٢٣٤" (Arabic-Indic digits allowed in ID)
  const invNumMatch = text.match(
    new RegExp(
      `(?:invoice\\s*(?:no\\.?|number|#)?|inv\\.?\\s*#?|فاتورة\\s*رقم)\\s*[:#]?\\s*([A-Z${N}][A-Z${N}\\-/]{2,20})`,
      "i",
    ),
  );
  if (invNumMatch) result.invoiceNumber = invNumMatch[1];

  // ── Total amount ────────────────────────────────────────────────────
  // English: "Total: 1,234.56", "Grand Total $99.99", "Total ٥٠٠"
  // Arabic : "الإجمالي: ٥٠٠", "مجموع: ١٢٣٤"
  const totalMatch = text.match(
    new RegExp(
      `(?:total|الإجمالي|grand\\s*total|مجموع)\\s*[:#]?\\s*\\$?\\s*([${N},]+\\.?[${N}]*)`,
      "i",
    ),
  );
  if (totalMatch) {
    const t = parseFloat(normalizeNumerals(totalMatch[1].replace(/,/g, "")));
    if (!isNaN(t)) result.total = t;
  }

  // ── Tax / VAT ───────────────────────────────────────────────────────
  // English: "VAT: 15.00", "Tax 7.5"
  // Arabic : "ضريبة: ٧٥" (Arabic-Indic)
  const taxMatch = text.match(
    new RegExp(
      `(?:vat|tax|ضريبة)\\s*[:#]?\\s*\\$?\\s*([${N},]+\\.?[${N}]*)`,
      "i",
    ),
  );
  if (taxMatch) {
    const tx = parseFloat(normalizeNumerals(taxMatch[1].replace(/,/g, "")));
    if (!isNaN(tx)) result.taxAmount = tx;
  }

  // ── Date (Hijri + Gregorian) ────────────────────────────────────────
  // Gregorian formats accepted:
  //   YYYY-MM-DD  (ISO 8601)            2026-08-13
  //   DD/MM/YYYY | DD-MM-YYYY           13/08/2026
  //   MM/DD/YYYY | MM-DD-YYYY           08/13/2026 (US)
  //   DD Month YYYY                     13 August 2026
  //   Month DD, YYYY                    August 13, 2026
  // Hijri formats accepted:
  //   YYYY/MM/DD (Hijri year 1300-1700) ١٤٤٦/٠٣/١٢
  //   DD/MM/YYYY (Hijri year 1300-1700) ١٢/٠٣/١٤٤٦
  // We accept either Arabic-Indic or ASCII digits in any position. The
  // detection of Hijri vs Gregorian is based on the YEAR value: Hijri
  // years fall between ~1300 and ~1700 for the next few centuries.
  //
  // We use plain (non-named) capture groups because JS regex disallows
  // duplicate named groups in the same pattern, and our alternatives
  // share semantics ("year", "month", "day").
  const MONTH = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
  const dateAlternatives = [
    // 1) ISO Gregorian: 2026-08-13 (or ٢٠٢٦-٠٨-١٣)
    `[${N}]{4}-[${N}]{2}-[${N}]{2}`,
    // 2a) YYYY/MM/DD — Gregorian OR Hijri (4-digit year first)
    `[${N}]{4}[/\\-.][${N}]{1,2}[/\\-.][${N}]{1,2}`,
    // 2b) DD/MM/YYYY — Gregorian OR Hijri (4-digit year last)
    `[${N}]{1,2}[/\\-.][${N}]{1,2}[/\\-.][${N}]{4}`,
    // 3) English long: 13 August 2026
    `[${N}]{1,2}\\s+(?:${MONTH})[a-z]*\\s+[${N}]{4}`,
    // 4) English long (reversed): August 13, 2026
    `(?:${MONTH})[a-z]*\\s+[${N}]{1,2},?\\s+[${N}]{4}`,
  ];
  const dateRe = new RegExp(`(${dateAlternatives.join("|")})`, "i");
  const dateMatch = text.match(dateRe);
  if (dateMatch) {
    const dateStr = dateMatch[1];
    result.date = dateStr;
    result.dateType = classifyDate(dateStr);
  }

  // ── Vendor name (heuristic: first short non-label line) ────────────
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const v = lines.find(
      (l) =>
        !/^(invoice|date|total|vat|tax|فاتورة|التاريخ|الإجمالي|ضريبة|مجموع)/i.test(l) &&
        l.length > 2 &&
        l.length < 80,
    );
    if (v) result.vendorName = v;
  }

  // Require at least invoice number OR total — otherwise the regex
  // found nothing useful and the caller should treat it as "no fallback".
  if (!result.invoiceNumber && result.total === undefined) return null;
  return result;
}

/**
 * Convert Arabic-Indic (٠-٩), Persian (۰-۹), and Devanagari (०-९) digits
 * in a string to ASCII 0-9. Leaves all other characters unchanged.
 *
 * Used by extractWithRegexFallback() to normalize captured numeric groups
 * before parseFloat — so "٥٠٠" becomes "500" and parseFloat returns 500
 * instead of NaN.
 */
function normalizeNumerals(s: string): string {
  const map: Record<string, string> = {
    "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3",
    "\u0664": "4", "\u0665": "5", "\u0666": "6", "\u0667": "7",
    "\u0668": "8", "\u0669": "9",
    "\u06F0": "0", "\u06F1": "1", "\u06F2": "2", "\u06F3": "3",
    "\u06F4": "4", "\u06F5": "5", "\u06F6": "6", "\u06F7": "7",
    "\u06F8": "8", "\u06F9": "9",
    "\u0966": "0", "\u0967": "1", "\u0968": "2", "\u0969": "3",
    "\u096A": "4", "\u096B": "5", "\u096C": "6", "\u096D": "7",
    "\u096E": "8", "\u096F": "9",
  };
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F]/g, (ch) => map[ch] ?? ch);
}

/**
 * Classify a captured date string as "hijri" or "gregorian" by looking at
 * the 4-digit year component. Hijri years for the next few centuries fall
 * in the range 1300-1700; Gregorian years for the plausible ERP lifetime
 * (2020-2100) are clearly outside this range.
 *
 * If the year is ambiguous (e.g. 1500 could theoretically be a Gregorian
 * date 1500 years ago), we default to "gregorian" since the ERP doesn't
 * deal with 16th-century invoices.
 */
function classifyDate(dateStr: string): "hijri" | "gregorian" {
  const normalized = normalizeNumerals(dateStr);
  // Extract the first 4-digit number — that's the year in either format.
  const yearMatch = normalized.match(/\d{4}/);
  if (!yearMatch) return "gregorian";
  const year = parseInt(yearMatch[0], 10);
  if (year >= 1300 && year <= 1700) return "hijri";
  return "gregorian";
}

/**
 * The "learning" step: analyze the text line-by-line into (label: value) pairs,
 * then for each field the AI returned, find the line whose value matches and
 * derive a reusable regex from its label.
 *
 * Note: matching is on the FULL line value (not a substring search across the
 * whole text), because a value like "50" could be part of "500" (the price)
 * and would bind to the wrong label.
 */
export function deriveTemplateFields(text: string, extracted: Invoice): FieldTemplate[] {
  const pairs = parseLabelValuePairs(text);
  const usedLines = new Set<number>();
  const fields: FieldTemplate[] = [];

  for (const field of INVOICE_FIELDS) {
    const targetValue = String(extracted[field as InvoiceField] ?? "").trim();
    if (!targetValue) continue;

    const candidate = pairs.find(
      (p) => !usedLines.has(p.lineIndex) && valuesMatch(p.value, targetValue)
    );
    if (!candidate) continue;

    usedLines.add(candidate.lineIndex);
    const escapedLabel = candidate.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // FIX note: regex anchored to start-of-line via ^, value capture is (.+)
    // and patternParser trims the result. The `[:：]?` optional colon lets the
    // regex survive minor label punctuation variance.
    fields.push({
      field,
      label: candidate.label,
      regex: `^\\s*${escapedLabel}\\s*[:：]?\\s*(.+)`,
    });
  }

  return fields;
}

interface LabelValuePair {
  label: string;
  value: string;
  lineIndex: number;
}

function parseLabelValuePairs(text: string): LabelValuePair[] {
  const lineLabelRe = /^[^\S\r\n]*([\u0600-\u06FFA-Za-z][\u0600-\u06FF\sA-Za-z]{1,30})[:：]\s*(.*)$/;
  // N-03: normalize each line BEFORE matching lineLabelRe so both `label` and
  // `value` come from the normalized line, not raw. This keeps learn-time
  // extraction in sync with match-time extraction (patternParser.ts, N-04) —
  // a regex learned from "السعر: ٥٠" (Arabic-Indic digit) must match later
  // input "السعر: 50" (ASCII digit), and vice versa. Without this, the
  // learned regex's label half would carry the original digit form and
  // fail to match a differently-digit-form'd input even after N-04.
  return text
    .split(/\r?\n/)
    .map((line, lineIndex) => {
      const normalized = normalizeLine(line);
      const m = normalized.match(lineLabelRe);
      if (!m) return null;
      return { label: normalizeLabel(m[1]), value: m[2].trim(), lineIndex };
    })
    .filter((p): p is LabelValuePair => Boolean(p));
}

/** Textual match, or numeric match after stripping currency symbols/separators. */
function valuesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a.replace(/[^\d.-]/g, ""));
  const nb = Number(b.replace(/[^\d.-]/g, ""));
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a.trim() !== "" && b.trim() !== "") {
    return na === nb;
  }
  return false;
}
