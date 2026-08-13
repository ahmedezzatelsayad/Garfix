/**
 * api.ts — Shared Route Handler helpers.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, persistRotatedRefreshToken, hasUnrestrictedScope, type AuthPayload } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logger } from "@/lib/logger";
import { z, ZodError } from "zod";
import { runWithTenantContext } from "@/lib/tenant-context";

export interface ApiContext {
  user: AuthPayload;
}

/**
 * SEC-01 FIX (Audit v2): Resolve auth and capture any rotated refresh token.
 *
 * Previously `requireAuth` called `resolveAuth` but discarded the
 * `rotatedRefreshToken` field — meaning the silent-refresh rotation logic
 * in `resolveAuth` (which issues a new refresh token + expects the old JTI
 * to be blacklisted by the next call) was dead code. A stolen refresh
 * cookie stayed valid for the full 30-day TTL even while the legitimate
 * user kept using the app.
 *
 * Now `requireAuth` returns the resolved auth result so callers can pass
 * it to `withErrorHandler` (or call `persistRotatedRefreshToken` themselves
 * on the response they return). `withErrorHandler` auto-persists any
 * rotated token onto the response, so individual route handlers don't
 * need to change.
 */
export interface AuthenticatedRequest {
  user: AuthPayload;
  /** Rotated refresh token (if resolveAuth silently rotated). Persist on response. */
  rotatedRefreshToken?: string | null;
  /** Rotated access token (if resolveAuth silently rotated). Persist on response. */
  rotatedAccessToken?: string | null;
}

/** Resolve auth, return null + 401 response if unauthenticated. */
export async function requireAuth(req: NextRequest): Promise<{ user: AuthPayload } | NextResponse> {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json(
      { error: result.error || "غير مصرّح" },
      { status: result.status || 401 },
    );
  }
  // Stash rotated tokens on a per-request WeakMap so withErrorHandler can
  // retrieve and persist them onto the final response. This avoids changing
  // the return signature of requireAuth (which would break 200+ callers).
  if (result.rotatedRefreshToken || result.rotatedAccessToken) {
    rotationStore.set(req, {
      refresh: result.rotatedRefreshToken,
      access: result.rotatedAccessToken,
    });
  }
  return { user: result.user };
}

/**
 * Resolve auth and return the full result (including rotated tokens).
 * Use this in routes that want explicit control over cookie persistence.
 */
export async function requireAuthWithRotation(req: NextRequest): Promise<
  | ({ user: AuthPayload } & AuthenticatedRequest)
  | NextResponse
> {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json(
      { error: result.error || "غير مصرّح" },
      { status: result.status || 401 },
    );
  }
  return {
    user: result.user,
    rotatedRefreshToken: result.rotatedRefreshToken,
    rotatedAccessToken: result.rotatedAccessToken,
  };
}

// Per-request rotation store — cleaned up automatically when the request
// object is GC'd (WeakMap). withErrorHandler reads from this to persist
// rotated tokens onto the response.
const rotationStore = new WeakMap<NextRequest, { refresh?: string | null; access?: string | null }>();

/**
 * Persist any rotated tokens onto a response. Called by withErrorHandler
 * and usable directly by route handlers that skip withErrorHandler.
 */
