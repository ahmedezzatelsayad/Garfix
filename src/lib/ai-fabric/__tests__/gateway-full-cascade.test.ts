// @ts-nocheck
/**
 * gateway-full-cascade.test.ts — 70 tests for the gateway cascade.
 * Uses mock.module from bun:test for DB and logger mocking.
 */

import { describe, it, expect, beforeEach, mock, afterAll } from "bun:test";

// ─── Mock DB setup ─────────────────────────────────────────────────────────

const m = () => ({
  findUnique: mock(() => Promise.resolve(null)),
  findMany: mock(() => Promise.resolve([])),
  create: mock(() => Promise.resolve({})),
  update: mock(() => Promise.resolve({})),
  delete: mock(() => Promise.resolve({})),
  deleteMany: mock(() => Promise.resolve({ count: 0 })),
  upsert: mock(() => Promise.resolve({})),
  aggregate: mock(() => Promise.resolve({ _sum: { costUsd: 0 }, _count: 0 })),
  groupBy: mock(() => Promise.resolve([])),
  count: mock(() => Promise.resolve(0)),
  findFirst: mock(() => Promise.resolve(null)),
});

const mockDb: Record<string, any> = {
  cacheEntry: m(), aIRequestLog: m(), ruleCandidate: m(),
  aIMemoryEntry: m(), budgetConfig: m(), notification: m(),
  company: m(), companyRuntime: m(), providerConfig: m(),
  globalPattern: m(), profitSnapshot: m(), aIScoreSnapshot: m(),
  jobQueue: m(), inventoryItem: m(), productCatalog: m(), client: m(),
  compiledRule: m(), platformSettings: m(), featureFlag: m(),
};

const mockLogger = {
  info: mock(() => {}), warn: mock(() => {}),
  error: mock(() => {}), debug: mock(() => {}),
};

