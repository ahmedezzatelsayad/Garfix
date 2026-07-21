// @ts-nocheck
/**
 * tamperAudit.test.ts — 50 tests for the tamper-evident audit chain module.
 *
 * Covers: appendToChain, verifyChain, getChainStats, and edge cases.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import crypto from "node:crypto";

// ── Mock definitions ──────────────────────────────────────────────────────────

const mockTECfindFirst = mock(() => Promise.resolve(null));
const mockTECcreate = mock(() => Promise.resolve({}));
const mockTECfindMany = mock(() => Promise.resolve([]));
const mockTECupdateMany = mock(() => Promise.resolve({}));
const mockTECupdate = mock(() => Promise.resolve({}));
const mockTECcount = mock(() => Promise.resolve(0));

mock.module("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      update: mock(() => Promise.resolve({})),
      create: mock(() => Promise.resolve({})),
      delete: mock(() => Promise.resolve({})),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
      upsert: mock(() => Promise.resolve({})),
      count: mock(() => Promise.resolve(0)),
    },
    auditLog: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), aggregate: mock(() => Promise.resolve({})) },
    adminAuditLog: { create: mock(() => Promise.resolve({})) },
    mFASecret: { findUnique: mock(() => Promise.resolve(null)), upsert: mock(() => Promise.resolve({})), update: mock(() => Promise.resolve({})), delete: mock(() => Promise.resolve({})) },
    sessionRegistry: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), findUnique: mock(() => Promise.resolve(null)), delete: mock(() => Promise.resolve({})), deleteMany: mock(() => Promise.resolve({ count: 0 })), count: mock(() => Promise.resolve(0)) },
    tamperEvidenceChain: {
      findFirst: mockTECfindFirst,
      create: mockTECcreate,
      findMany: mockTECfindMany,
      updateMany: mockTECupdateMany,
      update: mockTECupdate,
      count: mockTECcount,
    },
    webhookEndpoint: { findMany: mock(() => Promise.resolve([])), findUnique: mock(() => Promise.resolve(null)), create: mock(() => Promise.resolve({})), count: mock(() => Promise.resolve(0)) },
    webhookDelivery: { findMany: mock(() => Promise.resolve([])), create: mock(() => Promise.resolve({})), update: mock(() => Promise.resolve({})) },
    budgetConfig: { findUnique: mock(() => Promise.resolve(null)) },
    aIRequestLog: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), aggregate: mock(() => Promise.resolve({})) },
    aIMemoryEntry: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), findUnique: mock(() => Promise.resolve(null)), update: mock(() => Promise.resolve({})) },
    cacheEntry: { findUnique: mock(() => Promise.resolve(null)), upsert: mock(() => Promise.resolve({})), update: mock(() => Promise.resolve({})), delete: mock(() => Promise.resolve({})) },
    ruleCandidate: { findMany: mock(() => Promise.resolve([])) },
    company: { findMany: mock(() => Promise.resolve([])) },
    notification: { create: mock(() => Promise.resolve({})) },
  },
}));

mock.module("@/lib/logger", () => ({
  logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { appendToChain, verifyChain, getChainStats } = await import("@/lib/tamperAudit");

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeExpectedHash(contentHash: string, prevHash: string): string {
  return crypto.createHash("sha256").update(`${contentHash}:${prevHash}`).digest("hex");
}

function makeAuditContent(overrides: Record<string, unknown> = {}) {
  return {
    userEmail: "admin@garfix.com",
    action: "create",
    entity: "invoice",
    entityId: "inv-1",
    companySlug: "acme",
    details: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Tamper Audit Module", () => {
  beforeEach(() => {
    mockTECfindFirst.mockClear();
    mockTECcreate.mockClear();
    mockTECfindMany.mockClear();
    mockTECupdateMany.mockClear();
    mockTECupdate.mockClear();
    mockTECcount.mockClear();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // appendToChain — 15 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("appendToChain", () => {
    it("creates first entry with GENESIS prevHash when chain is empty", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent() });
      expect(mockTECfindFirst).toHaveBeenCalledWith({ orderBy: { chainOrder: "desc" } });
      const createCall = mockTECcreate.mock.calls[0][0];
      expect(createCall.data.prevHash).toBe("GENESIS");
      expect(createCall.data.chainOrder).toBe(0);
    });

    it("creates first entry with chainOrder 0", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent() });
      const createCall = mockTECcreate.mock.calls[0][0];
      expect(createCall.data.chainOrder).toBe(0);
    });

    it("stores entryId correctly", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-xyz", content: makeAuditContent() });
      const createCall = mockTECcreate.mock.calls[0][0];
      expect(createCall.data.entryId).toBe("audit-xyz");
    });

    it("stores companySlug when provided", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent(), companySlug: "acme" });
      const createCall = mockTECcreate.mock.calls[0][0];
      expect(createCall.data.companySlug).toBe("acme");
    });

    it("stores null companySlug when not provided", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent() });
      const createCall = mockTECcreate.mock.calls[0][0];
      expect(createCall.data.companySlug).toBeNull();
    });

    it("subsequent entry chains to previous contentHash", async () => {
      const prevContentHash = crypto.createHash("sha256").update("prev-content").digest("hex");
      mockTECfindFirst.mockResolvedValueOnce({ contentHash: prevContentHash, chainOrder: 5 });
      await appendToChain({ entryId: "audit-2", content: makeAuditContent() });
      const createCall = mockTECcreate.mock.calls[0][0];
      expect(createCall.data.prevHash).toBe(prevContentHash);
    });

    it("subsequent entry has chainOrder incremented by 1", async () => {
      mockTECfindFirst.mockResolvedValueOnce({ contentHash: "hash-1", chainOrder: 5 });
      await appendToChain({ entryId: "audit-2", content: makeAuditContent() });
      const createCall = mockTECcreate.mock.calls[0][0];
      expect(createCall.data.chainOrder).toBe(6);
    });

    it("stores a computed contentHash (SHA-256 of content:prevHash)", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent() });
      const createCall = mockTECcreate.mock.calls[0][0];
      expect(createCall.data.contentHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("contentHash is deterministic for same content and prevHash", async () => {
      const content = makeAuditContent();
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1a", content });
      const hash1 = mockTECcreate.mock.calls[0][0].data.contentHash;

      mockTECfindFirst.mockResolvedValueOnce(null);
      mockTECcreate.mockClear();
      await appendToChain({ entryId: "audit-1b", content });
      const hash2 = mockTECcreate.mock.calls[0][0].data.contentHash;

      expect(hash1).toBe(hash2);
    });

    it("contentHash changes when content changes", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent({ action: "create" }) });
      const hash1 = mockTECcreate.mock.calls[0][0].data.contentHash;

      mockTECfindFirst.mockResolvedValueOnce(null);
      mockTECcreate.mockClear();
      await appendToChain({ entryId: "audit-2", content: makeAuditContent({ action: "delete" }) });
      const hash2 = mockTECcreate.mock.calls[0][0].data.contentHash;

      expect(hash1).not.toBe(hash2);
    });

    it("contentHash changes when prevHash changes", async () => {
      const content = makeAuditContent();
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content });
      const hash1 = mockTECcreate.mock.calls[0][0].data.contentHash;

      mockTECfindFirst.mockResolvedValueOnce({ contentHash: "different-prev-hash", chainOrder: 0 });
      mockTECcreate.mockClear();
      await appendToChain({ entryId: "audit-2", content });
      const hash2 = mockTECcreate.mock.calls[0][0].data.contentHash;

      expect(hash1).not.toBe(hash2);
    });

    it("fetches last entry ordered by chainOrder desc", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent() });
      expect(mockTECfindFirst).toHaveBeenCalledWith({ orderBy: { chainOrder: "desc" } });
    });

    it("calls create exactly once per append", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent() });
      expect(mockTECcreate).toHaveBeenCalledTimes(1);
    });

    it("handles DB error gracefully without throwing", async () => {
      mockTECfindFirst.mockRejectedValueOnce(new Error("DB connection lost"));
      await expect(appendToChain({ entryId: "audit-1", content: makeAuditContent() })).resolves.toBeUndefined();
    });

    it("handles create error gracefully without throwing", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      mockTECcreate.mockRejectedValueOnce(new Error("Insert failed"));
      await expect(appendToChain({ entryId: "audit-1", content: makeAuditContent() })).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // verifyChain — 15 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("verifyChain", () => {
    it("returns valid=true for empty chain", async () => {
      mockTECfindMany.mockResolvedValueOnce([]);
      const result = await verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(0);
    });

    it("returns valid=true for single entry with GENESIS prevHash", async () => {
      const contentHash = computeExpectedHash("content-h1", "GENESIS");
      mockTECfindMany.mockResolvedValueOnce([{
        id: "chain-1", entryId: "audit-1", contentHash, prevHash: "GENESIS", chainOrder: 0,
      }]);
      const result = await verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(1);
    });

    it("returns valid=true for valid two-entry chain", async () => {
      const h1 = computeExpectedHash("content-h1", "GENESIS");
      const h2 = computeExpectedHash("content-h2", h1);
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
        { id: "chain-2", entryId: "audit-2", contentHash: h2, prevHash: h1, chainOrder: 1 },
      ]);
      const result = await verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(2);
    });

    it("returns valid=true for valid three-entry chain", async () => {
      const h1 = computeExpectedHash("c1", "GENESIS");
      const h2 = computeExpectedHash("c2", h1);
      const h3 = computeExpectedHash("c3", h2);
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
        { id: "chain-2", entryId: "audit-2", contentHash: h2, prevHash: h1, chainOrder: 1 },
        { id: "chain-3", entryId: "audit-3", contentHash: h3, prevHash: h2, chainOrder: 2 },
      ]);
      const result = await verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(3);
    });

    it("detects broken chain when prevHash is wrong", async () => {
      const h1 = computeExpectedHash("c1", "GENESIS");
      const h3 = computeExpectedHash("c3", "wrong-hash");
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
        { id: "chain-3", entryId: "audit-3", contentHash: h3, prevHash: "wrong-hash", chainOrder: 1 },
      ]);
      const result = await verifyChain();
      expect(result.valid).toBe(false);
      expect(result.breakAt).toBeDefined();
      expect(result.breakAt!.entryId).toBe("audit-3");
      expect(result.breakAt!.chainOrder).toBe(1);
      expect(result.breakAt!.reason).toContain("prevHash mismatch");
    });

    it("detects broken chain when first entry prevHash is not GENESIS", async () => {
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: "somehash", prevHash: "NOT-GENESIS", chainOrder: 0 },
      ]);
      const result = await verifyChain();
      expect(result.valid).toBe(false);
      expect(result.breakAt!.entryId).toBe("audit-1");
    });

    it("marks entry as invalid (isValid=false) when tampered", async () => {
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: "hash", prevHash: "WRONG", chainOrder: 0 },
      ]);
      await verifyChain();
      expect(mockTECupdate).toHaveBeenCalledWith({
        where: { id: "chain-1" },
        data: { isValid: false, verifiedAt: expect.any(Date) },
      });
    });

    it("marks all entries as verified (isValid=true) for valid chain", async () => {
      const h1 = computeExpectedHash("c1", "GENESIS");
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
      ]);
      await verifyChain();
      expect(mockTECupdateMany).toHaveBeenCalledWith({
        where: {},
        data: { isValid: true, verifiedAt: expect.any(Date) },
      });
    });

    it("does not call updateMany when chain is broken", async () => {
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: "hash", prevHash: "WRONG", chainOrder: 0 },
      ]);
      await verifyChain();
      expect(mockTECupdateMany).not.toHaveBeenCalled();
    });

    it("queries entries ordered by chainOrder asc", async () => {
      mockTECfindMany.mockResolvedValueOnce([]);
      await verifyChain();
      expect(mockTECfindMany).toHaveBeenCalledWith({ orderBy: { chainOrder: "asc" }, where: {} });
    });

    it("filters by companySlug when provided", async () => {
      mockTECfindMany.mockResolvedValueOnce([]);
      await verifyChain("acme");
      expect(mockTECfindMany).toHaveBeenCalledWith({ orderBy: { chainOrder: "asc" }, where: { companySlug: "acme" } });
    });

    it("partial company-scope verification only sees entries for that company", async () => {
      const h1 = computeExpectedHash("c1", "GENESIS");
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
      ]);
      const result = await verifyChain("acme");
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(1);
      expect(mockTECupdateMany).toHaveBeenCalledWith({
        where: { companySlug: "acme" },
        data: { isValid: true, verifiedAt: expect.any(Date) },
      });
    });

    it("reports correct totalEntries for broken chain", async () => {
      const h1 = computeExpectedHash("c1", "GENESIS");
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
        { id: "chain-2", entryId: "audit-2", contentHash: "h2", prevHash: "wrong", chainOrder: 1 },
        { id: "chain-3", entryId: "audit-3", contentHash: "h3", prevHash: "h2", chainOrder: 2 },
      ]);
      const result = await verifyChain();
      expect(result.totalEntries).toBe(3);
      expect(result.valid).toBe(false);
    });

    it("breakAt reason includes expected and actual hash prefixes", async () => {
      const h1 = computeExpectedHash("c1", "GENESIS");
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
        { id: "chain-2", entryId: "audit-2", contentHash: "h2", prevHash: "tampered", chainOrder: 1 },
      ]);
      const result = await verifyChain();
      expect(result.breakAt!.reason).toContain(h1.substring(0, 12));
      expect(result.breakAt!.reason).toContain("tampered".substring(0, 12));
    });

    it("returns valid for 10-entry chain built correctly", async () => {
      const entries: any[] = [];
      let prevHash = "GENESIS";
      for (let i = 0; i < 10; i++) {
        const contentHash = computeExpectedHash(`content-${i}`, prevHash);
        entries.push({
          id: `chain-${i}`, entryId: `audit-${i}`, contentHash, prevHash, chainOrder: i,
        });
        prevHash = contentHash;
      }
      mockTECfindMany.mockResolvedValueOnce(entries);
      const result = await verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getChainStats — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("getChainStats", () => {
    it("returns all zeros when no entries exist", async () => {
      mockTECcount
        .mockResolvedValueOnce(0)  // total
        .mockResolvedValueOnce(0)  // verified
        .mockResolvedValueOnce(0); // tampered
      const stats = await getChainStats();
      expect(stats).toEqual({ totalEntries: 0, verifiedCount: 0, unverifiedCount: 0, tamperedCount: 0 });
    });

    it("returns correct total entries", async () => {
      mockTECcount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(10);
      const stats = await getChainStats();
      expect(stats.totalEntries).toBe(100);
    });

    it("returns correct verified count", async () => {
      mockTECcount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(75)
        .mockResolvedValueOnce(5);
      const stats = await getChainStats();
      expect(stats.verifiedCount).toBe(75);
    });

    it("returns correct tampered count", async () => {
      mockTECcount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(20);
      const stats = await getChainStats();
      expect(stats.tamperedCount).toBe(20);
    });

    it("calculates unverified count as total - verified - tampered", async () => {
      mockTECcount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(20);
      const stats = await getChainStats();
      expect(stats.unverifiedCount).toBe(30); // 100 - 50 - 20
    });

    it("handles all entries verified", async () => {
      mockTECcount
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(0);
      const stats = await getChainStats();
      expect(stats.unverifiedCount).toBe(0);
      expect(stats.verifiedCount).toBe(50);
    });

    it("handles all entries tampered", async () => {
      mockTECcount
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(30);
      const stats = await getChainStats();
      expect(stats.unverifiedCount).toBe(0);
      expect(stats.tamperedCount).toBe(30);
    });

    it("calls count three times (total, verified, tampered)", async () => {
      mockTECcount
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      await getChainStats();
      expect(mockTECcount).toHaveBeenCalledTimes(3);
    });

    it("verified count query includes isValid=true and verifiedAt not null", async () => {
      mockTECcount
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      await getChainStats();
      expect(mockTECcount.mock.calls[1][0]).toEqual({
        where: { isValid: true, verifiedAt: { not: null } },
      });
    });

    it("tampered count query includes isValid=false", async () => {
      mockTECcount
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      await getChainStats();
      expect(mockTECcount.mock.calls[2][0]).toEqual({
        where: { isValid: false },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Edge cases", () => {
    it("consecutive appends increment chainOrder correctly", async () => {
      // First append
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent() });
      expect(mockTECcreate.mock.calls[0][0].data.chainOrder).toBe(0);

      // Second append
      const prevHash = mockTECcreate.mock.calls[0][0].data.contentHash;
      mockTECfindFirst.mockResolvedValueOnce({ contentHash: prevHash, chainOrder: 0 });
      await appendToChain({ entryId: "audit-2", content: makeAuditContent() });
      expect(mockTECcreate.mock.calls[1][0].data.chainOrder).toBe(1);

      // Third append
      const prevHash2 = mockTECcreate.mock.calls[1][0].data.contentHash;
      mockTECfindFirst.mockResolvedValueOnce({ contentHash: prevHash2, chainOrder: 1 });
      await appendToChain({ entryId: "audit-3", content: makeAuditContent() });
      expect(mockTECcreate.mock.calls[2][0].data.chainOrder).toBe(2);
    });

    it("company isolation: append with companySlug creates company-scoped entry", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent(), companySlug: "company-a" });
      expect(mockTECcreate.mock.calls[0][0].data.companySlug).toBe("company-a");
    });

    it("very long chain (100 entries) verifies correctly", async () => {
      const entries: any[] = [];
      let prevHash = "GENESIS";
      for (let i = 0; i < 100; i++) {
        const contentHash = computeExpectedHash(`content-${i}`, prevHash);
        entries.push({
          id: `chain-${i}`, entryId: `audit-${i}`, contentHash, prevHash, chainOrder: i,
        });
        prevHash = contentHash;
      }
      mockTECfindMany.mockResolvedValueOnce(entries);
      const result = await verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(100);
    });

    it("hash collision resistance: different content produces different hashes", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent({ action: "create" }) });
      const hash1 = mockTECcreate.mock.calls[0][0].data.contentHash;

      mockTECfindFirst.mockResolvedValueOnce(null);
      mockTECcreate.mockClear();
      await appendToChain({ entryId: "audit-2", content: makeAuditContent({ action: "delete" }) });
      const hash2 = mockTECcreate.mock.calls[0][0].data.contentHash;

      expect(hash1).not.toBe(hash2);
    });

    it("chain breaks at the exact tampered entry, not earlier", async () => {
      const h1 = computeExpectedHash("c1", "GENESIS");
      const h2 = computeExpectedHash("c2", h1);
      const h4 = computeExpectedHash("c4", "WRONG");
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
        { id: "chain-2", entryId: "audit-2", contentHash: h2, prevHash: h1, chainOrder: 1 },
        { id: "chain-4", entryId: "audit-4", contentHash: h4, prevHash: "WRONG", chainOrder: 2 },
      ]);
      const result = await verifyChain();
      expect(result.breakAt!.chainOrder).toBe(2);
      expect(result.breakAt!.entryId).toBe("audit-4");
    });

    it("getChainStats returns unverified=0 when all are verified or tampered", async () => {
      mockTECcount
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(60)
        .mockResolvedValueOnce(20);
      const stats = await getChainStats();
      expect(stats.unverifiedCount).toBe(0);
    });

    it("verifyChain with company filter does not mark entries from other companies", async () => {
      const h1 = computeExpectedHash("c1", "GENESIS");
      mockTECfindMany.mockResolvedValueOnce([
        { id: "chain-1", entryId: "audit-1", contentHash: h1, prevHash: "GENESIS", chainOrder: 0 },
      ]);
      await verifyChain("acme");
      expect(mockTECupdateMany).toHaveBeenCalledWith({
        where: { companySlug: "acme" },
        data: { isValid: true, verifiedAt: expect.any(Date) },
      });
    });

    it("appendToChain with null companySlug stores null", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent(), companySlug: null });
      expect(mockTECcreate.mock.calls[0][0].data.companySlug).toBeNull();
    });

    it("verifyChain handles undefined companySlug (global scope)", async () => {
      mockTECfindMany.mockResolvedValueOnce([]);
      await verifyChain(undefined);
      expect(mockTECfindMany).toHaveBeenCalledWith({ orderBy: { chainOrder: "asc" }, where: {} });
    });

    it("different createdAt timestamps produce different contentHashes", async () => {
      mockTECfindFirst.mockResolvedValueOnce(null);
      await appendToChain({ entryId: "audit-1", content: makeAuditContent({ createdAt: new Date("2025-01-01") }) });
      const hash1 = mockTECcreate.mock.calls[0][0].data.contentHash;

      mockTECfindFirst.mockResolvedValueOnce(null);
      mockTECcreate.mockClear();
      await appendToChain({ entryId: "audit-2", content: makeAuditContent({ createdAt: new Date("2025-12-31") }) });
      const hash2 = mockTECcreate.mock.calls[0][0].data.contentHash;

      expect(hash1).not.toBe(hash2);
    });
  });
});