export function applyRotatedTokens(req: NextRequest, response: NextResponse): NextResponse {
  const rotated = rotationStore.get(req);
  if (!rotated) return response;
  if (rotated.refresh) {
    persistRotatedRefreshToken(response, rotated.refresh);
  }
  if (rotated.access) {
    // Access token is set via the same cookie helper used by issueSession.
    // We import lazily to avoid a circular dependency at module load time.
    // The ACCESS_COOKIE + opts are re-exported from auth.ts.
    try {
      const { ACCESS_COOKIE } = require("@/lib/auth") as typeof import("@/lib/auth");
      const accessCookieOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict" as const,
        path: "/",
        maxAge: parseInt(process.env.JWT_ACCESS_TTL_SECONDS || "1800", 10),
      };
      response.cookies.set(ACCESS_COOKIE, rotated.access, accessCookieOpts);
    } catch (err) {
      logger.warn("[api] failed to persist rotated access token", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return response;
}

/**
 * Require founder — returns null if user IS the founder (proceed),
 * or a 403 NextResponse if NOT the founder.
 *
 * Checks both that the user's email matches FOUNDER_EMAIL (via isFounderEmail)
 * and that the founder's email is verified (emailVerified), matching the
 * defense-in-depth check in middleware.ts.
 */
export async function requireFounder(user: AuthPayload): Promise<NextResponse | null> {
  if (!isFounderEmail(user.email)) {
    return NextResponse.json(
      { error: "هذه العملية متاحة للمؤسس فقط" },
      { status: 403 },
    );
  }
  // SEC: Founder must have verified email — defense-in-depth
  const { db } = await import("@/lib/db");
  const dbUser = await db.appUser.findUnique({
    where: { uid: user.uid },
    select: { emailVerified: true },
  });
  if (!dbUser?.emailVerified) {
    return NextResponse.json(
      { error: "حساب المؤسس يجب أن يكون موثّق البريد الإلكتروني" },
      { status: 403 },
    );
  }
  return null;
}

/** Validate body against a zod schema, return parsed or 400 response. */
export function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  try {
    const data = schema.parse(body);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: err.issues[0]?.message || "Invalid input", details: err.issues },
          { status: 400 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid input" }, { status: 400 }),
    };
  }
}

/** Standard error response. */
export function apiError(message: string, status = 400, details?: unknown): NextResponse {
  if (details !== undefined) {
    return NextResponse.json({ error: message, details }, { status });
  }
  return NextResponse.json({ error: message }, { status });
}

/** Standard success response. */
export function apiOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Wrap an async handler with try/catch for clean error responses. */
export function withErrorHandler<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    const req = args[0] as NextRequest | undefined;

    // TASK-0 FIX (Audit v2 · Phase 2): Resolve auth + set tenant context
    // via AsyncLocalStorage BEFORE running the handler. This ensures every
    // Prisma query inside the handler is automatically wrapped in a
    // $transaction with set_config('app.current_company_slug', slug, true),
    // fixing the P0 regression where strict RLS returns 0 rows for routes
    // that don't use withTenantScope explicitly.
    let authResult: Awaited<ReturnType<typeof resolveAuth>> | null = null;
    try {
      if (req) {
        authResult = await resolveAuth(req);
      }
    } catch {
      // Auth resolution failed — proceed without tenant context (will 401)
    }

    // Determine tenant slug + platform admin status
    const user = authResult?.ok ? authResult.user : null;
    const isPlatformAdmin = user ? hasUnrestrictedScope(user) : false;
    const sp = req?.nextUrl.searchParams;
    const companySlug = user
      ? (isPlatformAdmin && !sp?.get("companySlug")
          ? "__ALL__"
          : sp?.get("companySlug") || user.companies[0] || "__ALL__")
      : "__ALL__";

    // Run the handler inside the tenant context
    const runHandler = async (): Promise<NextResponse> => {
      try {
        const response = await fn(...args);
        // SEC-01 FIX: persist any silently-rotated tokens
        if (req && authResult?.ok) {
          const rotated = rotationStore.get(req);
          if (rotated?.refresh || rotated?.access) {
            return applyRotatedTokens(req, response);
          }
        }
        return response;
      } catch (err) {
        const internalMessage = err instanceof Error ? err.message : String(err);
        logger.error("[api] unhandled error", { err: internalMessage });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    };

    // If we have a tenant context, wrap the handler in ALS
    if (user && companySlug) {
      return runWithTenantContext(companySlug, isPlatformAdmin, runHandler);
    }

    // No auth/tenant context — run without ALS (public routes)
    return runHandler();
  };
}

/**
 * Parse JSON body from a NextRequest.
 *
 * LOW-005 FIX (Cycle 3): enforce a maximum request body size to prevent
 * memory-exhaustion DoS. Next.js Route Handlers don't expose a built-in
 * body-size limit (unlike the Pages API `bodyParser.sizeLimit` config), so
 * we enforce it here by reading the Content-Length header and rejecting
 * oversize payloads BEFORE calling `req.json()` (which would buffer the
 * entire body into memory).
 *
 * Default limit: 1 MiB (matches Next.js Pages API default). Configurable
 * via MAX_JSON_BODY_BYTES env var. Routes that legitimately need larger
 * payloads (e.g. file uploads) bypass parseJsonBody and read the body
 * directly via req.body / req.formData().
 *
 * Returns:
 *   - parsed JSON on success
 *   - null on parse failure OR oversize body (caller should treat both
 *     as "invalid input" and return 400; the distinction is logged but
 *     not exposed to the client to avoid information leakage)
 */
