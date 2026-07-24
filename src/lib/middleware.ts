/**
 * middleware.ts — Composable middleware factories for API route handlers.
 *
 * The old pattern repeated auth + tenant-scope + plan-limits checks inline
 * in every route. This module exports factories that return ready-to-use
 * helpers, ensuring consistent enforcement and DRY code.
 *
 * Usage:
 *   import { requireCompanyAccess, withValidation } from "@/lib/middleware";
 *   import { z } from "zod";
 *
 *   const Schema = z.object({ name: z.string() });
 *
 *   export const POST = withValidation(Schema, async (req, ctx) => {
 *     const access = await requireCompanyAccess(req, ctx.body.companySlug);
 *     if (access.error) return access.error;
 *     // ... business logic
 *   });
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, assertCompanyAccess, type AuthPayload } from "./auth";
import { canAccessCompany } from "./tenantScope";
import { logAudit } from "./audit";
import { logger } from "./logger";
import { z, ZodError } from "zod";

// Note: isFounderEmail is imported later in the file (near requireFounder)
// to keep the founder-related imports grouped with the founder-related code.

export interface AuthContext {
  user: AuthPayload;
}

export type AuthedHandler<T = unknown> = (
  req: NextRequest,
  ctx: AuthContext & { body?: T; params?: Record<string, string> },
) => Promise<NextResponse>;

// ─── requireAuth ────────────────────────────────────────────────────────────

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

// ─── requireCompanyAccess ───────────────────────────────────────────────────

export interface CompanyAccessResult {
  ok: boolean;
  user?: AuthPayload;
  error?: NextResponse;
}

/**
 * Verify the user can access the given company. Use for routes that take
 * a companySlug in the body or query string.
 */
export async function requireCompanyAccess(
  req: NextRequest,
  companySlug: string,
): Promise<CompanyAccessResult> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return { ok: false, error: authResult };
  }
  if (!canAccessCompany(authResult.user, companySlug)) {
    return {
      ok: false,
      error: NextResponse.json({ error: "ليس لديك صلاحية للوصول إلى هذه الشركة" }, { status: 403 }),
    };
  }
  return { ok: true, user: authResult.user };
}

// ─── requirePermission ──────────────────────────────────────────────────────

/**
 * Check if the authenticated user has a specific permission.
 * Uses the permissions map from the JWT payload (computed by computeEffectivePermissions).
 * Founder and admin always pass.
 *
 * This is the CRITICAL security guard that was missing in v11 — without it,
 * any authenticated user could call any endpoint regardless of their role.
 *
 * P0 FIX (audit finding): the previous implementation only checked
 * `user.role === "admin"` — but the founder is identified by EMAIL match
 * (isFounderEmail), not by role. If the founder's role is ever set to
 * something other than "admin" (e.g. if a future migration changes the
 * default), they would be denied access to their own platform. We now
 * explicitly check isFounderEmail(user.email) so the founder always passes
 * regardless of their role value, matching the documented behavior.
 */
export function hasPermission(user: AuthPayload, permKey: string): boolean {
  // Founder (by email) and admin (by role) both bypass all permission checks
  if (isFounderEmail(user.email)) return true;
  if (user.role === "admin") return true;
  // Check the effective permissions map
  const perms = user.permissions || {};
  return !!perms[permKey];
}

/**
 * Require a specific permission. Returns {user} on success or {error} on failure.
 * Use this in every mutating endpoint (POST/PATCH/DELETE) to enforce RBAC.
 *
 * Example:
 *   const access = await requirePermission(req, "create_invoice");
 *   if (access.error) return access.error;
 */
export async function requirePermission(
  req: NextRequest,
  permKey: string,
): Promise<{ user: AuthPayload } | { error: NextResponse }> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return { error: authResult };
  }
  if (!hasPermission(authResult.user, permKey)) {
    return {
      error: NextResponse.json(
        { error: `ليس لديك صلاحية: ${permKey}` },
        { status: 403 },
      ),
    };
  }
  return { user: authResult.user };
}

/**
 * Require both auth + company access + a specific permission.
 * The most common guard for tenant-scoped mutating endpoints.
 *
 * Example:
 *   const access = await requirePermissionForCompany(req, "create_invoice", companySlug);
 *   if ("error" in access) return access.error;
 */
