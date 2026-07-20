/**
 * api.ts — Shared Route Handler helpers.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, type AuthPayload } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
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
      { error: result.error || "غير مصرّح" },
      { status: result.status || 401 },
    );
  }
  return { user: result.user };
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
  const dbUser = await db.user.findUnique({
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
      // Log the real error server-side for debugging
      const internalMessage = err instanceof Error ? err.message : String(err);
      logger.error("[api] unhandled error", { err: internalMessage });
      // Return a generic message to the client — never leak internal details
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
