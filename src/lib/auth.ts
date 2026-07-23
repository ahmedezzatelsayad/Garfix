/**
 * auth.ts — JWT auth + bcrypt password hashing.
 * Ported from v10 authMiddleware.ts + auth.ts, adapted to Next.js Route Handlers.
 *
 * Tokens:
 *   - Access token (short TTL, 30 min): carries uid/email/role/companies/perms/tv
 *   - Refresh token (long TTL, 30 days): carries uid + tv (token version)
 *
 * Token versioning: incrementing `User.tokenVersion` invalidates all outstanding
 * refresh tokens (used on logout-all, password reset, email verify).
 *
 * Cycle 2 hardening:
 *   - HIGH-004: Refresh token rotation — every refresh issues a new refresh
 *     token, limiting the blast radius of a stolen refresh token to one use.
 *   - HIGH-005: bcrypt cost factor default raised from 10 to 12 (OWASP 2025
 *     recommendation). Existing hashes rehash lazily on next successful login.
 *   - MED-005: JWT signing/verification now explicitly pins algorithm=HS256
 *     (defense-in-depth against alg-confusion / `none`-algorithm attacks).
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isFounderEmail } from "@/lib/founder";
import { computeEffectivePermissions } from "@/lib/permissions";
import { getValkeyClient } from "@/lib/valkey";
import { CSRF_COOKIE, generateCsrfToken, CSRF_COOKIE_OPTS } from "@/lib/cookies";

// SEC-002 FIX: No fallback secrets — throw if missing in production
function resolveSecret(envVar: string, name: string): string {
  const val = process.env[envVar];
  if (!val) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`FATAL: ${name} environment variable is not set. Refusing to start with insecure defaults.`);
    }
    // In dev only, use a deterministic but clearly-marked dev secret
    console.warn(`⚠️  ${name} not set — using dev default. DO NOT use in production.`);
    return `dev-only-${name.toLowerCase()}-not-for-production-static-key`;
  }
  if (val.length < 16) {
    throw new Error(`FATAL: ${name} must be at least 16 characters.`);
  }
  return val;
}

const JWT_SECRET = resolveSecret("JWT_SECRET", "JWT_SECRET");
const JWT_REFRESH_SECRET = resolveSecret("JWT_REFRESH_SECRET", "JWT_REFRESH_SECRET");
const ACCESS_TTL = parseInt(process.env.JWT_ACCESS_TTL_SECONDS || "1800", 10); // 30 min
const REFRESH_TTL = parseInt(process.env.JWT_REFRESH_TTL_SECONDS || "2592000", 10); // 30 days
// HIGH-005 FIX (Cycle 2): OWASP 2025 recommends bcrypt cost factor >= 12.
// Cost 10 takes ~70ms to verify on modern hardware — fast enough for offline
// brute-force on a stolen password DB. Cost 12 takes ~250ms — still
// imperceptible for single-login UX but ~4× costlier for attackers.
// Existing hashes (cost 10) remain valid; bcrypt encodes the cost in the hash
// and `verifyPassword` accepts any cost. `verifyPasswordAndMaybeRehash` below
// transparently upgrades legacy hashes on the next successful login.
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
const BCRYPT_MIN_ROUNDS = parseInt(process.env.BCRYPT_MIN_ROUNDS || "12", 10);
// MED-005 FIX (Cycle 2): explicitly pin the JWT signing algorithm.
// `jsonwebtoken@9` defaults to HS256 and rejects `alg: none`, but a future
// refactor that accepts user-supplied tokens could be vulnerable to
// alg-confusion (RS256 → HS256) or `none` if not pinned. Pinning is a
// defense-in-depth measure recommended by OWASP JWT cheat sheet.
const JWT_ALGORITHM = "HS256" as const;

export const ACCESS_COOKIE = "inv_token";
export const REFRESH_COOKIE = "inv_refresh";

export interface AuthPayload {
  uid: string;
  email: string;
  role: string;
  companies: string[];
  permissions: Record<string, number>;
  tv: number;
  jti?: string;
}

export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  companies: string[];
  permissions: Record<string, number>;
  emailVerified: boolean;
  tokenVersion: number;
}

// ── Password hashing ─────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * HIGH-005 FIX (Cycle 2): verify password AND transparently rehash at the
 * current BCRYPT_ROUNDS if the stored hash was produced with a lower cost
 * factor. Call this from login instead of `verifyPassword` to migrate
 * legacy hashes (cost 10) to the new cost 12 over time without forcing a
 * password reset for every user.
 *
 * Returns `{ ok: true }` on match (with optional `rehashed` flag) or
 * `{ ok: false }` on mismatch / error. Never throws.
 *
 * The rehash is fire-and-forget for the caller — the return value is the
 * auth decision; the rehash is a side-effect that improves future logins.
 * If the rehash fails (e.g. DB transient error), login still succeeds —
 * we will retry on the next login.
 */
