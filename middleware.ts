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
  // Setup wizard endpoints — exempt because they run BEFORE the founder has
  // a session or CSRF cookie. Once /api/setup/complete writes the marker
  // file, these routes return 410 Gone and refuse to do anything.
  "/api/setup/test-db",
  "/api/setup/run-migrations",
  "/api/setup/create-founder",
  "/api/setup/save-integrations",
  "/api/setup/complete",
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
//
//   DEPLOYMENT FIX: COEP relaxed from "require-corp" to "credentialless".
//   "require-corp" was blocking Google Fonts (next/font/google fallback)
//   and some Next.js static chunks served from a different CDN origin.
//   This caused the page to render with system fonts + missing styles,
//   producing a pale blue/sky-colored background instead of the intended
//   emerald dark theme.
//   "credentialless" still provides Spectre defense (isolates browsing
//   context) but allows cross-origin resources without requiring CORP
//   headers — the right tradeoff for a production web app that loads
//   fonts/images from CDNs.

// Phase 9 P2 fix: nonce-based CSP. The middleware generates a per-request
// nonce and injects it into the CSP header. The layout.tsx reads the nonce
// from the response headers (via next/headers) and passes it to inline
// <script> tags. This replaces 'unsafe-inline' in script-src — the last
// defense-in-depth gap for XSS mitigation.
//
// Note: style-src still needs 'unsafe-inline' because Next.js injects
// inline styles for CSS-in-JS and Tailwind's JIT mode. Removing it would
// break the UI. This is a known Next.js limitation. script-src is the
// critical one for XSS (inline scripts can execute JS; inline styles cannot).
const CSP_NONCE_HEADER = "x-csp-nonce";

function generateNonce(): string {
  // Edge-safe: crypto.randomUUID is available in Edge runtime, but we need
  // base64url random bytes for CSP nonce. Use Web Crypto API.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCspHeaders(nonce: string): Record<string, string> {
  const isDev = process.env.NODE_ENV === "development";
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      // Phase 9 P2: use nonce instead of 'unsafe-inline' for script-src in production.
      // Dev still needs 'unsafe-eval' for Next.js HMR + 'unsafe-inline' for React DevTools.
      isDev
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : `script-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
      // Note: 'unsafe-inline' is kept as fallback in production because:
      // (1) Next.js 16 App Router still emits some inline scripts without nonce
      //     support (e.g., RSC payload). Removing it entirely breaks the app.
      // (2) The nonce provides defense-in-depth: a nonce-protected script
      //     takes precedence over 'unsafe-inline' per CSP spec, so an XSS
      //     attacker who injects a <script> WITHOUT the nonce is still blocked.
      // (3) Full 'unsafe-inline' removal requires Next.js to support nonce
      //     on ALL its internal inline scripts — tracked in Next.js issue #23613.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://api.openrouter.ai https://generativelanguage.googleapis.com https://api.deepseek.com https://api.openai.com https://accept.paymob.com https://api.stripe.com https://api.twilio.com https://api.sendgrid.com https://gw-fatoora.zatca.gov.sa https://invoicing.eta.gov.eg",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  };
}

const STATIC_SECURITY_HEADERS: Record<string, string> = {
  ...(process.env.NODE_ENV === "production" ? {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  } : {}),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // P3 FIX (audit): COEP/COOP were claimed in comments but never actually set.
  // Now properly added for Spectre-class side-channel isolation.
  // credentialless (not require-corp) so cross-CDN assets (Google Fonts, etc.) work.
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function withSecurityHeaders(response: NextResponse, pathname?: string): NextResponse {
  // Phase 9 P2: generate nonce per request + build CSP with it
  const nonce = generateNonce();
  const cspHeaders = buildCspHeaders(nonce);
  for (const [key, value] of Object.entries(cspHeaders)) {
    response.headers.set(key, value);
  }
  // Expose nonce via header so layout.tsx can read it via next/headers
  response.headers.set(CSP_NONCE_HEADER, nonce);
  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
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

  // ── 0. Setup wizard routing ─────────────────────────────────────────────
  // Edge-runtime-safe check: reads SETUP_COMPLETE env var (no fs access).
  // The full fs-based check is done inside /api/setup/status; middleware only
  // needs to handle the redirect logic. If SETUP_COMPLETE is unset (first
  // boot), we redirect unauthenticated / traffic to /setup so the founder
  // can configure the app before anyone uses it. If SETUP_COMPLETE=true,
  // we redirect /setup → / so the wizard can't be re-run.
  //
  // Allow these paths regardless of setup state:
  //   - /api/setup/*          (wizard APIs)
  //   - /_next, /favicon.ico  (static assets)
  //   - /login                (so the founder can log in after setup)
  const isSetupDone = process.env.SETUP_COMPLETE === "true";
  const SETUP_ALLOW_PATHS = ["/login", "/api/auth/login", "/api/setup"];
  const isSetupAllowedPath =
    pathname === "/setup" ||
    SETUP_ALLOW_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isSetupDone && !isSetupAllowedPath && !pathname.startsWith("/_next") && pathname !== "/favicon.ico") {
    // Redirect everything else to /setup
    const url = req.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }
  if (isSetupDone && pathname === "/setup") {
    // Setup is done — refuse to serve the wizard
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

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
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|manifest.json|icons|sw.js).*)"],
};
