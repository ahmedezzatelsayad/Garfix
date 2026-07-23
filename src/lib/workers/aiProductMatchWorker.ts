/**
 * aiProductMatchWorker.ts — Worker for the AI Product Match Resolver queue.
 *
 * Task 18c. Registered as the handler for `QUEUE_NAMES.AI` so that any job
 * enqueued via `enqueueBackground(QUEUE_NAMES.AI, { type: "ai-product-match-resolve", data })`
 * gets routed here.
 *
 * The worker is the BACKEND counterpart to the async enqueue that fires
 * inside `matchProduct()` (productMatcher.ts) when the fuzzy score lands in
 * the ambiguous zone (0.70 ≤ score < 0.85). The matcher creates the audit
 * row synchronously (with `action="ai-queued-for-review"`, `resolvedBy=null`)
 * and enqueues a job carrying `{ auditId, companySlug, newProductName,
 * candidateProductId, candidateAlias, fuzzyScore }`. This worker then:
 *
 *   1. Loads the candidate product from DB.
 *   2. Calls `resolveAmbiguousMatch()` (which goes through `callAI` /
 *      aiProvider.ts — provider fallback chain, 60s timeout, encrypted keys).
 *   3. Updates the `ProductMatchAudit` row with the AI decision:
 *        - `resolvedBy = "ai"`
 *        - `aiReasoning = result.reasoning_ar`
 *        - `aiModel = "{provider}/{model}"`
 *        - `action` = ai-auto-matched | ai-auto-created | ai-queued-for-review
 *        - `confidence` = result.confidence (replaces the fuzzy score)
 *   4. If decision is "ai-auto-matched" (confidence ≥ 0.90 + same product):
 *      create the `ProductAlias` link on the existing matched product so
 *      future invoices for the same name route directly (no AI call needed).
 *
 * Failure modes:
 *   - AI call returns null (network / parse / all providers failed) →
 *     `action` stays as `ai-queued-for-review` and `resolvedBy` stays null,
 *     so a human admin can still resolve it from the review queue. The job
 *     itself "succeeds" (no retry) — we don't want to keep hammering the AI
 *     provider on permanent failures like bad model name.
 *   - DB update fails → the job throws and the queue runner retries up to
 *     `maxAttempts` (3) with backoff before landing in dead-letter.
 */

import { db } from "../db";
import { logger } from "../logger";
import { registerWorker, QUEUE_NAMES, recoverPendingJobs } from "../queues";
import { resolveAmbiguousMatch, getAIResolutionAction } from "../aiProductResolver";
import { num } from "../money";

/** Shape of the job payload — must match what productMatcher.ts enqueues. */
export interface AIProductMatchJobData {
  auditId: number;
  companySlug: string;
  newProductName: string;
  candidateProductId: number;
  candidateAlias: string;
  fuzzyScore: number;
}

export const AI_PRODUCT_MATCH_JOB_TYPE = "ai-product-match-resolve";

/**
 * The actual handler — exported for direct invocation from tests.
 */
