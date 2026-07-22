/**
 * ai-fabric/provider-optimizer.ts — Task-type → provider routing.
 *
 * Phase 3 of AI Fabric. Maps each AIRequestType to its optimal primary
 * and fallback provider. Unlike the existing smartRouter (which picks by
 * CAPABILITY: chat, invoice-extraction, reasoning, vision), this layer
 * routes by BUSINESS TASK TYPE (ocr, whatsapp, financial_analysis, matching).
 *
 * Default mapping (based on actual code audit of GarfiX's current usage):
 *
 *   ocr               → capability "invoice-extraction" → vision-capable model
 *   whatsapp          → capability "chat" → fast/cheap model
 *   financial_analysis → capability "reasoning" → reasoning model
 *   matching          → capability "chat" → same model as product matching
 *   other             → capability "chat" → general model
 *
 * Actual models used in current codebase (audited):
 *   - invoice-brain OCR: callAIWithFallback({ capability: "invoice-extraction" })
 *     → smartRouter picks best model for invoice-extraction from AIModelRegistry
 *   - product matching: callAI() with Arabic judge prompt → legacy provider chain
 *   - WhatsApp: logging only (AI not yet implemented)
 *   - financial_analysis: not yet implemented
 *
 * Fallback: if primaryProvider fails (timeout/rate-limit), automatically
 * switches to fallbackProvider + logs the reason.
 *
 * Source: ProviderConfig table (seeded in seed script), falls back to
 *         capability-based smartRouter if no config exists.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { callAIWithFallback, type RoutedChatOptions } from "@/lib/ai/smartRouter";
import type { AIRequestType, ProviderRoutingDecision } from "./types";
import { getCostRates } from "@/lib/ai/costTracker";

// ─── Task type → capability mapping (audited from actual code) ──────────────
//
// These map BUSINESS TASK TYPES to AI CAPABILITIES that the smartRouter
// understands. The smartRouter then picks the best healthy model for that
// capability from AIModelRegistry.

const TASK_CAPABILITY_MAP: Record<AIRequestType, string> = {
  // invoice-brain/aiFallback.ts:128 calls callAIWithFallback({ capability: "invoice-extraction" })
  ocr: "invoice-extraction",

  // WhatsApp webhook: currently logging only, but when AI is implemented
  // it will need fast/cheap responses for chat-like interactions
  whatsapp: "chat",

  // Financial analysis requires multi-step reasoning (not yet implemented)
  financial_analysis: "reasoning",

  // aiProductResolver.ts:17 uses callAI() (legacy chain) for Arabic product matching
  // This is a chat-style JSON extraction — maps to "chat" capability
  matching: "chat",

  // Default fallback
  other: "chat",
};

// ─── Default provider configs (seeded if ProviderConfig table is empty) ────
//
// These reflect the ACTUAL models used in the current codebase (not invented):
//   - Invoice OCR: smartRouter picks by "invoice-extraction" capability
//   - Product matching: legacy chain → z-ai-glm (sandbox) or company's openrouterModel
//   - WhatsApp: not yet AI-enabled
//   - Financial analysis: not yet implemented

const DEFAULT_PROVIDERS: Record<AIRequestType, { primary: string; fallback: string }> = {
  ocr: {
    // invoice-brain uses callAIWithFallback → smartRouter with capability "invoice-extraction"
    // Primary: best registry model, Fallback: legacy chain (z-ai-glm in sandbox)
    primary: "smart-router:invoice-extraction",
    fallback: "legacy:z-ai-glm",
  },
  whatsapp: {
    // Not yet AI-enabled — placeholder
    primary: "smart-router:chat",
    fallback: "legacy:z-ai-glm",
  },
  financial_analysis: {
    // Not yet implemented — placeholder
    primary: "smart-router:reasoning",
    fallback: "legacy:z-ai-glm",
  },
  matching: {
    // aiProductResolver uses callAI() (legacy chain)
    primary: "smart-router:chat",
    fallback: "legacy:z-ai-glm",
  },
  other: {
    primary: "smart-router:chat",
    fallback: "legacy:z-ai-glm",
  },
};

// ─── Cache (1-min TTL) to avoid DB hit on every request ────────────────────

interface CachedConfig {
  taskType: string;
  primaryProvider: string;
  fallbackProvider: string;
  expiresAt: number;
}
const configCache = new Map<string, CachedConfig>();
const CONFIG_CACHE_TTL_MS = 60_000;

/**
 * Get the provider routing for a task type.
 *
 * 1. Check in-memory cache (1-min TTL)
 * 2. Check ProviderConfig table
 * 3. Fall back to DEFAULT_PROVIDERS (based on code audit)
 *
 * Returns: { taskType, primaryProvider, fallbackProvider, usedFallback, fallbackReason? }
 */
