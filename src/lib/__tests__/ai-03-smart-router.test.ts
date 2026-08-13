// AI-03 FIX (Audit v2 · Phase 2)
/**
 * ai-03-smart-router.test.ts — Smart Router activation regression.
 *
 * Phase 1 (AI-01) made `getModelsForCapability()` actually return models
 * (was always returning [] because the capabilities column was missing).
 * Phase 2 (AI-03) verifies the Smart Router is wired into the model
 * selection path so the activation is end-to-end:
 *
 *   (1) `callAIWithFallback` uses `getModelsForCapability(cap)` as its
 *       PRIMARY selection path (registry-first) before the legacy chain.
 *   (2) When the registry returns a healthy candidate, that candidate is
 *       actually tried (callSingleProvider is invoked with the registry-
 *       selected model) BEFORE falling back to the legacy callAI().
 *   (3) Every routing decision is logged via `logger.info` with the
 *       `capability` field set correctly, so the audit trail / founder
 *       dashboard can trace which capability triggered which model.
 *
 * Strategy: mock the Prisma DB layer (db.aIModelRegistry.findMany) and
 * the legacy aiProvider module so the test runs in isolation without
 * touching the network or the live DB.
 */
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ─── Mock setup ───────────────────────────────────────────────────────────
//
// Mocks MUST be registered BEFORE importing the SUT because modelRegistry.ts
// imports `dbTyped` from "@/lib/db" at module load time and the registry
// cache is a module-level singleton that would persist across tests if not
// invalidated.

const findManyMock = mock(async () => [] as unknown[]);

// Capture logger.info calls so we can assert the routing decision was logged.
const infoMock = mock(() => {});
const warnMock = mock(() => {});
const debugMock = mock(() => {});

mock.module("@/lib/db", () => ({
  db: {
    aIModelRegistry: {
      findMany: findManyMock,
      findFirst: mock(async () => null),
      findUnique: mock(async () => null),
      update: mock(async () => ({})),
      updateMany: mock(async () => ({ count: 0 })),
      create: mock(async () => ({})),
    },
    aIBenchmarkResult: {
      findMany: mock(async () => []),
      create: mock(async () => ({})),
    },
  },
  get dbTyped() {
    return this.db;
  },
}));

// Mock the logger so we can spy on the routing decision log calls and the
// test output isn't polluted.
mock.module("@/lib/logger", () => ({
  logger: {
    debug: debugMock,
    info: infoMock,
    warn: warnMock,
    error: mock(() => {}),
    fatal: mock(() => {}),
  },
}));

// ─── SUT imports (after mocks are in place) ───────────────────────────────

const { getModelsForCapability, invalidateRegistryCache } = await import(
  "@/lib/ai/modelRegistry"
);
const { callAIWithFallback, routeRequest } = await import(
  "@/lib/ai/smartRouter"
);

// ─── Test helpers ─────────────────────────────────────────────────────────