export async function handleAIProductMatchJob(data: Record<string, unknown>): Promise<void> {
  const payload = data as unknown as AIProductMatchJobData;

  // Basic shape validation — refuse to process malformed payloads (the
  // queue runner will then dead-letter the job).
  if (
    typeof payload.auditId !== "number" ||
    typeof payload.companySlug !== "string" ||
    typeof payload.newProductName !== "string" ||
    typeof payload.candidateProductId !== "number" ||
    typeof payload.candidateAlias !== "string" ||
    typeof payload.fuzzyScore !== "number"
  ) {
    throw new Error(`ai-product-match-resolve: malformed payload — ${JSON.stringify(payload).slice(0, 300)}`);
  }

  const { auditId, companySlug, newProductName, candidateProductId, candidateAlias, fuzzyScore } = payload;

  // 1. Load the candidate product.
  const candidateProduct = await db.productCatalog.findUnique({
    where: { id: candidateProductId },
  });
  if (!candidateProduct) {
    // The candidate product was deleted between enqueue and execution.
    // Mark the audit as permanently unresolved with a clear lastError.
    await db.productMatchAudit.update({
      where: { id: auditId },
      data: {
        action: "ai-queued-for-review",
        aiReasoning: "Candidate product no longer exists — admin must review manually.",
        resolvedBy: null,
      },
    }).catch((err: unknown) => {
      logger.error("[ai-worker] failed to mark audit as orphaned", { auditId, err: err instanceof Error ? err.message : String(err) });
    });
    logger.warn("[ai-worker] candidate product gone — leaving audit for manual review", { auditId, candidateProductId });
    return;
  }

  // 2. Call the AI resolver (goes through callAI / aiProvider.ts).
  const aiResult = await resolveAmbiguousMatch(
    { name: newProductName },
    {
      id: candidateProduct.id,
      name: candidateProduct.name,
      price: candidateProduct.sellingPrice ? num(candidateProduct.sellingPrice, 3) : undefined,
    },
    fuzzyScore,
    companySlug,
  );

  if (!aiResult) {
    // AI call failed (network / parse / all providers down). Leave the
    // audit entry in `ai-queued-for-review` with `resolvedBy=null` so an
    // admin can still resolve it manually. The job itself "succeeds" — no
    // point retrying permanent AI failures (bad model name, quota exhausted).
    logger.warn("[ai-worker] AI call returned null — leaving audit for manual review", { auditId, companySlug });
    await db.productMatchAudit.update({
      where: { id: auditId },
      data: {
        action: "ai-queued-for-review",
        aiReasoning: "AI resolver call failed — manual review required.",
        resolvedBy: null,
      },
    }).catch((err: unknown) => {
      logger.error("[ai-worker] failed to update audit after AI null result", { auditId, err: err instanceof Error ? err.message : String(err) });
    });
    return;
  }

  // 3. Determine the action + tier.
  const { tier, action } = getAIResolutionAction(aiResult);
  const aiModel = `${aiResult.provider}/${aiResult.model}`;

  // 4. Update the audit entry with the AI decision.
  await db.productMatchAudit.update({
    where: { id: auditId },
    data: {
      resolvedBy: "ai",
      aiReasoning: aiResult.reasoning_ar,
      aiModel,
      confidence: aiResult.confidence,
      tier,
      action,
      matchedAlias: candidateAlias,
      matchedProductId: tier === "auto-match" ? candidateProductId : null,
    },
  });

  logger.info("[ai-worker] audit updated with AI decision", {
    auditId, action, confidence: aiResult.confidence, aiModel, same: aiResult.same_product,
  });

  // 5. If auto-match: create the ProductAlias link on the existing matched
  //    product so future invoices route directly without another AI call.
  if (action === "ai-auto-matched") {
    try {
      await db.productAlias.upsert({
        where: { companySlug_alias: { companySlug, alias: newProductName.trim() } },
        update: {
          productCatalogId: candidateProductId,
          source: "ai",
          confidence: aiResult.confidence,
          isVerified: true,
          createdBy: "ai-resolver",
        },
        create: {
          productCatalogId: candidateProductId,
          companySlug,
          alias: newProductName.trim(),
          language: "unspecified",
          source: "ai",
          confidence: aiResult.confidence,
          isVerified: true,
          createdBy: "ai-resolver",
        },
      });
      logger.info("[ai-worker] alias auto-linked by AI", {
        auditId, companySlug, alias: newProductName, productId: candidateProductId,
      });
    } catch (err) {
      // Alias create failure is non-fatal — the audit row is already
      // updated, so an admin can manually confirm the alias from the
      // review queue. Log + move on.
      logger.error("[ai-worker] failed to auto-link alias (audit row is still updated)", {
        auditId, companySlug, alias: newProductName, err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * AI Product Match Worker — Registration Function
 *
 * This worker handles AI-powered product matching for ambiguous invoice line items.
 * It MUST be explicitly registered via bootstrapRuntime() — NOT at import time.
 *
 * Anti-pattern PREVENTED: Previous version had module-level side effect:
 *   registerAIProductMatchWorker() was called at bottom of file, causing:
 *   - Worker registration during `next build`
 *   - Prisma connection attempts during build
 *   - Build failures in CI/CD where no database exists
 *
 * CORRECT USAGE: Only call this from src/runtime/bootstrap.ts
 */
let registered = false;
export function registerAIProductMatchWorker(): void {
  if (registered) return;
  registerWorker(QUEUE_NAMES.AI, handleAIProductMatchJob);
  registered = true;
  logger.info("[ai-product-match-worker] registered for queue", { queue: QUEUE_NAMES.AI });
}

// ❌ REMOVED: Module-level side effect (was causing build failures)
// registerAIProductMatchWorker();
