/**
 * /api/permissions/roles
 * GET  — List all roles (built-in + custom) with their permission definitions.
 * POST — Create a custom role.
 * PUT  — Update a custom role.
 * DELETE — Delete a custom role.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk, validateBody } from "@/lib/api";
import {
  ROLE_DEFINITIONS,
  createCustomRole,
  deleteCustomRole,
  updateCustomRole,
  getAllCustomRoles,
  getInheritedPermissions,
  getInheritanceChain,
  validatePermissionChange,
  logPermissionAudit,
  CustomRoleInput,
  PermissionScope,
  PermissionLevel,
} from "@/lib/rbac";
import { z } from "zod";

// ── GET: List all roles ──────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin/founder can view role definitions
  const isFounder = result.user.email === process.env.FOUNDER_EMAIL;
  if (result.user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can view roles", 403);
  }

  // Merge built-in + custom roles
  const builtIn = Object.values(ROLE_DEFINITIONS).map((def) => ({
    ...def,
    inheritedPermissions: getInheritedPermissions(def.id),
    inheritanceChain: getInheritanceChain(def.id),
  }));

  const custom = getAllCustomRoles().map((def) => ({
    ...def,
    inheritedPermissions: getInheritedPermissions(def.id),
    inheritanceChain: getInheritanceChain(def.id),
  }));

  return apiOk({ builtIn, custom, total: builtIn.length + custom.length });
});

// ── POST: Create custom role ─────────────────────────────────────────────────

const CreateRoleSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, "Role ID must be lowercase alphanumeric with underscores"),
  label: z.string().min(1).max(100),
  labelAr: z.string().min(1).max(100),
  inheritsFrom: z.string().min(1),
  resourcePermissions: z.array(z.object({
    resource: z.string(),
    level: z.number().min(0).max(15),
    scope: z.enum(["own", "team", "company", "platform"]),
  })),
  flatOverrides: z.record(z.string(), z.number()).optional(),
  timeRestrictions: z.record(z.string(), z.object({
    allowedDays: z.array(z.number().min(1).max(7)).optional(),
    startHour: z.number().min(0).max(23).optional(),
    endHour: z.number().min(0).max(23).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })).optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isFounder = result.user.email === process.env.FOUNDER_EMAIL;
  if (result.user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can create roles", 403);
  }

  const body = await parseJsonBody(req);
  const validation = validateBody(CreateRoleSchema, body);
  if (!validation.ok) return validation.response;

  // Validate each resource permission change
  for (const rp of validation.data.resourcePermissions) {
    const scopeVal = rp.scope as PermissionScope;
    const levelVal = rp.level as PermissionLevel;
    const check = validatePermissionChange({
      type: "grant",
      targetRole: validation.data.id,
      resource: rp.resource,
      level: levelVal,
      scope: scopeVal,
    }, result.user.role, isFounder);
    if (!check.valid) {
      return apiError(check.reason || "Invalid permission", 403);
    }
  }

  try {
    const newRole = createCustomRole(validation.data as CustomRoleInput);
    logPermissionAudit({
      timestamp: new Date().toISOString(),
      actorUid: result.user.uid,
      actorEmail: result.user.email,
      action: "create_role",
      targetRole: newRole.id,
      details: { resourcePermissions: newRole.resourcePermissions },
    });
    return apiOk({ role: newRole }, 201);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to create role", 400);
  }
});

// ── PUT: Update custom role ──────────────────────────────────────────────────

const UpdateRoleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100).optional(),
  labelAr: z.string().min(1).max(100).optional(),
  inheritsFrom: z.string().min(1).optional(),
  resourcePermissions: z.array(z.object({
    resource: z.string(),
    level: z.number().min(0).max(15),
    scope: z.enum(["own", "team", "company", "platform"]),
  })).optional(),
  flatOverrides: z.record(z.string(), z.number()).optional(),
  timeRestrictions: z.record(z.string(), z.object({
    allowedDays: z.array(z.number().min(1).max(7)).optional(),
    startHour: z.number().min(0).max(23).optional(),
    endHour: z.number().min(0).max(23).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })).optional(),
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isFounder = result.user.email === process.env.FOUNDER_EMAIL;
  if (result.user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can modify roles", 403);
  }

  const body = await parseJsonBody(req);
  const validation = validateBody(UpdateRoleSchema, body);
  if (!validation.ok) return validation.response;

  try {
    const updated = updateCustomRole(validation.data.id, validation.data as Partial<CustomRoleInput>);
    if (!updated) {
      return apiError("Custom role not found", 404);
    }
    logPermissionAudit({
      timestamp: new Date().toISOString(),
      actorUid: result.user.uid,
      actorEmail: result.user.email,
      action: "modify_role",
      targetRole: updated.id,
      details: { changes: validation.data },
    });
    return apiOk({ role: updated });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to update role", 400);
  }
});

// ── DELETE: Delete custom role ───────────────────────────────────────────────

const DeleteRoleSchema = z.object({
  id: z.string().min(1),
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isFounder = result.user.email === process.env.FOUNDER_EMAIL;
  if (result.user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can delete roles", 403);
  }

  const body = await parseJsonBody(req);
  const validation = validateBody(DeleteRoleSchema, body);
  if (!validation.ok) return validation.response;

  try {
    const deleted = deleteCustomRole(validation.data.id);
    logPermissionAudit({
      timestamp: new Date().toISOString(),
      actorUid: result.user.uid,
      actorEmail: result.user.email,
      action: "delete_role",
      targetRole: validation.data.id,
    });
    return apiOk({ deleted });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to delete role", 400);
  }
});
