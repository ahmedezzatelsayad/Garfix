/**
 * GET /api/auth/me — Return the current user profile.
 *
 * NOTE: The token-refresh POST handler moved to `/api/auth/refresh/route.ts`
 * (bug fix: the frontend calls `POST /api/auth/refresh`, not `/api/auth/me`).
 *
 * SEC-M2 FIX (Cycle 1): pin to Node.js runtime — Prisma + JWT + (now) Valkey
 *   blacklist check inside resolveAuth.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  resolveAuth,
  type SessionUser,
  buildUserProfile,
} from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";

// SEC-M2 FIX (Cycle 1): pin to Node.js runtime.
export const runtime = "nodejs";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the latest user from DB (in case permissions/companies changed)
  const dbUser = await db.appUser.findUnique({ where: { uid: result.user.uid } });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const sessionUser: SessionUser = {
    uid: dbUser.uid,
    email: dbUser.email,
    displayName: dbUser.displayName,
    role: dbUser.role,
    companies: parseJson<string[]>(dbUser.companies, []),
    permissions: parseJson<Record<string, number>>(dbUser.permissions, {}),
    emailVerified: dbUser.emailVerified,
    tokenVersion: dbUser.tokenVersion,
  };

  return NextResponse.json(await buildUserProfile(sessionUser));
});

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
