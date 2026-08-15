/**
 * Tests for src/lib/ai/keyVault.ts
 *
 * Covers:
 *   - encryptApiKey / decryptApiKey round-trip
 *   - Idempotency (encrypting an already-encrypted value returns it unchanged)
 *   - Legacy plaintext graceful migration (decrypt returns plaintext as-is)
 *   - Empty string handling
 *   - Masked placeholder rejection
 *   - maskApiKeyForDisplay
 *   - hasRealApiKey
 *   - resolveKeyForUpdate (all 3 cases: new, masked, empty)
 */

import { describe, it, expect, beforeAll } from "bun:test";
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKeyForDisplay,
  hasRealApiKey,
  resolveKeyForUpdate,
} from "../keyVault";

// Set a 32+ char test encryption key for the vault
beforeAll(() => {
  if (!process.env.PAYMENTS_ENC_KEY) {
    process.env.PAYMENTS_ENC_KEY =
      "test-encryption-key-for-vault-tests-32chars!";
  }
});

describe("keyVault — encryptApiKey", () => {
  it("encrypts a plaintext key", () => {
    const plaintext = "sk-or-v1-test-1234567890abcdef";
    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.length).toBeGreaterThan(plaintext.length);
    // Encrypted format: iv.tag.ciphertext (base64 segments)
    expect(encrypted.split(".")).toHaveLength(3);
  });

  it("returns empty string for empty input", () => {
    expect(encryptApiKey("")).toBe("");
  });

  it("is idempotent — encrypting an already-encrypted value returns it unchanged", () => {
    const plaintext = "sk-test-key-for-idempotency-check";
    const encrypted1 = encryptApiKey(plaintext);
    const encrypted2 = encryptApiKey(encrypted1);
    expect(encrypted2).toBe(encrypted1);
  });

  it("rejects masked placeholder (returns empty)", () => {
    expect(encryptApiKey("••••••••")).toBe("");
  });
});

describe("keyVault — decryptApiKey", () => {
  it("round-trips: encrypt then decrypt returns original", () => {
    const plaintext = "sk-or-v1-round-trip-test-key-12345";
    const encrypted = encryptApiKey(plaintext);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("returns empty for empty input", () => {
    expect(decryptApiKey("")).toBe("");
  });

  it("returns legacy plaintext as-is (graceful migration)", () => {
    // A legacy plaintext key that doesn't match the encrypted-format regex
    // (no dots separating base64 segments) should be returned unchanged.
    const legacy = "sk-legacy-plaintext-key-no-dots-here";
    const decrypted = decryptApiKey(legacy);
    expect(decrypted).toBe(legacy);
  });

  it("returns empty for corrupted encrypted value (refuses to leak ciphertext)", () => {
    // Take a real encrypted value and tamper with the auth tag segment.
    // This passes the format regex (looks encrypted) but GCM auth tag
    // verification will fail — we must NEVER return the ciphertext.
    const real = encryptApiKey("sk-real-key-for-tamper-test-12345");
    const [iv, _tag, data] = real.split(".");
    // Flip the first char of the tag to a different valid base64 char
    const tamperedTag = "Z" + _tag.slice(1);
    const tampered = `${iv}.${tamperedTag}.${data}`;
    const decrypted = decryptApiKey(tampered);
    expect(decrypted).toBe("");
  });

  it("returns empty for masked placeholder (BUG 11 fix)", () => {
    // The masked display placeholder "••••••••" should NEVER be returned as
    // a real key — if it ever lands in the DB (migration bug, direct edit),
    // sending it upstream as a Bearer token would 401 on every call.
    expect(decryptApiKey("••••••••")).toBe("");
  });
});

describe("keyVault — maskApiKeyForDisplay", () => {
  it("masks an encrypted key correctly", () => {
    const plaintext = "sk-or-v1-1234567890abcdef-XYZ";
    const encrypted = encryptApiKey(plaintext);
    const masked = maskApiKeyForDisplay(encrypted);
    // Should show first 4 + dots + last 4
    expect(masked).toContain("sk-o");
    expect(masked).toContain("-XYZ");
    expect(masked).toContain("•");
  });

  it("returns empty for empty input", () => {
    expect(maskApiKeyForDisplay("")).toBe("");
  });

  it("returns the masked placeholder unchanged", () => {
    expect(maskApiKeyForDisplay("••••••••")).toBe("••••••••");
  });

  it("handles short keys (returns masked placeholder)", () => {
    const short = "sk-ab";
    expect(maskApiKeyForDisplay(short)).toBe("••••••••");
  });
});

describe("keyVault — hasRealApiKey", () => {
  it("returns true for an encrypted real key", () => {
    const encrypted = encryptApiKey("sk-real-key-12345");
    expect(hasRealApiKey(encrypted)).toBe(true);
  });

  it("returns true for legacy plaintext key", () => {
    expect(hasRealApiKey("sk-legacy-plaintext-key-no-dots")).toBe(true);
  });

  it("returns false for empty", () => {
    expect(hasRealApiKey("")).toBe(false);
  });

  it("returns false for masked placeholder", () => {
    expect(hasRealApiKey("••••••••")).toBe(false);
  });

  it("returns false for corrupted encrypted value", () => {
    const real = encryptApiKey("sk-real-key-for-tamper-test-67890");
    const [iv, _tag, data] = real.split(".");
    const tamperedTag = "Z" + _tag.slice(1);
    const tampered = `${iv}.${tamperedTag}.${data}`;
    expect(hasRealApiKey(tampered)).toBe(false);
  });
});

describe("keyVault — resolveKeyForUpdate", () => {
  it("returns empty when submitted is empty (clear the key)", () => {
    const existing = encryptApiKey("sk-old-key-12345");
    expect(resolveKeyForUpdate("", existing)).toBe("");
  });

  it("preserves existing key when submitted is masked placeholder", () => {
    const existing = encryptApiKey("sk-old-key-12345");
    const result = resolveKeyForUpdate("••••••••", existing);
    expect(result).toBe(existing);
  });

  it("encrypts a new plaintext key", () => {
    const existing = encryptApiKey("sk-old-key-12345");
    const newKey = "sk-new-key-67890";
    const result = resolveKeyForUpdate(newKey, existing);
    expect(result).not.toBe(existing);
    expect(result).not.toBe(newKey);
    // Should be in encrypted format
    expect(result.split(".")).toHaveLength(3);
    // And should round-trip back to the new key
    expect(decryptApiKey(result)).toBe(newKey);
  });
});
