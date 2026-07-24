// @ts-nocheck
/**
 * gateway-cascade.test.ts — Comprehensive tests for the AI Fabric 5-stage cascade gateway.
 *
 * All Prisma DB calls are mocked. Uses Bun test (it/describe/expect) with jest mocks.
 */

import { describe, it, expect, beforeEach, jest } from "bun:test";

// ─── Shared mock references (for module-level mocks that need per-test control) ───

const mockLookupGlobalPattern = jest.fn().mockResolvedValue(null);

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockDb = {
  companyRuntime: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  aIRequestLog: { create: jest.fn(), findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
  cacheEntry: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn() },
  budgetConfig: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  providerConfig: { findFirst: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
  ruleCandidate: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  aIMemoryEntry: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  profitSnapshot: { create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  globalPattern: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
  company: { findMany: jest.fn(), findUnique: jest.fn() },
  notification: { create: jest.fn(), findMany: jest.fn() },
  aiScoreSnapshot: { upsert: jest.fn(), findMany: jest.fn() },
  compiledRule: { create: jest.fn() },
  jobQueue: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  platformSettings: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  featureFlag: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  inventoryItem: { findUnique: jest.fn(), findMany: jest.fn() },
  productCatalog: { findUnique: jest.fn(), findMany: jest.fn() },
  client: { findMany: jest.fn() },
};

jest.mock("@/lib/db", () => ({ db: mockDb }));
jest.mock("@/lib/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

// Shared mock store instance for invoice-brain patternStore
const mockPatternStoreGet = jest.fn().mockResolvedValue(null);

jest.mock("@/lib/invoice-brain/fingerprint", () => ({
  fingerprintText: jest.fn().mockReturnValue("fp-hash-123"),
}));
jest.mock("@/lib/invoice-brain/patternStore", () => ({
  PrismaPatternStore: jest.fn().mockImplementation(() => ({
    get: (...args: unknown[]) => mockPatternStoreGet(...args),
  })),
}));
jest.mock("@/lib/invoice-brain/patternParser", () => ({
  extractWithTemplate: jest.fn(),
}));
jest.mock("@/lib/invoice-brain/schema", () => ({
  InvoiceSchema: { safeParse: jest.fn().mockReturnValue({ success: true, data: { invoice: "parsed" } }) },
}));

// Mock cross-company-intelligence (used by patternStage)
jest.mock("@/lib/ai-fabric/cross-company-intelligence", () => ({
  lookupGlobalPattern: (...args: unknown[]) => mockLookupGlobalPattern(...args),
}));

// Mock budget-engine
const mockCheckBudgetGate = jest.fn().mockResolvedValue(true);
const mockGetBudgetStatus = jest.fn().mockResolvedValue(null);

jest.mock("@/lib/ai-fabric/budget-engine", () => ({
  checkBudgetGate: (...args: unknown[]) => mockCheckBudgetGate(...args),
  getBudgetStatus: (...args: unknown[]) => mockGetBudgetStatus(...args),
}));

// Now import the modules under test (after mocks are set up)
import { executeCascade, storeAIMemory, cacheStore } from "@/lib/ai-fabric/gateway";
import { fabricHash } from "@/lib/ai-fabric/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides?: Record<string, unknown>) {
  return {
    companySlug: "test-co",
    requestType: "other" as const,
    normalizedInput: "normalized-test-input",
    ...overrides,
  };
}

const defaultAiFn = jest.fn().mockResolvedValue({
  data: { answer: "ai-answer" },
  provider: "test/model",
  tokensUsed: 100,
  costUsd: 0.001,
});

/** Reset all mocks to clean state and set defaults for a typical "miss all stages" scenario. */
function resetToMissAll() {
  jest.clearAllMocks();
  // Re-set the default return values that bun:clearAllMocks wipes
  mockDb.cacheEntry.findUnique.mockResolvedValue(null);
  mockDb.ruleCandidate.findMany.mockResolvedValue([]);
  mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
  mockLookupGlobalPattern.mockResolvedValue(null);
  mockPatternStoreGet.mockResolvedValue(null);
  mockCheckBudgetGate.mockResolvedValue(true);
  mockGetBudgetStatus.mockResolvedValue(null);
  defaultAiFn.mockResolvedValue({
    data: { answer: "ai-answer" },
    provider: "test/model",
    tokensUsed: 100,
    costUsd: 0.001,
  });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Gateway Cascade — cacheStage", () => {
  beforeEach(() => { resetToMissAll(); });

  it("should hit cache with valid entry", async () => {
    const cacheData = { result: "cached-value" };
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "somekey",
      value: JSON.stringify(cacheData),
      expiresAt: new Date(Date.now() + 3600_000),
      hitCount: 5,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 6 });

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("cache");
    expect(result.data).toEqual(cacheData);
    expect(result.cacheHitCount).toBe(6);
  });

  it("should miss cache when entry does not exist", async () => {
    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
  });

  it("should miss cache and clean up expired entry", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "somekey",
      value: JSON.stringify({ data: 1 }),
      expiresAt: new Date(Date.now() - 1000),
      hitCount: 0,
    });
    mockDb.cacheEntry.delete.mockResolvedValue({});

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
    expect(mockDb.cacheEntry.delete).toHaveBeenCalledWith({ where: { key: expect.any(String) } });
  });

  it("should miss cache and clean up corrupted JSON entry", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "somekey",
      value: "not-valid-json{{{",
      expiresAt: new Date(Date.now() + 3600_000),
      hitCount: 3,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 4 });
    mockDb.cacheEntry.delete.mockResolvedValue({});

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
    expect(mockDb.cacheEntry.delete).toHaveBeenCalled();
  });

  it("should increment hitCount on cache hit", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k",
      value: JSON.stringify({ x: 1 }),
      expiresAt: new Date(Date.now() + 60_000),
      hitCount: 42,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 43 });

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.cacheHitCount).toBe(43);
    expect(mockDb.cacheEntry.update).toHaveBeenCalledWith({
      where: { key: expect.any(String) },
      data: { hitCount: { increment: 1 } },
    });
  });

  it("should use fabricHash for cache key", async () => {
    const slug = "hash-test-co";
    const input = "hash-test-input";
    await executeCascade(makeReq({ companySlug: slug, normalizedInput: input }), { aiFn: defaultAiFn });
    const expectedKey = fabricHash(`${slug}:${input}`);
    expect(mockDb.cacheEntry.findUnique).toHaveBeenCalledWith({ where: { key: expectedKey } });
  });
});