export async function parseJsonBody(req: NextRequest): Promise<unknown> {
  // LOW-005 FIX (Cycle 3): reject oversize bodies before buffering.
  const maxBytes = parseInt(
    process.env.MAX_JSON_BODY_BYTES || String(1024 * 1024),
    10,
  );
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    logger.warn("[api] rejected oversize JSON body", {
      contentLength,
      maxBytes,
      path: req.nextUrl.pathname,
    });
    return null;
  }
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Parse query params as a record. */
export function getQuery(req: NextRequest): Record<string, string> {
  const result: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/** Helper to apply JSON parsing to fields stored as JSON strings. */
export function parseJsonField<T = unknown>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch (err) {
    // Phase 9 P2 fix: log when DB-stored JSON is malformed (was silently
    // swallowed — masked data corruption). Ops can detect drift via logs.
    console.warn("[api] parseJsonField: malformed JSON, using fallback", {
      preview: s.slice(0, 100),
      err: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rate Limit Middleware — P0 API Policy Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

import { rateLimitResponse, getClientIp, LIMITS, type RateLimitConfig } from "@/lib/rateLimit";
import { trackApiRequest } from "@/lib/observability";

/**
 * withRateLimit — Enforce rate limiting on any API route handler.
 *
 * Wraps a route handler with rate limit checking before the handler executes.
 * If the rate limit is exceeded, returns 429 immediately without calling the handler.
 *
 * Usage:
 *   export const GET = withRateLimit<[NextRequest, RouteParams]>(
 *     LIMITS.API_READ,
 *     async (req, { params }) => { ... },
 *     "optional-prefix"
 *   );
 *
 * Rate limit categories (from LIMITS):
 *   - LOGIN: 5 per 15min (lockout)
 *   - REGISTER: 3 per hour
 *   - OTP_VERIFY: 5 per 5min
 *   - PASSWORD_RESET: 3 per hour
 *   - AI_CHAT: 10 per minute
 *   - AI_BULK: 3 per minute
 *   - API_READ: 60 per minute (default for GET routes)
 *   - API_WRITE: 30 per minute (default for POST/PUT/PATCH/DELETE routes)
 */
export function withRateLimit<T extends unknown[]>(
  config: RateLimitConfig,
  fn: (...args: T) => Promise<NextResponse>,
  keyPrefix?: string,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    // Extract the request from the first argument
    const req = args[0] as NextRequest;

    // Rate limit key: prefix + route path + client IP
    const route = req.nextUrl.pathname;
    const prefix = keyPrefix || `api:${route}`;
    const rlResponse = await rateLimitResponse(req, prefix, config);

    if (rlResponse) {
      // Rate limit exceeded — track as error and return 429
      trackApiRequest(route, req.method, 0, 429);
      return rlResponse;
    }

    // Rate limit OK — add headers and proceed to handler
    const start = Date.now();
    try {
      const response = await fn(...args);

      // Add rate limit headers to successful responses
      // Phase 9 P3 fix: compute actual remaining from the rate limiter state.
      // Was hardcoded to config.maxAttempts (the cap, not remaining).
      const used = response.headers.get("X-RateLimit-Used");
      const usedNum = used ? parseInt(used, 10) : 0;
      const remaining = Math.max(0, config.maxAttempts - usedNum);
      response.headers.set("X-RateLimit-Limit", String(config.maxAttempts));
      response.headers.set("X-RateLimit-Remaining", String(remaining));
      response.headers.set("X-RateLimit-Window", String(Math.ceil(config.windowMs / 1000)));

      // Track successful request
      trackApiRequest(route, req.method, Date.now() - start, response.status);

      return response;
    } catch (err) {
      // Track error request
      trackApiRequest(route, req.method, Date.now() - start, 500);
      throw err;
    }
  };
}