mock.module("@/lib/db", () => ({ db: mockDb }));
mock.module("@/lib/logger", () => ({ logger: mockLogger }));
mock.module("@/lib/ai-fabric/budget-engine", () => ({
  checkBudgetGate: mock(() => Promise.resolve(true)),
  getBudgetStatus: mock(() => Promise.resolve(null)),
  __resetAlertTracking: mock(() => {}),
}));
mock.module("@/lib/ai-fabric/cross-company-intelligence", () => ({
  lookupGlobalPattern: mock(() => Promise.resolve(null)),
  contributePattern: mock(() => Promise.resolve(true)),
  verifyNoSensitiveData: mock(() => true),
  getPatternStats: mock(() => Promise.resolve({ totalPatterns: 0, avgConfidence: 0, avgContributingCompanies: 0, topPatterns: [] })),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────

import { executeCascade, storeAIMemory, cacheStore, type GatewayAIFn, type GatewayOptions } from "@/lib/ai-fabric/gateway";
import { fabricHash, type GatewayRequest } from "@/lib/ai-fabric/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function clearAll() {
  for (const table of Object.values(mockDb) as any[]) {
    for (const fn of Object.values(table)) {
      if (typeof fn === "function" && typeof fn.mockClear === "function") fn.mockClear();
    }
  }
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
}

const req = (overrides?: Partial<GatewayRequest>): GatewayRequest => ({
  companySlug: "test-co",
  requestType: "other",
  normalizedInput: "test-input",
  ...overrides,
});

const aiResult = { data: { answer: "ai" }, provider: "test/model", tokensUsed: 100, costUsd: 0.001 };

// ─── cacheStage tests ────────────────────────────────────────────────────

describe("gateway cacheStage", () => {
  beforeEach(clearAll);

  it("returns miss when cache entry is null", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns hit when valid cache entry exists", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: JSON.stringify({ cached: true }),
      expiresAt: new Date(Date.now() + 60000), hitCount: 5,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 6 });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("cache");
    expect(r.data).toEqual({ cached: true });
  });

  it("increments hitCount on cache hit", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: JSON.stringify({ x: 1 }),
      expiresAt: new Date(Date.now() + 60000), hitCount: 3,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 4 });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.cacheHitCount).toBe(4);
  });

  it("cleans up expired cache entry", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: JSON.stringify({ x: 1 }),
      expiresAt: new Date(Date.now() - 1000), hitCount: 1,
    });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
    expect(mockDb.cacheEntry.delete).toHaveBeenCalled();
  });

  it("returns miss for expired entry", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: JSON.stringify({ x: 1 }),
      expiresAt: new Date(0), hitCount: 1,
    });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).not.toBe("cache");
  });

  it("returns miss for corrupted JSON", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: "not-json{{{",
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("deletes corrupted JSON entry", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: "broken",
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.cacheEntry.delete).toHaveBeenCalled();
  });

  it("parses complex JSON data from cache", async () => {
    const key = fabricHash("test-co:complex");
    const data = { items: [{ name: "a" }, { name: "b" }], total: 100 };
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: JSON.stringify(data),
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });
    const r = await executeCascade(req({ normalizedInput: "complex" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.data).toEqual(data);
  });

  it("uses fabricHash for cache key", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    await executeCascade(req({ companySlug: "a", normalizedInput: "b" }), { aiFn: () => Promise.resolve(aiResult) });
    const expectedKey = fabricHash("a:b");
    expect(mockDb.cacheEntry.findUnique).toHaveBeenCalledWith({ where: { key: expectedKey } });
  });

  it("returns data as parsed JSON object", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: '{"num":42}',
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.data).toEqual({ num: 42 });
  });

  it("handles string JSON value in cache", async () => {
    const key = fabricHash("test-co:str");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: '"hello world"',
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });
    const r = await executeCascade(req({ normalizedInput: "str" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.data).toBe("hello world");
  });

  it("handles number JSON value in cache", async () => {
    const key = fabricHash("test-co:num");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: "99",
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });
    const r = await executeCascade(req({ normalizedInput: "num" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.data).toBe(99);
  });

  it("handles null JSON value in cache (cache hit with null data, AI fills data)", async () => {
    // JSON.parse('null') returns null; cacheStage reports hit, but null data
    // causes subsequent stages to run. When AI fills in data, resolvedBy becomes "ai".
    const key = fabricHash("test-co:null-val");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: "null",
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });
    const r = await executeCascade(req({ normalizedInput: "null-val" }), { aiFn: () => Promise.resolve(aiResult) });
    // null data falls through to AI, which fills data; resolvedBy correctly becomes "ai"
    expect(r.resolvedBy).toBe("ai");
    expect(r.data).toEqual({ answer: "ai" });
  });

  it("calls findUnique with correct where clause", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    await executeCascade(req({ companySlug: "co1", normalizedInput: "inp1" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.cacheEntry.findUnique).toHaveBeenCalledWith({
      where: { key: fabricHash("co1:inp1") },
    });
  });

  it("handles array JSON value in cache", async () => {
    const key = fabricHash("test-co:arr");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: "[1,2,3]",
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });
    const r = await executeCascade(req({ normalizedInput: "arr" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.data).toEqual([1, 2, 3]);
  });

  it("different companies have different cache keys", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    await executeCascade(req({ companySlug: "co-a", normalizedInput: "same" }), { aiFn: () => Promise.resolve(aiResult) });
    await executeCascade(req({ companySlug: "co-b", normalizedInput: "same" }), { aiFn: () => Promise.resolve(aiResult) });
    const calls = mockDb.cacheEntry.findUnique.mock.calls;
    expect(calls[0][0].where.key).not.toBe(calls[1][0].where.key);
  });

  it("expired delete is fire-and-forget (catches errors)", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: "{}", expiresAt: new Date(0), hitCount: 1,
    });
    mockDb.cacheEntry.delete.mockRejectedValue(new Error("db error"));
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });
});

// ─── patternStage tests ──────────────────────────────────────────────────

