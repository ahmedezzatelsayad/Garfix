/**
 * POST /api/auth/register
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAudit } from "@/lib/audit";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const RegisterSchema = z.object({
  email: z.string().email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z
    .string()
    .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    .regex(/[A-Za-z]/, "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل")
    .regex(/\d/, "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل"),
  displayName: z.string().min(1, "الاسم مطلوب").max(100, "الاسم طويل جداً"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limit: 3 registrations per hour per IP
  const limited = await rateLimitResponse(req, "register", LIMITS.REGISTER);
  if (limited) return limited;

  const body = await parseJsonBody(req);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }
  const { email, password, displayName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return apiError("هذا البريد الإلكتروني مسجّل مسبقاً", 409);
  }

  const founder = isFounderEmail(normalizedEmail);
  const passwordHash = await hashPassword(password);
  const uid = randomUUID();

  const user = await db.user.create({
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

  return NextResponse.json({
    ok: true,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    isFounder: founder,
    message: "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.",
  });
});