export async function requirePermissionForCompany(
  req: NextRequest,
  permKey: string,
  companySlug: string,
): Promise<{ user: AuthPayload } | { error: NextResponse }> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return { error: authResult };
  }
  if (!hasPermission(authResult.user, permKey)) {
    return {
      error: NextResponse.json(
        { error: `ليس لديك صلاحية: ${permKey}` },
        { status: 403 },
      ),
    };
  }
  if (!canAccessCompany(authResult.user, companySlug)) {
    return {
      error: NextResponse.json(
        { error: "ليس لديك صلاحية للوصول إلى هذه الشركة" },
        { status: 403 },
      ),
    };
  }
  return { user: authResult.user };
}

// ─── requireFounder ─────────────────────────────────────────────────────────

import { isFounderEmail } from "./founder";

export async function requireFounder(req: NextRequest): Promise<{ user: AuthPayload } | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  if (!isFounderEmail(authResult.user.email)) {
    return NextResponse.json({ error: "هذه العملية متاحة للمؤسس فقط" }, { status: 403 });
  }
  // SEC-005 FIX: Founder must have verified email
  const { db } = await import("./db");
  const dbUser = await db.appUser.findUnique({
    where: { uid: authResult.user.uid },
    select: { emailVerified: true },
  });
  if (!dbUser?.emailVerified) {
    return NextResponse.json({ error: "حساب المؤسس يجب أن يكون موثّق البريد الإلكتروني" }, { status: 403 });
  }
  return authResult;
}

// ─── requireAdmin ───────────────────────────────────────────────────────────

export async function requireAdmin(req: NextRequest): Promise<{ user: AuthPayload } | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.user.role !== "admin" && !isFounderEmail(authResult.user.email)) {
    return NextResponse.json({ error: "هذه العملية متاحة للمدراء فقط" }, { status: 403 });
  }
  return authResult;
}

// ─── withValidation ─────────────────────────────────────────────────────────

export function withValidation<T>(
  schema: z.ZodSchema<T>,
  handler: (req: NextRequest, ctx: { body: T }) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "صيغة JSON غير صحيحة" }, { status: 400 });
    }
    try {
      const parsed = schema.parse(body);
      // CODE-005 FIX: Don't pass undefined as AuthPayload — handler should call requireAuth itself
      return handler(req, { body: parsed });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: err.issues[0]?.message || "مدخلات غير صالحة", details: err.issues },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: "مدخلات غير صالحة" }, { status: 400 });
    }
  };
}

// ─── withAuth ───────────────────────────────────────────────────────────────

/**
 * Wrap a handler with auth + optional validation. The wrapper handles:
 *   - resolveAuth → 401 if not authenticated
 *   - parse JSON body
 *   - validate body against schema (if provided)
 *   - call handler with { user, body, params }
 *   - catch unhandled errors → 500 with structured response
 */
export function withAuth<T = unknown>(
  handler: AuthedHandler<T>,
  options: { schema?: z.ZodSchema<T> } = {},
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult.user;

    let body: T | undefined;
    if (options.schema) {
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "صيغة JSON غير صحيحة" }, { status: 400 });
      }
      try {
        body = options.schema.parse(body);
      } catch (err) {
        if (err instanceof ZodError) {
          return NextResponse.json(
            { error: err.issues[0]?.message || "مدخلات غير صالحة", details: err.issues },
            { status: 400 },
          );
        }
        return NextResponse.json({ error: "مدخلات غير صالحة" }, { status: 400 });
      }
    }

    try {
      return await handler(req, { user, body });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error("[withAuth] unhandled", { err: detail, route: req.url });
      return NextResponse.json({ error: "خطأ داخلي في الخادم" }, { status: 500 });
    }
  };
}

// ─── withAudit ──────────────────────────────────────────────────────────────

/**
 * Wrap a mutation handler with automatic audit logging.
 * Use after withAuth: const handler = withAudit(withAuth(inner, {schema}), {action: "...", entity: "..."})
 */
export function withAudit<T>(
  handler: AuthedHandler<T>,
  auditInfo: { action: string; entity: string },
): AuthedHandler<T> {
  return async (req, ctx) => {
    const response = await handler(req, ctx);
    // Only log if the request succeeded (2xx)
    if (response.status >= 200 && response.status < 300 && ctx.appUser) {
      await logAudit({
        userEmail: ctx.appUser.email,
        userUid: ctx.appUser.uid,
        action: auditInfo.action,
        entity: auditInfo.entity,
        companySlug: ctx.body && typeof ctx.body === "object" && "companySlug" in ctx.body
          ? String((ctx.body as Record<string, unknown>).companySlug)
          : null,
      });
    }
    return response;
  };
}