describe("Gateway Cascade — patternStage", () => {
  beforeEach(() => { resetToMissAll(); });

  it("should hit OCR pattern with fingerprint match", async () => {
    const mockTemplate = { headers: ["invoice"] };
    mockPatternStoreGet.mockResolvedValue(mockTemplate);

    const { extractWithTemplate } = await import("@/lib/invoice-brain/patternParser");
    (extractWithTemplate as any).mockReturnValue({ total: 100 });

    const { InvoiceSchema } = await import("@/lib/invoice-brain/schema");
    (InvoiceSchema.safeParse as any).mockReturnValue({ success: true, data: { total: 100 } });

    const result = await executeCascade(
      makeReq({ requestType: "ocr", context: { text: "some invoice text" } }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("pattern");
    expect(result.data).toEqual({ total: 100 });
  });

  it("should miss OCR pattern when no template found", async () => {
    mockPatternStoreGet.mockResolvedValue(null);

    const result = await executeCascade(
      makeReq({ requestType: "ocr", context: { text: "invoice text" } }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });

  it("should skip OCR pattern for non-OCR requestType", async () => {
    const result = await executeCascade(
      makeReq({ requestType: "whatsapp" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });

  it("should handle pattern engine error non-fatally", async () => {
    const { fingerprintText } = await import("@/lib/invoice-brain/fingerprint");
    (fingerprintText as any).mockImplementation(() => { throw new Error("fp error"); });

    const result = await executeCascade(
      makeReq({ requestType: "ocr", context: { text: "invoice" } }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });

  it("should attempt cross-company pattern lookup after OCR miss", async () => {
    mockPatternStoreGet.mockResolvedValue(null);
    mockLookupGlobalPattern.mockResolvedValue(null);

    await executeCascade(
      makeReq({ requestType: "ocr", context: { text: "invoice" } }),
      { aiFn: defaultAiFn },
    );
    expect(mockLookupGlobalPattern).toHaveBeenCalled();
  });

  it("should hit cross-company global pattern", async () => {
    mockLookupGlobalPattern.mockResolvedValue({
      patternKey: "apple-iphone",
      suggestedSku: "SKU-001",
      suggestedVatCategory: "standard",
      suggestedCategory: "electronics",
      contributingCompaniesCount: 5,
      confidence: 0.95,
    });

    const result = await executeCascade(
      makeReq({ requestType: "matching" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("pattern");
    expect(result.data).toBeDefined();
  });

  it("should handle cross-company lookup error non-fatally", async () => {
    mockLookupGlobalPattern.mockRejectedValue(new Error("db error"));

    const result = await executeCascade(
      makeReq({ requestType: "matching" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });
});

describe("Gateway Cascade — ruleStage", () => {
  beforeEach(() => { resetToMissAll(); });

  it("should hit promoted rule match", async () => {
    const input = "rule-input-123";
    const inputHash = fabricHash(input);
    const ruleOutput = { classification: "electronics" };

    mockDb.ruleCandidate.findMany.mockResolvedValue([
      {
        id: 1, companySlug: "test-co", requestType: "matching",
        patternSignature: inputHash, consistentOutput: JSON.stringify(ruleOutput),
        status: "promoted", sampleCount: 25, confidence: 0.98,
      },
    ]);

    const result = await executeCascade(
      makeReq({ requestType: "matching", normalizedInput: input }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("rule");
    expect(result.data).toEqual(ruleOutput);
  });

  it("should miss when no promoted rules exist", async () => {
    const result = await executeCascade(
      makeReq({ requestType: "matching" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });

  it("should match rule with correct pattern signature", async () => {
    const input = "exact-match-input";
    const inputHash = fabricHash(input);

    mockDb.ruleCandidate.findMany.mockResolvedValue([
      {
        id: 2, companySlug: "test-co", requestType: "ocr",
        patternSignature: "wrong-hash", consistentOutput: JSON.stringify({ wrong: true }),
        status: "promoted", sampleCount: 30, confidence: 1.0,
      },
      {
        id: 3, companySlug: "test-co", requestType: "ocr",
        patternSignature: inputHash, consistentOutput: JSON.stringify({ correct: true }),
        status: "promoted", sampleCount: 30, confidence: 1.0,
      },
    ]);

    const result = await executeCascade(
      makeReq({ requestType: "ocr", normalizedInput: input }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("rule");
    expect(result.data).toEqual({ correct: true });
  });

  it("should skip rule with malformed JSON in consistentOutput", async () => {
    const input = "malformed-rule-input";
    const inputHash = fabricHash(input);

    mockDb.ruleCandidate.findMany.mockResolvedValue([
      {
        id: 4, companySlug: "test-co", requestType: "ocr",
        patternSignature: inputHash, consistentOutput: "not-json{{{",
        status: "promoted", sampleCount: 20, confidence: 0.95,
      },
    ]);

    const result = await executeCascade(
      makeReq({ requestType: "ocr", normalizedInput: input }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });

  it("should filter rules by requestType", async () => {
    await executeCascade(
      makeReq({ requestType: "whatsapp", normalizedInput: "type-filter-input" }),
      { aiFn: defaultAiFn },
    );
    expect(mockDb.ruleCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requestType: "whatsapp" }),
      }),
    );
  });

  it("should skip rule without consistentOutput (null)", async () => {
    const input = "no-output-input";
    const inputHash = fabricHash(input);

    mockDb.ruleCandidate.findMany.mockResolvedValue([
      {
        id: 6, companySlug: "test-co", requestType: "other",
        patternSignature: inputHash, consistentOutput: null,
        status: "promoted", sampleCount: 20, confidence: 0.95,
      },
    ]);

    const result = await executeCascade(
      makeReq({ requestType: "other", normalizedInput: input }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });

  it("should handle ruleStage DB error non-fatally", async () => {
    mockDb.ruleCandidate.findMany.mockRejectedValue(new Error("DB connection error"));

    const result = await executeCascade(
      makeReq({ requestType: "matching" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });

  it("should match rule only when status is promoted", async () => {
    await executeCascade(
      makeReq({ requestType: "matching", normalizedInput: "status-check-input" }),
      { aiFn: defaultAiFn },
    );
    expect(mockDb.ruleCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "promoted" }),
      }),
    );
  });
});

describe("Gateway Cascade — memoryStage", () => {
  beforeEach(() => { resetToMissAll(); });

  it("should hit memory with exact hash match", async () => {
    const input = "memory-hit-input";
    const inputHash = fabricHash(input);

    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-1", companySlug: "test-co", category: "decision",
        content: JSON.stringify({ inputHash, result: { action: "approve" } }),
        lastAccessedAt: new Date(),
      },
    ]);
    mockDb.aIMemoryEntry.update.mockResolvedValue({});

    const result = await executeCascade(
      makeReq({ requestType: "financial_analysis", normalizedInput: input }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("memory");
    expect(result.data).toEqual({ action: "approve" });
  });

  it("should miss when no matching memories found", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-2", companySlug: "test-co", category: "decision",
        content: JSON.stringify({ inputHash: "different-hash", result: { x: 1 } }),
        lastAccessedAt: new Date(),
      },
    ]);

    const result = await executeCascade(
      makeReq({ requestType: "other" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });

  it("should skip corrupted JSON entries", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-3", companySlug: "test-co", category: "decision",
        content: "broken-json{{{", lastAccessedAt: new Date(),
      },
      {
        id: "mem-4", companySlug: "test-co", category: "decision",
        content: JSON.stringify({ inputHash: fabricHash("mem-4-input"), result: { ok: true } }),
        lastAccessedAt: new Date(),
      },
    ]);
    mockDb.aIMemoryEntry.update.mockResolvedValue({});

    const result = await executeCascade(
      makeReq({ requestType: "other", normalizedInput: "mem-4-input" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("memory");
  });

  it("should map ocr requestType to invoice category", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(makeReq({ requestType: "ocr" }), { aiFn: defaultAiFn });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "invoice" }) }),
    );
  });

  it("should map whatsapp requestType to customer category", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(makeReq({ requestType: "whatsapp" }), { aiFn: defaultAiFn });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "customer" }) }),
    );
  });

  it("should map financial_analysis requestType to decision category", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(makeReq({ requestType: "financial_analysis" }), { aiFn: defaultAiFn });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "decision" }) }),
    );
  });

  it("should map matching requestType to product category", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(makeReq({ requestType: "matching" }), { aiFn: defaultAiFn });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "product" }) }),
    );
  });

  it("should map other requestType to decision category", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(makeReq({ requestType: "other" }), { aiFn: defaultAiFn });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "decision" }) }),
    );
  });

  it("should update lastAccessedAt on memory hit", async () => {
    const input = "update-access-input";
    const inputHash = fabricHash(input);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-5", companySlug: "test-co", category: "decision",
        content: JSON.stringify({ inputHash, result: { yes: true } }),
        lastAccessedAt: new Date(),
      },
    ]);
    mockDb.aIMemoryEntry.update.mockResolvedValue({});

    await executeCascade(
      makeReq({ requestType: "other", normalizedInput: input }),
      { aiFn: defaultAiFn },
    );
    expect(mockDb.aIMemoryEntry.update).toHaveBeenCalledWith({
      where: { id: "mem-5" },
      data: { lastAccessedAt: expect.any(Date) },
    });
  });

  it("should limit memory search to 10 entries", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it("should handle memoryStage DB error non-fatally", async () => {
    mockDb.aIMemoryEntry.findMany.mockRejectedValue(new Error("DB error"));
    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
  });
});

