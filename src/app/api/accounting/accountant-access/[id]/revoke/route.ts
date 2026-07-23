/**
 * /api/accounting/accountant-access/[id]/revoke
 * POST — Revoke external accountant access
 *
 * Frontend calls: POST /api/accounting/accountant-access/{id}/revoke?companySlug=X
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const RevokeSchema = z.object({
  companySlug: z.string().min(1),
  accountantEmail: z.string().email(),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  // The id parameter is the role identifier; we also accept accountantEmail in body
  const body = await parseJsonBody(req);
  const parsed = RevokeSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Build the role name from companySlug + sanitized email
  const roleName = `ext_accountant_${data.companySlug}_${data.accountantEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;

  // Delete all role permissions for this accountant in this company
  const deleted = await db.rolePermission.deleteMany({
    where: {
      role: roleName,
      companySlug: data.companySlug,
    },
  });

  if (deleted.count === 0) {
    return apiError("No accountant access found for this email in this company", 404);
  }

  // Remove the company from the accountant's companies list
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