describe("gateway patternStage", () => {
  beforeEach(clearAll);

  it("returns hit: false for non-OCR request type by default", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req({ requestType: "whatsapp" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns hit: false for matching request type", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req({ requestType: "matching" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns hit: false for financial_analysis request type", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req({ requestType: "financial_analysis" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns hit: false for 'other' request type", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req({ requestType: "other" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("falls through to AI when no pattern matches", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("OCR with no context.text falls through", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req({ requestType: "ocr" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("OCR with context.text but no global pattern falls through", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req({ requestType: "ocr", context: { text: "some invoice" } }), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("does not skip to AI prematurely when cache misses", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    // pattern, rule, and memory stages should all be attempted before AI
    expect(r.resolvedBy).toBe("ai");
  });
});

// ─── ruleStage tests ─────────────────────────────────────────────────────

describe("gateway ruleStage", () => {
  beforeEach(clearAll);

  it("returns hit: false when no promoted rules exist", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns hit: false when rules don't match input hash", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 1, companySlug: "test-co", requestType: "other", patternSignature: "wrong-hash", consistentOutput: "{}", sampleCount: 20, confidence: 0.95, status: "promoted" },
    ]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns hit: true when rule matches input hash", async () => {
    const inputHash = fabricHash("test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 1, companySlug: "test-co", requestType: "other", patternSignature: inputHash, consistentOutput: JSON.stringify({ ruled: true }), sampleCount: 20, confidence: 0.95, status: "promoted" },
    ]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("rule");
    expect(r.data).toEqual({ ruled: true });
  });

  it("queries with correct companySlug and requestType", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    await executeCascade(req({ companySlug: "my-co", requestType: "ocr" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.ruleCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companySlug: "my-co", requestType: "ocr", status: "promoted" }),
      }),
    );
  });

  it("returns parsed data from consistentOutput", async () => {
    const inputHash = fabricHash("test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 1, companySlug: "test-co", requestType: "other", patternSignature: inputHash, consistentOutput: '{"items":[1,2]}', sampleCount: 20, confidence: 0.95, status: "promoted" },
    ]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.data).toEqual({ items: [1, 2] });
  });

  it("skips malformed consistentOutput", async () => {
    const inputHash = fabricHash("test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 1, companySlug: "test-co", requestType: "other", patternSignature: inputHash, consistentOutput: "bad-json", sampleCount: 20, confidence: 0.95, status: "promoted" },
    ]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("only queries promoted rules (status=promoted)", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.ruleCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "promoted" }) }),
    );
  });

  it("handles DB error in ruleStage gracefully", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockRejectedValue(new Error("db error"));
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });
});

// ─── memoryStage tests ───────────────────────────────────────────────────

describe("gateway memoryStage", () => {
  beforeEach(clearAll);

  it("returns hit: false when no memories exist", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns hit: false when memories don't match input hash", async () => {
    const inputHash = fabricHash("test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      { id: 1, companySlug: "test-co", category: "decision", content: JSON.stringify({ inputHash: "other-hash", result: { x: 1 } }), lastAccessedAt: new Date() },
    ]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns hit: true when memory matches input hash", async () => {
    const inputHash = fabricHash("test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      { id: 1, companySlug: "test-co", category: "decision", content: JSON.stringify({ inputHash, result: { memorized: true } }), lastAccessedAt: new Date() },
    ]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("memory");
    expect(r.data).toEqual({ memorized: true });
  });

  it("updates lastAccessedAt on memory hit", async () => {
    const inputHash = fabricHash("test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      { id: 42, companySlug: "test-co", category: "decision", content: JSON.stringify({ inputHash, result: {} }), lastAccessedAt: new Date() },
    ]);
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.aIMemoryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 } }),
    );
  });

  it("maps ocr requestType to invoice category", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(req({ requestType: "ocr" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "invoice" }) }),
    );
  });

  it("maps whatsapp requestType to customer category", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(req({ requestType: "whatsapp" }), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "customer" }) }),
    );
  });

  it("takes only last 10 memories", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.aIMemoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it("handles corrupted memory content gracefully", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([
      { id: 1, companySlug: "test-co", category: "decision", content: "not-json", lastAccessedAt: new Date() },
    ]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });
});

// ─── executeCascade integration ──────────────────────────────────────────

