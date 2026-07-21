// @ts-nocheck
/**
 * secretsManager.test.ts — 30 tests for the secrets management module.
 *
 * Covers: getSecret, generateSecret, getSecretInventory, validateSecrets, rotateSecret.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ── Mock logger ───────────────────────────────────────────────────────────────

mock.module("@/lib/logger", () => ({
  logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
}));

// ── Save/restore env ──────────────────────────────────────────────────────────

const originalEnv = { ...process.env };

beforeEach(() => {
  // Reset env to a clean state
  for (const key of Object.keys(process.env)) {
    if (key !== "PATH" && key !== "HOME" && key !== "NODE_ENV") {
      delete process.env[key];
    }
  }
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  // Restore env
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

// ── Import after mocks ────────────────────────────────────────────────────────

const { getSecret, generateSecret, getSecretInventory, validateSecrets, rotateSecret } = await import("@/lib/secretsManager");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Secrets Manager Module", () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // getSecret — 8 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("getSecret", () => {
    it("returns value when env var is set", () => {
      process.env.JWT_SECRET = "my-super-secret-jwt-key-32-chars-long!";
      const result = getSecret("JWT_SECRET");
      expect(result).toBe("my-super-secret-jwt-key-32-chars-long!");
    });

    it("throws in production for required secret not set", () => {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;
      expect(() => getSecret("JWT_SECRET")).toThrow("FATAL");
      expect(() => getSecret("JWT_SECRET")).toThrow("JWT_SECRET");
    });

    it("returns placeholder in non-production when not set", () => {
      delete process.env.JWT_SECRET;
      const result = getSecret("JWT_SECRET");
      expect(result).toBe("dev-placeholder-jwt_secret");
    });

    it("validates minimum length and throws if too short", () => {
      process.env.JWT_SECRET = "short";
      expect(() => getSecret("JWT_SECRET")).toThrow("at least 32 characters");
    });

    it("returns value when length meets minimum", () => {
      process.env.VALKEY_URL = "redis://localhost:6379";
      const result = getSecret("VALKEY_URL");
      expect(result).toBe("redis://localhost:6379");
    });

    it("does not throw for optional secret not set in non-production", () => {
      delete process.env.VALKEY_URL;
      expect(() => getSecret("VALKEY_URL")).not.toThrow();
    });

    it("does not throw for optional secret not set in production (just warns)", () => {
      process.env.NODE_ENV = "production";
      delete process.env.VALKEY_URL;
      // VALKEY_URL is required=false, so no throw
      expect(() => getSecret("VALKEY_URL")).not.toThrow();
    });

    it("returns dev-placeholder for unknown env key", () => {
      delete process.env.UNKNOWN_KEY;
      const result = getSecret("UNKNOWN_KEY");
      expect(result).toBe("dev-placeholder-unknown_key");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateSecret — 6 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("generateSecret", () => {
    it("returns a string of the requested length", () => {
      const secret = generateSecret(32);
      expect(secret).toHaveLength(32);
    });

    it("returns a string of different length when requested", () => {
      const secret = generateSecret(48);
      expect(secret).toHaveLength(48);
    });

    it("uses default length of 32 when not specified", () => {
      const secret = generateSecret();
      expect(secret).toHaveLength(32);
    });

    it("is base64url safe (no +, /, =)", () => {
      const secret = generateSecret(64);
      expect(secret).not.toContain("+");
      expect(secret).not.toContain("/");
      expect(secret).not.toContain("=");
    });

    it("generates different values on consecutive calls", () => {
      const a = generateSecret(32);
      const b = generateSecret(32);
      expect(a).not.toBe(b);
    });

    it("generates random-looking values (not predictable)", () => {
      const secrets = new Set(Array.from({ length: 20 }, () => generateSecret(32)));
      expect(secrets.size).toBe(20);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getSecretInventory — 6 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("getSecretInventory", () => {
    it("lists all defined secrets", () => {
      const inventory = getSecretInventory();
      const keys = inventory.map((s) => s.envKey);
      expect(keys).toContain("JWT_SECRET");
      expect(keys).toContain("JWT_REFRESH_SECRET");
      expect(keys).toContain("PAYMENTS_ENC_KEY");
      expect(keys).toContain("DATABASE_URL");
      expect(keys).toContain("VALKEY_URL");
      expect(keys).toContain("OPENROUTER_API_KEY");
    });

    it("masks values (never shows actual secret)", () => {
      process.env.JWT_SECRET = "my-real-jwt-secret-value-32-chars!";
      const inventory = getSecretInventory();
      const jwt = inventory.find((s) => s.envKey === "JWT_SECRET")!;
      expect(jwt).toBeDefined();
      // Inventory should not contain the actual secret value
      expect(JSON.stringify(jwt)).not.toContain("my-real-jwt-secret-value");
    });

    it("shows isSet=false when secret not set", () => {
      delete process.env.JWT_SECRET;
      const inventory = getSecretInventory();
      const jwt = inventory.find((s) => s.envKey === "JWT_SECRET")!;
      expect(jwt.isSet).toBe(false);
    });

    it("shows isSet=true when secret is set", () => {
      process.env.JWT_SECRET = "a".repeat(32);
      const inventory = getSecretInventory();
      const jwt = inventory.find((s) => s.envKey === "JWT_SECRET")!;
      expect(jwt.isSet).toBe(true);
    });

    it("shows isSet=false for dev-placeholder values", () => {
      delete process.env.JWT_SECRET;
      const inventory = getSecretInventory();
      const jwt = inventory.find((s) => s.envKey === "JWT_SECRET")!;
      expect(jwt.isSet).toBe(false);
    });

    it("shows correct required status", () => {
      const inventory = getSecretInventory();
      const jwt = inventory.find((s) => s.envKey === "JWT_SECRET")!;
      const valkey = inventory.find((s) => s.envKey === "VALKEY_URL")!;
      expect(jwt.required).toBe(true);
      expect(valkey.required).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validateSecrets — 6 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("validateSecrets", () => {
    it("returns ok=true when all required secrets are set in production", () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = "a".repeat(32);
      process.env.JWT_REFRESH_SECRET = "b".repeat(32);
      process.env.PAYMENTS_ENC_KEY = "c".repeat(32);
      process.env.DATABASE_URL = "file:./dev.db";
      const result = validateSecrets();
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns errors for missing required secrets in production", () => {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;
      delete process.env.JWT_REFRESH_SECRET;
      delete process.env.PAYMENTS_ENC_KEY;
      delete process.env.DATABASE_URL;
      const result = validateSecrets();
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns warnings for missing required secrets in non-production", () => {
      delete process.env.JWT_SECRET;
      const result = validateSecrets();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("JWT_SECRET");
    });

    it("returns error for too-short secret", () => {
      process.env.JWT_SECRET = "short";
      const result = validateSecrets();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("too short"))).toBe(true);
    });

    it("does not error for missing optional secrets", () => {
      delete process.env.VALKEY_URL;
      delete process.env.OPENROUTER_API_KEY;
      process.env.JWT_SECRET = "a".repeat(32);
      process.env.JWT_REFRESH_SECRET = "b".repeat(32);
      process.env.PAYMENTS_ENC_KEY = "c".repeat(32);
      process.env.DATABASE_URL = "file:./dev.db";
      const result = validateSecrets();
      expect(result.errors).toHaveLength(0);
    });

    it("returns ok=false with error details for short secret", () => {
      process.env.JWT_SECRET = "too-short";
      const result = validateSecrets();
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("JWT_SECRET");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // rotateSecret — 4 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("rotateSecret", () => {
    it("generates a new secret of correct length for known key", () => {
      const secret = rotateSecret("JWT_SECRET");
      expect(secret).toHaveLength(32); // JWT_SECRET minLength = 32
    });

    it("generates a new secret of correct length for DATABASE_URL", () => {
      const secret = rotateSecret("DATABASE_URL");
      expect(secret).toHaveLength(10); // DATABASE_URL minLength = 10
    });

    it("generates different values on consecutive calls", () => {
      const a = rotateSecret("JWT_SECRET");
      const b = rotateSecret("JWT_SECRET");
      expect(a).not.toBe(b);
    });

    it("returns default length 32 for unknown key", () => {
      const secret = rotateSecret("UNKNOWN_KEY");
      expect(secret).toHaveLength(32);
    });
  });
});