describe("Gateway Cascade — aiStage", () => {
  beforeEach(() => { resetToMissAll(); });

  it("should call AI function and return result", async () => {
    const aiFn = jest.fn().mockResolvedValue({
      data: { extracted: true },
      provider: "openrouter/deepseek-chat",
      tokensUsed: 500,
      costUsd: 0.003,
    });

    const result = await executeCascade(makeReq(), { aiFn });
    expect(result.resolvedBy).toBe("ai");
    expect(result.data).toEqual({ extracted: true });
    expect(result.provider).toBe("openrouter/deepseek-chat");
    expect(result.tokensUsed).toBe(500);
    expect(result.costUsd).toBe(0.003);
  });

  it("should handle AI failure gracefully (returns null data)", async () => {
    const aiFn = jest.fn().mockRejectedValue(new Error("Model unavailable"));

    const result = await executeCascade(makeReq(), { aiFn });
    expect(result.data).toBeNull();
    expect(result.resolvedBy).toBe("ai");
  });

  it("should pass the correct request object to aiFn", async () => {
    const req = makeReq({ requestType: "ocr", normalizedInput: "fn-test-input" });
    const aiFn = jest.fn().mockResolvedValue({ data: null, provider: "p" });

    await executeCascade(req, { aiFn });
    expect(aiFn).toHaveBeenCalledWith(
      expect.objectContaining({
        companySlug: "test-co",
        requestType: "ocr",
        normalizedInput: "fn-test-input",
      }),
    );
  });

  it("should include latencyMs in result", async () => {
    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.latencyMs).toBe("number");
  });
});

