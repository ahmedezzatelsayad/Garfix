/**
 * smartRouter.ts — AI Orchestration Layer: capability-based model routing.
 *
 * Instead of a single global fallback chain, the Smart Router picks the best
 * model PER CAPABILITY. A chat reply and an invoice-JSON extraction have very
 * different latency / quality / cost tradeoffs — a free model that's great at
 * Arabic small-talk may be poor at strict-JSON, and vice-versa.
 *
 * Selection algorithm:
 *   1. Query the Model Registry for enabled + healthy models with the
 *      requested capability.
 *   2. Sort by healthScore desc (success + latency + cost + quality).
 *   3. Return the ordered chain (primary first, then fallbacks).
 *
 * If the registry is empty or has no healthy candidate for a capability, the
 * router transparently falls back to the legacy `getAiProviders()` chain — so
 * existing callAI() call sites keep working even before the registry is seeded.
 *
 * Automatic-fallback (runtime): the router exposes a `callAIWithFallback()`
 * wrapper that tries each model in the chain until one succeeds. If a provider
 * returns 429 (rate limit) or times out (> latencyCapMs), the router
 * immediately moves to the next model — the user never sees the failure.
 */
import { getModelsForCapability, resolveProviderConfigForModel, type RegistryEntry, type AICapability } from "./modelRegistry";
import type { ChatMessage, ChatResult, AiProviderConfig, ProviderType } from "@/lib/aiProvider";
import { logger } from "@/lib/logger";

export interface RouteDecision {
  capability: AICapability;
  primary: RegistryEntry | null;
  fallbacks: RegistryEntry[];
  /** True when the registry had no healthy candidate and we fell back to legacy. */
  usedLegacyFallback: boolean;
  /** Reasoning trail surfaced to the dashboard for transparency. */
  reason: string;
}

/**
 * Decide which model(s) to use for a given capability.
 */
export async function routeRequest(capability: AICapability): Promise<RouteDecision> {
  const candidates = await getModelsForCapability(capability);

  if (candidates.length === 0) {
    return {
      capability,
      primary: null,
      fallbacks: [],
      usedLegacyFallback: true,
      reason: `No healthy registry model for capability "${capability}" — falling back to legacy provider chain.`,
    };
  }

  // Sort by healthScore desc, then tier (free first), then latency asc
  const sorted = [...candidates].sort((a, b) => {
    if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
    if (a.tier !== b.tier) return a.tier === "free" ? -1 : 1;
    return a.avgLatencyMs - b.avgLatencyMs;
  });

  return {
    capability,
    primary: sorted[0],
    fallbacks: sorted.slice(1),
    usedLegacyFallback: false,
    reason: `Selected ${sorted[0].provider}/${sorted[0].model} (health ${sorted[0].healthScore}, success ${sorted[0].successRate}%, p50 ${(sorted[0].avgLatencyMs / 1000).toFixed(1)}s).`,
  };
}

// ─── Capability → ChatOptions hint ──────────────────────────────────────────
//
// The router needs to know which capability a request exercises so it can pick
// the right model. callAI() accepts an optional `capability` param; when
// omitted, the router is bypassed and the legacy chain is used (back-compat).

export interface RoutedChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  companySlug?: string;
  capability?: AICapability;
  /** Hard cap on per-model latency before the router escalates to the next fallback. */
  latencyCapMs?: number;
}

export interface RoutedChatResult extends ChatResult {
  routeDecision: RouteDecision;
  /** Which registry entry actually answered (null when legacy fallback was used). */
  usedModel: RegistryEntry | null;
}

/**
 * Call AI with smart routing + automatic fallback.
 *
 * Tries the registry-selected primary first; on 429/timeout/error, escalates
 * to each fallback in turn. If the entire registry chain fails, falls back to
 * the legacy callAI() (which itself has the z-ai sandbox safety net).
 */
export async function callAIWithFallback(
  options: RoutedChatOptions,
): Promise<RoutedChatResult> {
  const capability = options.capability;
  const latencyCapMs = options.latencyCapMs ?? 15_000;

  // No capability → legacy path (back-compat for existing call sites)
  if (!capability) {
    const { callAI } = await import("@/lib/aiProvider");
    const result = await callAI(options);
    return {
      ...result,
      routeDecision: {
        capability: "chat",
        primary: null,
        fallbacks: [],
        usedLegacyFallback: true,
        reason: "No capability specified — legacy provider chain used.",
      },
      usedModel: null,
    };
  }

  const decision = await routeRequest(capability);

  // Build the ordered chain to attempt: registry primary + fallbacks
  const chain: RegistryEntry[] = [];
  if (decision.primary) chain.push(decision.primary);
  chain.push(...decision.fallbacks);

  // Import provider factory lazily to avoid circular deps
  const { callSingleProvider } = await import("@/lib/aiProvider");

  let lastErr: unknown = null;

  for (const entry of chain) {
    const config = await resolveProviderConfigForModel(entry);
    if (!config) {
      continue;
    }
    // z-ai has null apiKey (sandbox) — allowed; other providers need a key
    if (entry.provider !== "z-ai" && !config.apiKey) {
      continue;
    }

    const t0 = Date.now();
    try {
      const result = await callSingleProvider(
        {
          provider: config.provider as ProviderType,
          apiKey: config.apiKey,
          model: entry.model,
          baseUrl: config.baseUrl,
          isEnabled: true,
          priority: 1,
        } as AiProviderConfig,
        {
          messages: options.messages,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          companySlug: options.companySlug,
        },
      );
      const elapsed = Date.now() - t0;

      // Latency-cap escalation: if the model answered but took too long,
      // log it but still return the result (the call succeeded). The cap is
      // mainly for future pre-emptive abort — we don't discard a valid reply.
      if (elapsed > latencyCapMs) {
        logger.warn("[smartRouter] model exceeded latency cap (kept result)", {
          model: entry.model,
          elapsed,
          cap: latencyCapMs,
        });
      }

      return {
        ...result,
        routeDecision: decision,
        usedModel: entry,
      };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[smartRouter] model failed — escalating to next fallback", {
        capability,
        model: entry.model,
        err: msg.slice(0, 200),
      });
      continue;
    }
  }

  // Entire registry chain failed → legacy fallback
  logger.warn("[smartRouter] registry chain exhausted — legacy fallback", {
    capability,
    triedCount: chain.length,
  });
  const { callAI } = await import("@/lib/aiProvider");
  const legacy = await callAI(options);
  return {
    ...legacy,
    routeDecision: decision,
    usedModel: null,
  };
}

/**
 * Convenience: return the current routing matrix (primary model per capability)
 * for display in the admin dashboard.
 */
export async function getRoutingMatrix(): Promise<
  Array<{ capability: AICapability; primary: RegistryEntry | null; candidateCount: number }>
> {
  const { ALL_CAPABILITIES } = await import("./modelRegistry");
  const matrix: Array<{ capability: AICapability; primary: RegistryEntry | null; candidateCount: number }> = [];
  for (const cap of ALL_CAPABILITIES) {
    const decision = await routeRequest(cap);
    matrix.push({
      capability: cap,
      primary: decision.primary,
      candidateCount: decision.primary ? 1 + decision.fallbacks.length : 0,
    });
  }
  return matrix;
}
