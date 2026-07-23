/**
 * /api/permissions/check
 * POST — Check if a user has a specific permission.
 *
 * Body: { resource, action, scope }
 * Response: { allowed: boolean, reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk } from "@/lib/api";
import { checkPermission, PermissionScope, getEffectivePermissions, validatePermissionChange } from "@/lib/rbac";

export const POST = withErrorHandler(async (req: NextRequest) => {
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
  const isFounder = user.email === process.env.FOUNDER_EMAIL;

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
