/**
 * GET /api/auth/mfa/status — MFA status for the RecoveryCodesBanner (SEC-07 / Phase 0 T3)
 *
 * Returns whether the user has MFA enabled, how many recovery codes they have,
 * and whether those codes need regeneration (old 32-bit format vs new 128-bit).
 *
 * The banner uses this to decide whether to show the "regenerate recovery codes"
 * warning to admin/founder accounts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api";
import { dbTyped as db } from "@/lib/db";
import { isMFAEnabled, getRecoveryCodeCount } from "@/lib/mfa";
import { isFounderEmail } from "@/lib/founder";

export const runtime = "nodejs";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult.user;

  const isAdmin = user.role === "admin" || isFounderEmail(user.email);
  const mfaEnabled = await isMFAEnabled(user.uid).catch(() => false);

  if (!mfaEnabled) {
    return NextResponse.json({
      mfaEnabled: false,
      recoveryCodesCount: 0,
      recoveryCodesNeedRegeneration: false,
      isAdmin,
      recoveryCodesRegeneratedAt: null,
    });
  }

  const recoveryCodesCount = await getRecoveryCodeCount(user.uid).catch(() => 0);

  // Check if recovery codes are in the OLD format (32-bit, 8 hex chars per code)
  // vs the NEW format (128-bit, 32 hex chars per code).
  //
  // Old format: XXXX-XXXX (8 hex chars, 1 dash)
  // New format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (32 hex chars, 7 dashes)
  //
  // We check by decrypting the stored recovery codes blob and inspecting the
  // hash length. Old hashes are SHA-256 of 8-char codes; new hashes are SHA-256
  // of 32-char codes. We can't distinguish by hash length (both are 64 hex chars),
  // so we check the `recoveryCodesRegeneratedAt` timestamp instead.
  //
  // If the timestamp is null AND the user is admin/founder, we assume old format
  // and show the banner. Once they regenerate, the timestamp is set.
  let recoveryCodesRegeneratedAt: string | null = null;
  try {
    const record = await db.mFASecret.findUnique({
      where: { id: `mfa-${user.uid}` },
      select: { recoveryCodes: true, verifiedAt: true },
    });
    if (record?.verifiedAt) {
      // If MFA was verified BEFORE the Phase 0 deployment (2026-08-13),
      // the recovery codes are in the old format.
      const phase0Date = new Date("2026-08-13T00:00:00Z");
      const verifiedAt = new Date(record.verifiedAt);
      if (verifiedAt < phase0Date) {
        recoveryCodesRegeneratedAt = null; // old format — needs regeneration
      } else {
        recoveryCodesRegeneratedAt = record.verifiedAt.toISOString();
      }
    }
  } catch {
    // If we can't check, don't show the banner (fail-safe)
    recoveryCodesRegeneratedAt = new Date().toISOString();
  }

  const recoveryCodesNeedRegeneration =
    isAdmin && recoveryCodesRegeneratedAt === null && recoveryCodesCount > 0;

  return NextResponse.json({
    mfaEnabled,
    recoveryCodesCount,
    recoveryCodesNeedRegeneration,
    isAdmin,
    recoveryCodesRegeneratedAt,
  });
});
