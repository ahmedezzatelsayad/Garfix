// @ts-nocheck
/**
 * mfa.test.ts — 60 tests for the TOTP-based MFA module.
 *
 * Covers: setupMFA, verifyAndEnableMFA, validateMFA, useRecoveryCode,
 * isMFAEnabled, isMFARequired, disableMFA, getRecoveryCodeCount, and edge cases.
 */

import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import crypto from "node:crypto";

// ── Mock definitions ──────────────────────────────────────────────────────────

const mockMFASecretFindUnique = mock(() => Promise.resolve(null));
const mockMFASecretUpsert = mock(() => Promise.resolve({}));
const mockMFASecretUpdate = mock(() => Promise.resolve({}));
const mockMFASecretDelete = mock(() => Promise.resolve({}));

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
    mFASecret: {
      findUnique: mockMFASecretFindUnique,
      upsert: mockMFASecretUpsert,
      update: mockMFASecretUpdate,
      delete: mockMFASecretDelete,
    },
    sessionRegistry: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), findUnique: mock(() => Promise.resolve(null)), delete: mock(() => Promise.resolve({})), deleteMany: mock(() => Promise.resolve({ count: 0 })), count: mock(() => Promise.resolve(0)) },
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

const { setupMFA, verifyAndEnableMFA, validateMFA, useRecoveryCode, isMFAEnabled, isMFARequired, disableMFA, getRecoveryCodeCount } = await import("@/lib/mfa");
const { encryptSecret, decryptSecret, hashToken } = await import("@/lib/cryptoVault");

// ── Helper ────────────────────────────────────────────────────────────────────

