/**
 * POST /api/auth/logout
 * Increments tokenVersion (invalidates all outstanding refresh tokens) and clears cookies.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, clearSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (result.ok && result.user) {
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
