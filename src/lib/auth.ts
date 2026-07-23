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
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isFounderEmail } from "@/lib/founder";
import { computeEffectivePermissions } from "@/lib/permissions";
import { getValkeyClient } from "@/lib/valkey";

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
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);

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

// ── Token signing ─────────────────────────────────────────────────────────

export function signToken(payload: AuthPayload): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti, type: "access" }, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(uid: string, tv: number): string {
  return jwt.sign({ uid, tv, type: "refresh" }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & AuthPayload & { type?: string };
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

export function verifyRefreshToken(token: string): { uid: string; tv: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as jwt.JwtPayload & {
      uid: string;
      tv: number;
      type?: string;
    };
    if (decoded.type !== "refresh") return null;
    return { uid: decoded.uid, tv: decoded.tv };
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
 */
export async function verifyTokenWithBlacklist(token: string): Promise<AuthPayload | null> {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.jti && await isTokenBlacklisted(payload.jti)) return null;
  return payload;
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
}

export async function clearSession(response: NextResponse): Promise<void> {
  response.cookies.set(ACCESS_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...REFRESH_COOKIE_OPTS, maxAge: 0 });
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
  rotatedRefreshToken?: string | null;
  error?: string;
  status?: number;
}

/**
 * Resolve the authenticated user from the request's access cookie.
 * On expired access token, attempts to refresh from the refresh cookie.
 */
export async function resolveAuth(req: NextRequest): Promise<AuthResult> {
  const access = getAccessToken(req);
  if (access) {
    // SEC-C1 FIX (Cycle 1): use verifyTokenWithBlacklist so that a
    // force-logged-out or password-changed user is immediately rejected,
    // even if the JWT signature is still valid for the remaining TTL.
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
  return { ok: true, user: payload };
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

// ── Additional auth helpers ──────────────────────────────────────────────────

/**
 * Persist a rotated refresh token cookie on the response.
 * Called by middleware when resolveAuth rotates the refresh token silently.
 */
export function persistRotatedRefreshToken(
  response: NextResponse,
  rotatedToken: string | null | undefined,
): void {
  if (!rotatedToken) return;
  response.cookies.set(REFRESH_COOKIE, rotatedToken, REFRESH_COOKIE_OPTS);
}

/**
 * Revoke the current access session by blacklisting the access token's JTI.
 * Used on logout and password change to immediately invalidate the session.
 */
export async function revokeAccessSession(req: NextRequest): Promise<void> {
  const access = getAccessToken(req);
  if (!access) return;
  const payload = verifyToken(access);
  if (!payload?.jti) return;
  // Estimate remaining TTL from the token's exp claim
  const decoded = jwt.decode(access) as jwt.JwtPayload | null;
  const exp = decoded?.exp ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, exp - now);
  if (remaining > 0) {
    await blacklistToken(payload.jti, remaining);
  }
}

/**
 * Verify a password and rehash it if the bcrypt cost factor is lower than
 * the current configured rounds. Returns { ok, rehashed }.
 */
export async function verifyPasswordAndMaybeRehash(
  plain: string,
  hash: string,
  uid: string,
): Promise<{ ok: boolean; rehashed?: boolean }> {
  const match = await verifyPassword(plain, hash);
  if (!match) return { ok: false };

  // Check if the hash cost is lower than our current rounds — rehash if so
  const hashRounds = parseInt(hash.split("$")[2], 10);
  if (hashRounds < BCRYPT_ROUNDS) {
    const newHash = await hashPassword(plain);
    await db.user.update({ where: { uid }, data: { passwordHash: newHash } });
    return { ok: true, rehashed: true };
  }
  return { ok: true, rehashed: false };
}

/**
 * Verify a refresh token AND check its JTI against the Valkey blacklist.
 * Returns the { uid, tv, jti } payload or null if invalid/blacklisted.
 */
export async function verifyRefreshTokenWithBlacklist(
  token: string,
): Promise<{ uid: string; tv: number; jti?: string } | null> {
  const payload = verifyRefreshToken(token);
  if (!payload) return null;

  // Decode to get JTI — refresh tokens issued after HIGH-004 FIX include a JTI
  const decoded = jwt.decode(token) as jwt.JwtPayload | null;
  const jti = decoded?.jti;
  if (jti && await isTokenBlacklisted(jti)) return null;

  return { ...payload, jti };
}
