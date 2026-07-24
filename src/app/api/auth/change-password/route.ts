/**
 * POST /api/auth/change-password
 *
 * Authenticated password change. Requires current password.
 * Increments tokenVersion to invalidate all other sessions AND blacklists
 * the current access token so the user must re-authenticate.
 *
 * Body: { currentPassword, newPassword }
 *
 * SEC-H1 FIX (Cycle 1): uses the strong passwordPolicy.ts validator (10+ chars,
 * upper/lower/digit/symbol, score-based) instead of the weaker inline schema.
 * SEC-C2 FIX (Cycle 1): blacklists the current access-token JTI.
 * SEC-L2 FIX (Cycle 1): rejects new password == current password.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, hashPassword, verifyPassword, revokeAccessSession } from "@/lib/auth";
import { validatePassword } from "@/lib/passwordPolicy";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

// SEC-M2 FIX (Cycle 1): pin to Node.js runtime — Prisma + bcrypt + Valkey.
export const runtime = "nodejs";

const Schema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z.string().min(1),
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

  // SEC-H1 FIX (Cycle 1): enforce the strong password policy from
  // passwordPolicy.ts (10+ chars, upper/lower/digit/symbol, score ≥ 40,
  // common-pattern penalties). The previous inline schema only required
  // 8 chars + 1 letter + 1 digit, which is below modern ERP minimums.
  const pwdCheck = validatePassword(newPassword);
  if (!pwdCheck.valid) {
    return apiError(pwdCheck.errors[0] || "كلمة المرور غير قوية بما يكفي", 400);
  }

  // Fetch the user's current password hash
  const dbUser = await db.appUser.findUnique({ where: { uid: user.uid } });
  if (!dbUser) return apiError("المستخدم غير موجود", 404);

  // Verify current password
  const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!ok) {
    return apiError("كلمة المرور الحالية غير صحيحة", 401);
  }

  // SEC-L2 FIX (Cycle 1): reject new password == current password.
  // This prevents a user from "changing" to the same password (which would
  // silently reset tokenVersion and lock other sessions for no benefit).
  const sameAsCurrent = await verifyPassword(newPassword, dbUser.passwordHash);
  if (sameAsCurrent) {
    return apiError("كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية", 400);
  }

  // Set new password + invalidate all sessions (tokenVersion++)
  const newHash = await hashPassword(newPassword);
  await db.appUser.update({
    where: { uid: user.uid },
    data: {
      passwordHash: newHash,
      tokenVersion: { increment: 1 },
    },
  });

  // SEC-C2 FIX (Cycle 1): blacklist the current access token so the user
  // must re-authenticate on this device too. The previous behavior left the
  // current access token valid for up to 30 minutes — long enough for an
  // attacker who stole the cookie to keep using it after the legitimate
  // user noticed the compromise and changed their password.
  await revokeAccessSession(req);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "password_change",
    entity: "auth",
  });

  return NextResponse.json({
    ok: true,
    message: "تم تغيير كلمة المرور. يرجى تسجيل الدخول مرة أخرى.",
  });
});