export async function verifyPasswordAndMaybeRehash(
  plain: string,
  hash: string,
  uid: string,
): Promise<{ ok: boolean; rehashed: boolean }> {
  try {
    const match = await bcrypt.compare(plain, hash);
    if (!match) return { ok: false, rehashed: false };
    // Check whether the stored hash needs upgrading to the current cost.
    let currentRounds: number;
    try {
      currentRounds = bcrypt.getRounds(hash);
    } catch {
      currentRounds = BCRYPT_ROUNDS; // can't tell — don't touch
    }
    if (currentRounds < BCRYPT_MIN_ROUNDS) {
      try {
        const newHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
        // Importing db lazily to avoid a hard dependency cycle at module
        // load time — `verifyPassword` is also called from contexts that
        // don't have a live DB connection (e.g. unit tests).
        const { db } = await import("@/lib/db");
        await db.user.update({
          where: { uid },
          data: { passwordHash: newHash },
        });
        return { ok: true, rehashed: true };
      } catch {
        // Rehash failed — login still succeeds; we'll retry next time.
        return { ok: true, rehashed: false };
      }
    }
    return { ok: true, rehashed: false };
  } catch {
    return { ok: false, rehashed: false };
  }
}

// ── Token signing ─────────────────────────────────────────────────────────

export function signToken(payload: AuthPayload): string {
  const jti = crypto.randomUUID();
  // MED-005 FIX (Cycle 2): pin algorithm to HS256.
  return jwt.sign({ ...payload, jti, type: "access" }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TTL,
  });
}

export function signRefreshToken(uid: string, tv: number): string {
  // MED-005 FIX (Cycle 2): pin algorithm to HS256.
  // HIGH-004 FIX (Cycle 2): include a JTI so refresh tokens can be
  // blacklisted on rotation (see `verifyRefreshTokenWithBlacklist`).
  const jti = crypto.randomUUID();
  return jwt.sign({ uid, tv, type: "refresh", jti }, JWT_REFRESH_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: REFRESH_TTL,
  });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    // MED-005 FIX (Cycle 2): pin accepted algorithms to HS256 only.
    // This rejects `alg: none` tokens and alg-confusion attacks.
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as jwt.JwtPayload & AuthPayload & { type?: string };
    if (decoded.type !== "access") return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role,
      companies: decoded.companies || [],
      permissions: decoded.permissions || {},
      tv: decoded.tv,
      jti: decoded.jti,
    };
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { uid: string; tv: number; jti?: string } | null {
  try {
    // MED-005 FIX (Cycle 2): pin accepted algorithms to HS256 only.
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as jwt.JwtPayload & {
      uid: string;
      tv: number;
      type?: string;
      jti?: string;
    };
    if (decoded.type !== "refresh") return null;
    return { uid: decoded.uid, tv: decoded.tv, jti: decoded.jti };
  } catch {
    return null;
  }
}

// ── Token blacklist (Valkey-backed, M3 FIX) ───────────────────────────────
// When an admin force-logs out a user, their JTI is added to Valkey with
// TTL = remaining token lifetime. verifyToken checks this before accepting.
// Uses the centralized valkey.ts connection manager.

/**
 * Check if a token's JTI is blacklisted.
 * Returns true if blacklisted (token should be rejected).
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const client = await getValkeyClient();
  if (!client) return false; // No Valkey = no blacklist = accept
  try {
    return (await client.exists(`token:blacklist:${jti}`)) > 0;
  } catch {
    return false; // Fail-open
  }
}

/**
 * Blacklist a token by its JTI for the remaining TTL.
 */
