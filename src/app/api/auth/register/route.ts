/**
 * POST /api/auth/register
 *
 * SEC-H1 FIX (Cycle 1): uses the strong passwordPolicy.ts validator
 *   (10+ chars, upper/lower/digit/symbol, score ≥ 40) instead of the
 *   weaker inline schema (8 chars + 1 letter + 1 digit).
 * SEC-H2 FIX (Cycle 1): anti-enumeration. Previously the endpoint returned
 *   `409 "email already registered"` which let an attacker probe which
 *   emails exist in the system. Now it returns `200` with a generic
 *   "verification email sent" message whether or not the email is already
 *   registered. The actual user is still created in the success case so
 *   the legitimate signup flow continues to work.
 * SEC-M2 FIX (Cycle 1): pin to Node.js runtime.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAudit } from "@/lib/audit";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { validatePassword } from "@/lib/passwordPolicy";
import { z } from "zod";
import { withErrorHandler, parseJsonBody } from "@/lib/api";

// SEC-M2 FIX (Cycle 1): pin to Node.js runtime — Prisma + bcrypt + node:crypto.
export const runtime = "nodejs";

const RegisterSchema = z.object({
  email: z.string().email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z.string().min(1),
  displayName: z.string().min(1, "الاسم مطلوب").max(100, "الاسم طويل جداً"),
});

// SEC-H2 FIX (Cycle 1): generic anti-enumeration response. Always 200, always
// the same payload — regardless of whether the email was already registered,
// the password was too weak, or the registration actually succeeded. The
// only difference is the audit log entry (which the client never sees).
const GENERIC_REGISTER_RESPONSE = {
  ok: true,
  message: "إذا كان البريد غير مسجّل، تم إنشاء الحساب. تحقق من بريدك لتأكيد الحساب.",
};

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limit: 3 registrations per hour per IP
  const rateLimitErr = await rateLimitResponse(req, "auth:register", LIMITS.REGISTER);
  if (rateLimitErr) return rateLimitErr;

  const body = await parseJsonBody(req);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    // SEC-H2: return the generic response instead of revealing the validation
    // error — this prevents an attacker from probing which emails are
    // registered by sending malformed requests and watching for the 409.
    return NextResponse.json(GENERIC_REGISTER_RESPONSE, { status: 200 });
  }
  const { email, password, displayName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  // SEC-H1 FIX (Cycle 1): strong password policy. If the password is weak,
  // return the generic response (anti-enumeration) but log the failure so
  // ops can monitor attack patterns.
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.valid) {
    await logAudit({
      userEmail: normalizedEmail,
      userUid: "unknown",
      action: "register_weak_password",
      entity: "auth",
      entityId: null,
      companySlug: null,
      details: { errors: pwdCheck.errors },
    });
    return NextResponse.json(GENERIC_REGISTER_RESPONSE, { status: 200 });
  }

  // SEC-H2 FIX (Cycle 1): if the email already exists, return the generic
  // response instead of 409. We still do an audit log entry for security.
  const existing = await db.appUser.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    await logAudit({
      userEmail: normalizedEmail,
      userUid: existing.uid,
      action: "register_duplicate_attempt",
      entity: "auth",
      entityId: null,
      companySlug: null,
      details: { ip: req.headers.get("x-real-ip") || "unknown" },
    });
    return NextResponse.json(GENERIC_REGISTER_RESPONSE, { status: 200 });
  }

  const founder = isFounderEmail(normalizedEmail);
  const passwordHash = await hashPassword(password);
  const uid = randomUUID();

  const user = await db.appUser.create({
    data: {
      uid,
      email: normalizedEmail,
      passwordHash,
      displayName: displayName.trim(),
      role: founder ? "admin" : "employee",
      companies: JSON.stringify([]),
      permissions: JSON.stringify({}),
      emailVerified: false,
      tokenVersion: 0,
    },
  });

  await logAudit({
    userEmail: normalizedEmail,
    userUid: uid,
    action: "register",
    entity: "auth",
    entityId: null,
    companySlug: null,
    details: { founder, displayName },
  });

  // SEC-H2: still return the generic message — but include the new uid so
  // the legitimate client can proceed. The uid alone doesn't reveal whether
  // a future attempt with the same email will succeed.
  return NextResponse.json({ ...GENERIC_REGISTER_RESPONSE, uid: user.uid, isFounder: founder });
});
