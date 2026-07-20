/**
 * POST /api/auth/reset-password
 *
 * Verifies the OTP sent by /forgot-password and sets a new password.
 * Increments tokenVersion to invalidate all existing sessions.
 *
 * Body: { email, code, newPassword }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { hashToken, safeCompare } from "@/lib/cryptoVault";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const Schema = z.object({
  email: z.string().email(),
  code: z.string().min(6, "الرمز مطلوب"),
  newPassword: z
    .string()
    .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    .regex(/[A-Za-z]/, "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل")
    .regex(/\d/, "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل"),
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

  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
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
  await db.user.update({
    where: { uid: user.uid },
    data: {
      passwordHash: newHash,
      tokenVersion: { increment: 1 },
    },
  });

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
