/**
 * POST /api/auth/login
 * Validates credentials, issues access + refresh cookies, returns user profile.
 *
 * Rate-limited: 5 attempts per 15 min per IP AND 5 per 15 min per email.
 * Account lockout after 5 failures on either dimension.
 *
 * SEC-M1 FIX (Cycle 1): added a per-email rate limit on top of the existing
 *   per-IP limit. The IP-only limit could be sidestepped by a distributed
 *   attacker (botnet) rotating source IPs while hammering a single account.
 *   The new per-email limit caps guesses against any one account regardless
 *   of how many source IPs are involved.
 * SEC-M2 FIX (Cycle 1): pin to Node.js runtime.
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

// SEC-M2 FIX (Cycle 1): pin to Node.js runtime — Prisma + bcrypt + Valkey.
export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limit: 5 attempts per 15 min per IP
  const ip = getClientIp(req);
  const ipRateLimitErr = await rateLimitResponse(req, "auth:login", LIMITS.LOGIN);
  if (ipRateLimitErr) return ipRateLimitErr;

  const body = await parseJsonBody(req);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  // SEC-M1 FIX (Cycle 1): per-email rate limit. We check this AFTER parsing
  // the email so the limit key is the normalized email, not the raw input.
  // The check is done BEFORE the DB lookup so a distributed attacker cannot
  // use IP rotation to bypass the per-account limit.
  const emailRateLimitErr = await rateLimitResponse(
    req,
    "auth:login-email",
    LIMITS.LOGIN,
    normalizedEmail,
  );
  if (emailRateLimitErr) return emailRateLimitErr;

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

  // Success — clear both rate limits (IP and email) so a legitimate user
  // who fat-fingered their password a few times isn't penalized.
  await clearRateLimit("auth:login", ip);
  await clearRateLimit("auth:login-email", normalizedEmail);

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
