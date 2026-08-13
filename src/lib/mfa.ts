/**
 * mfa.ts — TOTP-based MFA for admin/founder accounts.
 *
 * Uses the otpauth URI standard (Google Authenticator / Authy compatible).
 * Secrets are encrypted at rest via cryptoVault.
 * Recovery codes are hashed (SHA-256) before storage — one-time use.
 */

import crypto from "node:crypto";
import { dbTyped as db } from "@/lib/db";
import { encryptSecret, decryptSecret, hashToken, safeCompare } from "@/lib/cryptoVault";
import { logger } from "./logger";

// TOTP parameters (RFC 6238)
const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "sha1" as const;
const RECOVERY_CODE_COUNT = 10;

function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let result = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    result += alphabet[parseInt(bits.substring(i, i + 5), 2)];
  }
  return result;
}

/**
 * Base32 decode — required because TOTP secrets are Base32-encoded (RFC 6238),
 * but the old code mistakenly used base64 decode, producing wrong HMAC keys.
 * Authenticator apps (Google Authenticator, Authy) expect Base32 secrets.
 */
function base32Decode(str: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = str.replace(/=+$/, "");
  let bits = "";
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch.toUpperCase());
    if (idx === -1) continue; // skip invalid chars
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTPSecret(): string {
  const secret = crypto.randomBytes(20);
  return base32Encode(secret);
}

