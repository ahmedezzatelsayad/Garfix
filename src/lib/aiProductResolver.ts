/**
 * aiProductResolver.ts — AI-powered resolver for ambiguous product matches.
 * Activates ONLY when similarity score is in the ambiguous zone (0.70-0.85).
 *
 * Refactor: now routes through the unified `callAI` pipeline (aiProvider.ts)
 * instead of calling OpenRouter directly. This gives us:
 *   - 60s timeout (fetchWithTimeout)
 *   - provider fallback chain (DeepSeek → z-ai fallback)
 *   - DB-configured key/model (no env-only path)
 *   - consistent logging + usage tracking
 *
 * Task 17c: the resolved result now also exposes `provider` and `model` from
 * the underlying `callAI` call, so callers (the AI worker) can persist
 * `aiModel = "{provider}/{model}"` into `ProductMatchAudit` for monitoring
 * the overturn-rate per model in the first two weeks of production usage.
 */

import { db } from "./db";
import { logger } from "./logger";
import { callAI, type ProviderType } from "./aiProvider";

const SYSTEM_PROMPT = `أنت مساعد متخصص في مطابقة أسماء المنتجات لنظام ERP متعدد المستأجرين.
مهمتك: تحديد هل الاسمين يشيران لنفس المنتج أم لمنتجين مختلفين.
أعد الإجابة بصيغة JSON فقط:
{"same_product": true|false, "confidence": 0.0-1.0, "reasoning_ar": "شرح مختصر", "suggested_canonical_name": "الاسم الموحد أو null"}`;

export interface AIMatchResult {
  same_product: boolean;
  confidence: number;
  reasoning_ar: string;
  suggested_canonical_name: string | null;
  /** Task 17c — provider key used by callAI (e.g. "openrouter", "z-ai"). */
  provider: ProviderType;
  /** Task 17c — model identifier (e.g. "deepseek/deepseek-r1", "z-ai-glm"). */
  model: string;
}

export interface ResolveAmbiguousMatchInput {
  name: string;
  price?: number;
}

export interface ResolveAmbiguousMatchCandidate {
  id: number;
  name: string;
  price?: number;
}

export async function resolveAmbiguousMatch(
  newProduct: ResolveAmbiguousMatchInput,
  candidate: ResolveAmbiguousMatchCandidate,
  fuzzyScore: number,
  companySlug: string,
): Promise<AIMatchResult | null> {
  // Check cache — if we've resolved this exact pair before with high confidence, reuse it.
  // The cache lookup intentionally restricts to AI-resolved entries (`resolvedBy: "ai"`),
  // so stale "suggested" rows from before Task 17 don't poison the cache.
  const cached = await db.productMatchAudit.findFirst({
    where: {
      companySlug,
      inputText: newProduct.name,
      matchedAlias: candidate.name,
      resolvedBy: "ai",
      isUndone: false,
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  if (cached && cached.confidence >= 0.9 && cached.aiModel) {
    const [provider, ...modelParts] = cached.aiModel.split("/");
    return {
      same_product: cached.tier === "auto-match",
      confidence: cached.confidence,
      reasoning_ar: cached.aiReasoning || "Cached",
      suggested_canonical_name: candidate.name,
      provider: provider as ProviderType,
      model: modelParts.join("/") || "unknown",
    };
  }

  const userPrompt = `منتج أ: ${newProduct.name} (السعر: ${newProduct.price || "غير متوفر"})
منتج ب: ${candidate.name} (السعر: ${candidate.price || "غير متوفر"})
Similarity: ${fuzzyScore.toFixed(2)}`;

  try {
    const result = await callAI({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      maxTokens: 500,
    });

    const raw = result.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const validated = validateAIResult(parsed, result.provider, result.model);
    if (validated) {
      logger.debug("[ai-resolver] resolved via " + result.provider + "/" + result.model, {
        same: validated.same_product,
        confidence: validated.confidence,
      });
    }
    return validated;
  } catch (err) {
    logger.warn("[ai-resolver] call failed", { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function validateAIResult(
  parsed: unknown,
  provider: ProviderType,
  model: string,
): AIMatchResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const same_product = obj.same_product === true || obj.same_product === "true";
  const confidence = typeof obj.confidence === "number" ? obj.confidence : parseFloat(String(obj.confidence));
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) return null;
  return {
    same_product,
    confidence,
    reasoning_ar: typeof obj.reasoning_ar === "string" ? obj.reasoning_ar : "",
    suggested_canonical_name: typeof obj.suggested_canonical_name === "string" ? obj.suggested_canonical_name : null,
    provider,
    model,
  };
}

/**
 * Determine the action to take based on the AI result.
 *
 * confidence >= 0.90 + same_product   → auto-match (alias auto-linked)
 * confidence >= 0.90 + !same_product  → auto new-product (confirmed as distinct)
 * otherwise                          → stays in review queue with reasoning visible
 */
export function getAIResolutionAction(result: AIMatchResult): {
  tier: "auto-match" | "suggested" | "new-product";
  action: "ai-auto-matched" | "ai-auto-created" | "ai-queued-for-review";
} {
  if (result.confidence >= 0.90 && result.same_product) return { tier: "auto-match", action: "ai-auto-matched" };
  if (result.confidence >= 0.90 && !result.same_product) return { tier: "new-product", action: "ai-auto-created" };
  return { tier: "suggested", action: "ai-queued-for-review" };
}
