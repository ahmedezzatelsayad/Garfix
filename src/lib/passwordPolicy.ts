/**
 * passwordPolicy.ts — Password strength validation and session management.
 *
 * Enforces minimum password requirements and manages session concurrency.
 */

import { db } from "@/lib/db";
import { logger } from "./logger";

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0-100
  errors: string[];
}

const MIN_LENGTH = 10;
const MIN_SCORE = 40;

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  if (password.length < MIN_LENGTH) {
    errors.push(`كلمة المرور يجب أن تكون على الأقل ${MIN_LENGTH} أحرف`);
  } else {
    score += 20;
  }

  if (password.length >= 14) score += 10;
  if (password.length >= 20) score += 5;

  if (/[a-z]/.test(password)) score += 10;
  else errors.push("كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل");

  if (/[A-Z]/.test(password)) score += 10;
  else errors.push("كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل");

  if (/\d/.test(password)) score += 15;
  else errors.push("كلمة المرور يجب أن تحتوي على رقم واحد على الأقل");

  if (/[^a-zA-Z\d]/.test(password)) score += 15;
  else errors.push("كلمة المرور يجب أن تحتوي على رمز خاص واحد على الأقل");

  // Bonus for variety
  const uniqueChars = new Set(password.toLowerCase()).size;
  if (uniqueChars >= password.length * 0.7) score += 10;
  if (uniqueChars >= password.length * 0.9) score += 5;

  // Penalty for common patterns
  const lower = password.toLowerCase();
  if (/(.)\1{2,}/.test(lower)) score -= 10; // Repeated chars
  if (/^(1234|abcd|qwer|pass|admin|password)/.test(lower)) score -= 20; // Common starts

  score = Math.max(0, Math.min(100, score));

  return {
    valid: score >= MIN_SCORE && errors.length === 0,
    score,
    errors,
  };
}

// ── Session management ─────────────────────────────────────────────────

const MAX_SESSIONS_PER_USER = parseInt(process.env.MAX_SESSIONS_PER_USER || "5", 10);

/** Register a new session. Evicts oldest if over limit. */
export async function registerSession(params: {
  userUid: string;
  jti: string;
  ipAddress?: string;
  userAgent?: string;
  ttlSeconds: number;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000);

  await db.sessionRegistry.create({
    data: {
      userUid: params.userUid,
      jti: params.jti,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      expiresAt,
    },
  });

  // Enforce max sessions
  await enforceSessionLimit(params.userUid);
}

/** Enforce max concurrent sessions — evict oldest sessions beyond limit. */
async function enforceSessionLimit(userUid: string): Promise<string[]> {
  const sessions = await db.sessionRegistry.findMany({
    where: { userUid },
    orderBy: { createdAt: "asc" },
  });

  const evicted: string[] = [];

  if (sessions.length > MAX_SESSIONS_PER_USER) {
    const toEvict = sessions.slice(0, sessions.length - MAX_SESSIONS_PER_USER);
    for (const s of toEvict) {
      await db.sessionRegistry.delete({ where: { id: s.id } }).catch(() => {});
      evicted.push(s.jti);
    }
    logger.info("[session] evicted oldest sessions", {
      userUid,
      evictedCount: evicted.length,
    });
  }

  return evicted;
}

/** Check if a session (JTI) is still valid (exists and not expired). */
export async function isSessionValid(jti: string): Promise<boolean> {
  const session = await db.sessionRegistry.findUnique({ where: { jti } });
  if (!session) return false;
  if (session.expiresAt < new Date()) {
    await db.sessionRegistry.delete({ where: { jti } }).catch(() => {});
    return false;
  }
  return true;
}

/** Revoke a specific session. */
export async function revokeSession(jti: string): Promise<void> {
  await db.sessionRegistry.delete({ where: { jti } }).catch(() => {});
}

/** Revoke all sessions for a user. */
export async function revokeAllSessions(userUid: string): Promise<void> {
  await db.sessionRegistry.deleteMany({ where: { userUid } }).catch(() => {});
}

/** Get active session count for a user. */
export async function getActiveSessionCount(userUid: string): Promise<number> {
  return db.sessionRegistry.count({
    where: {
      userUid,
      expiresAt: { gt: new Date() },
    },
  });
}

/** Cleanup expired sessions (call periodically). */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.sessionRegistry.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}