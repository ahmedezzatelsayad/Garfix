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

// SEC-002 FIX: No fallback secrets — throw if missing in production
function resolveSecret(envVar: string, name: string): string {
  const val = process.env[envVar];
  if (!val) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`FATAL: ${name} environment variable is not set. Refusing to start with insecure defaults.`);
    }
    // In dev only, use a deterministic but clearly-marked dev secret
    console.warn(`⚠️  ${name} not set — using dev default. DO NOT use in production.`);
    return `dev-only-${name.toLowerCase()}-not-for-production-${Date.now()}`;
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
  return jwt.sign({ ...payload, type: "access" }, JWT_SECRET, { expiresIn: ACCESS_TTL });
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
    const payload = verifyToken(access);
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
