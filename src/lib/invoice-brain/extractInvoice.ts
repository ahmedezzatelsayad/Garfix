/**
 * invoice-brain/extractInvoice.ts — text entry point: fingerprint → pattern → AI fallback → learn.
 *
 * FIX from original: AI failures are now caught and surfaced as a structured
 * error result (source: "ai-error") instead of throwing and crashing the
 * caller. The caller decides whether to retry / show the user / fall back
 * to the legacy smart-parse endpoint.
 *
 * Also logs each extraction's source (pattern|ai|ai-error) so the platform
 * can track the AI-dependence ratio over time (checklist 6.1).
 */
import { fingerprintText } from "./fingerprint";
import { extractWithTemplate } from "./patternParser";
import { deriveTemplateFields, extractWithAIDetailed, type AiExtractionOutcome } from "./aiFallback";
import { InvoiceSchema, type Invoice } from "./schema";
import type { PatternStore } from "./patternStore";
import { verifyExtractedFields, type VerificationResult } from "./verifyExtraction";
import { logger } from "@/lib/logger";

export type ExtractionSource = "pattern" | "ai" | "ai-error";

export interface ExtractionResult {
  data: Invoice | null; // null only when source === "ai-error"
  source: ExtractionSource;
  fingerprint: string;
  error?: string;
  /**
   * Populated only when source === "ai" or "ai-error". Carries the raw
   * provider ChatResult + wall-clock latency so the route can log it via
   * logAiUsage(). Null on the pattern path (no AI call was made).
   */
  aiOutcome?: AiExtractionOutcome | null;
  /**
   * Post-extraction verification result. Null only when source === "ai-error"
   * (no data to verify). Present for both pattern and AI paths so callers can
   * check confidence and decide whether to surface a review prompt.
   */
  verification?: VerificationResult | null;
}

const MIN_FIELDS_TO_SAVE_TEMPLATE = 5;

export async function extractInvoice(
  text: string,
  store: PatternStore
): Promise<ExtractionResult> {
  const fingerprint = fingerprintText(text);

  // 1) Fast path: known template for this shape?
  const template = await store.get(fingerprint);
  if (template) {
    const raw = extractWithTemplate(text, template);
    if (raw) {
      const parsed = InvoiceSchema.safeParse(raw);
      if (parsed.success) {
        // Verification layer: validate extracted fields are logically consistent.
        // If verification fails badly (fallbackToAI), fall through to AI instead
        // of returning a likely-wrong pattern result.
        const verification = verifyExtractedFields(parsed.data, text);
        if (verification.fallbackToAI) {
          logger.warn("[brain] pattern template passed parse but failed verification — falling through to AI", {
            fingerprint,
            issues: verification.issues,
            confidence: verification.confidence,
          });
          // Fall through to AI path below — do NOT return the unverified pattern result.
        } else {
          await store.touch(fingerprint);
          logger.info("[brain] hit pattern template", { fingerprint, source: "pattern", verified: verification.verified, confidence: verification.confidence });
          return { data: parsed.data, source: "pattern", fingerprint, aiOutcome: null, verification };
        }
      }
    }
    // Template exists but failed (e.g. invoice shape drifted) → fall through to AI
    logger.warn("[brain] template miss — falling through to AI", { fingerprint });
  }

  // 2) No template, or template failed → AI fallback (the costly exception)
  try {
    const outcome = await extractWithAIDetailed(text);
    const aiResult = outcome.invoice;

    // 3) Learning: derive a new template from the AI's answer and save it
    const fields = deriveTemplateFields(text, aiResult);
    if (fields.length >= MIN_FIELDS_TO_SAVE_TEMPLATE) {
      await store.save({
        fingerprint,
        fields,
        sampleCount: 1,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      });
      logger.info("[brain] learned new template", { fingerprint, fieldsCount: fields.length });
    } else {
      logger.info("[brain] AI ok but too few fields to save a template", { fingerprint, fieldsCount: fields.length });
    }

    // Verify the AI result too — same logical consistency checks apply.
    // We don't fall back further (AI is the last resort), but we attach the
    // verification result so callers can surface a review prompt if confidence
    // is low.
    const verification = verifyExtractedFields(aiResult, text);
    if (!verification.verified) {
      logger.warn("[brain] AI extraction passed but verification found issues", {
        fingerprint,
        issues: verification.issues,
        confidence: verification.confidence,
      });
    }

    return { data: aiResult, source: "ai", fingerprint, aiOutcome: outcome, verification };
  } catch (err) {
    // FIX: graceful degradation — return a structured error, don't throw
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[brain] AI fallback failed", { fingerprint, err: msg });
    return { data: null, source: "ai-error", fingerprint, error: msg, aiOutcome: null };
  }
}
