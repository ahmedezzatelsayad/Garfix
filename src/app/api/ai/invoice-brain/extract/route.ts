/**
 * POST /api/ai/invoice-brain/extract
 *
 * Hybrid invoice extraction (pattern-first, AI-fallback-with-learning).
 * Takes raw text (WhatsApp/PDF/notes) and returns ParsedOrder[] drafts —
 * the SAME shape /api/ai/smart-parse returns — so the frontend can preview
 * and then bulk-import via /api/ai/bulk-import unchanged.
 *
 * Key difference from /api/ai/smart-parse: this endpoint learns. The first
 * time it sees a new invoice SHAPE it calls AI once, then derives + saves a
 * regex template. Subsequent invoices with the same shape are extracted with
 * the saved template — zero AI cost.
 *
 * Body: { rawText: string, companySlug: string }
 * Returns: { orders: ParsedOrder[], meta: { source, fingerprints, templatesCount, ... } }
 *
 * Checklist coverage: 3.2 (wired to existing flow), 4.1 (currency normalization),
 * 4.2 (Zod validation), 5.2 (AI rate-limited via LIMITS.AI_BULK), 6.1 (source logged).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { logAiUsage } from "@/lib/ai/costTracker";
import {
  extractInvoice,
  PrismaPatternStore,
  mapBrainToOrder,
  buildCompanyContext,
  type ParsedOrder,
} from "@/lib/invoice-brain";

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

  // 5.2 — rate-limit the AI fallback path (per user)
  const limited = await rateLimitResponse(req, "brain-ai", LIMITS.AI_BULK, user.uid);
  if (limited) return limited;

  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) return apiError("الشركة غير موجودة", 404);
  const ctx = buildCompanyContext(company);

  const t0 = Date.now();
  const store = new PrismaPatternStore();

  // Split multi-invoice text by "---" separators so one paste of several
  // invoices produces several drafts.
  const chunks = rawText
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const orders: Array<{ order: ParsedOrder; source: string; fingerprint: string }> = [];
  const skipped: Array<{ reason: string; preview: string }> = [];
  let usedAI = false;
  let usedPattern = false;
  let aiError: string | null = null;
  let totalTokensUsed = 0;
  const fingerprints = new Set<string>();

  for (const chunk of chunks) {
    const result = await extractInvoice(chunk, store);
    fingerprints.add(result.fingerprint);

    if (result.source === "ai-error") {
      aiError = result.error || "AI failed";
      skipped.push({ reason: `فشل الذكاء الاصطناعي: ${aiError}`, preview: chunk.slice(0, 60) });
      // P0 FIX: log the failed AI call too — failures matter for the
      // effectiveness dashboard's success-rate metric.
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

    if (result.source === "ai") {
      usedAI = true;
      // P0 FIX (AI Effectiveness prompt): log every AI-fallback call with
      // real token counts from the provider's usage object + the wall-clock
      // latency of the actual callAI() invocation (not the whole handler).
      // Pattern-path extractions are intentionally NOT logged here — they
      // consume zero AI tokens by design (that's the whole point of the
      // pattern-learning loop).
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
    if (result.source === "pattern") usedPattern = true;

    const mapped = mapBrainToOrder(result.data, ctx);
    if (mapped.ok) {
      orders.push({ order: mapped.order, source: result.source, fingerprint: result.fingerprint });
      // AI Fabric: store successful AI extraction in AI memory for future cascade hits
      if (result.source === "ai") {
        try {
          const { storeAIMemory, fabricHash } = await import("@/lib/ai-fabric/gateway");
          await storeAIMemory({
            companySlug,
            category: "invoice",
            inputHash: fabricHash(chunk),
            result: result.data,
          });
        } catch (memErr) {
          logger.warn("[invoice-brain] failed to store AI memory", {
            err: memErr instanceof Error ? memErr.message : String(memErr),
          });
        }
      }
    } else {
      skipped.push({ reason: mapped.reason, preview: chunk.slice(0, 60) });
    }
  }

  // AI Fabric: record AI spend to budget engine for cost tracking
  if (usedAI && totalTokensUsed > 0) {
    try {
      const { recordSpend } = await import("@/lib/ai-fabric/budget-engine");
      const estimatedCost = (totalTokensUsed / 1000) * 0.0003;
      await recordSpend(companySlug, estimatedCost);
    } catch (spendErr) {
      logger.warn("[invoice-brain] failed to record AI spend to budget engine", {
        err: spendErr instanceof Error ? spendErr.message : String(spendErr),
      });
    }
  }

  const processingMs = Date.now() - t0;
  const brainStats = await store.stats();

  const source: "pattern" | "ai" | "mixed" | "ai-error" =
    aiError && orders.length === 0
      ? "ai-error"
      : usedAI && usedPattern
        ? "mixed"
        : usedAI
          ? "ai"
          : "pattern";

  // 6.1 — log the extraction source so the platform can track AI-dependence ratio
  await db.aIProcessingLog.create({
    data: {
      companySlug,
      endpoint: "invoice-brain",
      model: "z-ai-glm",
      provider: "z-ai",
      ordersCount: orders.length,
      itemsCount: orders.reduce((s, o) => s + o.order.items.length, 0),
      processingMs,
      success: orders.length > 0,
    },
  }).catch(() => {});

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "invoice_brain_extract",
    entity: "ai",
    companySlug,
    details: {
      chunks: chunks.length,
      ordersExtracted: orders.length,
      skipped: skipped.length,
      source,
      usedAI,
      usedPattern,
      templatesCount: brainStats.totalTemplates,
      processingMs,
    },
  });

  logger.info("[invoice-brain] extraction complete", { companySlug, source, orders: orders.length, skipped: skipped.length, processingMs, templates: brainStats.totalTemplates });

  return NextResponse.json({
    ok: true,
    orders: orders.map((o) => o.order),
    meta: {
      source,
      processingMs,
      fingerprints: Array.from(fingerprints),
      templatesCount: brainStats.totalTemplates,
      totalHits: brainStats.totalHits,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 5),
      aiError,
    },
  });
});
