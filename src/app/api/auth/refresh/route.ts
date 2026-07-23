/**
 * POST /api/auth/refresh — Rotate the access token from a valid refresh token.
 *
 * Bug fix (auth-refresh): the frontend `AuthContext` calls this path, but the
 * handler previously lived on `POST /api/auth/me`. That mismatch caused every
 * silent session refresh to 404, logging users out instead of rotating the
 * token quietly. This route restores the contract the frontend expects.
 *
 * SEC-M2 FIX (Cycle 1): pin to Node.js runtime — Prisma + JWT.
 *
 * HIGH-004 FIX (Cycle 2): refresh token rotation. Every successful refresh
 *   now issues a NEW refresh token (via `issueSession`) and the OLD refresh
 *   token's JTI is blacklisted for its remaining TTL (via
 *   `verifyRefreshTokenWithBlacklist` + the rotation logic in
 *   `resolveAuth`/`blacklistToken`). This limits a stolen refresh token to
 *   at most one use, per RFC 6749 §10.4.
 *
 *   Backward compatibility: existing refresh tokens without a JTI claim
 *   (issued before this fix) cannot be blacklisted individually — they will
 *   simply not be replay-protected. They expire naturally at their 30-day
 *   TTL. All newly-issued tokens include a JTI and are rotation-protected.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyRefreshTokenWithBlacklist,
  issueSession,
  clearSession,
  blacklistToken,
  type SessionUser,
} from "@/lib/auth";
import jwt from "jsonwebtoken";
import { withErrorHandler } from "@/lib/api";

// SEC-M2 FIX (Cycle 1): pin to Node.js runtime.
export const runtime = "nodejs";

const REFRESH_TTL = parseInt(process.env.JWT_REFRESH_TTL_SECONDS || "2592000", 10); // 30 days

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Try refresh from cookie
  const refresh = req.cookies.get("inv_refresh")?.value;
  if (!refresh) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  // HIGH-004 FIX (Cycle 2): use the blacklist-aware verifier so a rotated
  // (and therefore blacklisted) refresh token cannot be replayed.
  const payload = await verifyRefreshTokenWithBlacklist(refresh);
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

  // HIGH-004 FIX (Cycle 2): blacklist the consumed refresh token's JTI for
  // its remaining TTL so it cannot be replayed. Best-effort: if Valkey is
  // unavailable, we still issue a new token (the old one will fail at the
  // next refresh attempt only because we set a NEW refresh cookie below —
  // the browser overwrites the old one).
  if (payload.jti) {
    try {
      const decoded = jwt.decode(refresh) as jwt.JwtPayload | null;
      const exp = decoded && typeof decoded.exp === "number" ? decoded.exp : 0;
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, exp - now);
      const ttl = Math.min(remaining, REFRESH_TTL);
      if (ttl > 0) await blacklistToken(payload.jti, ttl);
    } catch {
      // Best-effort — rotation still proceeds.
    }
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

  // issueSession issues BOTH a fresh access token AND a fresh refresh token,
  // which is exactly what we want for rotation.
  // SEC-H4 FIX (Cycle 3): pass `req` so the new access token's JTI is
  // registered in SessionRegistry with IP + User-Agent context.
  const response = NextResponse.json({ ok: true });
  await issueSession(response, sessionUser, req);
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
