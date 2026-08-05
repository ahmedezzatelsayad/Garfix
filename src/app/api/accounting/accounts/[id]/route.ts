/**
 * /api/accounting/accounts/[id]
 * DELETE — delete an account (must not have journal lines referencing it)
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermission, requirePermissionForCompany } from "@/lib/middleware";
import { assertCompanyAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

type RouteParams = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit DELETE /api/accounting-accounts-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "delete:accounting-accounts-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "finance_access");
  if ("error" in access) return access.error;
  const user = access.user;
  const existing = await db.account.findUnique({ where: { id } });
  if (!existing || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Account not found", 404);
  }

  // Block deletion if any journal lines reference this account
  const lineCount = await db.journalEntryLine.count({ where: { accountId: existing.id } });
  if (lineCount > 0) {
    return apiError(`لا يمكن حذف الحساب — هناك ${lineCount} قيد مرتبط به. أعد التصنيف أولاً.`, 400);
  }

  await db.account.delete({ where: { id: existing.id } });

  await logAudit({
    userEmail: user.email, userUid: user.uid ?? "",
    action: "delete", entity: "account", entityId: existing.id, companySlug: existing.companySlug,
    details: { code: existing.code, nameAr: existing.nameAr },
  });

  return NextResponse.json({ ok: true });
});