describe("Gateway Cascade — executeCascade full flow", () => {
  beforeEach(() => { resetToMissAll(); });

  it("cache hit → resolvedBy='cache'", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify({ from: "cache" }),
      expiresAt: new Date(Date.now() + 60_000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("cache");
    expect(result.data).toEqual({ from: "cache" });
  });

  it("pattern hit → resolvedBy='pattern'", async () => {
    mockLookupGlobalPattern.mockResolvedValue({
      patternKey: "test-product", suggestedSku: "SKU-X",
      suggestedVatCategory: "standard", suggestedCategory: "general",
      contributingCompaniesCount: 3, confidence: 0.92,
    });

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("pattern");
    expect(result.data).toBeDefined();
  });

  it("rule hit → resolvedBy='rule'", async () => {
    const inputHash = fabricHash("rule-flow-input");
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      {
        id: 10, companySlug: "test-co", requestType: "other",
        patternSignature: inputHash, consistentOutput: JSON.stringify({ ruled: true }),
        status: "promoted", sampleCount: 25, confidence: 0.97,
      },
    ]);

    const result = await executeCascade(
      makeReq({ normalizedInput: "rule-flow-input" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("rule");
    expect(result.data).toEqual({ ruled: true });
  });

  it("memory hit → resolvedBy='memory'", async () => {
    const input = "memory-flow-input";
    const inputHash = fabricHash(input);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-flow", companySlug: "test-co", category: "decision",
        content: JSON.stringify({ inputHash, result: { from: "memory" } }),
        lastAccessedAt: new Date(),
      },
    ]);
    mockDb.aIMemoryEntry.update.mockResolvedValue({});

    const result = await executeCascade(
      makeReq({ normalizedInput: input }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("memory");
    expect(result.data).toEqual({ from: "memory" });
  });

  it("full cascade to AI → resolvedBy='ai'", async () => {
    const aiFn = jest.fn().mockResolvedValue({
      data: { from: "ai" }, provider: "test/model", tokensUsed: 200, costUsd: 0.002,
    });

    const result = await executeCascade(makeReq(), { aiFn });
    expect(result.resolvedBy).toBe("ai");
    expect(result.data).toEqual({ from: "ai" });
  });

  it("should store non-cache results in cache", async () => {
    mockDb.cacheEntry.upsert.mockResolvedValue({});

    const aiFn = jest.fn().mockResolvedValue({
      data: { cacheThis: true }, provider: "t/m",
    });

    await executeCascade(makeReq(), { aiFn });
    expect(mockDb.cacheEntry.upsert).toHaveBeenCalled();
  });

  it("should NOT store cache results back in cache", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify({ cached: true }),
      expiresAt: new Date(Date.now() + 60_000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });

    await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(mockDb.cacheEntry.upsert).not.toHaveBeenCalled();
  });

  it("should NOT store null results in cache", async () => {
    const aiFn = jest.fn().mockResolvedValue({ data: null, provider: "t/m" });

    await executeCascade(makeReq(), { aiFn });
    expect(mockDb.cacheEntry.upsert).not.toHaveBeenCalled();
  });
});

