/**
 * /api/companies/[slug]/members/[uid]
 * PATCH  — update a member's role and/or permissions (merged into their perms JSON)
 * DELETE — remove the user from this company (drops slug from their `companies`
 *          array; the user record itself is preserved)
 *
 * Permission: settings_access
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { isFounderEmail } from "@/lib/founder";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";

type RouteParams = { params: Promise<{ slug: string; uid: string }> };

const UpdateSchema = z.object({
  role: z.enum(["admin", "editor", "employee", "viewer"]).optional(),
  permissions: z.record(z.string(), z.number()).optional(),
});

function readCompanies(raw: string | null | undefined): string[] {
  const arr = parseJsonField<unknown>(raw, []);
  return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
}

function readPerms(raw: string | null | undefined): Record<string, number> {
  const obj = parseJsonField<unknown>(raw, {});
  return obj && typeof obj === "object" ? (obj as Record<string, number>) : {};
}

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { slug, uid } = await params;
  const access = await requirePermissionForCompany(req, "settings_access", slug);
  if ("error" in access) return access.error;
  const admin = access.user;

  const existing = await db.user.findUnique({ where: { uid } });
  if (!existing) return apiError("User not found", 404);

  // Confirm this user is actually a member of this company
  const companies = readCompanies(existing.companies);
  if (!companies.includes(slug)) {
    return apiError("هذا المستخدم ليس عضواً في هذه الشركة", 400);
  }

  // Non-founder admins cannot edit the founder
  if (isFounderEmail(existing.email) && !isFounderEmail(admin.email)) {
    return apiError("لا يمكن تعديل بيانات المؤسس", 403);
  }

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  }
  const data = parsed.data;

  const updateData: Record<string, unknown> = {};

  if (data.role !== undefined) {
    // Block attempts to demote the founder via role change
    if (isFounderEmail(existing.email) && data.role !== "admin") {
      return apiError("لا يمكن تغيير دور المؤسس", 403);
    }
    updateData.role = data.role;
  }

  if (data.permissions !== undefined) {
    // Merge into existing permissions (shallow override per-key)
    const perms = readPerms(existing.permissions);
    Object.assign(perms, data.permissions);
    updateData.permissions = JSON.stringify(perms);
  }

  const updated = await db.user.update({
    where: { uid },
    data: updateData,
    select: { uid: true, email: true, displayName: true, role: true, companies: true, permissions: true },
  });

  if (data.role !== undefined && data.role !== existing.role) {
    await logAudit({
      userEmail: admin.email,
      userUid: admin.uid,
      action: "team_member_role_change",
      entity: "company_member",
      entityId: uid,
      companySlug: slug,
      details: { from: existing.role, to: data.role, targetEmail: existing.email },
    });
  }

  await logAudit({
    userEmail: admin.email,
    userUid: admin.uid,
    action: "team_member_update",
    entity: "company_member",
    entityId: uid,
    companySlug: slug,
    details: { fields: Object.keys(updateData), targetEmail: existing.email },
  });

  return NextResponse.json({
    ok: true,
    member: {
      uid: updated.uid,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      companies: readCompanies(updated.companies),
      permissions: readPerms(updated.permissions),
      isFounder: isFounderEmail(updated.email),
    },
  });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { slug, uid } = await params;
  const access = await requirePermissionForCompany(req, "settings_access", slug);
  if ("error" in access) return access.error;
  const admin = access.user;

  const existing = await db.user.findUnique({ where: { uid } });
  if (!existing) return apiError("User not found", 404);

  // Founder cannot be removed from a company
  if (isFounderEmail(existing.email)) {
    return apiError("لا يمكن إزالة المؤسس من الشركة", 403);
  }

  const companies = readCompanies(existing.companies);
  if (!companies.includes(slug)) {
    // Already not a member — idempotent success
    return NextResponse.json({ ok: true, removed: false });
  }

  const remaining = companies.filter((s) => s !== slug);

  // When a user loses access to a company, scrub any per-company permission
  // overrides so they don't leak across tenant boundaries. We keep the role
  // baseline intact.
  await db.user.update({
    where: { uid },
    data: {
      companies: JSON.stringify(remaining),
      // Bump tokenVersion so any cached session with the old companies list is
      // invalidated and the user must re-authenticate.
      tokenVersion: { increment: 1 },
    },
  });

  await logAudit({
    userEmail: admin.email,
    userUid: admin.uid,
    action: "team_member_remove",
    entity: "company_member",
    entityId: uid,
    companySlug: slug,
    details: { targetEmail: existing.email, remainingCompanies: remaining },
  });

  return NextResponse.json({ ok: true, removed: true });
});
