/**
 * /api/permissions/check
 * POST — Check if a user has a specific permission.
 *
 * Body: { resource, action, scope }
 * Response: { allowed: boolean, reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { isFounderEmail } from "@/lib/founder";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk } from "@/lib/api";
import { checkPermission, PermissionScope, getEffectivePermissions, validatePermissionChange } from "@/lib/rbac";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/permissions-check — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:permissions-check", LIMITS.API_WRITE);
  if (rl) return rl;

  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(req);
  if (!body || typeof body !== "object") {
    return apiError("Invalid JSON body", 400);
  }

  const { resource, action, scope } = body as { resource?: string; action?: string; scope?: string };

  if (!resource || !action) {
    return apiError("resource and action are required", 400);
  }

  // Map scope string to enum
  let permScope: PermissionScope = PermissionScope.own;
  if (scope === "team") permScope = PermissionScope.team;
  else if (scope === "company") permScope = PermissionScope.company;
  else if (scope === "platform") permScope = PermissionScope.platform;

  const user = result.user;
  const isFounder = isFounderEmail(user.email);

  // Get user's effective permissions
  const effective = getEffectivePermissions(
    user.role,
    user.permissions as Record<string, number> | null,
    isFounder,
  );

  // Check permission
  const allowed = checkPermission(
    effective.flat,
    user.role,
    resource,
    action,
    permScope,
    isFounder,
    effective.resources,
  );

  return apiOk({
    allowed,
    resource,
    action,
    scope: permScope,
    role: user.role,
    inheritanceChain: effective.inheritanceChain,
  });
});