describe("Gateway Cascade — budget gate integration", () => {
  beforeEach(() => { resetToMissAll(); });

  it("allowed request passes through to AI", async () => {
    const aiFn = jest.fn().mockResolvedValue({
      data: { passed: true }, provider: "t/m",
    });

    const result = await executeCascade(makeReq(), { aiFn });
    expect(result.resolvedBy).toBe("ai");
    expect(result.budgetBlocked).toBeFalsy();
  });

  it("blocked request returns early with budgetBlocked=true", async () => {
    mockCheckBudgetGate.mockResolvedValue(false);
    mockGetBudgetStatus.mockResolvedValue({
      companySlug: "test-co", monthlyBudgetUsd: 100, currentSpendUsd: 105,
      spendPct: 105, alertTriggered: true, hardStopActive: true, forecastMonthlySpendUsd: 150,
    });
    mockDb.aIRequestLog.create.mockResolvedValue({});

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.budgetBlocked).toBe(true);
    expect(result.data).toBeNull();
    expect(result.budgetReason).toBe("hard_stop");
  });

  it("blocked request with budget exceeded (no hard stop)", async () => {
    mockCheckBudgetGate.mockResolvedValue(false);
    mockGetBudgetStatus.mockResolvedValue({
      companySlug: "test-co", monthlyBudgetUsd: 100, currentSpendUsd: 105,
      spendPct: 105, alertTriggered: true, hardStopActive: false, forecastMonthlySpendUsd: 150,
    });

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.budgetBlocked).toBe(true);
    expect(result.budgetReason).toBe("budget_exceeded");
  });

  it("budget gate check failure is non-fatal", async () => {
    mockCheckBudgetGate.mockRejectedValue(new Error("budget db error"));

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
    expect(result.budgetBlocked).toBeFalsy();
  });

  it("budget gate is not checked when earlier stage resolves", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify({ data: 1 }),
      expiresAt: new Date(Date.now() + 60_000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });

    await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(mockCheckBudgetGate).not.toHaveBeenCalled();
  });
});

