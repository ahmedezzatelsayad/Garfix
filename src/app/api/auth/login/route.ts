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
import { dbTyped as db } from "@/lib/db";
import { verifyPasswordAndMaybeRehash, issueSession, type SessionUser } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { buildUserProfile } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimitResponse, clearRateLimit, getClientIp, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { isMFAEnabled, validateMFA } from "@/lib/mfa";

// SEC-M2 FIX (Cycle 1): pin to Node.js runtime — Prisma + bcrypt + Valkey.
export const runtime = "nodejs";

// P1 FIX (audit): Added optional mfaCode field for MFA-protected accounts.
// If the user has MFA enabled, the first login attempt (without mfaCode)
// returns { mfaRequired: true } so the frontend can prompt for the code.
// The second attempt includes mfaCode and validates it before issuing session.
//
// SEC-06 FIX (Audit v2 · Phase 2): the generic message below is returned for
// EVERY authentication failure (wrong password / user not found / MFA missing /
// MFA wrong) so an attacker cannot distinguish which step failed. The previous
// implementation returned `{ mfaRequired: true }` after a correct password,
// leaking credential validity and enabling MFA brute-force once the password
// was known. Rate limits (IP + email) are now cleared only AFTER full MFA
// validation succeeds — not after the password check.
const AUTH_GENERIC_ERROR = "بيانات الدخول غير صحيحة أو التحقق الثنائي مطلوب";
const LoginSchema = z.object({
  email: z.string().email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
  mfaCode: z.string().optional(), // P1 FIX: MFA code for MFA-protected accounts
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
  const { email, password, mfaCode } = parsed.data;
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

  const user = await db.appUser.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    // SEC-06 FIX (Audit v2 · Phase 2): anti-enumeration — return the same
    // byte-for-byte generic error as the wrong-password / MFA-missing /
    // MFA-wrong cases below. Do NOT reveal that the email doesn't exist.
    return apiError(AUTH_GENERIC_ERROR, 401);
  }

  const ok = await verifyPasswordAndMaybeRehash(password, user.passwordHash, user.uid);
  if (!ok.ok) {
    await logAudit({
      userEmail: normalizedEmail,
      userUid: user.uid,
      action: "login_failure",
      entity: "auth",
      details: { ip },
    });
    // SEC-06 FIX (Audit v2 · Phase 2): same generic error — do not reveal
    // that the password was the failing step.
    return apiError(AUTH_GENERIC_ERROR, 401);
  }
  // HIGH-005 FIX (Cycle 2): if the stored hash was at a lower bcrypt cost
  // factor and we just upgraded it, log it so we can monitor migration
  // progress of the 13 existing production users from cost 10 → cost 12.
  if (ok.rehashed) {
    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "password_rehash_upgraded",
      entity: "auth",
      details: { reason: "bcrypt_cost_factor_upgrade" },
    });
  }

  // P1 FIX (audit): MFA check — if the user has MFA enabled, require a valid
  // TOTP code before issuing the session. This prevents password-only login
  // for admin/founder accounts.
  //
  // SEC-06 FIX (Audit v2 · Phase 2): rate limits (IP + email) are cleared
  // ONLY AFTER MFA validation succeeds (see below). Previously they were
  // cleared immediately after the password check, which meant an attacker
  // with the right password could brute-force MFA codes without throttling.
  const mfaEnabled = await isMFAEnabled(user.uid).catch(() => false);
  if (mfaEnabled) {
    if (!mfaCode) {
      // SEC-06 FIX (Audit v2 · Phase 2): do NOT return { mfaRequired: true } —
      // that leaked that the password was correct. Return the same generic
      // error as a wrong password so the attacker can't tell which step
      // failed.
      return apiError(AUTH_GENERIC_ERROR, 401);
    }
    // Validate the MFA code
    const mfaValid = await validateMFA(user.uid, mfaCode).catch(() => false);
    if (!mfaValid) {
      await logAudit({
        userEmail: normalizedEmail,
        userUid: user.uid,
        action: "mfa_failure",
        entity: "auth",
        details: { ip },
      });
      // SEC-06 FIX (Audit v2 · Phase 2): same generic error — do not reveal
      // that the MFA code (not the password) was the failing step.
      return apiError(AUTH_GENERIC_ERROR, 401);
    }
  }

  // SEC-06 FIX (Audit v2 · Phase 2): full authentication (password + MFA)
  // has succeeded — NOW it is safe to clear the rate limits. A legitimate
  // user who fat-fingered their password a few times isn't penalized, and an
  // attacker who only had the password can no longer brute-force MFA without
  // throttling.
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
  // SEC-H4 FIX (Cycle 3, re-applied): pass `req` so issueSession can
  // register the JTI in the SessionRegistry with IP + User-Agent context
  // for forensic use and concurrent-session revocation.
  await issueSession(response, sessionUser, req);

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
    // P0 HARDENING: سطور مثل [slug1,slug2] بدون علامات اقتباس كانت تفشل
    // بصمت → جلسات بلا شركات → كل الشاشات تفتح المعالج. نحاول إصلاحها
    // تلقائيًا (split على الفواصل) قبل الاستسلام للقيمة الفارغة.
    try {
      const cleaned = s.replace(/^[\[\]]|[[\]]$/g, "").trim();
      if (cleaned.includes(",")) {
        return (cleaned.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean)) as unknown as T;
      }
    } catch { /* غير قابل للإصلاح */ }
    return fallback;
  }
}