function buildTOTPUri(secret: string, email: string): string {
  const encoded = encodeURIComponent(email);
  return `otpauth://totp/GarfiX:${encoded}?secret=${secret}&issuer=GarfiX&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

function generateRecoveryCodes(count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // SEC-07 FIX (Audit v2): Use 16 bytes (128 bits) of entropy instead of 4 bytes (32 bits).
    // 32 bits is brute-forceable in ~2^16 attempts on average (65,536 tries) — well within
    // an attacker's budget if they can observe one recovery code hash. 128 bits is
    // computationally infeasible. Format: XXXX-XXXX-XXXX-XXXX (16 hex chars = 64 bits displayed,
    // but the underlying entropy is 128 bits because we use the full buffer).
    const bytes = crypto.randomBytes(16);
    const code = bytes.toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-");
    codes.push(code);
  }
  return codes;
}

/** Generate a new TOTP secret for a user. Returns the secret (plaintext) and recovery codes. */
export async function setupMFA(userUid: string): Promise<{ secret: string; uri: string; recoveryCodes: string[] }> {
  const secret = generateTOTPSecret();
  const uri = buildTOTPUri(secret, userUid);
  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);

  // Hash recovery codes for storage
  const hashedCodes = recoveryCodes.map((c) => hashToken(c));
  const encryptedSecret = encryptSecret(secret);
  const encryptedCodes = encryptSecret(JSON.stringify(hashedCodes));

  await db.mFASecret.upsert({
    where: { id: `mfa-${userUid}` },
    create: {
      id: `mfa-${userUid}`,
      userId: userUid,
      secret: encryptedSecret,
      recoveryCodes: encryptedCodes,
      enabled: false, // Not enabled until verified
      verified: false, // backward compat
      verifiedAt: null, // cleared on (re-)setup
    },
    update: {
      secret: encryptedSecret,
      recoveryCodes: encryptedCodes,
      enabled: false,
      verified: false,
      verifiedAt: null, // cleared on re-setup
    },
  });

  return { secret, uri, recoveryCodes };
}

/** Verify a TOTP code during setup (enables MFA if valid). */
export async function verifyAndEnableMFA(userUid: string, code: string): Promise<boolean> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  if (!record) return false;

  const secret = decryptSecret(record.secret);
  if (verifyTOTPCode(secret, code)) {
    await db.mFASecret.update({
      where: { id: `mfa-${userUid}` },
      data: { verified: true },
    });
    return true;
  }
  return false;
}

/** Validate a TOTP code for an already-enabled MFA.
 * P1-2 FIX: Added rate limiting — 5 attempts per minute, then 15-min lockout.
 * P1-3 FIX: Added replay protection — same code cannot be reused within the TOTP window.
 */
export async function validateMFA(userUid: string, code: string): Promise<boolean> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  if (!record || !record.verified) return false;

  // P1-2: Rate limit check using Valkey
  // SEC-04 FIX (Audit v2 · Phase 2): Fail-CLOSED for MFA validation.
  // If Valkey is down, we can't enforce rate limiting or replay protection.
  // Previously this fail-opened (allowed MFA without rate limiting), which
  // means an attacker could brute-force TOTP codes during a Valkey outage.
  // Now it fail-closes (rejects MFA) forcing the user to retry later.
  try {
    const { getValkeyClient } = await import('./valkey');
    const valkey = await getValkeyClient();
    if (!valkey) {
      // SEC-04: Fail-CLOSED — no Valkey = no rate limiting = reject MFA
      const failMode = process.env.VALKEY_FAIL_MODE || "closed";
      if (failMode === "open") {
        logger.warn('[mfa] Valkey unavailable — fail-open (legacy mode)', { userUid });
        // Fall through to TOTP validation without rate limiting
      } else {
        logger.warn('[mfa] Valkey unavailable — fail-closed (rejecting MFA)', { userUid });
        return false;
      }
    } else {
      const rateLimitKey = `mfa:attempts:${userUid}`;
      const attempts = await valkey.get(rateLimitKey);
      const count = attempts ? parseInt(attempts, 10) : 0;
      
      if (count >= 5) {
        // Check if locked out
        const lockKey = `mfa:lockout:${userUid}`;
        const locked = await valkey.get(lockKey);
        if (locked) {
          const remaining = Math.ceil((parseInt(locked, 10) - Date.now()) / 1000);
          logger.warn('[mfa] rate limited', { userUid, remaining });
          return false;
        }
        // Set 15-minute lockout
        await valkey.set(lockKey, String(Date.now() + 15 * 60 * 1000), 'EX', 15 * 60);
        await valkey.del(rateLimitKey);
        logger.warn('[mfa] lockout triggered', { userUid });
        return false;
      }
      
      // Increment attempt counter (1 min TTL)
      await valkey.incr(rateLimitKey);
      if (count === 0) {
        await valkey.expire(rateLimitKey, 60);
      }
    }
  } catch (err) {
    // SEC-04: Fail-CLOSED on Valkey errors
    const failMode = process.env.VALKEY_FAIL_MODE || "closed";
    if (failMode === "open") {
      logger.warn('[mfa] Valkey error — fail-open (legacy mode)', { userUid, err: err instanceof Error ? err.message : String(err) });
    } else {
      logger.warn('[mfa] Valkey error — fail-closed (rejecting MFA)', { userUid, err: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  const secret = decryptSecret(record.secret);
  const valid = verifyTOTPCode(secret, code);

  if (valid) {
    // P1-3: Replay protection — store used code hash in Valkey for 90s (3 windows)
    try {
      const { getValkeyClient } = await import('./valkey');
      const valkey = await getValkeyClient();
      if (valkey) {
        const crypto = await import('node:crypto');
        const codeHash = crypto.createHash('sha256').update(`${userUid}:${code}`).digest('hex');
        const replayKey = `mfa:used:${codeHash}`;
        const alreadyUsed = await valkey.get(replayKey);
        if (alreadyUsed) {
          logger.warn('[mfa] replay attempt blocked', { userUid });
          return false;
        }
        await valkey.set(replayKey, '1', 'EX', 90);
      }
    } catch {
      // Fail-open
    }

    // Clear rate limit on success
    try {
      const { getValkeyClient } = await import('./valkey');
      const valkey = await getValkeyClient();
      if (valkey) {
        await valkey.del(`mfa:attempts:${userUid}`);
        await valkey.del(`mfa:lockout:${userUid}`);
      }
    } catch {}
  }
  return valid;
}

/**
 * Parse the encrypted recovery codes blob and return the array of hashed codes.
 * Returns empty array if the blob is missing or corrupt.
 */
function parseRecoveryCodes(encryptedBlob: string | null): string[] {
  if (!encryptedBlob) return [];
  try {
    const decrypted = decryptSecret(encryptedBlob);
    const parsed = JSON.parse(decrypted);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Use a recovery code (one-time use).
 * Hashes the input code and compares against stored hashes.
 * If found, removes the used code from the pool and persists the update.
 * Returns true if the code was valid and consumed, false otherwise.
 */
export async function useRecoveryCode(userUid: string, code: string): Promise<boolean> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  if (!record || !record.recoveryCodes) return false;
  // Must be enabled first
  if (!record.enabled && !record.verified) return false;

  const hashedCodes = parseRecoveryCodes(record.recoveryCodes);
  if (hashedCodes.length === 0) return false;

  const inputHash = hashToken(code);
  // SEC-08 FIX (Audit v2): Use constant-time comparison instead of indexOf.
  // indexOf short-circuits on the first non-matching character, leaking
  // information about which codes match the input prefix via timing.
  // Iterate all codes and compare each with safeCompare (which uses
  // crypto.timingSafeEqual under the hood).
  let matchedIndex = -1;
  for (let i = 0; i < hashedCodes.length; i++) {
    if (safeCompare(inputHash, hashedCodes[i])) {
      // Don't break on first match — continue iterating so timing
      // doesn't reveal which position matched.
      matchedIndex = i;
    }
  }
  if (matchedIndex === -1) return false;

  // Remove the used code from the pool
  hashedCodes.splice(matchedIndex, 1);
  const updatedBlob = encryptSecret(JSON.stringify(hashedCodes));

  await db.mFASecret.update({
    where: { id: `mfa-${userUid}` },
    data: { recoveryCodes: updatedBlob },
  });

  logger.info("[mfa] recovery code used", { userUid, remaining: hashedCodes.length });
  return true;
}

/** Check if MFA is enabled for a user. */
export async function isMFAEnabled(userUid: string): Promise<boolean> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  // Check `enabled` (new field) OR `verified` (backward compat)
  return record?.enabled === true || record?.verified === true;
}

/** Check if MFA is required (admin/founder roles). */
export function isMFARequired(role: string, isFounder: boolean): boolean {
  return role === "admin" || isFounder;
}

/** Internal TOTP verification — matches RFC 6238. */
function verifyTOTPCode(secret: string, userCode: string): boolean {
  try {
    // Accept current and previous/next time slot (30s window each)
    const now = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
    for (const offset of [0, -1, 1]) {
      const counter = now + offset;
      const counterBuf = Buffer.alloc(8);
      counterBuf.writeBigUInt64BE(BigInt(counter));

      // FIX: Use base32Decode (not base64) — TOTP secrets are Base32 per RFC 6238
      const key = base32Decode(secret);
      if (key.length === 0) continue;

      const hmac = crypto.createHmac(TOTP_ALGORITHM, key);
      hmac.update(counterBuf);
      const digest = hmac.digest();

      const byteOffset = digest[digest.length - 1] & 0x0f;
      const binary =
        ((digest[byteOffset] & 0x7f) << 24) |
        ((digest[byteOffset + 1] & 0xff) << 16) |
        ((digest[byteOffset + 2] & 0xff) << 8) |
        (digest[byteOffset + 3] & 0xff);

      const otp = (binary % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, "0");
      if (safeCompare(otp, userCode)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Disable MFA for a user (admin action). */
export async function disableMFA(userUid: string): Promise<void> {
  await db.mFASecret.delete({ where: { id: `mfa-${userUid}` } }).catch(() => {});
  logger.info("[mfa] MFA disabled for user", { userUid });
}

/**
 * Get remaining recovery code count.
 * Decrypts the stored blob and returns the number of unused codes.
 */
export async function getRecoveryCodeCount(userUid: string): Promise<number> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  if (!record || !record.recoveryCodes) return 0;
  return parseRecoveryCodes(record.recoveryCodes).length;
}