describe("Gateway Cascade — logRequest", () => {
  beforeEach(() => { resetToMissAll(); });

  it("logs to AIRequestLog on every request", async () => {
    mockDb.aIRequestLog.create.mockResolvedValue({});

    await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(mockDb.aIRequestLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companySlug: "test-co",
          resolvedBy: "ai",
        }),
      }),
    );
  });

  it("logs resolvedBy=cache for cache hits", async () => {
    mockDb.aIRequestLog.create.mockResolvedValue({});
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify({ d: 1 }),
      expiresAt: new Date(Date.now() + 60_000), hitCount: 0,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 1 });

    await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(mockDb.aIRequestLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolvedBy: "cache" }),
      }),
    );
  });

  it("handles logging failure non-fatally", async () => {
    mockDb.aIRequestLog.create.mockRejectedValue(new Error("log DB down"));

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
    expect(result.data).toBeDefined();
  });

  it("logs latencyMs in the request log", async () => {
    mockDb.aIRequestLog.create.mockResolvedValue({});

    await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(mockDb.aIRequestLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ latencyMs: expect.any(Number) }),
      }),
    );
  });

  it("logs provider and tokens for AI-resolved requests", async () => {
    mockDb.aIRequestLog.create.mockResolvedValue({});

    const aiFn = jest.fn().mockResolvedValue({
      data: { x: 1 }, provider: "deepseek/v3", tokensUsed: 999, costUsd: 0.005,
    });

    await executeCascade(makeReq(), { aiFn });
    expect(mockDb.aIRequestLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "deepseek/v3",
          tokensUsed: 999,
          costUsd: 0.005,
        }),
      }),
    );
  });
});

describe("Gateway Cascade — cacheStore", () => {
  beforeEach(() => { resetToMissAll(); });

  it("upserts cache entry with correct key and value", async () => {
    mockDb.cacheEntry.upsert.mockResolvedValue({});
    await cacheStore("my-co", "my-input", { result: "yes" });
    expect(mockDb.cacheEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: fabricHash("my-co:my-input"),
          companySlug: "my-co",
          value: JSON.stringify({ result: "yes" }),
        }),
      }),
    );
  });

  it("respects custom TTL in expiresAt", async () => {
    mockDb.cacheEntry.upsert.mockResolvedValue({});
    const ttlMs = 7200_000; // 2 hours
    await cacheStore("co", "input", { x: 1 }, ttlMs);
    const call = mockDb.cacheEntry.upsert.mock.calls[0][0];
    const expiresAt = call.create.expiresAt as Date;
    const expectedMin = Date.now() + ttlMs - 1000;
    const expectedMax = Date.now() + ttlMs + 1000;
    expect(expiresAt.getTime()).toBeGreaterThan(expectedMin);
    expect(expiresAt.getTime()).toBeLessThan(expectedMax);
  });

  it("uses default 1 hour TTL when not specified", async () => {
    mockDb.cacheEntry.upsert.mockResolvedValue({});
    await cacheStore("co", "input", { x: 1 });
    const call = mockDb.cacheEntry.upsert.mock.calls[0][0];
    const expiresAt = call.create.expiresAt as Date;
    const expectedMin = Date.now() + 3600_000 - 1000;
    const expectedMax = Date.now() + 3600_000 + 1000;
    expect(expiresAt.getTime()).toBeGreaterThan(expectedMin);
    expect(expiresAt.getTime()).toBeLessThan(expectedMax);
  });

  it("serializes complex data to JSON for value", async () => {
    mockDb.cacheEntry.upsert.mockResolvedValue({});
    const complexData = { nested: { array: [1, 2, 3], bool: true, nil: null } };
    await cacheStore("co", "in", complexData);
    expect(mockDb.cacheEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ value: JSON.stringify(complexData) }),
      }),
    );
  });
});

