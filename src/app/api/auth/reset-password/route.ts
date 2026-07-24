/**
 * POST /api/auth/reset-password
 *
 * Verifies the OTP sent by /forgot-password and sets a new password.
 * Increments tokenVersion to invalidate all existing sessions.
 *
 * Body: { email, code, newPassword }
 *
 * SEC-H1 FIX (Cycle 1): uses strong passwordPolicy.ts.
 * SEC-H3 FIX (Cycle 1): enforces per-OTP max-attempts (5) — the `attempts`
 *   field was previously incremented but never checked, allowing unlimited
 *   OTP guessing within the rate-limit window.
 *
 * RUNTIME: Node.js only — imports cryptoVault.ts (node:crypto)
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { hashToken, safeCompare } from "@/lib/cryptoVault";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { validatePassword } from "@/lib/passwordPolicy";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

// SEC-H3 FIX (Cycle 1): per-OTP max attempts. Once an OTP record has been
// guessed at this many times, it is locked and the user must request a new
// one via /forgot-password. Combined with the IP/email rate limit this
// shrinks the OTP brute-force search space to ~5 guesses per OTP.
const OTP_MAX_ATTEMPTS = 5;

const Schema = z.object({
  email: z.string().email(),
  code: z.string().min(6, "الرمز مطلوب"),
  newPassword: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const limited = await rateLimitResponse(req, "pw-reset-verify", LIMITS.OTP_VERIFY);
  if (limited) return limited;

  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { email, code, newPassword } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  // SEC-H1 FIX (Cycle 1): enforce strong password policy BEFORE doing any
  // OTP lookup. This avoids leaking whether the email exists when the
  // password is weak (the response is the same generic OTP error).
  const pwdCheck = validatePassword(newPassword);
  if (!pwdCheck.valid) {
    return apiError(pwdCheck.errors[0] || "كلمة المرور غير قوية بما يكفي", 400);
  }

  const user = await db.appUser.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return apiError("رمز التحقق غير صحيح أو منتهي الصلاحية", 400);
  }

  // Find the most recent unused reset OTP for this user
  const otpRow = await db.emailVerification.findFirst({
    where: {
      userId: user.uid,
      purpose: "password_reset",
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRow || !otpRow.codeHash) {
    return apiError("رمز التحقق غير صحيح أو منتهي الصلاحية", 400);
  }

  // SEC-H3 FIX (Cycle 1): per-OTP attempt cap. If this OTP has already been
  // guessed wrong too many times, reject without consuming another attempt
  // and force the user to request a fresh OTP.
  if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
    // Mark the OTP as used so it cannot be retried even if the rate limiter
    // is bypassed.
    await db.emailVerification.update({
      where: { id: otpRow.id },
      data: { usedAt: new Date() },
    }).catch(() => {});
    logger.warn("[reset-password] OTP locked after too many attempts", { email: normalizedEmail });
    return apiError("تم تجاوز عدد المحاولات المسموح. اطلب رمزاً جديداً", 400);
  }

  // Verify the OTP code (constant-time comparison)
  const expectedHash = hashToken(code);
  if (!safeCompare(expectedHash, otpRow.codeHash)) {
    // Increment attempts
    await db.emailVerification.update({
      where: { id: otpRow.id },
      data: { attempts: { increment: 1 } },
    });
    return apiError("رمز التحقق غير صحيح أو منتهي الصلاحية", 400);
  }

  // Mark OTP as used
  await db.emailVerification.update({
    where: { id: otpRow.id },
    data: { usedAt: new Date() },
  });

  // Set new password + invalidate all sessions (tokenVersion++)
  const newHash = await hashPassword(newPassword);
  await db.appUser.update({
    where: { uid: user.uid },
    data: {
      passwordHash: newHash,
      tokenVersion: { increment: 1 },
    },
  });

  // SEC-C2 FIX (Cycle 1): we don't have the user's request cookie here (they
  // are unauthenticated), so we cannot blacklist a specific JTI. But
  // tokenVersion++ already invalidates ALL outstanding refresh tokens, and
  // any outstanding access tokens will expire within ACCESS_TTL (30 min).
  // If the user is logged in elsewhere, those sessions die on next refresh.

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "password_reset",
    entity: "auth",
  });

  logger.info("[reset-password] password reset successful", { email: normalizedEmail });

  return NextResponse.json({
    ok: true,
    message: "تم تغيير كلمة المرور بنجاح. سجّل الدخول بكلمة المرور الجديدة.",
  });
});
