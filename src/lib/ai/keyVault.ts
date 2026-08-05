/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.1 — AI Key Vault
 *
 * طبقة تشفير/فك تشفير مفاتيح API الخاصة بكل شركة.
 *
 * المشكلة التي تحلها:
 *   - جدول `CompanyAIConfig` بيخزّن 4 مفاتيح لكل شركة (chat, invoice, parse, memory)
 *   - التعليقات في schema.prisma بتقول "Encrypted key" لكن الكود كان بيخزنها plaintext
 *   - الملف ده بيوصّل cryptoVault.ts فعلياً بمسار الـ AI keys
 *
 * الاستراتيجية:
 *   - أي مفتاح جديد بيتخزّن مشفّر عبر `encryptSecret()`
 *   - عند القراءة، بنستخدم `tryDecryptSecret()` (graceful fallback)
 *     عشان المفاتيح الـ legacy (plaintext) لسه تشتغل لحد ما تتم إعادة حفظها
 *   - لو المفتاح فاضي، بيرجع فاضي (مفيش حاجة نعملها تشفير)
 *
 * RUNTIME: Node.js only — `cryptoVault.ts` بيستخدم node:crypto
 * ═════════════════════════════════════════════════════════════
 */

import { encryptSecret, tryDecryptSecret, isEncrypted } from "@/lib/cryptoVault";
import { logger } from "@/lib/logger";

/**
 * Encrypt an API key before storing it in the database.
 *
 * Returns the input unchanged if:
 *   - It's empty (no key to encrypt)
 *   - It's already encrypted (idempotent — don't double-encrypt)
 *   - It's a masked value (••••••••) — caller should never pass this; defensive guard
 *
 * Throws if encryption fails (e.g. PAYMENTS_ENC_KEY not set in production).
 */
export function encryptApiKey(plaintext: string): string {
  if (!plaintext || plaintext.length === 0) return "";
  if (plaintext === "••••••••") return ""; // masked placeholder → treat as "no change"
  if (isEncrypted(plaintext)) return plaintext; // already encrypted — idempotent

  try {
    return encryptSecret(plaintext);
  } catch (err) {
    logger.error("[keyVault] encryptApiKey failed — refusing to store plaintext", {
      err: err instanceof Error ? err.message : String(err),
    });
    throw new Error("Failed to encrypt API key — check PAYMENTS_ENC_KEY is set");
  }
}

/**
 * Decrypt an API key for use in an upstream AI call.
 *
 * Returns:
 *   - "" if input is empty
 *   - The plaintext if input is encrypted (normal case)
 *   - The input as-is if it's NOT in encrypted format (legacy plaintext migration)
 *   - "" if decryption fails (corrupted / wrong key) — never return ciphertext
 *
 * The graceful fallback for legacy plaintext is what lets us ship encryption
 * without a separate migration script: existing keys keep working, and any
 * new save re-encrypts them.
 */
export function decryptApiKey(stored: string): string {
  if (!stored || stored.length === 0) return "";

  // Legacy plaintext values that don't match the encrypted-format regex
  // are returned as-is. This is intentional and documented in cryptoVault.ts.
  const decrypted = tryDecryptSecret(stored);
  if (decrypted === null) {
    logger.error("[keyVault] decryptApiKey failed — refusing to use ciphertext as key", {
      storedLength: stored.length,
      // Don't log the value itself — even partial logging is dangerous
    });
    return "";
  }
  return decrypted;
}

/**
 * Mask an API key for display in the UI.
 *
 * Returns "••••••••" if the key is empty or already masked.
 * Otherwise returns first 4 + dots + last 4 characters.
 *
 * Accepts BOTH encrypted and plaintext inputs — decrypts first if needed.
 */
export function maskApiKeyForDisplay(stored: string): string {
  if (!stored || stored.length === 0) return "";
  if (stored === "••••••••") return stored;

  const real = decryptApiKey(stored);
  if (!real || real.length <= 8) return real ? "••••••••" : "";
  return `${real.substring(0, 4)}${"•".repeat(Math.min(real.length - 8, 20))}${real.substring(real.length - 4)}`;
}

/**
 * Check whether a stored value is actually a real key (after decryption),
 * vs. an empty placeholder or masked display value.
 *
 * Useful for `hasApiKey` fields in API responses.
 */
export function hasRealApiKey(stored: string): boolean {
  if (!stored || stored.length === 0) return false;
  if (stored === "••••••••") return false;
  const real = decryptApiKey(stored);
  return !!real && real.length > 0;
}

/**
 * Resolve a "real key" for an update operation.
 *
 * When the founder submits a config update, the UI sends either:
 *   - A new plaintext key (we should encrypt + store)
 *   - The masked placeholder "••••••••" (means "keep the existing key")
 *   - An empty string (means "clear the key")
 *
 * This helper handles all three cases.
 */
export function resolveKeyForUpdate(
  submitted: string,
  existingEncrypted: string
): string {
  // Empty submission → clear the key
  if (!submitted || submitted.length === 0) return "";

  // Masked placeholder → keep the existing (encrypted) value
  if (submitted === "••••••••") return existingEncrypted;

  // Real new key → encrypt it
  return encryptApiKey(submitted);
}
