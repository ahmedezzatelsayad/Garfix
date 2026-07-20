/**
 * ai-fabric/__tests__/gateway.test.ts — Phase 1-3 integration tests.
 *
 * Tests the 5-stage cascade gateway, cost optimizer, and provider optimizer.
 * All tests use the actual Prisma client (SQLite in-memory) — no mocks for DB.
 * AI calls are mocked (we don't call real LLMs in tests).
 *
 * Acceptance criteria from the execution prompt:
 * - Same request sent twice → first resolvedBy='ai', second resolvedBy='cache'
 * - Every stage logs to AIRequestLog
 * - Cost optimizer produces correct numbers from real AIRequestLog data
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "@/lib/db";
import { executeCascade, storeAIMemory, cacheStore, type GatewayRequest } from "@/lib/ai-fabric/gateway";
import { calculateSavedCost, getCascadeBreakdown } from "@/lib/ai-fabric/cost-optimizer";
import { getProviderRouting, seedProviderConfigs } from "@/lib/ai-fabric/provider-optimizer";
import { fabricHash } from "@/lib/ai-fabric/types";

// Test company slug
const TEST_SLUG = "test-cascade-co";

// ─── Helpers ───────────────────────────────────────────────────────────────

async function cleanTestData() {
  await db.aIRequestLog.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.cacheEntry.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.aIMemoryEntry.deleteMany({ where: { companySlug: TEST_SLUG } });
}

function makeRequest(overrides?: Partial<GatewayRequest>): GatewayRequest {
  return {
    companySlug: TEST_SLUG,
    requestType: "other",
    normalizedInput: "test-input-123",
    ...overrides,
  };
}

// ─── Test Suite ────────────────────────────────────────────────────────────

describe("AI Fabric Gateway — Phase 1", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("should resolve via AI on first call (cache miss)", async () => {
    const req = makeRequest({
      normalizedInput: `unique-input-${Date.now()}`,
      requestType: "other",
    });

    const result = await executeCascade(req, {
      aiFn: async () => ({
        data: { answer: "AI response" },
        provider: "test/test-model",
        tokensUsed: 100,
        costUsd: 0.001,
      }),
    });

    expect(result.data).toEqual({ answer: "AI response" });
    expect(result.resolvedBy).toBe("ai");
    expect(result.provider).toBe("test/test-model");
    expect(result.tokensUsed).toBe(100);
    expect(result.costUsd).toBe(0.001);
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it("should resolve via cache on second identical call", async () => {
    const input = `cache-test-${Date.now()}`;
    const req = makeRequest({ normalizedInput: input, requestType: "other" });

    // First call → AI
    const result1 = await executeCascade(req, {
      aiFn: async () => ({
        data: { answer: "cached-response" },
        provider: "test/model",
        tokensUsed: 50,
        costUsd: 0.0005,
      }),
    });
    expect(result1.resolvedBy).toBe("ai");

    // Second call → Cache
    const result2 = await executeCascade(req, {
      aiFn: async () => ({
        data: { answer: "should-not-see-this" },
        provider: "test/model-2",
        tokensUsed: 50,
        costUsd: 0.0005,
      }),
    });
    expect(result2.resolvedBy).toBe("cache");
    expect(result2.data).toEqual({ answer: "cached-response" });
    expect(result2.cacheHitCount).toBe(1); // first hit after store
  });

  it("should log every request to AIRequestLog", async () => {
    await cleanTestData();
    const input = `log-test-${Date.now()}`;

    // First call (AI)
    await executeCascade(makeRequest({ normalizedInput: input }), {
      aiFn: async () => ({ data: { result: 1 }, provider: "t/m", tokensUsed: 10, costUsd: 0.0001 }),
    });

    // Second call (cache)
    await executeCascade(makeRequest({ normalizedInput: input }), {
      aiFn: async () => ({ data: { result: 2 }, provider: "t/m", tokensUsed: 10, costUsd: 0.0001 }),
    });

    // Small delay to allow fire-and-forget logRequest to complete
    await new Promise((r) => setTimeout(r, 50));

    const logs = await db.aIRequestLog.findMany({
      where: { companySlug: TEST_SLUG },
      orderBy: { createdAt: "asc" },
    });

    // Should have 2 logs (one from each call)
    const logTests = logs.filter((l) => l.normalizedInput === undefined || true);
    expect(logs.length).toBeGreaterThanOrEqual(2);

    // First should be 'ai', second should be 'cache'
    const last2 = logs.slice(-2);
    expect(last2[0].resolvedBy).toBe("ai");
    expect(last2[1].resolvedBy).toBe("cache");
  });

  it("should skip stages when requested", async () => {
    const input = `skip-test-${Date.now()}`;
    const req = makeRequest({ normalizedInput: input, requestType: "other" });

    // Skip cache and pattern — should go to AI even if cached
    await executeCascade(req, {
      aiFn: async () => ({ data: { result: "direct-ai" }, provider: "t/m", tokensUsed: 10, costUsd: 0.0001 }),
    });

    // Now call with skip cache — should hit AI again even though it's cached
    const result = await executeCascade(req, {
      aiFn: async () => ({ data: { result: "skip-ai" }, provider: "t/m-2", tokensUsed: 20, costUsd: 0.0002 }),
      skipStages: ["cache"],
    });

    expect(result.resolvedBy).toBe("ai");
    expect(result.data).toEqual({ result: "skip-ai" });
  });

  it("should handle AI failure gracefully (returns null)", async () => {
    const input = `fail-test-${Date.now()}`;

    const result = await executeCascade(makeRequest({ normalizedInput: input }), {
      aiFn: async () => {
        throw new Error("AI provider unavailable");
      },
    });

    expect(result.data).toBeNull();
    expect(result.resolvedBy).toBe("ai"); // reached AI stage but failed
  });

  it("should store and retrieve AI memory", async () => {
    const inputHash = fabricHash(`memory-test-${Date.now()}`);
    await storeAIMemory({
      companySlug: TEST_SLUG,
      category: "decision",
      inputHash,
      result: { action: "approve", confidence: 0.95 },
    });

    // Verify it was stored
    const memories = await db.aIMemoryEntry.findMany({
      where: { companySlug: TEST_SLUG, category: "decision" },
    });

    expect(memories.length).toBeGreaterThanOrEqual(1);
    const latest = memories[memories.length - 1];
    const content = JSON.parse(latest.content);
    expect(content.inputHash).toBe(inputHash);
    expect(content.result.action).toBe("approve");
  });

  it("should respect cache TTL (expired entries are not used)", async () => {
    const input = `ttl-test-${Date.now()}`;
    const req = makeRequest({ normalizedInput: input });

    // Store with 1ms TTL (immediately expired)
    await cacheStore(TEST_SLUG, input, { result: "expired" }, 1);
    // Wait a tiny bit for it to expire
    await new Promise((r) => setTimeout(r, 10));

    const result = await executeCascade(req, {
      aiFn: async () => ({ data: { result: "fresh-ai" }, provider: "t/m", tokensUsed: 10, costUsd: 0.0001 }),
    });

    // Should NOT hit the expired cache
    expect(result.resolvedBy).toBe("ai");
    expect(result.data).toEqual({ result: "fresh-ai" });
  });
});

describe("AI Fabric Cost Optimizer — Phase 2", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("should calculate savings correctly (70 cache, 30 AI)", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 60_000 * 60); // 1 hour ago

    // Create 70 cache-resolved requests (cost $0 each)
    for (let i = 0; i < 70; i++) {
      await db.aIRequestLog.create({
        data: {
          companySlug: TEST_SLUG,
          requestType: "other",
          resolvedBy: "cache",
          costUsd: 0,
          latencyMs: 5,
          createdAt: new Date(periodStart.getTime() + i * 1000),
        },
      });
    }

    // Create 30 AI-resolved requests ($0.002 each = $0.06 total)
    for (let i = 0; i < 30; i++) {
      await db.aIRequestLog.create({
        data: {
          companySlug: TEST_SLUG,
          requestType: "other",
          resolvedBy: "ai",
          costUsd: 0.002,
          latencyMs: 500,
          tokensUsed: 100,
          provider: "test/model",
          createdAt: new Date(periodStart.getTime() + (70 + i) * 1000),
        },
      });
    }

    const report = await calculateSavedCost(TEST_SLUG, periodStart, now);

    // Total: 100 requests
    expect(report.totalRequests).toBe(100);

    // Actual cost: 30 × $0.002 = $0.06
    expect(report.actualCostUsd).toBe(0.06);

    // Avg AI cost: $0.002
    // Hypothetical if all 100 went to AI: 100 × $0.002 = $0.20
    expect(report.hypotheticalAiOnlyCostUsd).toBe(0.2);

    // Saved: $0.20 - $0.06 = $0.14
    expect(report.savedUsd).toBe(0.14);

    // Savings %: 0.14 / 0.20 = 70%
    expect(report.savingsPct).toBe(70);

    // Breakdown
    const cacheEntry = report.breakdown.find((b) => b.resolvedBy === "cache");
    expect(cacheEntry).toBeDefined();
    expect(cacheEntry!.count).toBe(70);
    expect(cacheEntry!.percentage).toBe(70);

    const aiEntry = report.breakdown.find((b) => b.resolvedBy === "ai");
    expect(aiEntry).toBeDefined();
    expect(aiEntry!.count).toBe(30);
    expect(aiEntry!.percentage).toBe(30);
  });

  it("should return empty breakdown for company with no logs", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 60_000 * 60);

    const breakdown = await getCascadeBreakdown("nonexistent-company", periodStart, now);
    expect(breakdown).toEqual([]);
  });

  it("should handle zero-cost AI calls (free models)", async () => {
    await cleanTestData();
    const now = new Date();
    const periodStart = new Date(now.getTime() - 60_000 * 60);

    // 10 requests, all resolved by AI with $0 cost (free model)
    for (let i = 0; i < 10; i++) {
      await db.aIRequestLog.create({
        data: {
          companySlug: TEST_SLUG,
          requestType: "other",
          resolvedBy: "ai",
          costUsd: 0,
          latencyMs: 200,
          provider: "z-ai/z-ai-glm",
          createdAt: new Date(periodStart.getTime() + i * 1000),
        },
      });
    }

    const report = await calculateSavedCost(TEST_SLUG, periodStart, now);
    expect(report.totalRequests).toBe(10);
    expect(report.actualCostUsd).toBe(0);
    expect(report.hypotheticalAiOnlyCostUsd).toBe(0);
    expect(report.savedUsd).toBe(0);
  });
});

describe("AI Fabric Provider Optimizer — Phase 3", () => {
  it("should return default routing when no config exists", async () => {
    const routing = await getProviderRouting("ocr");
    expect(routing.taskType).toBe("ocr");
    expect(routing.primaryProvider).toBe("smart-router:invoice-extraction");
    expect(routing.fallbackProvider).toBe("legacy:z-ai-glm");
    expect(routing.usedFallback).toBe(false);
  });

  it("should route all 5 task types", async () => {
    const types = ["ocr", "whatsapp", "financial_analysis", "matching", "other"] as const;

    for (const type of types) {
      const routing = await getProviderRouting(type);
      expect(routing.taskType).toBe(type);
      expect(routing.primaryProvider).toBeDefined();
      expect(routing.fallbackProvider).toBeDefined();
    }
  });

  it("should seed provider configs without error", async () => {
    await seedProviderConfigs();

    const types = ["ocr", "whatsapp", "financial_analysis", "matching", "other"];
    for (const type of types) {
      const config = await db.providerConfig.findUnique({ where: { taskType: type } });
      expect(config).not.toBeNull();
      expect(config!.primaryProvider).toBeDefined();
      expect(config!.fallbackProvider).toBeDefined();
    }
  });
});

describe("AI Fabric Types — Utilities", () => {
  it("fabricHash should produce consistent 16-char hex output", () => {
    const h1 = fabricHash("hello world");
    const h2 = fabricHash("hello world");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
    expect(/^[0-9a-f]+$/.test(h1)).toBe(true);
  });

  it("fabricHash should produce different outputs for different inputs", () => {
    const h1 = fabricHash("input-a");
    const h2 = fabricHash("input-b");
    expect(h1).not.toBe(h2);
  });
});