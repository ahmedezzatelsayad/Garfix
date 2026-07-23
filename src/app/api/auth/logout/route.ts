/**
 * POST /api/auth/logout
 * Increments tokenVersion (invalidates all outstanding refresh tokens) and clears cookies.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, clearSession, revokeAccessSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api";

// SEC-M2 FIX (Cycle 1): pin to Node.js runtime — uses Prisma + Valkey (blacklist).
export const runtime = "nodejs";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (result.ok && result.user) {
    // SEC-C2 FIX (Cycle 1): blacklist the current access token's JTI for its
    // remaining TTL so it can no longer be used even before its natural
    // expiration. Paired with `tokenVersion++` below this fully terminates
    // the session instead of leaving a 30-minute zombie access token.
    await revokeAccessSession(req);
    // Increment token version to invalidate all outstanding refresh tokens
    await db.user.update({
      where: { uid: result.user.uid },
      data: { tokenVersion: { increment: 1 } },
    });
    await logAudit({
      userEmail: result.user.email,
      userUid: result.user.uid,
      action: "logout",
      entity: "auth",
    });
  }
  const response = NextResponse.json({ ok: true });
  await clearSession(response);
  return response;
});
