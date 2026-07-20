/**
 * POST /api/auth/refresh — Rotate the access token from a valid refresh token.
 *
 * Bug fix (auth-refresh): the frontend `AuthContext` calls this path, but the
 * handler previously lived on `POST /api/auth/me`. That mismatch caused every
 * silent session refresh to 404, logging users out instead of rotating the
 * token quietly. This route restores the contract the frontend expects.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyRefreshToken,
  issueSession,
  clearSession,
  type SessionUser,
} from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Try refresh from cookie
  const refresh = req.cookies.get("inv_refresh")?.value;
  if (!refresh) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }
  const payload = verifyRefreshToken(refresh);
  if (!payload) {
    const res = NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
    await clearSession(res);
    return res;
  }
  const user = await db.user.findUnique({ where: { uid: payload.uid } });
  if (!user || user.tokenVersion !== payload.tv) {
    const res = NextResponse.json({ error: "Session revoked" }, { status: 401 });
    await clearSession(res);
    return res;
  }

  const sessionUser: SessionUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    companies: parseJson<string[]>(user.companies, []),
    permissions: parseJson<Record<string, number>>(user.permissions, {}),
    emailVerified: user.emailVerified,
    tokenVersion: user.tokenVersion,
  };

  const response = NextResponse.json({ ok: true });
  await issueSession(response, sessionUser);
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
