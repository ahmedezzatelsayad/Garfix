/**
 * middleware.ts — Next.js Edge middleware for all /api/* routes.
 *
 * Responsibilities:
 *   1. Route classification (public vs protected)
 *   2. Authentication via resolveAuth (401 on protected routes if unauthenticated)
 *   3. General rate limiting (60 req/min per uid or per IP)
 *   4. Security headers on every response
 *   5. Forward authenticated user info via custom header for route handlers
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, type AuthPayload } from "@/lib/auth";
import { rateLimitResponse, getClientIp, LIMITS, type RateLimitConfig } from "@/lib/rateLimit";
import { CSRF_COOKIE, generateCsrfToken, CSRF_COOKIE_OPTS } from "@/lib/cookies";

// ── Public routes that skip authentication ──────────────────────────────────

const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/health",
  "/api/landing-content",
];

// Routes exempt from CSRF verification even though they are POST and protected.
// Auth refresh only rotates tokens (no state change) and cannot be read cross-origin
// (access token is httpOnly). Including it in CSRF enforcement would break
// the automatic refresh flow in authedFetch.
const CSRF_EXEMPT_ROUTES = [
  "/api/auth/refresh",
];

function isPublicRoute(pathname: string): boolean {
  // Exact matches for static public routes
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  // Prefix match for wildcard public routes
  if (pathname.startsWith("/api/webhooks/")) return true;
  return false;
}

// ── General API rate limit config: 60 requests per minute ───────────────────

const GENERAL_API_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 60,
};

// ── Security headers ────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  // Generate a unique request ID per invocation
  response.headers.set("X-Request-ID", crypto.randomUUID());
  return response;
}

// ── Middleware ──────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);

  // ── 1. Public routes: rate-limit by IP, skip auth ──────────────────────
  if (isPublicRoute(pathname)) {
    const limited = await rateLimitResponse(req, "pub", GENERAL_API_LIMIT, ip);
    if (limited) return withSecurityHeaders(limited);

    const response = NextResponse.next();
    return withSecurityHeaders(response);
  }

  // ── 2. Protected routes: resolve auth ──────────────────────────────────
  const authResult = await resolveAuth(req);

  if (!authResult.ok || !authResult.user) {
    const response = NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: authResult.status || 401 },
    );
    return withSecurityHeaders(response);
  }

  const user: AuthPayload = authResult.user;

  // ── 3. CSRF double-submit verification for mutating methods ──────────────
  // SEC-010 FIX: Enforce CSRF protection on POST, PUT, PATCH, DELETE.
  // The inv_csrf cookie is set on every authenticated response; JS must
  // read it and echo the value in the X-CSRF-Token header on every
  // mutating request. Safe methods (GET, HEAD, OPTIONS) are exempt.
  // Certain auth routes (refresh) are also exempt — they only rotate tokens
  // and the attacker cannot read the httpOnly access cookie anyway.
  const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (mutatingMethods.includes(req.method) && !CSRF_EXEMPT_ROUTES.includes(pathname)) {
    const csrfCookie = req.cookies.get(CSRF_COOKIE)?.value;
    const csrfHeader = req.headers.get("x-csrf-token");

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      const response = NextResponse.json(
        { error: "رمز حماية CSRF غير صالح أو مفقود" },
        { status: 403 },
      );
      return withSecurityHeaders(response);
    }
  }

  // ── 4. Rate limit by uid (authenticated user) ─────────────────────────
  const limited = await rateLimitResponse(req, "api", GENERAL_API_LIMIT, user.uid);
  if (limited) return withSecurityHeaders(limited);

  // ── 5. Continue with security headers + user info ──────────────────────
  const response = NextResponse.next();

  // Set authenticated user info on a custom header so route handlers can access it
  response.headers.set("x-user-payload", encodeURIComponent(JSON.stringify(user)));

  // SEC-010: Issue/refresh CSRF cookie on every authenticated response so the
  // client always has a fresh token. If the cookie is already set and not
  // expired, we keep it; otherwise we generate a new one.
  const existingCsrf = req.cookies.get(CSRF_COOKIE)?.value;
  if (!existingCsrf) {
    const newCsrf = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE, newCsrf, CSRF_COOKIE_OPTS);
  }

  return withSecurityHeaders(response);
}

// ── Matcher ─────────────────────────────────────────────────────────────────

export const config = {
  matcher: ["/api/:path*"],
};
