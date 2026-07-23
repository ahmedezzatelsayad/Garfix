// @ts-nocheck
/**
 * learning-engine-advanced.test.ts — 30 tests for the learning engine.
 * Tests recordObservation, promoteCandidates, getLearningStatus.
 */

import { describe, it, expect, beforeEach, mock, afterAll } from "bun:test";

// ─── Mock setup ─────────────────────────────────────────────────────────

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
  compiledRule: m(),
};

const mockLogger = {
  info: mock(() => {}), warn: mock(() => {}),
  error: mock(() => {}), debug: mock(() => {}),
};

mock.module("@/lib/db", () => ({ db: mockDb }));
mock.module("@/lib/logger", () => ({ logger: mockLogger }));

import { recordObservation, promoteCandidates, getLearningStatus, MIN_SAMPLES, MIN_CONFIDENCE } from "@/lib/ai-fabric/learning-engine";

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

// ─── recordObservation ───────────────────────────────────────────────────

describe("recordObservation", () => {
  beforeEach(clearAll);

  it("creates candidate on first observation", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue(null);
    await recordObservation("co", "ocr", "hash1", { result: "a" });
    expect(mockDb.ruleCandidate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companySlug: "co",
          requestType: "ocr",
          patternSignature: "hash1",
          sampleCount: 1,
          confidence: 1.0,
          status: "observing",
        }),
      }),
    );
  });

  it("serializes output as JSON in consistentOutput", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue(null);
    await recordObservation("co", "ocr", "h1", { x: 1, y: "test" });
    const callData = mockDb.ruleCandidate.create.mock.calls[0][0].data;
    expect(callData.consistentOutput).toBe(JSON.stringify({ x: 1, y: "test" }));
  });

  it("updates existing candidate with matching output", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue({
      id: 1, companySlug: "co", patternSignature: "h1",
      sampleCount: 10, confidence: 0.8, consistentOutput: '{"r":1}', status: "observing",
    });
    await recordObservation("co", "ocr", "h1", { r: 1 });
    expect(mockDb.ruleCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ sampleCount: 11 }),
      }),
    );
  });

  it("confidence increases when output matches", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue({
      id: 1, sampleCount: 10, confidence: 0.8,
      consistentOutput: '{"r":1}', status: "observing",
    });
    await recordObservation("co", "ocr", "h1", { r: 1 });
    const newConf = mockDb.ruleCandidate.update.mock.calls[0][0].data.confidence;
    expect(newConf).toBeGreaterThan(0.8);
  });

  it("confidence decreases when output does not match", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue({
      id: 1, sampleCount: 10, confidence: 0.8,
      consistentOutput: '{"r":1}', status: "observing",
    });
    await recordObservation("co", "ocr", "h1", { r: 2 });
    const newConf = mockDb.ruleCandidate.update.mock.calls[0][0].data.confidence;
    expect(newConf).toBeLessThan(0.8);
  });

  it("does not update non-observing candidates", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue({
      id: 1, sampleCount: 10, confidence: 0.8,
      consistentOutput: '{"r":1}', status: "promoted",
    });
    await recordObservation("co", "ocr", "h1", { r: 1 });
    expect(mockDb.ruleCandidate.update).not.toHaveBeenCalled();
  });

  it("queries findFirst with correct companySlug and patternSignature", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue(null);
    await recordObservation("my-co", "matching", "hash-xyz", { r: 1 });
    expect(mockDb.ruleCandidate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companySlug: "my-co", patternSignature: "hash-xyz" } }),
    );
  });

  it("uses patternSignature equal to inputHash", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue(null);
    await recordObservation("co", "ocr", "my-hash", {});
    const callData = mockDb.ruleCandidate.create.mock.calls[0][0].data;
    expect(callData.patternSignature).toBe("my-hash");
  });

  it("handles complex output objects", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue(null);
    const output = { items: [{ id: 1, name: "a" }], total: 100 };
    await recordObservation("co", "ocr", "h1", output);
    const callData = mockDb.ruleCandidate.create.mock.calls[0][0].data;
    expect(JSON.parse(callData.consistentOutput)).toEqual(output);
  });

  it("rounds confidence to 4 decimal places", async () => {
    mockDb.ruleCandidate.findFirst.mockResolvedValue({
      id: 1, sampleCount: 3, confidence: 0.6667,
      consistentOutput: '{"r":1}', status: "observing",
    });
    await recordObservation("co", "ocr", "h1", { r: 1 });
    const newConf = mockDb.ruleCandidate.update.mock.calls[0][0].data.confidence;
    const decimals = newConf.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });
});