/** Shape that mapRow() in modelRegistry.ts expects from Prisma's findMany. */
interface RawRegistryRow {
  id: number;
  provider: string;
  model: string;
  costPerTokenIn: number;
  costPerTokenOut: number;
  maxTokens: number | null;
  isActive: boolean;
  capabilities: string[];
  healthScore: number;
  isHealthy: boolean;
  lastHealthCheck: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeRow(overrides: Partial<RawRegistryRow> = {}): RawRegistryRow {
  return {
    id: 1,
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    costPerTokenIn: 0.0001,
    costPerTokenOut: 0.0002,
    maxTokens: 16384,
    isActive: true,
    capabilities: ["chat"],
    healthScore: 0.8,
    isHealthy: true,
    lastHealthCheck: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────

describe("AI-03 Smart Router activation (Audit v2 · Phase 2)", () => {
  beforeEach(() => {
    invalidateRegistryCache();
    findManyMock.mockImplementation(async () => [] as unknown[]);
    infoMock.mockReset();
    warnMock.mockReset();
    debugMock.mockReset();
  });

  afterEach(() => {
    mock.restore();
  });

  // ─── (1) callAIWithFallback uses getModelsForCapability as PRIMARY ──
  //
  // The architectural contract: the Smart Router MUST consult the registry
  // BEFORE the legacy chain. We verify by setting up a healthy registry
  // model and asserting that callSingleProvider (the registry-selected
  // model) is invoked, and the result comes from the registry call (not
  // the legacy callAI).

  it("uses getModelsForCapability as the primary selection path", async () => {
    findManyMock.mockImplementation(async () =>
      [
        makeRow({
          id: 1,
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          capabilities: ["chat"],
          isHealthy: true,
          healthScore: 0.9,
        }),
      ] as unknown as never,
    );

    const callSingleProviderMock = mock(async () => ({
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      content: "registry-selected reply",
      usage: { total_tokens: 12, prompt_tokens: 6, completion_tokens: 6 },
    }));
    const callAIMock = mock(async () => ({
      provider: "z-ai",
      model: "z-ai-glm",
      content: "legacy fallback reply",
      usage: { total_tokens: 1, prompt_tokens: 1, completion_tokens: 0 },
    }));
    const getAiProvidersMock = mock(async () => [
      {
        provider: "openrouter",
        apiKey: "sk-test-key",
        model: "openai/gpt-4o-mini",
        baseUrl: "https://openrouter.ai/api/v1",
        isEnabled: true,
        priority: 1,
      },
    ]);

    mock.module("@/lib/aiProvider", () => ({
      callAI: callAIMock,
      callSingleProvider: callSingleProviderMock,
      getAiProviders: getAiProvidersMock,
    }));

    const { callAIWithFallback: fresh } = await import(
      "@/lib/ai/smartRouter"
    );

    const result = await fresh({
      messages: [{ role: "user", content: "hello" }],
      capability: "chat",
    });

    // Registry model was tried first and won.
    expect(callSingleProviderMock).toHaveBeenCalledTimes(1);
    // Legacy chain was NOT consulted (registry succeeded).
    expect(callAIMock).not.toHaveBeenCalled();
    expect(result.content).toBe("registry-selected reply");
    expect(result.usedModel?.model).toBe("openai/gpt-4o-mini");
    expect(result.routeDecision.usedLegacyFallback).toBe(false);
  });

  it("routeRequest consults getModelsForCapability and returns matching candidates", async () => {
    findManyMock.mockImplementation(async () =>
      [
        makeRow({
          id: 1,
          provider: "deepseek",
          model: "deepseek-chat",
          capabilities: ["chat", "reasoning"],
          isHealthy: true,
          healthScore: 0.85,
        }),
        makeRow({
          id: 2,
          provider: "openai",
          model: "gpt-4o",
          capabilities: ["vision"],
          isHealthy: true,
          healthScore: 0.92,
        }),
      ] as unknown as never,
    );

    // Capability = chat → only deepseek should be returned
    const chatModels = await getModelsForCapability("chat");
    expect(chatModels).toHaveLength(1);
    expect(chatModels[0]?.provider).toBe("deepseek");

    const decision = await routeRequest("chat");
    expect(decision.capability).toBe("chat");
    expect(decision.primary?.provider).toBe("deepseek");
    expect(decision.usedLegacyFallback).toBe(false);
  });

  // ─── (2) Routing decision is logged with the correct capability ─────
  //
  // AI-03 contract: every routing decision must be observable in the audit
  // trail. We assert `logger.info` was called with the capability field
  // matching the requested capability.

  it("logs the routing decision with the correct capability on registry success", async () => {
    findManyMock.mockImplementation(async () =>
      [
        makeRow({
          id: 1,
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          capabilities: ["invoice-extraction"],
          isHealthy: true,
          healthScore: 0.85,
        }),
      ] as unknown as never,
    );

    const callSingleProviderMock = mock(async () => ({
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      content: "extracted JSON",
      usage: { total_tokens: 50, prompt_tokens: 40, completion_tokens: 10 },
    }));
    mock.module("@/lib/aiProvider", () => ({
      callAI: mock(async () => ({ content: "legacy" })),
      callSingleProvider: callSingleProviderMock,
      getAiProviders: mock(async () => [
        {
          provider: "openrouter",
          apiKey: "sk-test-key",
          model: "openai/gpt-4o-mini",
          baseUrl: "https://openrouter.ai/api/v1",
          isEnabled: true,
          priority: 1,
        },
      ]),
    }));

    const { callAIWithFallback: fresh } = await import(
      "@/lib/ai/smartRouter"
    );

    await fresh({
      messages: [{ role: "user", content: "extract invoice" }],
      capability: "invoice-extraction",
    });

    // Find the routing-decision log call.
    const routingLogCall = infoMock.mock.calls.find(
      (call: unknown) =>
        Array.isArray(call) &&
        typeof call[0] === "string" &&
        (call[0] as string).includes("routing decision"),
    );
    expect(routingLogCall).toBeDefined();
    const payload = (routingLogCall as unknown[])[1] as Record<string, unknown>;
    // The capability field must match the requested capability.
    expect(payload.capability).toBe("invoice-extraction");
    // The usedModel must be the one that actually answered.
    expect(payload.usedModel).toBe("openai/gpt-4o-mini");
    expect(payload.usedProvider).toBe("openrouter");
    expect(payload.usedLegacyFallback).toBe(false);
  });

  it("logs the routing decision with the correct capability when registry is empty", async () => {
    // Empty registry → must log and fall back to legacy.
    findManyMock.mockImplementation(async () => [] as unknown as never);

    mock.module("@/lib/aiProvider", () => ({
      callAI: mock(async () => ({
        provider: "z-ai",
        model: "z-ai-glm",
        content: "legacy fallback reply",
        usage: { total_tokens: 1, prompt_tokens: 1, completion_tokens: 0 },
      })),
      callSingleProvider: mock(async () => {
        throw new Error("no providers");
      }),
      getAiProviders: mock(async () => []),
    }));

    const { callAIWithFallback: fresh } = await import(
      "@/lib/ai/smartRouter"
    );

    const result = await fresh({
      messages: [{ role: "user", content: "reason about this" }],
      capability: "reasoning",
    });

    // The route decision reflects the registry was empty.
    expect(result.routeDecision.usedLegacyFallback).toBe(true);
    expect(result.routeDecision.capability).toBe("reasoning");

    // A routing-decision log call MUST exist with capability="reasoning".
    const routingLogCall = infoMock.mock.calls.find(
      (call: unknown) =>
        Array.isArray(call) &&
        typeof call[0] === "string" &&
        (call[0] as string).includes("routing decision"),
    );
    expect(routingLogCall).toBeDefined();
    const payload = (routingLogCall as unknown[])[1] as Record<string, unknown>;
    expect(payload.capability).toBe("reasoning");
    expect(payload.usedLegacyFallback).toBe(true);
    expect(payload.usedModel).toBeNull();
  });

  it("logs the routing decision with the correct capability when no capability is specified", async () => {
    // Back-compat path: no capability → legacy chain.
    mock.module("@/lib/aiProvider", () => ({
      callAI: mock(async () => ({
        provider: "z-ai",
        model: "z-ai-glm",
        content: "legacy reply",
        usage: { total_tokens: 1, prompt_tokens: 1, completion_tokens: 0 },
      })),
      callSingleProvider: mock(async () => {
        throw new Error("unused");
      }),
      getAiProviders: mock(async () => []),
    }));

    const { callAIWithFallback: fresh } = await import(
      "@/lib/ai/smartRouter"
    );

    await fresh({
      messages: [{ role: "user", content: "hi" }],
      // No capability → back-compat path. Default capability for the log
      // is "chat" (see callAIWithFallback).
    });

    const routingLogCall = infoMock.mock.calls.find(
      (call: unknown) =>
        Array.isArray(call) &&
        typeof call[0] === "string" &&
        (call[0] as string).includes("routing decision"),
    );
    expect(routingLogCall).toBeDefined();
    const payload = (routingLogCall as unknown[])[1] as Record<string, unknown>;
    expect(payload.capability).toBe("chat");
    expect(payload.usedLegacyFallback).toBe(true);
  });

  it("logs the routing decision with capability when registry chain is exhausted", async () => {
    // Registry has a healthy candidate, but the provider call fails — so
    // the router escalates through the chain, then falls back to legacy.
    findManyMock.mockImplementation(async () =>
      [
        makeRow({
          id: 1,
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          capabilities: ["vision"],
          isHealthy: true,
          healthScore: 0.9,
        }),
      ] as unknown as never,
    );

    const callSingleProviderMock = mock(async () => {
      throw new Error("simulated provider 500");
    });
    const callAIMock = mock(async () => ({
      provider: "z-ai",
      model: "z-ai-glm",
      content: "legacy after registry exhausted",
      usage: { total_tokens: 1, prompt_tokens: 1, completion_tokens: 0 },
    }));

    mock.module("@/lib/aiProvider", () => ({
      callAI: callAIMock,
      callSingleProvider: callSingleProviderMock,
      getAiProviders: mock(async () => [
        {
          provider: "openrouter",
          apiKey: "sk-test-key",
          model: "openai/gpt-4o-mini",
          baseUrl: "https://openrouter.ai/api/v1",
          isEnabled: true,
          priority: 1,
        },
      ]),
    }));

    const { callAIWithFallback: fresh } = await import(
      "@/lib/ai/smartRouter"
    );

    const result = await fresh({
      messages: [{ role: "user", content: "describe image" }],
      capability: "vision",
    });

    // Registry was tried but failed — legacy chain took over.
    expect(callSingleProviderMock).toHaveBeenCalledTimes(1);
    expect(callAIMock).toHaveBeenCalledTimes(1);
    expect(result.content).toBe("legacy after registry exhausted");
    expect(result.usedModel).toBe(null);

    // Routing-decision log MUST exist with capability="vision".
    const routingLogCall = infoMock.mock.calls.find(
      (call: unknown) =>
        Array.isArray(call) &&
        typeof call[0] === "string" &&
        (call[0] as string).includes("routing decision"),
    );
    expect(routingLogCall).toBeDefined();
    const payload = (routingLogCall as unknown[])[1] as Record<string, unknown>;
    expect(payload.capability).toBe("vision");
    expect(payload.usedModel).toBeNull();
    // The routeDecision reflects the registry WAS consulted (usedLegacyFallback=false)
    // even though the legacy chain answered at runtime.
    expect(payload.usedLegacyFallback).toBe(false);
  });
});