describe("Gateway Cascade — skipStages and cacheTtlMs", () => {
  beforeEach(() => { resetToMissAll(); });

  it("should skip cache when skipStages includes 'cache'", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify({ cached: true }),
      expiresAt: new Date(Date.now() + 60_000), hitCount: 5,
    });

    const result = await executeCascade(makeReq(), {
      aiFn: defaultAiFn,
      skipStages: ["cache"],
    });
    expect(result.resolvedBy).toBe("ai");
  });

  it("should skip pattern when skipStages includes 'pattern'", async () => {
    mockLookupGlobalPattern.mockResolvedValue({ hit: true } as any);

    const result = await executeCascade(makeReq(), {
      aiFn: defaultAiFn,
      skipStages: ["pattern"],
    });
    expect(result.resolvedBy).toBe("ai");
  });

  it("should skip multiple stages", async () => {
    const result = await executeCascade(makeReq(), {
      aiFn: defaultAiFn,
      skipStages: ["cache", "pattern", "rule", "memory"],
    });
    expect(result.resolvedBy).toBe("ai");
  });

  it("cacheTtlMs=0 disables caching of results", async () => {
    mockDb.cacheEntry.upsert.mockResolvedValue({});

    await executeCascade(makeReq(), { aiFn: defaultAiFn, cacheTtlMs: 0 });
    expect(mockDb.cacheEntry.upsert).not.toHaveBeenCalled();
  });

  it("cacheTtlMs=0 with skipStages empty still runs all stages", async () => {
    const result = await executeCascade(makeReq(), {
      aiFn: defaultAiFn,
      cacheTtlMs: 0,
    });
    expect(result.resolvedBy).toBe("ai");
    expect(mockDb.cacheEntry.findUnique).toHaveBeenCalled();
  });
});

describe("Gateway Cascade — storeAIMemory", () => {
  beforeEach(() => { resetToMissAll(); });

  it("creates AIMemoryEntry with correct structure", async () => {
    mockDb.aIMemoryEntry.create.mockResolvedValue({});
    await storeAIMemory({
      companySlug: "mem-co", category: "invoice", inputHash: "hash-abc", result: { total: 500 },
    });
    expect(mockDb.aIMemoryEntry.create).toHaveBeenCalledWith({
      data: {
        companySlug: "mem-co",
        category: "invoice",
        content: JSON.stringify({ inputHash: "hash-abc", result: { total: 500 } }),
      },
    });
  });

  it("serializes result to JSON in content field", async () => {
    mockDb.aIMemoryEntry.create.mockResolvedValue({});
    const result = { items: [{ name: "Widget" }], tax: 50 };
    await storeAIMemory({ companySlug: "co", category: "decision", inputHash: "h", result });
    const call = mockDb.aIMemoryEntry.create.mock.calls[0][0];
    const parsed = JSON.parse(call.data.content);
    expect(parsed.result).toEqual(result);
    expect(parsed.inputHash).toBe("h");
  });
});

describe("Gateway Cascade — edge cases", () => {
  beforeEach(() => { resetToMissAll(); });

  it("should handle empty normalizedInput", async () => {
    const result = await executeCascade(makeReq({ normalizedInput: "" }), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
  });

  it("should handle very long normalizedInput", async () => {
    const longInput = "a".repeat(10000);
    const result = await executeCascade(makeReq({ normalizedInput: longInput }), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
  });

  it("should return latencyMs >= 0", async () => {
    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("should not include provider/tokens/cost for non-AI resolution", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify({ d: 1 }),
      expiresAt: new Date(Date.now() + 60_000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.provider).toBeUndefined();
    expect(result.tokensUsed).toBeUndefined();
    expect(result.costUsd).toBeUndefined();
  });

  it("fabricHash produces consistent 16-char hex", () => {
    const h = fabricHash("consistent-test");
    expect(h).toHaveLength(16);
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
    expect(fabricHash("consistent-test")).toBe(h);
  });

  it("fabricHash differs for different inputs", () => {
    expect(fabricHash("a")).not.toBe(fabricHash("b"));
  });
});

describe("Gateway Cascade — additional cacheStage edge cases", () => {
  beforeEach(() => { resetToMissAll(); });

  it("cache hit with boundary expiry time (exactly now)", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify({ d: 1 }),
      expiresAt: new Date(Date.now() - 1), // just expired (1ms ago)
      hitCount: 0,
    });
    mockDb.cacheEntry.delete.mockResolvedValue({});

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    // expiresAt < new Date() → expired → miss
    expect(result.resolvedBy).toBe("ai");
  });

  it("cache hit returns data field as-is after parse", async () => {
    const nested = { a: { b: { c: [1, 2, 3] } }, d: true, e: null, f: 0 };
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify(nested),
      expiresAt: new Date(Date.now() + 60_000), hitCount: 0,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 1 });

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.data).toEqual(nested);
  });

  it("cache entry with null JSON value falls through to AI", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: "null",
      expiresAt: new Date(Date.now() + 60_000), hitCount: 0,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 1 });

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    // JSON.parse("null") returns null, which the cascade treats as "no data"
    // and falls through to AI
    expect(result.resolvedBy).toBe("ai");
  });
});