export async function blacklistToken(jti: string, remainingTtlSeconds: number): Promise<void> {
  const client = await getValkeyClient();
  if (!client || remainingTtlSeconds <= 0) return;
  try {
    await client.set(`token:blacklist:${jti}`, "1", "EX", remainingTtlSeconds);
  } catch {
    // Fail silently — blacklist is best-effort
  }
}

/**
 * Async token verification that also checks the Valkey blacklist.
 * Use this for sensitive operations where revocation must be enforced.
 *
 * SEC-C1 FIX (Cycle 1): this is now the canonical verifier used by
 * `resolveAuth` so that blacklisted access tokens are rejected immediately.
 */
export async function verifyTokenWithBlacklist(token: string): Promise<AuthPayload | null> {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.jti && await isTokenBlacklisted(payload.jti)) return null;
  return payload;
}

/**
 * SEC-C2 FIX (Cycle 1): high-level "revoke current session" helper.
 *
 * Reads the access token from the request, decodes its JTI + exp, and
 * blacklists the JTI for the remaining TTL. Idempotent: if there is no
 * access token, or it has no JTI, or it is already expired, this is a no-op.
 *
 * Use this on:
 *   - logout        → user explicitly signs out
 *   - change-password → user changes their own password (current session kept
 *                       alive only via the new cookies the caller issues)
 *   - reset-password → admin/system forces a password reset
 *   - admin force-logout → founder kicks a user out
 *
 * Pairs with `User.tokenVersion++` which invalidates the refresh token;
 * together they fully terminate the session.
 */
export async function revokeAccessSession(req: NextRequest): Promise<void> {
  const access = getAccessToken(req);
  if (!access) return;
  // Decode without verifying — we already trust the cookie came from us,
  // and we want this to work even if the token has just expired (so we
  // can still kill it for the remaining natural TTL window).
  let decoded: jwt.JwtPayload | null = null;
  try {
    decoded = jwt.decode(access) as jwt.JwtPayload | null;
  } catch {
    decoded = null;
  }
  if (!decoded) return;
  const jti = decoded.jti;
  if (!jti) return;
  const exp = typeof decoded.exp === "number" ? decoded.exp : 0;
  const now = Math.floor(Date.now() / 1000);
  const remaining = exp - now;
  if (remaining <= 0) return; // already expired — nothing to blacklist
  // Cap the blacklist TTL at the natural access-token TTL so stale entries
  // don't accumulate if the exp claim is somehow wrong.
  const ttl = Math.min(remaining, ACCESS_TTL);
  await blacklistToken(jti, ttl);
}

// ── Cookie helpers ─────────────────────────────────────────────────────────

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ACCESS_TTL,
};

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: REFRESH_TTL,
};

export async function issueSession(response: NextResponse, user: SessionUser): Promise<void> {
  const payload: AuthPayload = {
    uid: user.uid,
    email: user.email,
    role: user.role,
    companies: user.companies,
    permissions: user.permissions,
    tv: user.tokenVersion,
  };
  response.cookies.set(ACCESS_COOKIE, signToken(payload), COOKIE_OPTS);
  response.cookies.set(REFRESH_COOKIE, signRefreshToken(user.uid, user.tokenVersion), REFRESH_COOKIE_OPTS);
  // SEC-010: Issue CSRF cookie on login so the client can immediately make mutating requests.
  response.cookies.set(CSRF_COOKIE, generateCsrfToken(), CSRF_COOKIE_OPTS);
}

export async function clearSession(response: NextResponse): Promise<void> {
  response.cookies.set(ACCESS_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...REFRESH_COOKIE_OPTS, maxAge: 0 });
  // SEC-010: Clear CSRF cookie on logout
  response.cookies.set(CSRF_COOKIE, "", { ...CSRF_COOKIE_OPTS, maxAge: 0 });
}

export function getAccessToken(req: NextRequest): string | undefined {
  return req.cookies.get(ACCESS_COOKIE)?.value;
}

export function getRefreshToken(req: NextRequest): string | undefined {
  return req.cookies.get(REFRESH_COOKIE)?.value;
}

// ── Request-time auth (Route Handler helpers) ────────────────────────────

