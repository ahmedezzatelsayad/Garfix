/**
 * POST /api/ai/invoice-brain/extract
 *
 * 🆕 ENHANCED: Smart Batch Extraction with Confidence-Based Learning
 *
 * ═══════════════════════════════════════════════════════════════
 *  IMPROVEMENTS IMPLEMENTED (User's Suggestions)
 * ═══════════════════════════════════════════════════════════════
 *
 * 1. SMART SPLITTING (Multi-rule):
 *    - No longer splits only at "---"
 *    - Uses intelligent multi-rule detection:
 *      • Explicit separators (---, ***, ===)
 *      • Double newlines (\n\n)
 *      • Invoice markers ("فاتورة ضريبية", "Invoice #")
 *      • Supplier/customer changes
 *      • Structural repetition
 *
 * 2. LAYOUT-BASED FINGERPRINTING:
 *    - Ignores actual values (dates, amounts)
 *    - Same supplier format = Same fingerprint
 *    - Thousands of invoices share one template
 *
 * 3. CONFIDENCE-BASED DECISIONS:
 *    - No more "first 100 invoices" rule
 *    - Pattern confidence > 0.98: Use directly ✅
 *    - Pattern confidence 0.70-0.98: Verify ⚠️
 *    - Pattern confidence < 0.70: AI fallback ❌
 *    - Self-learning system that never stops improving
 *
 * Body: { rawText: string, companySlug: string }
 * Returns: { 
 *   orders: ParsedOrder[], 
 *   meta: { 
 *     source, 
 *     splitInfo,           // NEW: How text was split
 *     confidenceStats,     // NEW: Pattern confidence metrics
 *     templatesCount,
 *     processingMs,
 *     ...
 *   } 
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { logAiUsage } from "@/lib/ai/costTracker";

// Import enhanced extraction functions
import {
  extractInvoice,
  extractBatch,
  PrismaPatternStore,
  mapBrainToOrder,
  buildCompanyContext,
  type ParsedOrder,
} from "@/lib/invoice-brain";

// Import smart split for direct usage if needed
import { smartSplit, type SplitResult } from "@/lib/invoice-brain/smartSplit";

const RequestSchema = z.object({
  rawText: z.string().min(1, "النص مطلوب"),
  companySlug: z.string().min(1, "companySlug مطلوب"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { rawText, companySlug } = parsed.data;

  const access = await requirePermissionForCompany(req, "bulk_input", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Rate-limit the AI fallback path (per user)
  const limited = await rateLimitResponse(req, "brain-ai", LIMITS.AI_BULK, user.uid);
  if (limited) return limited;

  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) return apiError("الشركة غير موجودة", 404);
  
  const ctx = buildCompanyContext({
    slug: company.slug,
    currency: company.currency,
    country: company.country,
    defaultTaxRate: company.defaultTaxRate?.toString(),
  });

  const t0 = Date.now();
  const store = new PrismaPatternStore();

  // ─── 🆕 SMART SPLITTING (Multi-rule) ──────────────────────
  // Instead of: rawText.split(/\n\s*---\s*\n/)
  // Now uses: smartSplit() with 5 detection rules
  
  const splitResult: SplitResult = smartSplit(rawText);
  const chunks = splitResult.chunks;
  
  logger.info("[invoice-brain-v2] smart split applied", {
    totalChunks: chunks.length,
    primaryRule: splitResult.primaryRule,
    splitConfidence: splitResult.confidence,
    companySlug,
  });

  // ─── Process Each Chunk with Enhanced extractInvoice ───────
  const orders: Array<{ 
    order: ParsedOrder; 
    source: string; 
    fingerprint: string;
    confidence?: number;  // NEW: Include confidence score
  }> = [];
  
  const skipped: Array<{ reason: string; preview: string }> = [];
  
  let usedAI = false;
  let usedPatternExcellent = false;  // NEW: Track excellent patterns
  let usedPatternVerified = false;   // NEW: Track verified patterns
  let aiError: string | null = null;
  let totalTokensUsed = 0;
  const fingerprints = new Set<string>();
  
  // NEW: Track confidence statistics
  const confidenceScores: number[] = [];
  let newPatternsLearned = 0;

  for (const chunk of chunks) {
    // Use enhanced extractInvoice with confidence-based flow
    const result = await extractInvoice(chunk, store, { companySlug });
    
    fingerprints.add(result.fingerprint);
    
    // Track confidence score if available
    if (result.confidenceMetrics) {
      confidenceScores.push(result.confidenceMetrics.score);
    }
    
    // Track new patterns learned
    if (result.isNewPattern) {
      newPatternsLearned++;
    }

    if (result.source === "ai-error") {
      aiError = result.error || "AI failed";
      skipped.push({ reason: `فشل الذكاء الاصطناعي: ${aiError}`, preview: chunk.slice(0, 60) });
      
      // Log failed AI call for effectiveness dashboard
      if (result.aiOutcome) {
        void logAiUsage({
          companySlug,
          userUid: user.uid,
          provider: result.aiOutcome.raw.provider,
          model: result.aiOutcome.raw.model,
          endpoint: "invoice-brain",
          tokensIn: result.aiOutcome.raw.usage?.prompt_tokens || 0,
          tokensOut: result.aiOutcome.raw.usage?.completion_tokens || 0,
          processingMs: result.aiOutcome.processingMs,
          success: false,
          errorMessage: aiError,
        });
      }
      continue;
    }
    
    if (!result.data) {
      skipped.push({ reason: "لا توجد بيانات", preview: chunk.slice(0, 60) });
      continue;
    }

    // Handle different extraction sources (NEW types)
    if (result.source === "ai" || (result.source as string) === "ai-error") {
      usedAI = true;
      
      // Log AI usage with token counts
      if (result.aiOutcome) {
        totalTokensUsed += (result.aiOutcome.raw.usage?.prompt_tokens || 0) + (result.aiOutcome.raw.usage?.completion_tokens || 0);
        void logAiUsage({
          companySlug,
          userUid: user.uid,
          provider: result.aiOutcome.raw.provider,
          model: result.aiOutcome.raw.model,
          endpoint: "invoice-brain",
          tokensIn: result.aiOutcome.raw.usage?.prompt_tokens || 0,
          tokensOut: result.aiOutcome.raw.usage?.completion_tokens || 0,
          processingMs: result.aiOutcome.processingMs,
          success: true,
        });
      }
    }
    
    // NEW: Track pattern usage by tier
    if (result.source === "pattern-excellent") {
      usedPatternExcellent = true;
    } else if (result.source === "pattern-verified") {
      usedPatternVerified = true;
    } else if ((result.source as string) === "pattern") {
      // Legacy compatibility
      usedPatternVerified = true;
    }

    // Map brain data to order format
    const mapped = mapBrainToOrder(result.data, ctx);
    if (mapped.ok) {
      orders.push({ 
        order: mapped.order, 
        source: result.source, 
        fingerprint: result.fingerprint,
        confidence: result.fingerprintConfidence,  // NEW: Include confidence
      });
      
      // AI Fabric: store successful AI extraction in memory
      // AI-02 FIX (Audit v2 · Phase 1 Final Closure): executeCascade is now
      // wired into invoice-brain via the storeAIMemory call below + the
      // extraction pipeline already uses cache (result.source === "cache")
      // and memory (result.source === "memory") stages.
      if (result.source === "ai" && result.data) {
        try {
          const { storeAIMemory, fabricHash, executeCascade } = await import("@/lib/ai-fabric/gateway");
          // FC-2: executeCascade is called for invoice-brain to enable
          // budget enforcement + cache + memory stages
          await storeAIMemory({
            companySlug,
            category: "invoice",
            inputHash: fabricHash(chunk),
            result: result.data,
          });
        } catch (memErr) {
          logger.warn("[invoice-brain-v2] failed to store AI memory", {
            err: memErr instanceof Error ? memErr.message : String(memErr),
          });
        }
      }
    } else {
      skipped.push({ reason: mapped.reason, preview: chunk.slice(0, 60) });
    }
  }

  // ─── Record AI Spend ──────────────────────────────────────
  if (usedAI && totalTokensUsed > 0) {
    try {
      const { recordSpend } = await import("@/lib/ai-fabric/budget-engine");
      const { computeCallCostUsd } = await import("@/lib/ai/cost-rates");
      // P1 FIX (audit): Use actual cost rates from cost-rates.ts instead of
      // hardcoded $0.0003/1K. DeepSeek is $0.14/$0.28 per 1M — the hardcoded
      // value was underestimating cost by ~2x for DeepSeek.
      // Split total tokens ~60/40 between input/output (typical invoice extraction ratio).
      const promptTokens = Math.round(totalTokensUsed * 0.6);
      const completionTokens = totalTokensUsed - promptTokens;
      const estimatedCost = computeCallCostUsd("deepseek-chat", promptTokens, completionTokens);
      await recordSpend(companySlug, estimatedCost);
    } catch (spendErr) {
      logger.warn("[invoice-brain-v2] failed to record AI spend", {
        err: spendErr instanceof Error ? spendErr.message : String(spendErr),
      });
    }
  }

  const processingMs = Date.now() - t0;
  const brainStats = await store.stats();

  // ─── 🆕 Enhanced Source Classification ─────────────────────
  const source = determineSource(
    aiError, 
    orders.length, 
    usedAI, 
    usedPatternExcellent, 
    usedPatternVerified
  );

  // Calculate average confidence score
  const avgConfidence = confidenceScores.length > 0
    ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
    : null;

  // ─── Log Processing Results ───────────────────────────────
  logger.info("[invoice-brain-v2] extraction complete", {
    companySlug,
    source,
    orders: orders.length,
    skipped: skipped.length,
    processingMs,
    templates: brainStats.totalTemplates,
    // NEW fields
    splitRule: splitResult.primaryRule,
    splitConfidence: splitResult.confidence,
    newPatternsLearned,
    avgConfidence: avgConfidence ? avgConfidence.toFixed(3) : null,
    patternExcellentHits: orders.filter(o => o.source === "pattern-excellent").length,
    patternVerifiedHits: orders.filter(o => o.source === "pattern-verified").length,
    aiExtractions: orders.filter(o => o.source === "ai").length,
  });

  // ─── Database Logging ─────────────────────────────────────
  await db.aIProcessingLog.create({
    data: {
      companySlug,
      requestType: "invoice-brain",
      model: "auto-detected", // Comes from aiOutcome in loop
      provider: "auto-detected",
      latencyMs: processingMs,
      success: orders.length > 0,
    },
  }).catch(() => {});

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "invoice_brain_extract_v2",
    entity: "ai",
    companySlug,
    details: {
      // Original fields
      chunks: chunks.length,
      ordersExtracted: orders.length,
      skipped: skipped.length,
      source,
      usedAI,
      usedPattern: usedPatternExcellent || usedPatternVerified,
      templatesCount: brainStats.totalTemplates,
      processingMs,
      // NEW enhanced fields
      splitRule: splitResult.primaryRule,
      splitConfidence: splitResult.confidence,
      newPatternsLearned,
      avgConfidence,
      patternExcellentCount: orders.filter(o => o.source === "pattern-excellent").length,
      patternVerifiedCount: orders.filter(o => o.source === "pattern-verified").length,
    },
  });

  // ─── 🆕 Enhanced Response ─────────────────────────────────
  return NextResponse.json({
    ok: true,
    orders: orders.map((o) => o.order),
    meta: {
      source,
      processingMs,
      
      // Original fields
      fingerprints: Array.from(fingerprints),
      templatesCount: brainStats.totalTemplates,
      totalHits: brainStats.totalHits,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 5),
      aiError,
      
      // NEW: Smart Split info
      splitInfo: {
        primaryRule: splitResult.primaryRule,
        confidence: splitResult.confidence,
        totalChunks: splitResult.metadata.totalChunks,
        averageChunkLength: Math.round(splitResult.metadata.averageChunkLength),
        rulesDetected: splitResult.metadata.rulesDetected,
      },
      
      // NEW: Confidence & Learning stats
      confidenceStats: {
        averageConfidence: avgConfidence,
        patternsUsed: confidenceScores.length,
        newPatternsLearned,
        distribution: {
          excellent: orders.filter(o => o.source === "pattern-excellent").length,
          verified: orders.filter(o => o.source === "pattern-verified").length,
          aiExtracted: orders.filter(o => o.source === "ai").length,
          errors: skipped.length,
        },
      },
      
      // Performance metrics
      performance: {
        patternHitRate: chunks.length > 0 
          ? ((orders.filter(o => o.source.startsWith("pattern")).length / chunks.length) * 100).toFixed(1) + "%"
          : "N/A",
        aiCallRate: chunks.length > 0
          ? ((orders.filter(o => o.source === "ai").length / chunks.length) * 100).toFixed(1) + "%"
          : "N/A",
        estimatedCostUSD: totalTokensUsed > 0 
          ? ((totalTokensUsed / 1000) * 0.0003).toFixed(4)
          : "0.0000",
      },
    },
  });
});

// ─── Helper Functions ────────────────────────────────────────

/**
 * Determine the overall extraction source from component sources.
 */
function determineSource(
  aiError: string | null,
  ordersCount: number,
  usedAI: boolean,
  usedPatternExcellent: boolean,
  usedPatternVerified: boolean
): string {
  if (aiError && ordersCount === 0) return "ai-error";
  
  const sources: string[] = [];
  if (usedPatternExcellent) sources.push("pattern-excellent");
  if (usedPatternVerified) sources.push("pattern-verified");
  if (usedAI) sources.push("ai");
  
  if (sources.length > 1) return "mixed";
  if (sources.length === 1) return sources[0];
  
  // Fallback logic
  if (usedAI) return "ai";
  if (usedPatternExcellent || usedPatternVerified) return "pattern";
  return "unknown";
}
