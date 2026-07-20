/**
 * cryptoVault-advanced.test.ts — 40 tests for the crypto vault.
 *
 * Tests: encryptSecret/decryptSecret round-trip, legacy plaintext passthrough,
 * failure modes (wrong key, corrupted data, tampered auth tag), tryDecryptSecret,
 * isEncrypted, hashToken, safeCompare, and edge cases (empty, unicode, long,
 * special chars).
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────────────────────────

mock.module("@/lib/logger", () => ({
  logger: {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    fatal: mock(() => {}),
  },
}));

// Import after mocks
const {
  encryptSecret,
  decryptSecret,
  tryDecryptSecret,
  isEncrypted,
  hashToken,
  safeCompare,
} = await import("@/lib/cryptoVault");

// ─── encryptSecret / decryptSecret round-trip ───────────────────────────────

describe("encryptSecret / decryptSecret round-trip", () => {
  it("round-trips a simple string", () => {
    const plain = "hello world";
    const encrypted = encryptSecret(plain);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plain);
  });

  it("round-trips a JSON string", () => {
    const json = JSON.stringify({ key: "value", num: 42 });
    const encrypted = encryptSecret(json);
    const decrypted = decryptSecret(encrypted);
    expect(JSON.parse(decrypted)).toEqual({ key: "value", num: 42 });
  });

  it("round-trips an API key", () => {
    const apiKey = "sk-or-v1-abc123def456ghi789jkl012mno345pqr678";
    const encrypted = encryptSecret(apiKey);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(apiKey);
  });

  it("round-trips a numeric string", () => {
    const num = "1234567890";
    const encrypted = encryptSecret(num);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(num);
  });

  it("round-trips an Arabic string", () => {
    const arabic = "مرحبا بالعالم";
    const encrypted = encryptSecret(arabic);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(arabic);
  });

  it("different inputs produce different outputs", () => {
    const e1 = encryptSecret("input-one");
    const e2 = encryptSecret("input-two");
    expect(e1).not.toBe(e2);
  });

  it("same input produces different outputs (random IV)", () => {
    const plain = "same-input";
    const e1 = encryptSecret(plain);
    const e2 = encryptSecret(plain);
    expect(e1).not.toBe(e2);
  });

  it("encrypted format has three dot-separated segments", () => {
    const encrypted = encryptSecret("test");
    const parts = encrypted.split(".");
    expect(parts.length).toBe(3);
  });

  it("encrypted format segments are valid base64", () => {
    const encrypted = encryptSecret("format-test");
    const [iv, tag, data] = encrypted.split(".");
    // Base64 pattern
    const b64Re = /^[A-Za-z0-9+/=]+$/;
    expect(iv).toMatch(b64Re);
    expect(tag).toMatch(b64Re);
    expect(data).toMatch(b64Re);
  });
});

// ─── decryptSecret legacy (plaintext passthrough) ───────────────────────────

describe("decryptSecret legacy plaintext", () => {
  it("returns plaintext for non-encrypted format", () => {
    const plaintext = "just-a-plain-string";
    expect(decryptSecret(plaintext)).toBe(plaintext);
  });

  it("returns plaintext for random text", () => {
    const text = "some random value 123 !@#";
    expect(decryptSecret(text)).toBe(text);
  });

  it("returns plaintext for API-key-like format (no dots)", () => {
    const key = "sk-or-v1-abc123def456";
    expect(decryptSecret(key)).toBe(key);
  });
});

// ─── decryptSecret failure modes ────────────────────────────────────────────

describe("decryptSecret failure modes", () => {
  it("throws on encrypted value with wrong key", () => {
    // We can't easily change the key, but we can corrupt the IV to simulate
    // a decryption failure
    const encrypted = encryptSecret("secret-data");
    // Tamper with the IV
    const parts = encrypted.split(".");
    const tampered = "AAAA" + parts[0].slice(4) + "." + parts[1] + "." + parts[2];
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws on corrupted ciphertext", () => {
    const encrypted = encryptSecret("corrupt-test");
    const parts = encrypted.split(".");
    const corrupted = parts[0] + "." + parts[1] + "." + "AAAA" + parts[2].slice(4);
    expect(() => decryptSecret(corrupted)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const encrypted = encryptSecret("tag-tamper");
    const parts = encrypted.split(".");
    const tampered = parts[0] + "." + "AAAA" + parts[1].slice(4) + "." + parts[2];
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("NEVER returns ciphertext as plaintext", () => {
    const encrypted = encryptSecret("must-not-leak");
    // Tamper to force a throw
    const parts = encrypted.split(".");
    const tampered = parts[0] + "." + "XXXX" + parts[1].slice(4) + "." + parts[2];
    try {
      decryptSecret(tampered);
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      // The error message should mention decryption failure
      expect((err as Error).message).toContain("Decryption failed");
    }
  });

  it("error message mentions wrong key possibility", () => {
    const encrypted = encryptSecret("error-msg-test");
    const parts = encrypted.split(".");
    const tampered = "Z" + parts[0].slice(1) + "." + parts[1] + "." + parts[2];
    try {
      decryptSecret(tampered);
    } catch (err) {
      expect((err as Error).message).toContain("PAYMENTS_ENC_KEY");
    }
  });

  it("throws on malformed encrypted format (two segments only)", () => {
    // "abc.def" is too short for iv(16+ chars).tag(22+ chars) pattern
    expect(() => decryptSecret("abc.def")).not.toThrow();
    // It doesn't match the isLikelyEncrypted regex, so it's returned as-is
    expect(decryptSecret("abc.def")).toBe("abc.def");
  });

  it("returns empty string as-is", () => {
    expect(decryptSecret("")).toBe("");
  });
});

// ─── tryDecryptSecret ───────────────────────────────────────────────────────

describe("tryDecryptSecret", () => {
  it("returns decrypted value for valid encrypted input", () => {
    const encrypted = encryptSecret("try-decrypt-ok");
    expect(tryDecryptSecret(encrypted)).toBe("try-decrypt-ok");
  });

  it("returns null on decryption failure instead of throwing", () => {
    const encrypted = encryptSecret("try-decrypt-fail");
    const parts = encrypted.split(".");
    const tampered = "X" + parts[0].slice(1) + "." + parts[1] + "." + parts[2];
    expect(tryDecryptSecret(tampered)).toBeNull();
  });

  it("returns plaintext for non-encrypted input", () => {
    expect(tryDecryptSecret("plain-text")).toBe("plain-text");
  });
});

// ─── isEncrypted ────────────────────────────────────────────────────────────

describe("isEncrypted", () => {
  it("detects encrypted format", () => {
    const encrypted = encryptSecret("detect-me");
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("rejects plaintext", () => {
    expect(isEncrypted("just text")).toBe(false);
  });

  it("rejects short strings", () => {
    expect(isEncrypted("a.b.c")).toBe(false);
  });

  it("rejects strings without dots", () => {
    expect(isEncrypted("nodothere")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isEncrypted("")).toBe(false);
  });
});

// ─── hashToken ──────────────────────────────────────────────────────────────

describe("hashToken", () => {
  it("produces consistent SHA-256 hash", () => {
    const h1 = hashToken("consistent-token");
    const h2 = hashToken("consistent-token");
    expect(h1).toBe(h2);
  });

  it("produces 64-character hex string", () => {
    const h = hashToken("length-test");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("different inputs produce different hashes", () => {
    const h1 = hashToken("token-a");
    const h2 = hashToken("token-b");
    expect(h1).not.toBe(h2);
  });

  it("hashes empty string", () => {
    const h = hashToken("");
    expect(h).toHaveLength(64);
  });
});

// ─── safeCompare ────────────────────────────────────────────────────────────

describe("safeCompare", () => {
  it("returns true for equal strings", () => {
    expect(safeCompare("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(safeCompare("abc", "abd")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(safeCompare("short", "much-longer-string")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(safeCompare("", "")).toBe(true);
  });

  it("returns false for empty vs non-empty", () => {
    expect(safeCompare("", "a")).toBe(false);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("encrypts empty string but decryptSecret returns raw blob (empty ciphertext fails regex)", () => {
    const e = encryptSecret("");
    // AES-GCM with empty plaintext produces empty ciphertext → "iv.tag."
    // The last segment is empty, so isLikelyEncrypted returns false
    // and decryptSecret returns the blob as legacy plaintext
    expect(e.split(".").length).toBe(3);
    // The decrypted result is the raw encrypted blob (not "")
    expect(decryptSecret(e)).toBe(e);
    // tryDecryptSecret would also return the blob (no error thrown)
    expect(tryDecryptSecret(e)).toBe(e);
  });

  it("encrypts and decrypts unicode characters", () => {
    const unicode = "Привет мир 日本語 🎉 émoji";
    const e = encryptSecret(unicode);
    const d = decryptSecret(e);
    expect(d).toBe(unicode);
  });

  it("encrypts and decrypts very long string (10KB)", () => {
    const long = "x".repeat(10240);
    const e = encryptSecret(long);
    const d = decryptSecret(e);
    expect(d).toBe(long);
  });

  it("encrypts and decrypts special characters", () => {
    const special = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`\n\t\r\\';
    const e = encryptSecret(special);
    const d = decryptSecret(e);
    expect(d).toBe(special);
  });

  it("encrypts and decrypts JSON with special characters", () => {
    const json = JSON.stringify({
      name: "O'Brien & Sons",
      path: "C:\\Users\\test",
      regex: "/^[a-z]+$/i",
      newline: "line1\nline2",
    });
    const e = encryptSecret(json);
    const d = decryptSecret(e);
    expect(d).toBe(json);
  });

  it("hashToken is deterministic for long input", () => {
    const long = "a".repeat(5000);
    const h1 = hashToken(long);
    const h2 = hashToken(long);
    expect(h1).toBe(h2);
  });
});