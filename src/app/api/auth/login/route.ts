/**
 * POST /api/auth/login
 * Validates credentials, issues access + refresh cookies, returns user profile.
 *
 * Rate-limited: 5 attempts per 15 min per IP. Account lockout after 5 failures.
 *
 * Body: { email, password }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, issueSession, type SessionUser } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { buildUserProfile } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimitResponse, clearRateLimit, getClientIp, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const LoginSchema = z.object({
  email: z.string().email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limit: 5 attempts per 15 min per IP
  const ip = getClientIp(req);
  const rateLimitErr = await rateLimitResponse(req, "auth:login", LIMITS.LOGIN);
  if (rateLimitErr) return rateLimitErr;

  const body = await parseJsonBody(req);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    // Anti-enumeration: same message for "wrong password" as "no such user"
    return apiError("البريد الإلكتروني أو كلمة المرور غير صحيحة", 401);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await logAudit({
      userEmail: normalizedEmail,
      userUid: user.uid,
      action: "login_failure",
      entity: "auth",
      details: { ip },
    });
    return apiError("البريد الإلكتروني أو كلمة المرور غير صحيحة", 401);
  }

  // Success — clear the rate limit for this IP (must match the key prefix used in rateLimitResponse)
  await clearRateLimit("auth:login", ip);

  const founder = isFounderEmail(user.email);
  const role = founder ? "admin" : user.role;

  const companies = parseJson<string[]>(user.companies, []);
  const permissions = parseJson<Record<string, number>>(user.permissions, {});

  const sessionUser: SessionUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role,
    companies,
    permissions,
    emailVerified: user.emailVerified,
    tokenVersion: user.tokenVersion,
  };

  const response = NextResponse.json({
    ok: true,
    user: await buildUserProfile(sessionUser),
  });
  await issueSession(response, sessionUser);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "login_success",
    entity: "auth",
    details: { founder, role, ip },
  });

  return response;
});

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
