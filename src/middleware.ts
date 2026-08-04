/**
 * middleware.ts — Lightweight Edge-safe middleware.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE FIX (Vercel infinite-loading RCA):
 *
 * The previous version of this middleware imported `@/lib/auth` (which pulls
 * in `jsonwebtoken`, `bcryptjs`, Prisma) and `@/lib/rateLimit` (which pulls
 * in `ioredis`). With `runtime: "nodejs"` set, Vercel ran the middleware as
 * a serverless function. On cold start the middleware's import chain alone
 * could take 3–10s, and on Hobby-tier (10s function timeout) this hung the
 * first /api/auth/me call indefinitely — leaving AuthContext in `loading`
 * state forever, which trapped the UI on <PageLoader />.
 *
 * The middleware is now responsible for ONLY:
 *   1. Security headers (CSP, HSTS, X-Frame-Options, etc.)
 *   2. CSRF double-submit verification (cookie + header, pure string compare)
 *   3. CSRF cookie issuance (crypto.randomUUID — no I/O)
 *   4. Cache-Control for /api/auth/* responses
 *
 * It NO LONGER:
 *   - Calls resolveAuth (was pulling Prisma + JWT + Valkey)
 *   - Calls rateLimitResponse (was pulling ioredis)
 *   - Reads the access/refresh JWT cookies
 *   - Queries the database
 *   - Touches Redis/Valkey
 *   - Redirects unauthenticated page requests to /login (each page now does
 *     its own client-side auth check via useAuth())
 *   - Sets the `x-user-payload` header (no route handler ever read it —
 *     every route handler already calls resolveAuth(req) itself)
 *
 * Auth + rate limiting now happen INSIDE each Route Handler via the
 * existing `requireAuth()` and `withRateLimit()` helpers in `@/lib/api`.
 * This is the correct architectural location for them on Vercel because
 * Route Handlers are independently scalable serverless functions with
 * their own timeout budgets, while middleware runs on the critical path
 * of EVERY request including static page renders.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { CSRF_COOKIE, generateCsrfToken, CSRF_COOKIE_OPTS } from "@/lib/cookies";

// ── Public auth routes that don't need CSRF verification ────────────────────
// These POST endpoints are called BEFORE the user has a CSRF cookie (login,
// register, forgot-password, reset-password). They are exempt from CSRF
// enforcement. All other mutating endpoints require the double-submit token.
const CSRF_EXEMPT_ROUTES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/refresh",  // refresh only rotates tokens; can't be read cross-origin
];

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

// ── Security headers ────────────────────────────────────────────────────────
//
// MED-008 FIX (Cycle 2): X-XSS-Protection set to "0" (was "1; mode=block").
//   The header is deprecated and modern browsers ignore it. In old browsers
//   (IE, old Safari) the "1; mode=block" value can introduce vulnerabilities
//   via the IE XSS auditor. OWASP recommends "0". The real XSS defense is
//   the Content-Security-Policy header.
//
// LOW-002 FIX (Cycle 2): added Cross-Origin-Opener-Policy and
//   Cross-Origin-Embedder-Policy. These defend against Spectre-class side
//   channel attacks by isolating the browsing context.

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.openrouter.ai",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  ...(process.env.NODE_ENV === "production" ? {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  } : {}),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function withSecurityHeaders(response: NextResponse, pathname?: string): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  // LOW-004 FIX (Cycle 2): never cache auth responses. A cached 401 could
  // be served to a different user behind a misconfigured proxy; a cached
  // 200 with a Set-Cookie could leak session cookies.
  if (pathname && pathname.startsWith("/api/auth/")) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }
  // Unique request ID per invocation — useful for log correlation.
  response.headers.set("X-Request-ID", crypto.randomUUID());
  return response;
}

// ── Middleware ──────────────────────────────────────────────────────────────

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // ── 1. CSRF double-submit verification for mutating methods ────────────
  // Pure string comparison — no DB, no JWT, no Redis. The inv_csrf cookie
  // is httpOnly? NO — it must be readable by JS so it can be echoed in the
  // X-CSRF-Token header. The double-submit pattern works because an
  // attacker on another origin cannot read the cookie (same-origin policy)
  // and therefore cannot forge the header.
  if (
    MUTATING_METHODS.includes(req.method) &&
    !CSRF_EXEMPT_ROUTES.includes(pathname)
  ) {
    const csrfCookie = req.cookies.get(CSRF_COOKIE)?.value;
    const csrfHeader = req.headers.get("x-csrf-token");

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      const response = NextResponse.json(
        { error: "رمز حماية CSRF غير صالح أو مفقود" },
        { status: 403 },
      );
      return withSecurityHeaders(response, pathname);
    }
  }

  // ── 2. Continue with security headers + CSRF cookie (if missing) ───────
  const response = NextResponse.next();

  // Issue/refresh CSRF cookie on every response so the client always has
  // a fresh token. If the cookie is already set, we keep it.
  const existingCsrf = req.cookies.get(CSRF_COOKIE)?.value;
  if (!existingCsrf) {
    const newCsrf = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE, newCsrf, CSRF_COOKIE_OPTS);
  }

  return withSecurityHeaders(response, pathname);
}

// ── Matcher ─────────────────────────────────────────────────────────────────
//
// Apply security headers (CSP, HSTS, etc.) to ALL routes, not just /api/*.
// Page routes also need CSP to prevent XSS in the SPA shell.
// Excludes Next.js internal asset paths so static files aren't slowed down.

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
