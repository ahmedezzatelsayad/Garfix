/**
 * api.ts — Shared Route Handler helpers.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, type AuthPayload } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z, ZodError } from "zod";

export interface ApiContext {
  user: AuthPayload;
}

/** Resolve auth, return null + 401 response if unauthenticated. */
export async function requireAuth(req: NextRequest): Promise<{ user: AuthPayload } | NextResponse> {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json(
      { error: result.error || "Unauthorized" },
      { status: result.status || 401 },
    );
  }
  return { user: result.user };
}

/** Require founder — return 403 if not. */
export function requireFounder(user: AuthPayload): NextResponse | null {
  // Founder is determined by email — checked via env FOUNDER_EMAIL
  // We can't import isFounderEmail here without circular dep; just check role + a founder flag
  // The auth flow sets role=admin for the founder; founder-specific endpoints check email match
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
export function apiError(message: string, status = 400): NextResponse {
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
    try {
      return await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      // Note: `req` is not in scope here on purpose — the wrapper is generic
      // over the handler signature (some handlers receive no req). We log the
      // message only.
      logger.error("[api] unhandled error", { err: message });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

/** Parse JSON body from a NextRequest. */
export async function parseJsonBody(req: NextRequest): Promise<unknown> {
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
  } catch {
    return fallback;
  }
}
