/**
 * ai-fabric/gateway.ts — AI Fabric Decision Engine: 5-stage cost cascade.
 *
 * Every request that needs "intelligence" passes through this cascade before
 * reaching any LLM. The stages are ordered cheapest-first:
 *
 *   1. CACHE      → CacheEntry.key = hash(companySlug + normalizedInput)
 *   2. PATTERN    → deterministic regex/rules per requestType (invoice-brain)
 *   3. RULE       → static business rules (hardcoded per company context)
 *   4. MEMORY     → AIMemoryEntry — previous AI decisions for similar context
 *   5. AI RUNTIME → actual LLM call via smartRouter (the costly fallback)
 *
 * Every request is logged to AIRequestLog with the correct resolvedBy value,
 * regardless of which stage resolved it. This is the primary data source for
 * cost optimization, AI scoring, and profit calculation in later phases.
 *
 * Phase 1 acceptance criteria:
 * - Same request sent twice → first resolvedBy='ai' (or pattern), second resolvedBy='cache'
 * - Every stage logs to AIRequestLog
 * - Actual counts from invoice-brain data, not theoretical percentages
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { fabricHash, type GatewayRequest, type GatewayResult, type CascadeStage, type AIRequestType } from "./types";

// ─── Stage handlers (injected for testability) ─────────────────────────────

/**
 * Cache lookup: hash(companySlug + normalizedInput) → CacheEntry.
 * If hit and not expired, increment hitCount and return.
 */
async function cacheStage(
  req: GatewayRequest,
): Promise<{ hit: boolean; data: unknown; hitCount?: number }> {
  const key = fabricHash(`${req.companySlug}:${req.normalizedInput}`);
  const entry = await db.cacheEntry.findUnique({ where: { key } });

  if (!entry) return { hit: false, data: null };

  // Check expiry
  if (entry.expiresAt < new Date()) {
    // Expired — clean up asynchronously (don't block the cascade)
    db.cacheEntry.delete({ where: { key } }).catch(() => {});
    return { hit: false, data: null };
  }

  // Hit — increment hitCount
  const updated = await db.cacheEntry.update({
    where: { key },
    data: { hitCount: { increment: 1 } },
  });

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(entry.value);
  } catch {
    // Corrupted JSON — delete and fall through
    db.cacheEntry.delete({ where: { key } }).catch(() => {});
    return { hit: false, data: null };
  }

  return { hit: true, data: parsed, hitCount: updated.hitCount };
}

/**
 * Store a result in the cache for future cascade hits.
 * Called after stages 2-5 produce a result.
 */
async function cacheStore(
  companySlug: string,
  normalizedInput: string,
  data: unknown,
  ttlMs: number = 3600_000, // default 1 hour
): Promise<void> {
  const key = fabricHash(`${companySlug}:${normalizedInput}`);
  const value = JSON.stringify(data);
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.cacheEntry.upsert({
    where: { key },
    create: { key, companySlug, value, expiresAt },
    update: { value, expiresAt },
  });
}

/**
 * Pattern stage: deterministic regex/rules per requestType.
 *
 * For "ocr" requestType, this delegates to the invoice-brain pattern engine
 * (fingerprint → template → regex extraction). For other types, it runs
 * lightweight regex patterns that match common deterministic structures.
 *
 * Returns null if no pattern matches (fall through to next stage).
 */
