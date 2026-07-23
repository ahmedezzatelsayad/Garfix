/**
 * /api/accounting/accountant-access
 * GET  — List external accountant accesses for a company
 * POST — Grant accountant access (companySlug, accountantEmail, accessLevel)
 * DELETE — Revoke accountant access
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { createExternalAccountantAccess, type AccountantAccessLevel } from "@/lib/accounting/accountant-collab";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ─── GET ─────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  // Find all RolePermission rows with roles that start with "ext_accountant_" for this company
  const rolePerms = await db.rolePermission.findMany({
    where: {
      companySlug,
      role: { startsWith: "ext_accountant_" },
    },
  });

  // Group by role to reconstruct access entries
  const roleMap = new Map<string, { permissions: string[]; companySlug: string }>();
  for (const rp of rolePerms) {
    if (!roleMap.has(rp.role)) {
      roleMap.set(rp.role, { permissions: [], companySlug: rp.companySlug || companySlug });
    }
    roleMap.get(rp.role)!.permissions.push(rp.permissionKey);
  }

  const entries = Array.from(roleMap.entries()).map(([role, data]) => {
    // Extract email from role name: ext_accountant_{companySlug}_{email_sanitized}
    const prefix = `ext_accountant_${companySlug}_`;
    const emailPart = role.slice(prefix.length);
    // Approximate the original email — sanitized chars replaced back
    const accountantEmail = emailPart.replace(/_/g, "@").replace(/_at_/g, "@");

    // Determine access level from permissions
    let accessLevel: AccountantAccessLevel = "read_only";
    if (data.permissions.includes("post_journal_entry") || data.permissions.includes("create_voucher")) {
      accessLevel = "full_edit";
    } else if (data.permissions.includes("create_journal_entry")) {
      accessLevel = "limited_edit";
    }

    return {
      role,
      accountantEmail,
      accessLevel,
      permissionsGranted: data.permissions,
      companySlug: data.companySlug,
    };
  });

  return apiOk({ accesses: entries });
});

// ─── POST ──────────────────────────────────────────────────────────────

const GrantSchema = z.object({
  companySlug: z.string().min(1),
  accountantEmail: z.string().email(),
  accessLevel: z.enum(["read_only", "limited_edit", "full_edit"]),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = GrantSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const result = await createExternalAccountantAccess(
    data.companySlug,
    data.accountantEmail,
    data.accessLevel,
  );

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "grant_accountant_access",
    entity: "accountant_access",
    companySlug: data.companySlug,
    details: { accountantEmail: data.accountantEmail, accessLevel: data.accessLevel },
  });

  return apiOk({ ok: true, access: result });
});

// ─── DELETE ────────────────────────────────────────────────────────────

const RevokeSchema = z.object({
  companySlug: z.string().min(1),
  accountantEmail: z.string().email(),
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = RevokeSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Find and delete the role permissions for this accountant
  const roleName = `ext_accountant_${data.companySlug}_${data.accountantEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;

  const deleted = await db.rolePermission.deleteMany({
    where: {
      role: roleName,
      companySlug: data.companySlug,
    },
  });

  // Also remove the company from the accountant's companies list
  const accountantUser = await db.user.findUnique({ where: { email: data.accountantEmail } });
  if (accountantUser) {
    const companies: string[] = JSON.parse(accountantUser.companies || "[]");
    const updated = companies.filter((c) => c !== data.companySlug);
    await db.user.update({
      where: { email: data.accountantEmail },
      data: { companies: JSON.stringify(updated) },
    });
  }

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "revoke_accountant_access",
    entity: "accountant_access",
    companySlug: data.companySlug,
    details: { accountantEmail: data.accountantEmail, rolePermissionsDeleted: deleted.count },
  });

  return apiOk({ ok: true, deletedCount: deleted.count });
});
