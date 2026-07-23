/**
 * /api/accounting/accounts/[id]
 * DELETE — delete an account (must not have journal lines referencing it)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const existing = await db.account.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return apiError("Account not found", 404);

  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Block deletion if any journal lines reference this account
  const lineCount = await db.journalEntryLine.count({ where: { accountId: existing.id } });
  if (lineCount > 0) {
    return apiError(`لا يمكن حذف الحساب — هناك ${lineCount} قيد مرتبط به. أعد التصنيف أولاً.`, 400);
  }

  await db.account.delete({ where: { id: existing.id } });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "delete", entity: "account", entityId: existing.id, companySlug: existing.companySlug,
    details: { code: existing.code, nameAr: existing.nameAr },
  });

  return NextResponse.json({ ok: true });
});