async function patternStage(
  req: GatewayRequest,
): Promise<{ hit: boolean; data: unknown }> {
  // Only OCR has a meaningful pattern engine right now (invoice-brain)
  // Other request types may have patterns added later.
  if (req.requestType === "ocr" && req.context?.text) {
    try {
      const { fingerprintText } = await import("@/lib/invoice-brain/fingerprint");
      const { PrismaPatternStore } = await import("@/lib/invoice-brain/patternStore");
      const { extractWithTemplate } = await import("@/lib/invoice-brain/patternParser");
      const { InvoiceSchema } = await import("@/lib/invoice-brain/schema");

      const text = req.context.text as string;
      const fp = fingerprintText(text);
      const store = new PrismaPatternStore();
      const template = await store.get(fp);

      if (template) {
        const raw = extractWithTemplate(text, template);
        if (raw) {
          const parsed = InvoiceSchema.safeParse(raw);
          if (parsed.success) {
            return { hit: true, data: parsed.data };
          }
        }
      }
    } catch (err) {
      // Pattern engine failure is non-fatal — fall through to next stage
      logger.warn("[gateway] pattern stage error (non-fatal)", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Future: add pattern rules for whatsapp, financial_analysis, matching

  return { hit: false, data: null };
}

/**
 * Rule stage: static business rules that don't need AI.
 *
 * Currently a placeholder that returns no match. Rules are added per-company
 * as the system learns (Phase 11 — Learning Engine auto-generates rules).
 *
 * Example future rules:
 * - If supplier X always sends product Y with VAT category Z → skip AI
 * - If invoice total < threshold → use default classification
 */
async function ruleStage(
  _req: GatewayRequest,
): Promise<{ hit: boolean; data: unknown }> {
  // Phase 1: No hardcoded rules. Rules are populated by:
  //   - Manual admin entry (future)
  //   - Learning Engine auto-promotion (Phase 11)
  //   - Cross-company pattern intelligence (Phase 12)
  return { hit: false, data: null };
}

/**
 * Memory stage: check AIMemoryEntry for a previous AI decision in the
 * same context (same companySlug + category + similar content).
 *
 * This enables the cascade to replay previous AI decisions without
 * re-calling the LLM. The AI Memory is populated by Phase 7 (Digital Twin).
 */
async function memoryStage(
  req: GatewayRequest,
): Promise<{ hit: boolean; data: unknown }> {
  // Map requestType to memory category
  const categoryMap: Record<AIRequestType, string> = {
    ocr: "invoice",
    whatsapp: "customer",
    financial_analysis: "decision",
    matching: "product",
    other: "decision",
  };

  const category = categoryMap[req.requestType] || "decision";

  // Find the most recent memory entry for this company + category
  // Content similarity is done via the normalizedInput hash for speed.
  // Future: vector similarity search when embedding cache is wired.
  const inputHash = fabricHash(req.normalizedInput);

  try {
    const memories = await db.aIMemoryEntry.findMany({
      where: {
        companySlug: req.companySlug,
        category,
      },
      orderBy: { lastAccessedAt: "desc" },
      take: 10, // check last 10 entries
    });

    for (const mem of memories) {
      try {
        const content = JSON.parse(mem.content);
        // If the stored memory has the same input hash, it's a direct replay
        if (content.inputHash === inputHash) {
          // Update lastAccessedAt
          await db.aIMemoryEntry.update({
            where: { id: mem.id },
            data: { lastAccessedAt: new Date() },
          });
          return { hit: true, data: content.result };
        }
      } catch {
        // Corrupted JSON — skip
      }
    }
  } catch (err) {
    logger.warn("[gateway] memory stage error (non-fatal)", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return { hit: false, data: null };
}

/**
 * AI Runtime stage: the costly fallback — actually calls an LLM.
 *
 * Uses the existing smartRouter (callAIWithFallback) for capability-based
 * model selection with automatic fallback. In Phase 3, this will be
 * replaced/augmented by the Provider Optimizer for task-type routing.
 *
 * The `aiFn` parameter allows callers to inject the actual AI function
 * (e.g. invoice extraction, product matching, chat) — the gateway
 * handles the cascade logic, not the AI-specific prompt engineering.
 */
async function aiStage<T>(
  req: GatewayRequest,
  aiFn: (req: GatewayRequest) => Promise<{ data: T; provider: string; tokensUsed?: number; costUsd?: number }>,
): Promise<{ data: T; provider: string; tokensUsed?: number; costUsd?: number }> {
  return aiFn(req);
}

// ─── Logging ───────────────────────────────────────────────────────────────

/**
 * Log a cascade resolution to AIRequestLog.
 * Called for EVERY request, regardless of which stage resolved it.
 */
async function logRequest(params: {
  companySlug: string;
  requestType: AIRequestType;
  resolvedBy: CascadeStage;
  provider?: string;
  tokensUsed?: number;
  costUsd?: number;
  latencyMs: number;
}): Promise<void> {
  try {
    await db.aIRequestLog.create({
      data: {
        companySlug: params.companySlug,
        requestType: params.requestType,
        resolvedBy: params.resolvedBy,
        provider: params.provider || null,
        tokensUsed: params.tokensUsed || null,
        costUsd: params.costUsd || 0,
        latencyMs: params.latencyMs,
      },
    });
  } catch (err) {
    // Logging failure is non-critical — never block the request
    logger.error("[gateway] failed to log AIRequestLog", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface GatewayAIFn<T = unknown> {
  (req: GatewayRequest): Promise<{ data: T; provider: string; tokensUsed?: number; costUsd?: number }>;
}

export interface GatewayOptions<T = unknown> {
  /** The actual AI function to call at stage 5. Required. */
  aiFn: GatewayAIFn<T>;
  /** Cache TTL in ms (default: 1 hour). Set 0 to disable caching. */
  cacheTtlMs?: number;
  /** Skip specific stages (for testing or special cases). */
  skipStages?: CascadeStage[];
}

/**
 * Execute the AI Fabric cascade for a single request.
 *
 * This is the main entry point. Every "intelligent" operation in GarfiX
 * should pass through this function to ensure cost optimization.
 *
 * @example
 * ```ts
 * const result = await executeCascade({
 *   companySlug: "acme",
 *   requestType: "ocr",
 *   normalizedInput: normalizedInvoiceText,
 *   context: { text: rawInvoiceText },
 * }, {
 *   aiFn: async (req) => {
 *     const outcome = await extractWithAIDetailed(req.context.text);
 *     return { data: outcome.invoice, provider: "openrouter/...", tokensUsed: 1234, costUsd: 0.002 };
 *   },
 * });
 * ```
 */
export async function executeCascade<T = unknown>(
  req: GatewayRequest,
  options: GatewayOptions<T>,
): Promise<GatewayResult<T>> {
  const t0 = Date.now();
  const skipStages = new Set(options.skipStages || []);
  let resolvedBy: CascadeStage = "ai";
  let data: T | null = null;
  let provider: string | undefined;
  let tokensUsed: number | undefined;
  let costUsd: number | undefined;
  let cacheHitCount: number | undefined;

  // Stage 1: CACHE
  if (!skipStages.has("cache")) {
    const cacheResult = await cacheStage(req);
    if (cacheResult.hit) {
      resolvedBy = "cache";
      data = cacheResult.data as T;
      cacheHitCount = cacheResult.hitCount;
      logger.info("[gateway] cascade hit: CACHE", {
        company: req.companySlug,
        type: req.requestType,
        hitCount: cacheHitCount,
      });
    }
  }

  // Stage 2: PATTERN
  if (!data && !skipStages.has("pattern")) {
    const patternResult = await patternStage(req);
    if (patternResult.hit) {
      resolvedBy = "pattern";
      data = patternResult.data as T;
      logger.info("[gateway] cascade hit: PATTERN", {
        company: req.companySlug,
        type: req.requestType,
      });
    }
  }

  // Stage 3: RULE
  if (!data && !skipStages.has("rule")) {
    const ruleResult = await ruleStage(req);
    if (ruleResult.hit) {
      resolvedBy = "rule";
      data = ruleResult.data as T;
      logger.info("[gateway] cascade hit: RULE", {
        company: req.companySlug,
        type: req.requestType,
      });
    }
  }

  // Stage 4: MEMORY
  if (!data && !skipStages.has("memory")) {
    const memoryResult = await memoryStage(req);
    if (memoryResult.hit) {
      resolvedBy = "memory";
      data = memoryResult.data as T;
      logger.info("[gateway] cascade hit: MEMORY", {
        company: req.companySlug,
        type: req.requestType,
      });
    }
  }

  // Stage 5: AI RUNTIME (fallback)
  if (!data) {
    try {
      const aiResult = await aiStage(req, options.aiFn);
      data = aiResult.data;
      provider = aiResult.provider;
      tokensUsed = aiResult.tokensUsed;
      costUsd = aiResult.costUsd;
      logger.info("[gateway] cascade fell through to AI", {
        company: req.companySlug,
        type: req.requestType,
        provider,
        tokensUsed,
        costUsd,
      });
    } catch (err) {
      logger.error("[gateway] AI stage failed — returning null", {
        company: req.companySlug,
        type: req.requestType,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const latencyMs = Date.now() - t0;

  // Store result in cache for future hits (unless it was already a cache hit
  // or the result is null). Await to avoid race condition where a subsequent
  // request for the same input arrives before the store completes.
  if (data && resolvedBy !== "cache" && (options.cacheTtlMs ?? 3600_000) > 0) {
    await cacheStore(req.companySlug, req.normalizedInput, data, options.cacheTtlMs).catch(() => {});
  }

  // Log to AIRequestLog (async, non-blocking)
  logRequest({
    companySlug: req.companySlug,
    requestType: req.requestType,
    resolvedBy,
    provider,
    tokensUsed,
    costUsd,
    latencyMs,
  }).catch(() => {});

  return {
    data,
    resolvedBy,
    provider,
    tokensUsed,
    costUsd,
    latencyMs,
    cacheHitCount,
  };
}

// ─── Convenience: store a memory entry (used by Phase 7) ───────────────────

export async function storeAIMemory(params: {
  companySlug: string;
  category: string;
  inputHash: string;
  result: unknown;
}): Promise<void> {
  const content = JSON.stringify({ inputHash: params.inputHash, result: params.result });
  await db.aIMemoryEntry.create({
    data: {
      companySlug: params.companySlug,
      category: params.category,
      content,
    },
  });
}

// ─── Barrel export ─────────────────────────────────────────────────────────
export { cacheStore, fabricHash };