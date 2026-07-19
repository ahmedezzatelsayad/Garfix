/**
 * POST /api/auth/change-password
 *
 * Authenticated password change. Requires current password.
 * Increments tokenVersion to invalidate other sessions (but keeps the current one).
 *
 * Body: { currentPassword, newPassword }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, hashPassword, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const Schema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z
    .string()
    .min(8, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
    .regex(/[A-Za-z]/, "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل")
    .regex(/\d/, "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const user = result.user;

  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { currentPassword, newPassword } = parsed.data;

  // Fetch the user's current password hash
  const dbUser = await db.user.findUnique({ where: { uid: user.uid } });
  if (!dbUser) return apiError("المستخدم غير موجود", 404);

  // Verify current password
  const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!ok) {
    return apiError("كلمة المرور الحالية غير صحيحة", 401);
  }

  // Set new password + invalidate all other sessions
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
    action: "password_change",
    entity: "auth",
  });

  return NextResponse.json({
    ok: true,
    message: "تم تغيير كلمة المرور. قد تحتاج لتسجيل الدخول مرة أخرى على الأجهزة الأخرى.",
  });
});
