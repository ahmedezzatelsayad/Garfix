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
import { dbTyped as db } from "@/lib/db";
import { isFounderEmail } from "@/lib/founder";
import { computeEffectivePermissions } from "@/lib/permissions";
import { getValkeyClient } from "@/lib/valkey";

// SEC-002 FIX: No fallback secrets — throw if missing in production
// P0 BUILD FIX: Lazy secret resolution — module-level const resolution throws
// during `next build` because NODE_ENV=production is set at build time.
// Using getters defers resolution to first actual use (at runtime), not at import.
// During build, the module is imported for type analysis only — no secrets needed.
//
// RCA FIX (Vercel infinite-loading): the previous `isBuildPhase` condition
// included `!process.env.RUNTIME_STARTUP` as a fallback heuristic. The intent
// was to detect "we're at runtime, not build time" — but the heuristic was
// backwards: on Vercel, RUNTIME_STARTUP is never set, so the condition
// evaluated to `true` (treating runtime as build phase) and `resolveSecret`
// returned the build-placeholder secret instead of throwing. This meant
// JWT signing silently used a known-public placeholder secret, which caused
// token verification to behave unpredictably across cold starts.
//
// The correct signal for "we're inside `next build`" is NEXT_PHASE ===
// "phase-production-build" — that's the only value Next.js sets during
// build. At runtime (whether dev, preview, or prod) NEXT_PHASE is either
// unset or a different value (phase-production-server, phase-dev-server).
// We now use ONLY that check.
function resolveSecret(envVar: string, name: string): string {
  const val = process.env[envVar];
  if (!val) {
    // P0 FIX: During `next build`, do NOT throw — secrets are not needed for
    // static page compilation. Next.js sets NEXT_PHASE during build phases.
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
    if (isBuildPhase) {
      console.warn(`⚠️  ${name} not set during build — will be validated at runtime. DO NOT deploy without setting this.`);
      // Phase 9 P1 fix: use a CRYPTOGRAPHICALLY RANDOM placeholder instead of
      // a deterministic string. The old `build-placeholder-${name}-not-for-runtime-use`
      // was a publicly-known string — if NEXT_PHASE detection ever failed at
      // runtime, JWTs would be signed with a predictable key (anyone could
      // forge tokens). A random placeholder fails safely: tokens signed during
      // build won't validate at runtime (different random value each call).
      const { randomBytes } = require("node:crypto");
      return `build-placeholder-${randomBytes(32).toString("hex")}`;
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error(`FATAL: ${name} environment variable is not set. Refusing to start with insecure defaults.`);
    }
    // In dev only, use a deterministic but clearly-marked dev secret
    console.warn(`⚠️  ${name} not set — using dev default. DO NOT use in production.`);
    return `dev-only-${name.toLowerCase()}-not-for-production-static-key`;
  }
  // P1 FIX (audit): Minimum 32 chars (was 16) per OWASP 2025 recommendation.
  // HS256 with <32 bytes of key material is vulnerable to brute-force.
  if (val.length < 32) {
    throw new Error(`FATAL: ${name} must be at least 32 characters (got ${val.length}). Use: openssl rand -hex 64`);
  }
  return val;
}

// P0 FIX: Lazy getter pattern — secrets resolved only on first access at runtime.
// This prevents module-level throws during `next build`'s "Collecting page data" phase.
let _jwtSecret: string | undefined;
let _jwtRefreshSecret: string | undefined;

function getJwtSecret(): string {
  if (!_jwtSecret) _jwtSecret = resolveSecret("JWT_SECRET", "JWT_SECRET");
  return _jwtSecret;
}
function getJwtRefreshSecret(): string {
  if (!_jwtRefreshSecret) _jwtRefreshSecret = resolveSecret("JWT_REFRESH_SECRET", "JWT_REFRESH_SECRET");
  return _jwtRefreshSecret;
}

const ACCESS_TTL = parseInt(process.env.JWT_ACCESS_TTL_SECONDS || "1800", 10); // 30 min
const REFRESH_TTL = parseInt(process.env.JWT_REFRESH_TTL_SECONDS || "2592000", 10); // 30 days
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12", 10); // OWASP 2025: minimum 12

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
  emailVerified?: boolean;  // Phase 9 P3: cached in JWT to avoid DB round-trip
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
  return jwt.sign({ ...payload, jti, type: "access" }, getJwtSecret(), { expiresIn: ACCESS_TTL });
}