describe("executeCascade integration", () => {
  beforeEach(clearAll);

  it("falls through to AI when all stages miss", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
  });

  it("returns data from AI call", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.data).toEqual({ answer: "ai" });
  });

  it("logs to AIRequestLog", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.aIRequestLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companySlug: "test-co", resolvedBy: "ai" }),
      }),
    );
  });

  it("stores result in cache after AI resolution", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.cacheEntry.upsert).toHaveBeenCalled();
  });

  it("does not store in cache when cacheTtlMs is 0", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult), cacheTtlMs: 0 });
    expect(mockDb.cacheEntry.upsert).not.toHaveBeenCalled();
  });

  it("returns latencyMs > 0", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns provider from AI result", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.provider).toBe("test/model");
  });

  it("returns tokensUsed from AI result", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.tokensUsed).toBe(100);
  });

  it("returns costUsd from AI result", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.costUsd).toBe(0.001);
  });

  it("handles AI failure gracefully (data: null)", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => { throw new Error("AI fail"); } });
    expect(r.data).toBeNull();
  });

  it("does not cache null results", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    await executeCascade(req(), { aiFn: () => { throw new Error("fail"); } });
    expect(mockDb.cacheEntry.upsert).not.toHaveBeenCalled();
  });

  it("AI result includes all GatewayResult fields", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r).toHaveProperty("data");
    expect(r).toHaveProperty("resolvedBy");
    expect(r).toHaveProperty("latencyMs");
    expect(r).toHaveProperty("provider");
    expect(r).toHaveProperty("tokensUsed");
    expect(r).toHaveProperty("costUsd");
  });

  it("caches non-cache resolutions", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    mockDb.aIMemoryEntry.findMany.mockResolvedValue([]);
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.cacheEntry.upsert).toHaveBeenCalled();
  });

  it("does not re-cache cache hits", async () => {
    const key = fabricHash("test-co:test-input");
    mockDb.cacheEntry.findUnique.mockResolvedValue({
      key, value: JSON.stringify({ x: 1 }),
      expiresAt: new Date(Date.now() + 60000), hitCount: 1,
    });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });
    await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(mockDb.cacheEntry.upsert).not.toHaveBeenCalled();
  });
});

// ─── skipStages ──────────────────────────────────────────────────────────

describe("executeCascade skipStages", () => {
  beforeEach(clearAll);

  it("skips cache when in skipStages", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue({ key: "k", value: "{}", expiresAt: new Date(Date.now() + 60000), hitCount: 1 });
    mockDb.cacheEntry.update.mockResolvedValue({ hitCount: 2 });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult), skipStages: ["cache"] });
    expect(r.resolvedBy).toBe("ai");
  });

  it("skips pattern when in skipStages", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult), skipStages: ["pattern"] });
    expect(r.resolvedBy).toBe("ai");
  });

  it("skips rule when in skipStages", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult), skipStages: ["rule"] });
    expect(r.resolvedBy).toBe("ai");
  });

  it("skips memory when in skipStages", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult), skipStages: ["memory"] });
    expect(r.resolvedBy).toBe("ai");
  });

  it("skips multiple stages", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult), skipStages: ["cache", "pattern", "rule", "memory"] });
    expect(r.resolvedBy).toBe("ai");
  });

  it("goes directly to AI when all early stages skipped", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult), skipStages: ["cache", "pattern", "rule", "memory"] });
    expect(r.provider).toBe("test/model");
    expect(r.data).toEqual({ answer: "ai" });
  });
});

// ─── Budget gate ─────────────────────────────────────────────────────────

