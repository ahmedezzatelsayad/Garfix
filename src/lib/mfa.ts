/**
 * mfa.ts — TOTP-based MFA for admin/founder accounts.
 *
 * Uses the otpauth URI standard (Google Authenticator / Authy compatible).
 * Secrets are encrypted at rest via cryptoVault.
 * Recovery codes are hashed (SHA-256) before storage — one-time use.
 */

import crypto from "node:crypto";
import { db } from "@/lib/db";
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
    const bytes = crypto.randomBytes(4);
    const code = bytes.toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-");
    codes.push(code);
  }
  return codes;
}

/** Generate a new TOTP secret for a user. Returns the secret (plaintext) and recovery codes. */
export async function setupMFA(userUid: string): Promise<{ secret: string; uri: string; recoveryCodes: string[] }> {
  const secret = verifyTOTPCodeSecret();
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
      userUid,
      secret: encryptedSecret,
      recoveryCodes: encryptedCodes,
      enabled: false, // Not enabled until verified
    },
    update: {
      secret: encryptedSecret,
      recoveryCodes: encryptedCodes,
      enabled: false,
      verifiedAt: null,
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
      data: { enabled: true, verifiedAt: new Date() },
    });
    return true;
  }
  return false;
}

/** Validate a TOTP code for an already-enabled MFA. */
export async function validateMFA(userUid: string, code: string): Promise<boolean> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  if (!record || !record.enabled) return false;

  const secret = decryptSecret(record.secret);
  const valid = verifyTOTPCode(secret, code);

  if (valid) {
    await db.mFASecret.update({
      where: { id: `mfa-${userUid}` },
      data: { lastUsedAt: new Date() },
    });
  }
  return valid;
}

/** Use a recovery code (one-time use). */
export async function useRecoveryCode(userUid: string, code: string): Promise<boolean> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  if (!record || !record.enabled) return false;

  const hashedCodes: string[] = JSON.parse(decryptSecret(record.recoveryCodes));
  const hashedInput = hashToken(code);

  const idx = hashedCodes.indexOf(hashedInput);
  if (idx === -1) return false;

  // Remove used code
  hashedCodes.splice(idx, 1);
  await db.mFASecret.update({
    where: { id: `mfa-${userUid}` },
    data: {
      recoveryCodes: encryptSecret(JSON.stringify(hashedCodes)),
      lastUsedAt: new Date(),
    },
  });

  return true;
}

/** Check if MFA is enabled for a user. */
export async function isMFAEnabled(userUid: string): Promise<boolean> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  return record?.enabled === true;
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

/** Get remaining recovery code count. */
export async function getRecoveryCodeCount(userUid: string): Promise<number> {
  const record = await db.mFASecret.findUnique({ where: { id: `mfa-${userUid}` } });
  if (!record) return 0;
  try {
    const hashedCodes: string[] = JSON.parse(decryptSecret(record.recoveryCodes));
    return hashedCodes.length;
  } catch {
    return 0;
  }
}