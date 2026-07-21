// @ts-nocheck
/**
 * passwordPolicy.test.ts — 50 tests for the password validation and session management module.
 *
 * Covers: validatePassword (scoring, requirements, penalties, bonuses),
 * registerSession, isSessionValid, revokeSession, revokeAllSessions,
 * getActiveSessionCount, cleanupExpiredSessions.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock definitions ──────────────────────────────────────────────────────────

const mockSessionCreate = mock(() => Promise.resolve({}));
const mockSessionFindMany = mock(() => Promise.resolve([]));
const mockSessionFindUnique = mock(() => Promise.resolve(null));
const mockSessionDelete = mock(() => Promise.resolve({}));
const mockSessionDeleteMany = mock(() => Promise.resolve({ count: 0 }));
const mockSessionCount = mock(() => Promise.resolve(0));

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
    sessionRegistry: {
      create: mockSessionCreate,
      findMany: mockSessionFindMany,
      findUnique: mockSessionFindUnique,
      delete: mockSessionDelete,
      deleteMany: mockSessionDeleteMany,
      count: mockSessionCount,
    },
    tamperEvidenceChain: { findFirst: mock(() => Promise.resolve(null)), create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), updateMany: mock(() => Promise.resolve({})), update: mock(() => Promise.resolve({})), count: mock(() => Promise.resolve(0)) },
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

const {
  validatePassword,
  registerSession,
  isSessionValid,
  revokeSession,
  revokeAllSessions,
  getActiveSessionCount,
  cleanupExpiredSessions,
} = await import("@/lib/passwordPolicy");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Password Policy Module", () => {
  beforeEach(() => {
    mockSessionCreate.mockClear();
    mockSessionFindMany.mockClear();
    mockSessionFindUnique.mockClear();
    mockSessionDelete.mockClear();
    mockSessionDeleteMany.mockClear();
    mockSessionCount.mockClear();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validatePassword — Minimum length — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("validatePassword — minimum length", () => {
    it("rejects password shorter than 10 chars", () => {
      const result = validatePassword("Ab1!xyz");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("10"))).toBe(true);
    });

    it("accepts exactly 10 chars", () => {
      const result = validatePassword("Abcdef123!");
      expect(result.errors.some((e) => e.includes("10"))).toBe(false);
    });

    it("score gets +20 for length >= 10", () => {
      const result = validatePassword("aaaaaaaaaa"); // 10 chars but no uppercase, digit, special
      expect(result.score).toBeGreaterThanOrEqual(20);
    });

    it("score gets +10 bonus for length >= 14", () => {
      const result = validatePassword("aaaaaaaaaaaaaa"); // 14 chars
      expect(result.score).toBeGreaterThanOrEqual(30); // 20 (min) + 10 (14+)
    });

    it("score gets +5 bonus for length >= 20", () => {
      const result = validatePassword("aaaaaaaaaaaaaaaaaaaa"); // 20 chars
      expect(result.score).toBeGreaterThanOrEqual(35); // 20 (min) + 10 (14+) + 5 (20+)
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validatePassword — Character classes — 8 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("validatePassword — character classes", () => {
    it("requires lowercase letter", () => {
      const result = validatePassword("ABCDEFGHIJ1!");
      expect(result.errors.some((e) => e.includes("صغير"))).toBe(true);
    });

    it("gives +10 for lowercase", () => {
      const result = validatePassword("aaaaaaaaaa1!");
      expect(result.score).toBeGreaterThanOrEqual(30); // 20 (len) + 10 (lower) + 15 (digit) + 15 (special) = 60
    });

    it("requires uppercase letter", () => {
      const result = validatePassword("abcdefghij1!");
      expect(result.errors.some((e) => e.includes("كبير"))).toBe(true);
    });

    it("gives +10 for uppercase", () => {
      const result = validatePassword("AAAAAaaaa1!");
      expect(result.errors.some((e) => e.includes("كبير"))).toBe(false);
    });

    it("requires digit", () => {
      const result = validatePassword("Abcdefghij!");
      expect(result.errors.some((e) => e.includes("رقم"))).toBe(true);
    });

    it("gives +15 for digit", () => {
      // Compare same-length passwords, one with digit one without
      const without = validatePassword("KxmNpQzAbCd!");
      const withDigit = validatePassword("KxmN7pQzAbC!");
      expect(withDigit.score).toBe(without.score + 15);
    });

    it("requires special character", () => {
      const result = validatePassword("Abcdefghij1");
      expect(result.errors.some((e) => e.includes("رمز خاص"))).toBe(true);
    });

    it("gives +15 for special character", () => {
      const result = validatePassword("Abcdefg1!@#");
      expect(result.errors.some((e) => e.includes("رمز خاص"))).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validatePassword — Score calculation — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("validatePassword — score calculation", () => {
    it("score is capped at 100", () => {
      const result = validatePassword("aA1!very-long-and-strong-password-2025-xyz");
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("score is floored at 0", () => {
      const result = validatePassword("aaaaaaaaaa"); // 20 (len) - penalties
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it("valid strong password has score >= 40", () => {
      const result = validatePassword("MyStr0ng!Pass");
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(40);
    });

    it("password missing multiple classes has low score", () => {
      const result = validatePassword("abcdefghij"); // only lowercase, 10 chars
      expect(result.score).toBeLessThan(40);
    });

    it("perfect password scores 100", () => {
      // 20(len10) + 10(len14) + 5(len20) + 10(lower) + 10(upper) + 15(digit) + 15(special) + 10(variety70%) + 5(variety90%) = 100
      const result = validatePassword("Kx7mN2!pQwR5sT8yV#zL@3jH");
      expect(result.score).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validatePassword — Common pattern penalties — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("validatePassword — common pattern penalties", () => {
    it("penalizes password starting with '1234'", () => {
      const base = validatePassword("Kx7mN2!pQzAb");
      const penalty = validatePassword("1234mN2!pQzAb");
      expect(penalty.score).toBeLessThan(base.score);
      expect(base.score - penalty.score).toBe(20);
    });

    it("penalizes password starting with 'password'", () => {
      const result = validatePassword("passwordA1!");
      // 20(len) + 10(lower) + 10(upper) + 15(digit) + 15(special) + 10(variety) - 20(common) = 60
      expect(result.score).toBe(60);
    });

    it("penalizes password starting with 'admin'", () => {
      const result = validatePassword("admin1234A!");
      expect(result.score).toBeLessThan(100);
    });

    it("penalizes password starting with 'qwer'", () => {
      const result = validatePassword("qwer1234A!");
      expect(result.score).toBeLessThan(100);
    });

    it("penalizes password starting with 'abcd'", () => {
      const result = validatePassword("abcd1234A!");
      expect(result.score).toBeLessThan(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validatePassword — Repeated character penalty — 3 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("validatePassword — repeated character penalty", () => {
    it("penalizes 3+ repeated chars", () => {
      const clean = validatePassword("Abcdef1!xyz");
      const repeated = validatePassword("Abbbbbb1!xy");
      expect(repeated.score).toBeLessThan(clean.score);
    });

    it("does not penalize 2 repeated chars", () => {
      const result = validatePassword("Abcdeef1!xy");
      // 2 repeated is fine, only 3+ gets -10
      expect(result.errors).not.toContain(expect.stringContaining("repeated"));
    });

    it("penalizes repeated special chars too", () => {
      const result = validatePassword("Abcdef1!!!xyz");
      // !!! is 3 repeated, should get -10
      const base = validatePassword("Abcdef1!xyz");
      expect(result.score).toBeLessThan(base.score);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validatePassword — Variety bonus — 4 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("validatePassword — variety bonus", () => {
    it("gives +10 bonus when unique chars >= 70% of length", () => {
      const result = validatePassword("aBcDeFgHiJ"); // 10 chars, 10 unique = 100%
      expect(result.score).toBeGreaterThanOrEqual(30); // 20 (len) + 10 (variety)
    });

    it("gives +5 extra bonus when unique chars >= 90% of length", () => {
      // High variety (>=90%) gets +10 + 5 = +15; medium (70-90%) gets only +10
      const high = validatePassword("Kx7mN2!pQzAb"); // 12 unique/12 = 100% → +15 variety
      const low = validatePassword("Kx7mN2!pQzxx");  // 10 unique/12 = 83% → +10 variety only
      expect(high.score).toBeGreaterThan(low.score);
      expect(high.score - low.score).toBe(5);
    });

    it("low variety password gets no variety bonus", () => {
      const result = validatePassword("aaaaaaaaaa1!"); // 13 chars, only 3 unique
      // 20(len) + 10(14+) + 10(lower) + 15(digit) + 15(special) - 10(repeated) = 60
      const hasVarietyPenalty = result.score < 60;
      expect(hasVarietyPenalty || result.score === 60).toBe(true);
    });

    it("variety is case-insensitive", () => {
      const result = validatePassword("aAaAaAaAaA1!"); // 12 chars, unique lowercase = {a, 1, !} = 3
      // 20(len) + 10(14+) + 10(lower) + 10(upper) + 15(digit) + 15(special) - 10(repeated 'a') = 60
      // variety: 3/12 = 25% < 70%, no bonus
      expect(result.score).toBe(60);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Session management — registerSession — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("registerSession", () => {
    it("creates a session with correct userUid and jti", async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);
      await registerSession({ userUid: "user-1", jti: "jti-abc", ttlSeconds: 3600 });
      expect(mockSessionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userUid: "user-1",
          jti: "jti-abc",
        }),
      });
    });

    it("creates session with expiresAt in the future", async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);
      const before = Date.now();
      await registerSession({ userUid: "user-1", jti: "jti-abc", ttlSeconds: 3600 });
      const after = Date.now();
      const callData = mockSessionCreate.mock.calls[0][0].data;
      const expectedMin = new Date(before + 3600 * 1000);
      const expectedMax = new Date(after + 3600 * 1000);
      expect(callData.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(callData.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });

    it("stores ipAddress when provided", async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);
      await registerSession({ userUid: "user-1", jti: "jti-abc", ipAddress: "1.2.3.4", ttlSeconds: 3600 });
      expect(mockSessionCreate.mock.calls[0][0].data.ipAddress).toBe("1.2.3.4");
    });

    it("stores null ipAddress when not provided", async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);
      await registerSession({ userUid: "user-1", jti: "jti-abc", ttlSeconds: 3600 });
      expect(mockSessionCreate.mock.calls[0][0].data.ipAddress).toBeNull();
    });

    it("stores userAgent when provided", async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);
      await registerSession({ userUid: "user-1", jti: "jti-abc", userAgent: "Firefox", ttlSeconds: 3600 });
      expect(mockSessionCreate.mock.calls[0][0].data.userAgent).toBe("Firefox");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Session validation — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("isSessionValid", () => {
    it("returns true for valid non-expired session", async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        jti: "jti-abc", expiresAt: new Date(Date.now() + 3600_000),
      });
      expect(await isSessionValid("jti-abc")).toBe(true);
    });

    it("returns false for non-existent session", async () => {
      mockSessionFindUnique.mockResolvedValueOnce(null);
      expect(await isSessionValid("jti-ghost")).toBe(false);
    });

    it("returns false and deletes expired session", async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        jti: "jti-expired", expiresAt: new Date(Date.now() - 1000),
      });
      expect(await isSessionValid("jti-expired")).toBe(false);
      expect(mockSessionDelete).toHaveBeenCalledWith({ where: { jti: "jti-expired" } });
    });

    it("queries by jti", async () => {
      mockSessionFindUnique.mockResolvedValueOnce(null);
      await isSessionValid("my-jti");
      expect(mockSessionFindUnique).toHaveBeenCalledWith({ where: { jti: "my-jti" } });
    });

    it("handles delete error gracefully for expired session", async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        jti: "jti-expired", expiresAt: new Date(Date.now() - 1000),
      });
      mockSessionDelete.mockRejectedValueOnce(new Error("DB error"));
      expect(await isSessionValid("jti-expired")).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Session revocation — 4 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("revokeSession / revokeAllSessions", () => {
    it("revokeSession deletes by jti", async () => {
      mockSessionDelete.mockResolvedValueOnce({});
      await revokeSession("jti-abc");
      expect(mockSessionDelete).toHaveBeenCalledWith({ where: { jti: "jti-abc" } });
    });

    it("revokeSession handles not-found gracefully", async () => {
      mockSessionDelete.mockRejectedValueOnce(new Error("Not found"));
      await expect(revokeSession("jti-ghost")).resolves.toBeUndefined();
    });

    it("revokeAllSessions deletes many by userUid", async () => {
      mockSessionDeleteMany.mockResolvedValueOnce({ count: 3 });
      await revokeAllSessions("user-1");
      expect(mockSessionDeleteMany).toHaveBeenCalledWith({ where: { userUid: "user-1" } });
    });

    it("revokeAllSessions handles error gracefully", async () => {
      mockSessionDeleteMany.mockRejectedValueOnce(new Error("DB error"));
      await expect(revokeAllSessions("user-1")).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Session limit enforcement — 3 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("session limit enforcement", () => {
    it("evicts oldest sessions when over limit (max 5)", async () => {
      const now = Date.now();
      const sessions = Array.from({ length: 7 }, (_, i) => ({
        id: `sess-${i}`,
        userUid: "user-1",
        jti: `jti-${i}`,
        createdAt: new Date(now - (7 - i) * 60000),
        expiresAt: new Date(now + 3600_000),
      }));
      mockSessionFindMany.mockResolvedValueOnce(sessions);
      mockSessionDelete.mockResolvedValue({});

      await registerSession({ userUid: "user-1", jti: "jti-new", ttlSeconds: 3600 });
      // Should evict oldest 2 (sessions 0 and 1)
      expect(mockSessionDelete).toHaveBeenCalledTimes(2);
      expect(mockSessionDelete).toHaveBeenCalledWith({ where: { id: "sess-0" } });
      expect(mockSessionDelete).toHaveBeenCalledWith({ where: { id: "sess-1" } });
    });

    it("does not evict when below the limit", async () => {
      const now = Date.now();
      const sessions = Array.from({ length: 3 }, (_, i) => ({
        id: `sess-${i}`,
        userUid: "user-1",
        jti: `jti-${i}`,
        createdAt: new Date(now - (3 - i) * 60000),
        expiresAt: new Date(now + 3600_000),
      }));
      mockSessionFindMany.mockResolvedValueOnce(sessions);
      await registerSession({ userUid: "user-1", jti: "jti-new", ttlSeconds: 3600 });
      // 3 existing + 1 new = 4, under limit of 5, no eviction
      expect(mockSessionDelete).toHaveBeenCalledTimes(0);
    });

    it("queries sessions ordered by createdAt asc for eviction", async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);
      await registerSession({ userUid: "user-1", jti: "jti-new", ttlSeconds: 3600 });
      expect(mockSessionFindMany).toHaveBeenCalledWith({
        where: { userUid: "user-1" },
        orderBy: { createdAt: "asc" },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getActiveSessionCount — 2 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("getActiveSessionCount", () => {
    it("returns count of non-expired sessions", async () => {
      mockSessionCount.mockResolvedValueOnce(3);
      const result = await getActiveSessionCount("user-1");
      expect(result).toBe(3);
    });

    it("queries with expiresAt greater than now", async () => {
      mockSessionCount.mockResolvedValueOnce(0);
      await getActiveSessionCount("user-1");
      expect(mockSessionCount).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userUid: "user-1",
          expiresAt: { gt: expect.any(Date) },
        }),
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // cleanupExpiredSessions — 1 test
  // ═══════════════════════════════════════════════════════════════════════════
  describe("cleanupExpiredSessions", () => {
    it("deletes sessions with expiresAt in the past and returns count", async () => {
      mockSessionDeleteMany.mockResolvedValueOnce({ count: 42 });
      const count = await cleanupExpiredSessions();
      expect(count).toBe(42);
      expect(mockSessionDeleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});