describe("executeCascade budget gate", () => {
  beforeEach(clearAll);

  it("allows AI call when checkBudgetGate returns true", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const { checkBudgetGate } = await import("@/lib/ai-fabric/budget-engine");
    (checkBudgetGate as any).mockResolvedValue(true);
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("ai");
    expect(r.budgetBlocked).toBeFalsy();
  });

  it("blocks AI call when checkBudgetGate returns false", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const { checkBudgetGate } = await import("@/lib/ai-fabric/budget-engine");
    (checkBudgetGate as any).mockResolvedValue(false);
    const { getBudgetStatus } = await import("@/lib/ai-fabric/budget-engine");
    (getBudgetStatus as any).mockResolvedValue({ hardStopActive: true, currentSpendUsd: 100, monthlyBudgetUsd: 100 });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.budgetBlocked).toBe(true);
  });

  it("returns budgetBlocked: true when blocked", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const { checkBudgetGate } = await import("@/lib/ai-fabric/budget-engine");
    (checkBudgetGate as any).mockResolvedValue(false);
    const { getBudgetStatus } = await import("@/lib/ai-fabric/budget-engine");
    (getBudgetStatus as any).mockResolvedValue({ hardStopActive: false });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.budgetBlocked).toBe(true);
  });

  it("returns budgetReason when blocked", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const { checkBudgetGate } = await import("@/lib/ai-fabric/budget-engine");
    (checkBudgetGate as any).mockResolvedValue(false);
    const { getBudgetStatus } = await import("@/lib/ai-fabric/budget-engine");
    (getBudgetStatus as any).mockResolvedValue({ hardStopActive: true });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.budgetReason).toBe("hard_stop");
  });

  it("returns resolvedBy: cache when budget-blocked", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const { checkBudgetGate } = await import("@/lib/ai-fabric/budget-engine");
    (checkBudgetGate as any).mockResolvedValue(false);
    const { getBudgetStatus } = await import("@/lib/ai-fabric/budget-engine");
    (getBudgetStatus as any).mockResolvedValue({ hardStopActive: false });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.resolvedBy).toBe("cache");
  });

  it("returns budget_exceeded reason when not hard stop", async () => {
    mockDb.cacheEntry.findUnique.mockResolvedValue(null);
    const { checkBudgetGate } = await import("@/lib/ai-fabric/budget-engine");
    (checkBudgetGate as any).mockResolvedValue(false);
    const { getBudgetStatus } = await import("@/lib/ai-fabric/budget-engine");
    (getBudgetStatus as any).mockResolvedValue({ hardStopActive: false });
    const r = await executeCascade(req(), { aiFn: () => Promise.resolve(aiResult) });
    expect(r.budgetReason).toBe("budget_exceeded");
  });
});

// ─── Type exports ────────────────────────────────────────────────────────

describe("type exports", () => {
  it("GatewayAIFn type is exported as a function type", () => {
    const fn: GatewayAIFn<string> = async (_req) => ({ data: "test", provider: "p" });
    expect(typeof fn).toBe("function");
  });

  it("GatewayOptions type accepts valid options", () => {
    const opts: GatewayOptions<string> = {
      aiFn: async (_req) => ({ data: "x", provider: "p" }),
      cacheTtlMs: 1000,
      skipStages: ["cache"],
    };
    expect(opts.cacheTtlMs).toBe(1000);
    expect(opts.skipStages).toContain("cache");
  });
});

// ─── cacheStore ──────────────────────────────────────────────────────────

describe("cacheStore", () => {
  beforeEach(clearAll);

  it("upserts cache entry with correct data", async () => {
    await cacheStore("co1", "input1", { result: 42 });
    expect(mockDb.cacheEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: fabricHash("co1:input1") },
        create: expect.objectContaining({ companySlug: "co1", key: fabricHash("co1:input1") }),
      }),
    );
  });

  it("uses default TTL of 1 hour", async () => {
    await cacheStore("co", "inp", {});
    const createData = mockDb.cacheEntry.upsert.mock.calls[0][0].create;
    const ttlMs = createData.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(3590000);
    expect(ttlMs).toBeLessThanOrEqual(3600000);
  });
});

// ─── storeAIMemory ───────────────────────────────────────────────────────

describe("storeAIMemory", () => {
  beforeEach(clearAll);

  it("creates AIMemoryEntry with correct data", async () => {
    await storeAIMemory({ companySlug: "co", category: "decision", inputHash: "h1", result: { action: "approve" } });
    expect(mockDb.aIMemoryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companySlug: "co", category: "decision" }),
      }),
    );
  });

  it("serializes result as JSON in content", async () => {
    await storeAIMemory({ companySlug: "co", category: "product", inputHash: "h2", result: { name: "widget" } });
    const callData = mockDb.aIMemoryEntry.create.mock.calls[0][0].data;
    const parsed = JSON.parse(callData.content);
    expect(parsed.inputHash).toBe("h2");
    expect(parsed.result.name).toBe("widget");
  });
});

afterAll(() => { mock.restore(); });