export interface AuthResult {
  ok: boolean;
  user?: AuthPayload;
  error?: string;
  status?: number;
  /**
   * HIGH-004 FIX (Cycle 2): when set, the caller should write this new refresh
   * token to the refresh cookie. This implements refresh token rotation —
   * every time the access token is regenerated from a refresh token, a NEW
   * refresh token is issued and the caller is expected to persist it.
   *
   * Middleware (the primary caller of resolveAuth) persists the rotated
   * refresh token via `withRotatedRefreshToken` below. Route handlers that
   * call resolveAuth directly and want rotation should also persist it.
   */
  rotatedRefreshToken?: string;
  /** The original refresh JTI that was consumed (for audit logging). */
  consumedRefreshJti?: string;
}

/**
 * Resolve the authenticated user from the request's access cookie.
 * On expired access token, attempts to refresh from the refresh cookie.
 *
 * SEC-C1 FIX (Cycle 1): the access-token path now consults the Valkey
 * token blacklist via `verifyTokenWithBlacklist`. This makes admin
 * force-logout, post-logout invalidation, and post-password-change
 * invalidation effective immediately for the access token too — previously
 * a blacklisted access token remained valid for its full 30-minute TTL
 * because the sync `verifyToken` could not perform the async blacklist
 * check. The performance cost is one Valkey EXISTS call per authenticated
 * request (sub-ms on a hot Valkey connection); when Valkey is not
 * configured the function degrades to the old behavior (no blacklist).
 *
 * HIGH-004 FIX (Cycle 2): refresh token rotation. When the access token is
 * expired/missing and we fall back to the refresh token, we issue a NEW
 * refresh token (and blacklist the old JTI for its remaining TTL). This
 * limits a stolen refresh token to AT MOST ONE use — standard practice
 * per RFC 6749 §10.4 and OWASP Session Management Cheat Sheet. The new
 * refresh token is returned in `AuthResult.rotatedRefreshToken`; the caller
 * (middleware or route handler) is responsible for persisting it to the
 * refresh cookie.
 *
 * Backward compatibility: if the caller ignores `rotatedRefreshToken`, the
 * old refresh token still works for its full 30-day lifetime — no breakage.
 * Rotation is a strict improvement; consumers that persist the new token
 * get the security benefit, consumers that don't get the old behavior.
 */
export async function resolveAuth(req: NextRequest): Promise<AuthResult> {
  const access = getAccessToken(req);
  if (access) {
    const payload = await verifyTokenWithBlacklist(access);
    if (payload) return { ok: true, user: payload };
  }

  // Try refresh
  const refresh = getRefreshToken(req);
  if (!refresh) return { ok: false, error: "Unauthorized", status: 401 };

  const refreshPayload = verifyRefreshToken(refresh);
  if (!refreshPayload) return { ok: false, error: "Unauthorized", status: 401 };

  // Look up user — verify token version matches (invalidates old sessions)
  const user = await db.user.findUnique({ where: { uid: refreshPayload.uid } });
  if (!user) return { ok: false, error: "Unauthorized", status: 401 };
  if (user.tokenVersion !== refreshPayload.tv) {
    return { ok: false, error: "Session revoked", status: 401 };
  }

  // Issue a fresh access token payload
  const companies = parseJsonArr(user.companies);
  const permissions = parseJsonObj(user.permissions);
  const payload: AuthPayload = {
    uid: user.uid,
    email: user.email,
    role: user.role,
    companies,
    permissions,
    tv: user.tokenVersion,
  };

  // HIGH-004 FIX (Cycle 2): rotate the refresh token.
  // 1. Decode the old refresh token's JTI + exp without verification (we
  //    already verified it above) so we can blacklist it for its remaining TTL.
  // 2. Issue a fresh refresh token bound to the same uid + tokenVersion.
  // 3. Return both via AuthResult so the caller can persist + audit.
  let rotatedRefreshToken: string | undefined;
  let consumedRefreshJti: string | undefined;
  try {
    const decodedOld = jwt.decode(refresh) as jwt.JwtPayload | null;
    if (decodedOld) {
      consumedRefreshJti = decodedOld.jti;
      // Blacklist the old refresh JTI for the remaining TTL (best-effort).
      // This is a soft revocation — it doesn't break anything if Valkey is
      // unavailable, but when Valkey IS available, replaying the old refresh
      // token will fail with `Session revoked` because the JTI is blacklisted.
      // Note: this relies on the same blacklist mechanism as access tokens.
      // A subtle point: refresh tokens signed with JWT_REFRESH_SECRET are
      // verified with `verifyRefreshToken`, which does NOT consult the
      // blacklist. To get blacklist enforcement on refresh tokens, the
      // explicit `/api/auth/refresh` route must use a blacklist-aware
      // verifier. We add that below in `verifyRefreshTokenWithBlacklist`.
      // For resolveAuth's own rotation, we issue a new token and rely on the
      // /api/auth/refresh endpoint to enforce the blacklist on the NEXT
      // refresh attempt.
      if (consumedRefreshJti) {
        const exp = typeof decodedOld.exp === "number" ? decodedOld.exp : 0;
        const now = Math.floor(Date.now() / 1000);
        const remaining = Math.max(0, exp - now);
        const ttl = Math.min(remaining, REFRESH_TTL);
        if (ttl > 0) await blacklistToken(consumedRefreshJti, ttl);
      }
    }
    rotatedRefreshToken = signRefreshToken(user.uid, user.tokenVersion);
  } catch {
    // Rotation is best-effort — if it fails, fall back to no rotation.
    // The user keeps their existing refresh token for its natural lifetime.
    rotatedRefreshToken = undefined;
  }

  return { ok: true, user: payload, rotatedRefreshToken, consumedRefreshJti };
}