describe("Gateway Cascade — additional patternStage tests", () => {
  beforeEach(() => { resetToMissAll(); });

  it("OCR with schema parse failure falls through", async () => {
    mockPatternStoreGet.mockResolvedValue({ headers: [] });
    const { extractWithTemplate } = await import("@/lib/invoice-brain/patternParser");
    (extractWithTemplate as any).mockReturnValue({ total: 100 });

    const { InvoiceSchema } = await import("@/lib/invoice-brain/schema");
    (InvoiceSchema.safeParse as any).mockReturnValue({ success: false, error: "bad data" });

    const result = await executeCascade(
      makeReq({ requestType: "ocr", context: { text: "invoice" } }),
      { aiFn: defaultAiFn },
    );
    // Schema parse fails → pattern miss → goes to AI
    expect(result.resolvedBy).toBe("ai");
  });

  it("OCR with extractWithTemplate returning null falls through", async () => {
    mockPatternStoreGet.mockResolvedValue({ headers: [] });
    const { extractWithTemplate } = await import("@/lib/invoice-brain/patternParser");
    (extractWithTemplate as any).mockReturnValue(null);

    const result = await executeCascade(
      makeReq({ requestType: "ocr", context: { text: "invoice" } }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });
});

describe("Gateway Cascade — additional ruleStage tests", () => {
  beforeEach(() => { resetToMissAll(); });

  it("skips rule with no consistentOutput field at all", async () => {
    const inputHash = fabricHash("no-field-input");
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      {
        id: 7, companySlug: "test-co", requestType: "other",
        patternSignature: inputHash,
        // no consistentOutput field
        status: "promoted", sampleCount: 20, confidence: 0.95,
      },
    ]);

    const result = await executeCascade(
      makeReq({ requestType: "other", normalizedInput: "no-field-input" }),
      { aiFn: defaultAiFn },
    );
    expect(result.resolvedBy).toBe("ai");
  });
});

describe("Gateway Cascade — additional memoryStage tests", () => {
  beforeEach(() => { resetToMissAll(); });

  it("handles empty memories array", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    expect(result.resolvedBy).toBe("ai");
  });

  it("handles memory with missing inputHash field", async () => {
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      {
        id: "mem-x", companySlug: "test-co", category: "decision",
        content: JSON.stringify({ result: { action: "done" } }),
        lastAccessedAt: new Date(),
      },
    ]);

    const result = await executeCascade(makeReq(), { aiFn: defaultAiFn });
    // No inputHash → no match → falls to AI
    expect(result.resolvedBy).toBe("ai");
  });
});

describe("Gateway Cascade — additional executeCascade flow tests", () => {
  beforeEach(() => { resetToMissAll(); });

  it("cache hit with custom cacheTtlMs stores nothing", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key: "k", value: JSON.stringify({ d: 1 }),
      expiresAt: new Date(Date.now() + 60_000), hitCount: 0,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 1 });

    await executeCascade(makeReq(), { aiFn: defaultAiFn, cacheTtlMs: 5000 });
    // Cache hit → no store
    expect(mockDb.cacheEntry.upsert).not.toHaveBeenCalled();
  });

  it("AI result stored with custom TTL", async () => {
    mockDb.cacheEntry.upsert.mockResolvedValue({});
    await executeCascade(makeReq(), { aiFn: defaultAiFn, cacheTtlMs: 1800_000 });

    expect(mockDb.cacheEntry.upsert).toHaveBeenCalled();
    const call = mockDb.cacheEntry.upsert.mock.calls[0][0];
    const expiresAt = call.create.expiresAt as Date;
    const expectedMin = Date.now() + 1800_000 - 1000;
    expect(expiresAt.getTime()).toBeGreaterThan(expectedMin);
  });
});
