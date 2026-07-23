/**
 * GET /api/startup-check — Returns the result of startup environment checks.
 * Founder-only. Useful for the founder dashboard to surface any config warnings.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { runStartupChecks, validatePlanLimits } from "@/lib/startupCheck";
import { cacheStats } from "@/lib/cache";
import { withErrorHandler } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }
  const startup = runStartupChecks();
  validatePlanLimits();
  const cache = cacheStats();
  return NextResponse.json({
    ...startup,
    cache,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      WHATSAPP_ALLOWED_SENDERS_SET: !!process.env.WHATSAPP_ALLOWED_SENDERS,
      PAYMENTS_ENC_KEY_SET: !!process.env.PAYMENTS_ENC_KEY,
      SMTP_CONFIGURED: !!(process.env.SMTP_HOST && process.env.SMTP_FROM),
    },
    timestamp: new Date().toISOString(),
  });
});
