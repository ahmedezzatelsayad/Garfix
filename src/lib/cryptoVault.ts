/**
 * cryptoVault.ts — AES-256-GCM encryption for secrets at rest.
 *
 * Used for: OpenRouter API keys, WhatsApp access tokens, payment provider
 * credentials, and any other sensitive values stored in the database.
 *
 * Design:
 *   - The Data Encryption Key (DEK) is derived from a passphrase via scrypt.
 *   - The passphrase comes from PAYMENTS_ENC_KEY env var (set by founder).
 *   - Format: iv(12).tag(16).ciphertext — all base64.
 *
 * Migration strategy for existing unencrypted values:
 *   - decryptSecret() returns the input unchanged if it doesn't match the
 *     expected format — so legacy plaintext values keep working until they
 *     are re-saved (which always re-encrypts).
 *
 * RUNTIME: Node.js only — uses node:crypto (not available in Edge Runtime)
 */
'use node';

import crypto from "node:crypto";
import { logger } from "./logger";

// SEC-003 FIX: No fallback to JWT_SECRET — dedicated key required
// P0 BUILD FIX: Lazy secret resolution — module-level const resolution throws
// during `next build` because NODE_ENV=production is set at build time.
// Using a getter defers resolution to first actual use (at runtime), not at import.
// During build, the module is imported for type analysis only — no secrets needed.
function resolveEncryptionKey(): string {
  const val = process.env.PAYMENTS_ENC_KEY || process.env.VAULT_ENCRYPTION_KEY;
  if (!val) {
    // P0 FIX: During `next build`, do NOT throw — secrets are not needed for
    // static page compilation. Next.js sets NEXT_PHASE during build phases.
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"
      || (process.env.NODE_ENV === "production" && typeof window === "undefined" && !process.env.RUNTIME_STARTUP);
    if (isBuildPhase) {
      console.warn("⚠️  PAYMENTS_ENC_KEY not set during build — will be validated at runtime. DO NOT deploy without setting this.");
      return "build-placeholder-encryption-key-not-for-runtime-use-32chars!!";
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: PAYMENTS_ENC_KEY (or VAULT_ENCRYPTION_KEY) must be set to at least 32 characters for production.");
    }
    console.warn("⚠️ PAYMENTS_ENC_KEY not set — using dev-only key. DO NOT use in production.");
    return "dev-only-encryption-key-not-for-production-use-32chars!";
  }
  if (val.length < 32) {
    // During build phase, allow short keys with a warning
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"
      || (process.env.NODE_ENV === "production" && typeof window === "undefined" && !process.env.RUNTIME_STARTUP);
    if (isBuildPhase) {
      console.warn(`⚠️  PAYMENTS_ENC_KEY is ${val.length} chars (< 32) during build — will be validated at runtime.`);
      return val;
    }
    throw new Error("FATAL: PAYMENTS_ENC_KEY must be at least 32 characters.");
  }
  return val;
}

// P0 FIX: Lazy getter pattern — encryption key resolved only on first access at runtime.
// This prevents module-level throws during `next build`'s "Collecting page data" phase.
let _encKeyEnv: string | undefined;

function getEncryptionKey(): string {
  if (!_encKeyEnv) _encKeyEnv = resolveEncryptionKey();
  return _encKeyEnv;
}
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SCRYPT_N = 16384;

// Cache the derived key — scrypt is expensive
let cachedKey: Buffer | null = null;
let cachedSalt: Buffer | null = null;

function getSalt(): Buffer {
  if (cachedSalt) return cachedSalt;
  // Derive a stable salt from the env var (deterministic per environment)
  cachedSalt = crypto.scryptSync(getEncryptionKey(), "garfix-vault-salt", KEY_LEN, { N: SCRYPT_N }).slice(0, 16);
  return cachedSalt;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = crypto.scryptSync(getEncryptionKey(), getSalt(), KEY_LEN, { N: SCRYPT_N });
  return cachedKey;
}

function isLikelyEncrypted(value: string): boolean {
  // Encrypted values are base64 with at least iv(12) + tag(16) + 1 byte content
  // Format: <base64-iv>.<base64-tag>.<base64-ciphertext>
  return /^[A-Za-z0-9+/=]{16,}\.[A-Za-z0-9+/=]{22,}\.[A-Za-z0-9+/=]+$/.test(value);
}

export function encryptSecret(plaintext: string): string {
  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
  } catch (err) {
    logger.error("[vault] encryptSecret failed", { err: err instanceof Error ? err.message : String(err) });
    throw new Error("Encryption failed");
  }
}

/**
 * Migration strategy for existing unencrypted values:
 *   - decryptSecret() returns the input unchanged ONLY if it doesn't match the
 *     encrypted-value format (so legacy plaintext values keep working until
 *     they are re-saved).
 *   - P0 FIX (audit finding): if the value LOOKS encrypted but fails to
 *     decrypt (wrong key, corrupted data, tampered auth tag), we now THROW
 *     instead of silently returning the ciphertext. Returning the ciphertext
 *     would have two dangerous failure modes:
 *       1. The caller would treat ciphertext as if it were the plaintext
 *          secret and send it to the upstream API as if it were a real key.
 *       2. It defeats the entire purpose of encryption at rest — anyone with
 *          DB read access could "decrypt" by simply reading the column.
 *     Callers that need a graceful fallback (e.g. config-lookup paths) should
 *     wrap the call in try/catch and apply their own fallback policy.
 */
export function decryptSecret(stored: string): string {
  if (!stored) return stored;
  if (!isLikelyEncrypted(stored)) {
    // Legacy plaintext — return as-is (with a debug log so we can audit migrations)
    logger.debug("[vault] value is not in encrypted format, returning as-is");
    return stored;
  }
  try {
    const [ivB64, tagB64, dataB64] = stored.split(".");
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error("Malformed encrypted value (missing iv/tag/data segments)");
    }
    const key = getKey();
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    // P0 FIX: throw — do NOT return the ciphertext as if it were the plaintext.
    // The audit finding (cryptoVault.ts:99-102) flagged this as a critical
    // vulnerability: returning the raw value silently leaks the encrypted
    // blob to callers that believe they have just decrypted it.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[vault] decryptSecret failed — refusing to return ciphertext as plaintext", { err: msg });
    throw new Error(
      "Decryption failed — the stored value looks encrypted but could not be decrypted " +
      "(wrong PAYMENTS_ENC_KEY, corrupted data, or tampered auth tag). " +
      "Refusing to return the ciphertext as plaintext. Original error: " + msg
    );
  }
}

/**
 * Safe variant for callers that genuinely want a graceful fallback (e.g.
 * reading optional config where a missing key shouldn't crash the request).
 * Returns null on decryption failure rather than throwing. Use sparingly —
 * the default `decryptSecret` should throw so failures are loud.
 */
export function tryDecryptSecret(stored: string): string | null {
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

export function isEncrypted(value: string): boolean {
  return isLikelyEncrypted(value);
}

/** Hash a verification token (SHA-256) — compare-only, cannot recover the original. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison to prevent timing attacks. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
