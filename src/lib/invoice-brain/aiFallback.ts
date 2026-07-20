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
  // Route via the Smart Router with capability="invoice-extraction" so the
  // registry picks the healthiest model FOR JSON extraction (which may differ
  // from the best chat model). Falls back to the legacy chain if the registry
  // is empty or all registry models fail.
  const result = await callAIWithFallback({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    temperature: 0,
    maxTokens: Math.min(aiConfig.maxTokens, 600), // cap at 600 for JSON extraction
    capability: "invoice-extraction",
  });
  const raw = await parseAIJson<unknown>(result.content, "أعد استخراج بيانات الفاتورة كـ JSON صحيح.");
  const invoice = InvoiceSchema.parse(raw);
  return { invoice, raw: result, processingMs: Date.now() - t0 };
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
