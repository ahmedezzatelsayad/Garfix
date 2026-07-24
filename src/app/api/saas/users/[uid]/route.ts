/**
 * /api/saas/users/[uid]
 * PATCH  — update a user (admin/founder OR self for displayName only)
 * DELETE — soft-delete a user (founder only)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder, requireAuth } from "@/lib/middleware";
import { isFounderEmail } from "@/lib/founder";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";

type RouteParams = { params: Promise<{ uid: string }> };

const UpdateSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: z.enum(["admin", "editor", "employee", "viewer", "inactive"]).optional(),
  companies: z.array(z.string()).optional(),
  permissions: z.record(z.string(), z.number()).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { uid } = await params;
  const existing = await db.appUser.findUnique({ where: { uid } });
  if (!existing) return apiError("User not found", 404);

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Determine caller identity. Founder/admin bypass; otherwise allow
  // self-edit (only for displayName).
  const authResult = await requireAuth(req);
  const caller = authResult instanceof NextResponse ? null : authResult.user;
  if (!caller) return authResult as NextResponse;
  const isSelf = caller.uid === uid;
  const isCallerAdmin = caller.role === "admin" || isFounderEmail(caller.email);

  if (!isCallerAdmin && !isSelf) {
    return apiError("ليس لديك صلاحية لتعديل هذا المستخدم", 403);
  }

  // Non-founder admins cannot edit founders (unless it's their own profile)
  if (isFounderEmail(existing.email) && !isFounderEmail(caller.email) && !isSelf) {
    return apiError("لا يمكن تعديل بيانات المؤسس", 403);
  }

  // Self-edits are restricted to displayName only
  if (isSelf && !isCallerAdmin) {
    const allowed: (keyof typeof data)[] = ["displayName"];
    const attempted = Object.keys(data) as (keyof typeof data)[];
    const illegal = attempted.filter((k) => !allowed.includes(k));
    if (illegal.length > 0) {
      return apiError("يمكنك تعديل اسمك فقط. تواصل مع المدير لباقي التغييرات.", 403);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.displayName !== undefined) updateData.displayName = data.displayName;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.companies !== undefined) updateData.companies = JSON.stringify(data.companies);
  if (data.permissions !== undefined) updateData.permissions = JSON.stringify(data.permissions);
  // isActive: false → soft delete by setting role="inactive"
  if (data.isActive !== undefined) {
    if (data.isActive === false) updateData.role = "inactive";
    else if (data.isActive === true && existing.role === "inactive") updateData.role = "viewer";
  }

  // Block attempts to demote the founder via role change
  if (isFounderEmail(existing.email) && updateData.role && updateData.role !== "admin") {
    return apiError("لا يمكن تغيير دور المؤسس", 403);
  }

  // SEC-H2C4 (Cycle 4): close mass-assignment / cross-tenant privilege escalation
  // on PATCH. Previously a tenant admin could:
  //   (a) PATCH any user in the platform (not just members of their own companies)
  //       — fixed by requiring the target user to share at least one company with
  //       the caller (unless caller is founder)
  //   (b) Add arbitrary companies to a user's `companies` array, escalating
  //       themselves across tenants — fixed by requiring every new slug to be in
  //       the caller's own companies list
  //   (c) Promote a user to admin role — fixed by requiring founder for that
  //       specific transition
  if (!isFounderEmail(caller.email)) {
    // (a) Target must share ≥1 company with caller (or be the caller themselves)
    if (!isSelf) {
      const targetCompanies = parseJsonField<string[]>(existing.companies, []);
      const callerCompanies = new Set(caller.companies || []);
      const sharesCompany = targetCompanies.some((slug) => callerCompanies.has(slug));
      if (!sharesCompany) {
        await logAudit({
          userEmail: caller.email, userUid: caller.uid,
          action: "update_denied", entity: "user", entityId: uid,
          details: { reason: "cross_tenant_user_edit", targetEmail: existing.email },
        });
        return apiError("لا يمكنك تعديل مستخدم لا يشاركك أي شركة", 403);
      }
    }
    // (b) Caller cannot assign companies they don't manage
    if (data.companies !== undefined) {
      const callerCompanies = new Set(caller.companies || []);
      const illegal = data.companies.filter((slug) => !callerCompanies.has(slug));
      if (illegal.length > 0) {
        await logAudit({
          userEmail: caller.email, userUid: caller.uid,
          action: "update_denied", entity: "user", entityId: uid,
          details: { reason: "cross_tenant_company_assignment", attemptedSlugs: illegal },
        });
        return apiError("لا يمكنك إضافة المستخدم إلى شركة لا تديرها", 403);
      }
    }
    // (c) Only founder can promote to admin role
    if (data.role === "admin" && existing.role !== "admin") {
      return apiError("لا يمكن للمدير العادي ترقية مستخدم إلى دور المدير — تواصل مع المؤسس", 403);
    }
  }

  const updated = await db.appUser.update({ where: { uid }, data: updateData });

  // Audit-log role transitions to/from admin (sensitive privilege change)
  if (data.role !== undefined && data.role !== existing.role) {
    await logAudit({
      userEmail: caller.email, userUid: caller.uid,
      action: "role_change", entity: "user", entityId: uid,
      details: { from: existing.role, to: data.role, targetEmail: existing.email },
    });
  }

  await logAudit({
    userEmail: caller.email, userUid: caller.uid,
    action: "update", entity: "user", entityId: uid,
    details: { fields: Object.keys(updateData), self: isSelf },
  });

  return NextResponse.json({
    ok: true,
    user: {
      uid: updated.uid,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      companies: parseJsonField<string[]>(updated.companies, []),
      permissions: parseJsonField<Record<string, number>>(updated.permissions, {}),
      emailVerified: updated.emailVerified,
    },
  });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const { uid } = await params;
  const existing = await db.appUser.findUnique({ where: { uid } });
  if (!existing) return apiError("User not found", 404);

  // The founder cannot delete their own account (would lock the system)
  if (isFounderEmail(existing.email)) {
    return apiError("لا يمكن حذف حساب المؤسس", 403);
  }

  // Soft delete: set role to "inactive" and clear company access
  await db.appUser.update({
    where: { uid },
    data: {
      role: "inactive",
      companies: "[]",
      permissions: "{}",
      // Bump tokenVersion to invalidate all outstanding sessions
      tokenVersion: { increment: 1 },
    },
  });

  await logAudit({
    userEmail: founder.email, userUid: founder.uid,
    action: "delete", entity: "user", entityId: uid,
    details: { targetEmail: existing.email, softDelete: true },
  });

  return NextResponse.json({ ok: true });
});