export async function getProviderRouting(taskType: AIRequestType): Promise<ProviderRoutingDecision> {
  const cached = configCache.get(taskType);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      taskType,
      primaryProvider: cached.primaryProvider,
      fallbackProvider: cached.fallbackProvider,
      usedFallback: false,
    };
  }

  // Check ProviderConfig table
  const config = await db.providerConfig.findUnique({
    where: { taskType },
  });

  let primaryProvider: string;
  let fallbackProvider: string;

  if (config) {
    primaryProvider = config.primaryProvider;
    fallbackProvider = config.fallbackProvider;
  } else {
    const defaults = DEFAULT_PROVIDERS[taskType] || DEFAULT_PROVIDERS.other;
    primaryProvider = defaults.primary;
    fallbackProvider = defaults.fallback;
  }

  // Cache the result
  configCache.set(taskType, {
    taskType,
    primaryProvider,
    fallbackProvider,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  });

  return {
    taskType,
    primaryProvider,
    fallbackProvider,
    usedFallback: false,
  };
}

/**
 * Call the AI provider for a task type, with automatic fallback.
 *
 * This integrates with the existing smartRouter when the provider is
 * "smart-router:*", and falls back to the legacy callAI chain otherwise.
 *
 * @param taskType - Business task type (ocr, whatsapp, etc.)
 * @param options - Chat options (messages, temperature, etc.)
 * @returns The AI response + routing decision
 */
export async function callWithProviderRouting(
  taskType: AIRequestType,
  options: Omit<RoutedChatOptions, "capability">,
): Promise<{
  content: string;
  provider: string;
  tokensIn?: number;
  tokensOut?: number;
  routingDecision: ProviderRoutingDecision;
}> {
  const routing = await getProviderRouting(taskType);
  const capability = TASK_CAPABILITY_MAP[taskType] || "chat" as const;

  try {
    // If primary is a smart-router reference, use callAIWithFallback
    if (routing.primaryProvider.startsWith("smart-router:")) {
      const result = await callAIWithFallback({
        ...options,
        capability: capability as "chat" | "invoice-extraction" | "reasoning" | "vision",
      });

      const provider = result.usedModel
        ? `${result.usedModel.provider}/${result.usedModel.model}`
        : "legacy-fallback";

      return {
        content: result.content,
        provider,
        tokensIn: result.usage?.prompt_tokens,
        tokensOut: result.usage?.completion_tokens,
        routingDecision: routing,
      };
    }

    // Otherwise use the legacy callAI
    const { callAI } = await import("@/lib/aiProvider");
    const result = await callAI(options as Parameters<typeof callAI>[0]);

    return {
      content: result.content,
      provider: `legacy:${result.model || "unknown"}`,
      tokensIn: result.usage?.prompt_tokens,
      tokensOut: result.usage?.completion_tokens,
      routingDecision: routing,
    };
  } catch (err) {
    // Primary failed — try fallback
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("[provider-optimizer] primary failed, trying fallback", {
      taskType,
      primary: routing.primaryProvider,
      err: errorMsg.slice(0, 200),
    });

    routing.usedFallback = true;
    routing.fallbackReason = errorMsg.slice(0, 200);

    try {
      const { callAI } = await import("@/lib/aiProvider");
      const result = await callAI(options as Parameters<typeof callAI>[0]);

      return {
        content: result.content,
        provider: `fallback:${result.model || "unknown"}`,
        tokensIn: result.usage?.prompt_tokens,
        tokensOut: result.usage?.completion_tokens,
        routingDecision: routing,
      };
    } catch (fallbackErr) {
      const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      logger.error("[provider-optimizer] both primary and fallback failed", {
        taskType,
        fallback: routing.fallbackProvider,
        err: fbMsg.slice(0, 200),
      });
      throw fallbackErr;
    }
  }
}

/**
 * Seed the ProviderConfig table with defaults.
 * Run once during initial setup. Safe to re-run (upsert).
 */
export async function seedProviderConfigs(): Promise<void> {
  const tasks: AIRequestType[] = ["ocr", "whatsapp", "financial_analysis", "matching", "other"];

  for (const taskType of tasks) {
    const defaults = DEFAULT_PROVIDERS[taskType];
    await db.providerConfig.upsert({
      where: { taskType },
      create: {
        taskType,
        primaryProvider: defaults.primary,
        fallbackProvider: defaults.fallback,
      },
      update: {
        primaryProvider: defaults.primary,
        fallbackProvider: defaults.fallback,
      },
    });
  }

  logger.info("[provider-optimizer] seeded ProviderConfig table with defaults", {
    count: tasks.length,
  });
}
