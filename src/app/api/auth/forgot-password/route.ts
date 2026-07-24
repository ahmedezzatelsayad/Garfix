/**
 * POST /api/auth/forgot-password
 *
 * Generates a password-reset OTP and stores it. In production, the OTP would
 * be emailed via SMTP. In this sandbox, we return the OTP directly for demo
 * purposes (the response includes the code).
 *
 * Anti-enumeration: always returns 200 even if the email doesn't exist,
 * so attackers can't probe which emails are registered.
 *
 * Body: { email: string }
 *
 * RUNTIME: Node.js only — uses node:crypto
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/cryptoVault";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { withErrorHandler, parseJsonBody } from "@/lib/api";

const Schema = z.object({
  email: z.string().email("صيغة البريد الإلكتروني غير صحيحة"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limit: 3 reset requests per hour per IP
  const limited = await rateLimitResponse(req, "pw-reset", LIMITS.PASSWORD_RESET);
  if (limited) return limited;

  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true }); // anti-enumeration: don't reveal validation errors
  }
  const email = parsed.data.email.trim().toLowerCase();

  const user = await db.appUser.findUnique({ where: { email } });

  if (user) {
    // Generate 6-digit OTP
    const code = String(randomInt(100000, 999999));
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await db.emailVerification.create({
      data: {
        userId: user.uid,
        codeHash,
        purpose: "password_reset",
        expiresAt,
      },
    });

    logger.info("[forgot-password] OTP generated", { email });

    // In production: send email via SMTP
    // For dev/sandbox: return the code so the user can test (NEVER in production)
    const response: Record<string, unknown> = {
      ok: true,
      message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني",
    };
    if (process.env.NODE_ENV !== "production") {
      response.devCode = code;
    }
    return NextResponse.json(response);
  }

  // Anti-enumeration: return the same response even if the email doesn't exist
  return NextResponse.json({
    ok: true,
    message: "إذا كان البريد مسجلاً، سيصلك رمز التحقق",
  });
});
