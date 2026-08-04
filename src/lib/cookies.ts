/**
 * cookies.ts — Centralized cookie options.
 *
 * Single source of truth for httpOnly/secure/sameSite/maxAge settings.
 * All auth/session cookies MUST use these — never inline literal objects.
 */

const SECURE = process.env.NODE_ENV === "production";
const SAME_SITE: "lax" | "strict" | "none" = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none") || "lax";

/** Short-lived access token (30 min default). */
export const ACCESS_COOKIE = "inv_token";
export const ACCESS_TTL = parseInt(process.env.JWT_ACCESS_TTL_SECONDS || "1800", 10);

/** Long-lived refresh token (30 days default). */
export const REFRESH_COOKIE = "inv_refresh";
export const REFRESH_TTL = parseInt(process.env.JWT_REFRESH_TTL_SECONDS || "2592000", 10);

/** CSRF double-submit cookie (readable by JS to echo in X-CSRF-Token header). */
export const CSRF_COOKIE = "inv_csrf";
export const CSRF_TTL = 1800;

export const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: SECURE,
  sameSite: SAME_SITE,
  path: "/",
  maxAge: ACCESS_TTL,
} as const;

export const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: SECURE,
  sameSite: SAME_SITE,
  path: "/",
  maxAge: REFRESH_TTL,
} as const;

/** CSRF cookie is NOT httpOnly — JS must read it to echo in X-CSRF-Token header. */
export const CSRF_COOKIE_OPTS = {
  httpOnly: false,
  secure: SECURE,
  sameSite: SAME_SITE,
  path: "/",
  maxAge: CSRF_TTL,
} as const;

/**
 * Generate a CSRF token (32 random bytes → 64-char hex string).
 *
 * Uses the Web Crypto API (globalThis.crypto) which is available in both
 * the Edge Runtime and Node.js 19+, so this function is safe to call
 * from middleware (which now runs on Edge) and from Route Handlers.
 *
 * Previously this used `node:crypto.randomBytes()` — that broke when
 * middleware was migrated off `runtime: "nodejs"` because node:crypto
 * is not available in the Edge Runtime.
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