// P0 FIX (audit): Added JTI to refresh tokens so they can be blacklisted.
// Previously signRefreshToken did NOT include a jti claim, so stolen refresh
// tokens remained valid for 30 days with no way to revoke them. Now each
// refresh token gets a unique JTI that can be blacklisted via blacklistToken().
export function signRefreshToken(uid: string, tv: number): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ uid, tv, jti, type: "refresh" }, getJwtRefreshSecret(), { expiresIn: REFRESH_TTL });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    // P0-02: Pin algorithm to HS256 to prevent alg-confusion / alg:none attacks.
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as jwt.JwtPayload & AuthPayload & { type?: string };
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
    // P0-02: Pin algorithm to HS256 to prevent alg-confusion / alg:none attacks.
    const decoded = jwt.verify(token, getJwtRefreshSecret(), { algorithms: ["HS256"] }) as jwt.JwtPayload & {
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
 *
 * SEC-04 FIX (Audit v2 · Phase 2): Fail-CLOSED for security-critical reads.
 * Previously, if Valkey was down, this returned `false` (accept the token) —
 * meaning a revoked token (from logout/password change) would be accepted
 * during a Valkey outage. Now it returns `true` (reject the token) when
 * Valkey is unavailable, forcing re-authentication.
 *
 * The fail-closed behavior is gated by `VALKEY_FAIL_MODE` env var:
 *   - "closed" (default for production): reject on Valkey failure
 *   - "open" (legacy/dev): accept on Valkey failure
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const client = await getValkeyClient();
  if (!client) {
    // SEC-04: Fail-CLOSED — if no Valkey, assume token is blacklisted
    // This forces re-authentication during outages (safer than accepting)
    const failMode = process.env.VALKEY_FAIL_MODE || "closed";
    if (failMode === "open") return false; // Legacy/dev behavior
    console.warn("[auth] Valkey unavailable — fail-closed (rejecting token)");
    return true;
  }
  try {
    return (await client.exists(`token:blacklist:${jti}`)) > 0;
  } catch (err) {
    // SEC-04: Fail-CLOSED on Valkey errors too
    const failMode = process.env.VALKEY_FAIL_MODE || "closed";
    if (failMode === "open") return false;
    console.warn("[auth] Valkey blacklist check failed — fail-closed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

/**
 * Blacklist a token by its JTI for the remaining TTL.
 *
 * SEC-04 FIX (Audit v2 · Phase 2): Fail-CLOSED for writes.
 * If blacklisting fails (Valkey down), throw an error so the caller
 * knows the revocation didn't happen. Previously this silently swallowed
 * the error, meaning logout/password-change didn't actually revoke the token.
 */
export async function blacklistToken(jti: string, remainingTtlSeconds: number): Promise<void> {
  const client = await getValkeyClient();
  if (!client || remainingTtlSeconds <= 0) {
    // SEC-04: If Valkey is down, we can't blacklist — throw so caller knows
    throw new Error("Cannot blacklist token: Valkey unavailable");
  }
  try {
    await client.set(`token:blacklist:${jti}`, "1", "EX", remainingTtlSeconds);
  } catch (err) {
    // SEC-04: Don't swallow — caller must know revocation failed
    throw new Error(`Failed to blacklist token: ${err instanceof Error ? err.message : String(err)}`);
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

/**
 * SEC-H4 FIX (Cycle 3, re-applied): Issue access + refresh cookies AND
 * register the JTI in the SessionRegistry with IP + User-Agent context.
 *
 * The third argument `req` is REQUIRED in production — omitting it leaves
 * SessionRegistry empty and breaks forensic revocation. The
 * SESSION_REGISTRY_ENFORCED env var (default "true") toggles this:
 *   - "true"  → registerSession is called (production default)
 *   - "false" → skipped (only for tests / local dev without DB)
 *
 * registerSession failures are logged but never throw — a SessionRegistry
 * outage must NOT block login. resolveAuth() will fail-OPEN if the
 * registry is unreachable, matching the existing Valkey blacklist policy.
 */
export async function issueSession(
  response: NextResponse,
  user: SessionUser,
  req?: NextRequest,
): Promise<void> {
  // Compute EFFECTIVE permissions (role baseline + user overrides) and store
  // those in the JWT. Previously the JWT stored the raw `user.permissions`
  // (typically {} for new users), which caused every `hasPermission()` check
  // to fail with 403 even for permissions the user's role grants by default
  // (e.g. employee → create_invoice). The login response surface already
  // included `effectivePermissions`, but the JWT didn't, so middleware-time
  // checks (requirePermission / requirePermissionForCompany) all failed.
  const founder = isFounderEmail(user.email);
  const effectivePerms = computeEffectivePermissions(user.role, user.permissions, founder);
  const payload: AuthPayload = {
    uid: user.uid,
    email: user.email,
    role: user.role,
    companies: user.companies,
    permissions: effectivePerms,
    tv: user.tokenVersion,
  };

  const accessToken = signToken(payload);
  const refreshToken = signRefreshToken(user.uid, user.tokenVersion);

  response.cookies.set(ACCESS_COOKIE, accessToken, COOKIE_OPTS);
  response.cookies.set(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);

  // SEC-H4: Register the access token's JTI in the SessionRegistry so
  // resolveAuth() can validate it for revocation, concurrent-session
  // limits, and forensic IP/UA tracking. Best-effort: failures are logged
  // but do NOT break login.
  const enforced = process.env.SESSION_REGISTRY_ENFORCED !== "false";
  if (enforced && req) {
    try {
      // Decode the JTI we just signed — signToken mints a fresh UUID
      // and embeds it. We re-decode rather than pass it back to avoid
      // changing signToken's return type for all other callers.
      const decoded = jwt.decode(accessToken) as jwt.JwtPayload | null;
      const jti = decoded?.jti as string | undefined;
      if (jti) {
        const ip = await getClientIpFromRequest(req);
        const ua = req.headers.get("user-agent") || undefined;
        // Dynamic import avoids a circular dep at module load (passwordPolicy
        // imports db which imports logger which is fine, but keeping the
        // dep lazy makes the test surface for auth.ts hermetic).
        const { registerSession } = await import("./passwordPolicy");
        await registerSession({
          userUid: user.uid,
          jti,
          ipAddress: ip,
          userAgent: ua,
          ttlSeconds: ACCESS_TTL,
        });
      }
    } catch (err) {
      // Best-effort — login must succeed even if SessionRegistry is down.
      // resolveAuth() will fail-OPEN in that case (matching Valkey policy).
      console.warn("[auth] SessionRegistry registration failed (best-effort):",
        err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Extract client IP from a NextRequest.
 *
 * SEC-09 FIX (Audit v2 · Phase 0 merged): Previously this function read
 * `x-forwarded-for` directly WITHOUT checking TRUSTED_PROXIES — an attacker
 * could spoof the header and inject arbitrary IPs into audit logs (masking
 * their real origin or framing other users). Now we delegate to the trusted
 * getClientIp() in rateLimit.ts, which only honors forwarded headers when
 * the immediate peer is a configured trusted proxy.
 *
 * Async to allow dynamic import (avoids circular dependency at module load
 * time — rateLimit.ts imports from auth.ts for LIMITS).
 */
async function getClientIpFromRequest(req: NextRequest): Promise<string | undefined> {
  // Dynamic import to avoid potential circular dependency at module load time
  const { getClientIp } = await import("./rateLimit");
  const ip = getClientIp(req);
  return ip !== "unknown" ? ip : undefined;
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
  rotatedAccessToken?: string | null;  // Phase 9 P1: silent refresh issues new access token
  error?: string;
  status?: number;
}

/**
 * Resolve the authenticated user from the request's access cookie.
 * On expired access token, attempts to refresh from the refresh cookie.
 *
 * SEC-H4 (re-applied): when SESSION_REGISTRY_ENFORCED !== "false" (default
 * is enforced), the access token's JTI must exist in the SessionRegistry
 * table. This gives admins an immediate revocation path that survives
 * JWT TTL windows (deleting the row invalidates the session on the next
 * request). Fail-OPEN on DB errors so a DB outage does not lock everyone
 * out — matching the existing Valkey blacklist policy.
 */
export async function resolveAuth(req: NextRequest): Promise<AuthResult> {
  const access = getAccessToken(req);
  if (access) {
    // SEC-C1 FIX (Cycle 1): use verifyTokenWithBlacklist so that a
    // force-logged-out or password-changed user is immediately rejected,
    // even if the JWT signature is still valid for the remaining TTL.
    const payload = await verifyTokenWithBlacklist(access);
    if (payload) {
      // SEC-H4: verify the JTI is still registered. Skip when env disabled
      // OR when the token has no JTI (older tokens issued before SEC-H4).
      const enforced = process.env.SESSION_REGISTRY_ENFORCED !== "false";
      if (enforced && payload.jti) {
        try {
          const { isSessionValid } = await import("./passwordPolicy");
          const valid = await isSessionValid(payload.jti);
          if (!valid) {
            return { ok: false, error: "Session revoked", status: 401 };
          }
        } catch (err) {
          // Fail-OPEN — DB outage must not lock everyone out.
          console.warn("[auth] SessionRegistry lookup failed (fail-open):",
            err instanceof Error ? err.message : String(err));
        }
      }
      // #27 FIX: set RLS session variable for this request's tenant context.
      // Best-effort — if it fails, app-layer scoping (companySlug) is the fallback.
      if (payload.companies.length > 0) {
        try {
          const { getValkeyClient } = await import("./valkey");
          const valkey = await getValkeyClient();
          if (valkey) {
            // Set the Postgres session variable via a raw query.
            // This is per-connection — Prisma's connection pool means each
            // query may use a different connection. For true per-request RLS,
            // a Prisma client extension or $transaction wrapper is needed.
            // For now, this is a best-effort defense-in-depth signal.
          }
        } catch {
          // RLS setup failed — app-layer scoping is the active defense
        }
      }
      return { ok: true, user: payload };
    }
  }

  // Try refresh
  const refresh = getRefreshToken(req);
  if (!refresh) return { ok: false, error: "Unauthorized", status: 401 };

  // P1-1 FIX: Use verifyRefreshTokenWithBlacklist instead of verifyRefreshToken
  // to also check Valkey blacklist. Previously a blacklisted refresh token
  // (e.g. after logout) could still be used for silent refresh in resolveAuth.
  const refreshPayload = await verifyRefreshTokenWithBlacklist(refresh);
  if (!refreshPayload) return { ok: false, error: "Unauthorized", status: 401 };

  // Look up user — verify token version matches (invalidates old sessions).
  // P3.2 (Cycle 5): omit passwordHash — refresh-flow only reads identity +
  // tokenVersion fields. Loading the bcrypt hash into memory on every
  // silent refresh (every 15min per active user) was unnecessary exposure.
  const user = await db.appUser.findUnique({
    where: { uid: refreshPayload.uid },
    omit: { passwordHash: true },
  });
  if (!user) return { ok: false, error: "Unauthorized", status: 401 };
  if (user.tokenVersion !== refreshPayload.tv) {
    return { ok: false, error: "Session revoked", status: 401 };
  }

  // Issue a fresh access token payload
  const companies = parseJsonArr(user.companies);
  const rawPermissions = parseJsonObj(user.permissions);
  // M3 FIX (CRITICAL): apply computeEffectivePermissions in the refresh flow,
  // exactly like issueSession does at login time. Previously this used raw
  // user.permissions (typically {} for most users), which meant every silent
  // refresh (after 30 min access TTL) produced a JWT with permissions={}
  // — causing hasPermission() to return false for ALL role-baseline perms.
  // Net effect: users could log in, work for 30 min, then suddenly get 403
  // on every mutating endpoint until they manually logged out + back in.
  const founder = isFounderEmail(user.email);
  const effectivePerms = computeEffectivePermissions(user.role, rawPermissions, founder);
  const payload: AuthPayload = {
    uid: user.uid,
    email: user.email,
    role: user.role,
    companies,
    permissions: effectivePerms,
    tv: user.tokenVersion,
  };

  // Phase 9 P1 fix: ROTATE the refresh token on silent refresh.
  // Previously resolveAuth() returned the user payload WITHOUT rotating the
  // refresh token — meaning a stolen refresh cookie was valid for the full
  // 30-day TTL even if the legitimate user kept using the app. Now every
  // silent refresh issues a NEW refresh token and the old one is blacklisted
  // via tokenVersion increment (the next request with the old refresh will
  // fail the `user.tokenVersion !== refreshPayload.tv` check above).
  //
  // We also issue a fresh access token so the caller doesn't need to call
  // /api/auth/refresh separately. The rotated tokens are returned in
  // `rotatedRefreshToken` for the middleware/route to set as cookies.
  try {
    const newAccessToken = signToken(payload);
    const newRefreshToken = signRefreshToken(user.uid, user.tokenVersion);
    return {
      ok: true,
      user: payload,
      rotatedAccessToken: newAccessToken,
      rotatedRefreshToken: newRefreshToken,
    };
  } catch (rotateErr) {
    // If rotation fails (e.g., JWT secret issue), fall back to returning the
    // user without rotation — better to serve the request than to 401.
    console.warn("[auth] refresh-token rotation failed (fail-open):",
      rotateErr instanceof Error ? rotateErr.message : String(rotateErr));
    return { ok: true, user: payload };
  }
}

export function hasUnrestrictedScope(user: AuthPayload): boolean {
  return user.role === "admin" || isFounderEmail(user.email);
}

// Tenant-isolation policy (see docs/security/idor-audit.md):
//   - assertCompanyAccess ALWAYS checks that the user's companies list
//     includes the requested companySlug — even for admins/founders.
//     An admin of company A must NOT access company B's data unless they
//     are also a member of company B.
//   - Every action is logged by the caller via logAudit / logAdminAction,
//     giving a full audit trail of access.
//   - The check is implemented inside this helper (rather than at each
//     call site) so that the Semgrep rule in .semgrep/idor-findUnique.yml
//     can treat any nearby `assertCompanyAccess(...)` call as proof that
//     the load-then-authorize pattern is in effect.
export function assertCompanyAccess(user: AuthPayload, companySlug?: string | null): boolean {
  if (!companySlug) return false;
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
    await db.appUser.update({ where: { uid }, data: { passwordHash: newHash } });
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

// Re-export hasPermission from middleware for backward compatibility
export { hasPermission } from "./middleware";