// ─── promoteCandidates ───────────────────────────────────────────────────

describe("promoteCandidates", () => {
  beforeEach(clearAll);

  it("promotes candidate with high confidence and enough samples", async () => {
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 1, companySlug: "co", requestType: "ocr", sampleCount: MIN_SAMPLES, confidence: MIN_CONFIDENCE, status: "observing" },
    ]);
    const r = await promoteCandidates();
    expect(r.promoted).toBe(1);
    expect(r.rejected).toBe(0);
  });

  it("updates status to promoted for qualifying candidates", async () => {
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 5, sampleCount: 20, confidence: 0.96, status: "observing" },
    ]);
    await promoteCandidates();
    expect(mockDb.ruleCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: { status: "promoted" } }),
    );
  });

  it("rejects candidate with low confidence", async () => {
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 2, sampleCount: MIN_SAMPLES, confidence: 0.3, status: "observing" },
    ]);
    const r = await promoteCandidates();
    expect(r.promoted).toBe(0);
    expect(r.rejected).toBe(1);
  });

  it("does not reject candidate with confidence >= 0.5", async () => {
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 3, sampleCount: MIN_SAMPLES, confidence: 0.5, status: "observing" },
    ]);
    const r = await promoteCandidates();
    expect(r.promoted).toBe(0);
    expect(r.rejected).toBe(0);
  });

  it("only evaluates candidates with sampleCount >= MIN_SAMPLES", async () => {
    // DB query filters by sampleCount >= MIN_SAMPLES, so mock returns []
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    const r = await promoteCandidates();
    expect(r.promoted).toBe(0);
  });

  it("queries only observing candidates with enough samples", async () => {
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    await promoteCandidates();
    expect(mockDb.ruleCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "observing", sampleCount: { gte: MIN_SAMPLES } },
      }),
    );
  });

  it("handles empty candidates list", async () => {
    mockDb.ruleCandidate.findMany.mockResolvedValue([]);
    const r = await promoteCandidates();
    expect(r.promoted).toBe(0);
    expect(r.rejected).toBe(0);
  });

  it("processes multiple candidates in single run", async () => {
    mockDb.ruleCandidate.findMany.mockResolvedValue([
      { id: 1, sampleCount: 20, confidence: 0.96, status: "observing" },
      { id: 2, sampleCount: 20, confidence: 0.3, status: "observing" },
      { id: 3, sampleCount: 20, confidence: 0.99, status: "observing" },
    ]);
    const r = await promoteCandidates();
    expect(r.promoted).toBe(2);
    expect(r.rejected).toBe(1);
  });
});

// ─── getLearningStatus ───────────────────────────────────────────────────

describe("getLearningStatus", () => {
  beforeEach(clearAll);

  it("returns correct observing count", async () => {
    mockDb.ruleCandidate.count
      .mockResolvedValueOnce(5)   // observing
      .mockResolvedValueOnce(3)   // promoted
      .mockResolvedValueOnce(2);  // rejected
    const r = await getLearningStatus("co");
    expect(r.observing).toBe(5);
  });

  it("returns correct promoted count", async () => {
    mockDb.ruleCandidate.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    const r = await getLearningStatus("co");
    expect(r.promoted).toBe(3);
  });

  it("returns correct rejected count", async () => {
    mockDb.ruleCandidate.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    const r = await getLearningStatus("co");
    expect(r.rejected).toBe(2);
  });

  it("returns correct total", async () => {
    mockDb.ruleCandidate.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    const r = await getLearningStatus("co");
    expect(r.total).toBe(10);
  });

  it("returns correct companySlug", async () => {
    mockDb.ruleCandidate.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const r = await getLearningStatus("my-co");
    expect(r.companySlug).toBe("my-co");
  });

  it("handles company with zero candidates", async () => {
    mockDb.ruleCandidate.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const r = await getLearningStatus("empty-co");
    expect(r.total).toBe(0);
    expect(r.observing).toBe(0);
  });

  it("queries count with correct status filters", async () => {
    mockDb.ruleCandidate.count.mockResolvedValue(0);
    await getLearningStatus("co");
    expect(mockDb.ruleCandidate.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companySlug: "co", status: "observing" } }),
    );
    expect(mockDb.ruleCandidate.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companySlug: "co", status: "promoted" } }),
    );
    expect(mockDb.ruleCandidate.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companySlug: "co", status: "rejected" } }),
    );
  });
});

afterAll(() => { mock.restore(); });