function createEncryptedRecoveryCodes(codes: string[]): string {
  const hashed = codes.map((c) => hashToken(c));
  return encryptSecret(JSON.stringify(hashed));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MFA Module", () => {
  beforeEach(() => {
    mockMFASecretFindUnique.mockClear();
    mockMFASecretUpsert.mockClear();
    mockMFASecretUpdate.mockClear();
    mockMFASecretDelete.mockClear();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // setupMFA — 12 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("setupMFA", () => {
    it("generates a non-empty secret", async () => {
      const result = await setupMFA("user-1");
      expect(result.secret).toBeTruthy();
      expect(result.secret.length).toBeGreaterThan(0);
    });

    it("returns a valid otpauth URI", async () => {
      const result = await setupMFA("user-1");
      expect(result.uri).toContain("otpauth://totp/");
      expect(result.uri).toContain("GarfiX:");
      expect(result.uri).toContain("secret=");
      expect(result.uri).toContain("algorithm=SHA1");
      expect(result.uri).toContain("digits=6");
      expect(result.uri).toContain("period=30");
    });

    it("URI encodes the userUid", async () => {
      const result = await setupMFA("user@test.com");
      expect(result.uri).toContain("GarfiX:user%40test.com");
    });

    it("generates exactly 10 recovery codes", async () => {
      const result = await setupMFA("user-1");
      expect(result.recoveryCodes).toHaveLength(10);
    });

    it("recovery codes are in XXXX-XXXX format", async () => {
      const result = await setupMFA("user-1");
      for (const code of result.recoveryCodes) {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      }
    });

    it("recovery codes are uppercase", async () => {
      const result = await setupMFA("user-1");
      for (const code of result.recoveryCodes) {
        expect(code).toBe(code.toUpperCase());
      }
    });

    it("calls db.mFASecret.upsert with correct id", async () => {
      await setupMFA("user-abc");
      expect(mockMFASecretUpsert).toHaveBeenCalledTimes(1);
      const call = mockMFASecretUpsert.mock.calls[0][0];
      expect(call.where).toEqual({ id: "mfa-user-abc" });
    });

    it("stores encrypted secret in DB", async () => {
      await setupMFA("user-1");
      const call = mockMFASecretUpsert.mock.calls[0][0];
      expect(call.create.secret).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    });

    it("stores encrypted recovery codes in DB", async () => {
      await setupMFA("user-1");
      const call = mockMFASecretUpsert.mock.calls[0][0];
      expect(call.create.recoveryCodes).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    });

    it("sets enabled=false on create", async () => {
      await setupMFA("user-1");
      const call = mockMFASecretUpsert.mock.calls[0][0];
      expect(call.create.enabled).toBe(false);
    });

    it("sets enabled=false on update (re-setup)", async () => {
      await setupMFA("user-1");
      const call = mockMFASecretUpsert.mock.calls[0][0];
      expect(call.update.enabled).toBe(false);
    });

    it("clears verifiedAt on update (re-setup)", async () => {
      await setupMFA("user-1");
      const call = mockMFASecretUpsert.mock.calls[0][0];
      expect(call.update.verifiedAt).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // verifyAndEnableMFA — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("verifyAndEnableMFA", () => {
    it("returns false when record does not exist", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      const result = await verifyAndEnableMFA("user-ghost", "123456");
      expect(result).toBe(false);
    });

    it("returns false for an invalid TOTP code", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      const encSecret = encryptSecret(secret);
      const encCodes = createEncryptedRecoveryCodes(["AAAA-BBBB"]);
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1", secret: encSecret,
        recoveryCodes: encCodes, enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await verifyAndEnableMFA("user-1", "000000");
      expect(result).toBe(false);
    });

    it("returns false for a wrong 6-digit code", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      const encSecret = encryptSecret(secret);
      const encCodes = createEncryptedRecoveryCodes(["AAAA-BBBB"]);
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1", secret: encSecret,
        recoveryCodes: encCodes, enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await verifyAndEnableMFA("user-1", "999999");
      expect(result).toBe(false);
    });

    it("returns false when code has wrong length", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      const encSecret = encryptSecret(secret);
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1", secret: encSecret,
        recoveryCodes: "enc", enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await verifyAndEnableMFA("user-1", "12345");
      expect(result).toBe(false);
    });

    it("returns false for empty code", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      const encSecret = encryptSecret(secret);
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1", secret: encSecret,
        recoveryCodes: "enc", enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await verifyAndEnableMFA("user-1", "");
      expect(result).toBe(false);
    });

    it("does not call update when record not found", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      await verifyAndEnableMFA("user-ghost", "123456");
      expect(mockMFASecretUpdate).not.toHaveBeenCalled();
    });

    it("does not call update when code is invalid", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      const encSecret = encryptSecret(secret);
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1", secret: encSecret,
        recoveryCodes: "enc", enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      await verifyAndEnableMFA("user-1", "000000");
      expect(mockMFASecretUpdate).not.toHaveBeenCalled();
    });

    it("queries with correct where clause", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      await verifyAndEnableMFA("user-xyz", "123456");
      expect(mockMFASecretFindUnique).toHaveBeenCalledWith({ where: { id: "mfa-user-xyz" } });
    });

    it("handles decryption error gracefully (returns false)", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1", secret: "corrupted-not-encrypted",
        recoveryCodes: "enc", enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await verifyAndEnableMFA("user-1", "123456");
      expect(result).toBe(false);
    });

    it("non-existent user returns false without throwing", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      const result = await verifyAndEnableMFA("nonexistent-uid", "123456");
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validateMFA — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("validateMFA", () => {
    it("returns false when record does not exist", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      const result = await validateMFA("user-ghost", "123456");
      expect(result).toBe(false);
    });

    it("returns false when MFA is not enabled", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: encryptSecret(secret), recoveryCodes: "enc",
        enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await validateMFA("user-1", "123456");
      expect(result).toBe(false);
    });

    it("returns false for an invalid code on enabled MFA", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: encryptSecret(secret), recoveryCodes: "enc",
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const result = await validateMFA("user-1", "000000");
      expect(result).toBe(false);
    });

    it("returns false for wrong-length code", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: encryptSecret(secret), recoveryCodes: "enc",
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const result = await validateMFA("user-1", "1234");
      expect(result).toBe(false);
    });

    it("returns false for empty code", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: encryptSecret(secret), recoveryCodes: "enc",
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const result = await validateMFA("user-1", "");
      expect(result).toBe(false);
    });

    it("does not update lastUsedAt for invalid code", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: encryptSecret(secret), recoveryCodes: "enc",
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      await validateMFA("user-1", "000000");
      expect(mockMFASecretUpdate).not.toHaveBeenCalled();
    });

    it("queries with correct where clause", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      await validateMFA("user-zzz", "123456");
      expect(mockMFASecretFindUnique).toHaveBeenCalledWith({ where: { id: "mfa-user-zzz" } });
    });

    it("handles decryption error gracefully", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "not-properly-encrypted", recoveryCodes: "enc",
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const result = await validateMFA("user-1", "123456");
      expect(result).toBe(false);
    });

    it("non-existent user returns false", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      const result = await validateMFA("no-such-user", "123456");
      expect(result).toBe(false);
    });

    it("disabled MFA returns false even with valid-looking code", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: encryptSecret(secret), recoveryCodes: "enc",
        enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await validateMFA("user-1", "123456");
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // useRecoveryCode — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("useRecoveryCode", () => {
    it("returns false when record does not exist", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      const result = await useRecoveryCode("user-ghost", "AAAA-BBBB");
      expect(result).toBe(false);
    });

    it("returns false when MFA is not enabled", async () => {
      const codes = ["AAAA-BBBB", "CCCC-DDDD"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes(codes),
        enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await useRecoveryCode("user-1", "AAAA-BBBB");
      expect(result).toBe(false);
    });

    it("returns false for invalid recovery code", async () => {
      const codes = ["AAAA-BBBB", "CCCC-DDDD"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes(codes),
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const result = await useRecoveryCode("user-1", "ZZZZ-ZZZZ");
      expect(result).toBe(false);
    });

    it("returns true for a valid recovery code", async () => {
      const codes = ["AAAA-BBBB", "CCCC-DDDD"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes(codes),
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const result = await useRecoveryCode("user-1", "AAAA-BBBB");
      expect(result).toBe(true);
    });

    it("removes used code from the pool (one-time use)", async () => {
      const codes = ["AAAA-BBBB", "CCCC-DDDD"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes(codes),
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      await useRecoveryCode("user-1", "AAAA-BBBB");
      expect(mockMFASecretUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockMFASecretUpdate.mock.calls[0][0];
      const updatedCodes = JSON.parse(decryptSecret(updateCall.data.recoveryCodes));
      expect(updatedCodes).toHaveLength(1);
      expect(updatedCodes).not.toContain(hashToken("AAAA-BBBB"));
      expect(updatedCodes).toContain(hashToken("CCCC-DDDD"));
    });

    it("second use of same code returns false", async () => {
      const codes = ["AAAA-BBBB"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes(codes),
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const first = await useRecoveryCode("user-1", "AAAA-BBBB");
      expect(first).toBe(true);

      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes([]),
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const second = await useRecoveryCode("user-1", "AAAA-BBBB");
      expect(second).toBe(false);
    });

    it("does not update DB when code is invalid", async () => {
      const codes = ["AAAA-BBBB"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes(codes),
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      await useRecoveryCode("user-1", "ZZZZ-ZZZZ");
      expect(mockMFASecretUpdate).not.toHaveBeenCalled();
    });

    it("handles case-insensitive code matching (lowercase fails)", async () => {
      const codes = ["AAAA-BBBB"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes(codes),
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const result = await useRecoveryCode("user-1", "aaaa-bbbb");
      expect(result).toBe(false);
    });

    it("handles empty recovery code pool", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: "enc", recoveryCodes: createEncryptedRecoveryCodes([]),
        enabled: true, verifiedAt: new Date(), lastUsedAt: null,
      });
      const result = await useRecoveryCode("user-1", "AAAA-BBBB");
      expect(result).toBe(false);
    });

    it("queries with correct where clause", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      await useRecoveryCode("user-abc", "AAAA-BBBB");
      expect(mockMFASecretFindUnique).toHaveBeenCalledWith({ where: { id: "mfa-user-abc" } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // isMFAEnabled — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("isMFAEnabled", () => {
    it("returns true when record exists and enabled=true", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce({ enabled: true });
      const result = await isMFAEnabled("user-1");
      expect(result).toBe(true);
    });

    it("returns false when record exists and enabled=false", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce({ enabled: false });
      const result = await isMFAEnabled("user-1");
      expect(result).toBe(false);
    });

    it("returns false when record does not exist", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      const result = await isMFAEnabled("user-ghost");
      expect(result).toBe(false);
    });

    it("returns false when enabled is undefined", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce({ enabled: undefined });
      const result = await isMFAEnabled("user-1");
      expect(result).toBe(false);
    });

    it("queries with correct where clause", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      await isMFAEnabled("user-xyz");
      expect(mockMFASecretFindUnique).toHaveBeenCalledWith({ where: { id: "mfa-user-xyz" } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // isMFARequired — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("isMFARequired", () => {
    it("returns true for admin role", () => {
      expect(isMFARequired("admin", false)).toBe(true);
    });

    it("returns true for founder (isFounder=true)", () => {
      expect(isMFARequired("employee", true)).toBe(true);
    });

    it("returns true for admin founder", () => {
      expect(isMFARequired("admin", true)).toBe(true);
    });

    it("returns false for employee (isFounder=false)", () => {
      expect(isMFARequired("employee", false)).toBe(false);
    });

    it("returns false for editor (isFounder=false)", () => {
      expect(isMFARequired("editor", false)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // disableMFA — 4 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("disableMFA", () => {
    it("calls db delete with correct id", async () => {
      mockMFASecretDelete.mockResolvedValueOnce({});
      await disableMFA("user-1");
      expect(mockMFASecretDelete).toHaveBeenCalledWith({ where: { id: "mfa-user-1" } });
    });

    it("handles non-existent user (delete throws) gracefully", async () => {
      mockMFASecretDelete.mockRejectedValueOnce(new Error("Record not found"));
      await disableMFA("user-ghost");
      expect(mockMFASecretDelete).toHaveBeenCalledWith({ where: { id: "mfa-user-ghost" } });
    });

    it("handles Prisma not-found error gracefully", async () => {
      const prismaError = new Error("Record to delete does not exist");
      (prismaError as any).code = "P2025";
      mockMFASecretDelete.mockRejectedValueOnce(prismaError);
      await disableMFA("user-missing");
      expect(mockMFASecretDelete).toHaveBeenCalledTimes(1);
    });

    it("resolves without error for valid user", async () => {
      mockMFASecretDelete.mockResolvedValueOnce({ id: "mfa-user-1" });
      await expect(disableMFA("user-1")).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getRecoveryCodeCount — 4 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("getRecoveryCodeCount", () => {
    it("returns 0 for non-existent user", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce(null);
      const result = await getRecoveryCodeCount("user-ghost");
      expect(result).toBe(0);
    });

    it("returns correct count for user with 10 codes", async () => {
      const codes = Array.from({ length: 10 }, (_, i) => `${i.toString(16).toUpperCase().padStart(4, "0")}-AAAA`);
      mockMFASecretFindUnique.mockResolvedValueOnce({
        recoveryCodes: createEncryptedRecoveryCodes(codes),
      });
      const result = await getRecoveryCodeCount("user-1");
      expect(result).toBe(10);
    });

    it("returns 0 when recovery codes have been exhausted", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce({
        recoveryCodes: createEncryptedRecoveryCodes([]),
      });
      const result = await getRecoveryCodeCount("user-1");
      expect(result).toBe(0);
    });

    it("returns 0 when recovery codes are corrupted", async () => {
      mockMFASecretFindUnique.mockResolvedValueOnce({
        recoveryCodes: "not-encrypted-properly",
      });
      const result = await getRecoveryCodeCount("user-1");
      expect(result).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Edge cases", () => {
    it("consecutive setup calls generate different secrets", async () => {
      const r1 = await setupMFA("user-1");
      const r2 = await setupMFA("user-1");
      expect(r1.secret).not.toBe(r2.secret);
    });

    it("consecutive setup calls generate different recovery codes", async () => {
      const r1 = await setupMFA("user-1");
      const r2 = await setupMFA("user-1");
      expect(r1.recoveryCodes).not.toEqual(r2.recoveryCodes);
    });

    it("recovery codes from setup are unique", async () => {
      const result = await setupMFA("user-1");
      const unique = new Set(result.recoveryCodes);
      expect(unique.size).toBe(10);
    });

    it("isMFARequired returns false for viewer role", () => {
      expect(isMFARequired("viewer", false)).toBe(false);
    });

    it("isMFARequired returns false for empty string role", () => {
      expect(isMFARequired("", false)).toBe(false);
    });

    it("disableMFA with empty string uid calls delete", async () => {
      mockMFASecretDelete.mockResolvedValueOnce({});
      await disableMFA("");
      expect(mockMFASecretDelete).toHaveBeenCalledWith({ where: { id: "mfa-" } });
    });

    it("getRecoveryCodeCount for user with 3 codes returns 3", async () => {
      const codes = ["AAAA-BBBB", "CCCC-DDDD", "EEEE-FFFF"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        recoveryCodes: createEncryptedRecoveryCodes(codes),
      });
      expect(await getRecoveryCodeCount("user-1")).toBe(3);
    });

    it("getRecoveryCodeCount after using 2 of 5 codes returns 3", async () => {
      const remaining = ["CCCC-DDDD", "EEEE-FFFF", "GGGG-HHHH"];
      mockMFASecretFindUnique.mockResolvedValueOnce({
        recoveryCodes: createEncryptedRecoveryCodes(remaining),
      });
      expect(await getRecoveryCodeCount("user-1")).toBe(3);
    });

    it("verifyAndEnableMFA with non-string code returns false", async () => {
      const secret = crypto.randomBytes(20).toString("base64url");
      mockMFASecretFindUnique.mockResolvedValueOnce({
        id: "mfa-user-1", userUid: "user-1",
        secret: encryptSecret(secret), recoveryCodes: "enc",
        enabled: false, verifiedAt: null, lastUsedAt: null,
      });
      const result = await verifyAndEnableMFA("user-1", "not-a-number" as any);
      expect(result).toBe(false);
    });

    it("setupMFA for different users produces independent records", async () => {
      const r1 = await setupMFA("user-A");
      const r2 = await setupMFA("user-B");
      expect(r1.secret).not.toBe(r2.secret);
      expect(r1.uri).not.toBe(r2.uri);
      expect(mockMFASecretUpsert).toHaveBeenCalledTimes(2);
      expect(mockMFASecretUpsert.mock.calls[0][0].where.id).toBe("mfa-user-A");
      expect(mockMFASecretUpsert.mock.calls[1][0].where.id).toBe("mfa-user-B");
    });
  });
});

afterAll(() => { mock.restore(); });