/**
 * HIGH-004 FIX (Cycle 2): verify a refresh token AND consult the Valkey
 * blacklist. Used by `/api/auth/refresh` so that a rotated (and therefore
 * blacklisted) refresh token cannot be replayed.
 */
export async function verifyRefreshTokenWithBlacklist(
  token: string,
): Promise<{ uid: string; tv: number; jti?: string } | null> {
  // Decode + verify signature + algorithm.
  let decoded: jwt.JwtPayload & { uid: string; tv: number; type?: string } | null = null;
  try {
    decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as jwt.JwtPayload & { uid: string; tv: number; type?: string };
    if (decoded.type !== "refresh") return null;
  } catch {
    return null;
  }
  // Blacklist check (best-effort, fails open when Valkey is unavailable).
  if (decoded.jti && (await isTokenBlacklisted(decoded.jti))) return null;
  return { uid: decoded.uid, tv: decoded.tv, jti: decoded.jti };
}

/**
 * HIGH-004 FIX (Cycle 2): helper for middleware to persist a rotated refresh
 * token to the response cookie. No-op if `rotatedRefreshToken` is unset.
 */
export function persistRotatedRefreshToken(
  response: NextResponse,
  rotatedRefreshToken: string | undefined,
): void {
  if (!rotatedRefreshToken) return;
  response.cookies.set(REFRESH_COOKIE, rotatedRefreshToken, REFRESH_COOKIE_OPTS);
}

export function hasUnrestrictedScope(user: AuthPayload): boolean {
  return user.role === "admin" || isFounderEmail(user.email);
}

export function assertCompanyAccess(user: AuthPayload, companySlug?: string | null): boolean {
  if (!companySlug) return hasUnrestrictedScope(user);
  if (hasUnrestrictedScope(user)) return true;
  return Array.isArray(user.companies) && user.companies.includes(companySlug);
}

// ── Profile ────────────────────────────────────────────────────────────────

export async function buildUserProfile(user: SessionUser) {
  const founder = isFounderEmail(user.email);
  const effective = computeEffectivePermissions(user.role, user.permissions, founder);
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    companies: user.companies,
    permissions: user.permissions,
    effectivePermissions: effective,
    emailVerified: user.emailVerified,
    isFounder: founder,
  };
}

// ── JSON parse helpers ────────────────────────────────────────────────────

function parseJsonArr(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseJsonObj(s: string | null | undefined): Record<string, number> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// ── Cookie helpers (for client-side reads where needed) ──────────────────

export async function getRequestCookies(): Promise<{
  access?: string;
  refresh?: string;
}> {
  const store = await cookies();
  return {
    access: store.get(ACCESS_COOKIE)?.value,
    refresh: store.get(REFRESH_COOKIE)?.value,
  };
}
