/**
 * /api/accounting/bank-accounts/[id]
 * GET — get single bank account
 * PATCH — update bank account
 * DELETE — soft-delete (set isActive=false)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const UpdateSchema = z.object({
  companySlug: z.string().min(1),
  bankName: z.string().optional(),
  accountName: z.string().optional(),
  accountNumber: z.string().optional(),
  iban: z.string().optional(),
  branchCode: z.string().optional(),
  currency: z.string().optional(),
  accountType: z.enum(["checking", "savings", "cash_vault"]).optional(),
  glAccountId: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const account = await db.bankAccount.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        glAccount: { select: { id: true, code: true, nameAr: true, nameEn: true, type: true } },
        bankTransactions: {
          where: { isReconciled: false },
          orderBy: { date: "desc" },
          take: 20,
        },
      },
    });

    if (!account) return apiError("Bank account not found", 404);

    // SEC-C4 (Cycle 4): close IDOR — GET was missing the requirePermissionForCompany
    // guard that PATCH/DELETE already enforced. Any unauthenticated user with a
    // sequential id could read any tenant's bank account number + IBAN + balance.
    const access = await requirePermissionForCompany(req, "finance_access", account.companySlug);
    if ("error" in access) return access.error;

    return apiOk({
      ...account,
      balance: num(account.balance, 3).toFixed(3),
      bankTransactions: account.bankTransactions.map((t) => ({
        ...t,
        amount: num(t.amount, 3).toFixed(3),
      })),
    });
  })();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const accountId = parseInt(id, 10);
    const body = await parseJsonBody(req);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
    const data = parsed.data;

    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    const existing = await db.bankAccount.findUnique({ where: { id: accountId } });
    if (!existing) return apiError("Bank account not found", 404);
    if (existing.companySlug !== data.companySlug) return apiError("Bank account does not belong to this company", 403);

    // Validate GL account if updating
    if (data.glAccountId) {
      const glAccount = await db.account.findUnique({ where: { id: data.glAccountId } });
      if (!glAccount || glAccount.companySlug !== data.companySlug) {
        return apiError("GL account does not belong to this company", 400);
      }
      if (glAccount.type !== "asset") {
        return apiError("Bank account must be linked to an asset-type GL account", 400);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.bankName) updateData.bankName = data.bankName;
    if (data.accountName) updateData.accountName = data.accountName;
    if (data.accountNumber) updateData.accountNumber = data.accountNumber;
    if (data.iban !== undefined) updateData.iban = data.iban || null;
    if (data.branchCode !== undefined) updateData.branchCode = data.branchCode || null;
    if (data.currency) updateData.currency = data.currency;
    if (data.accountType) updateData.accountType = data.accountType;
    if (data.glAccountId !== undefined) updateData.glAccountId = data.glAccountId || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const account = await db.bankAccount.update({
      where: { id: accountId },
      data: updateData,
      include: {
        glAccount: { select: { id: true, code: true, nameAr: true, nameEn: true, type: true } },
      },
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "update",
      entity: "bank_account",
      entityId: accountId,
      companySlug: data.companySlug,
      details: { updatedFields: Object.keys(updateData) },
    });

    return apiOk({
      ...account,
      balance: num(account.balance, 3).toFixed(3),
    });
  })();
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const accountId = parseInt(id, 10);

    const sp = req.nextUrl.searchParams;
    const companySlug = sp.get("companySlug");
    if (!companySlug) return apiError("companySlug query parameter required", 400);

    const access = await requirePermissionForCompany(req, "finance_access", companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    const existing = await db.bankAccount.findUnique({ where: { id: accountId } });
    if (!existing) return apiError("Bank account not found", 404);
    if (existing.companySlug !== companySlug) return apiError("Bank account does not belong to this company", 403);

    // Soft delete: set isActive = false
    const account = await db.bankAccount.update({
      where: { id: accountId },
      data: { isActive: false },
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "delete",
      entity: "bank_account",
      entityId: accountId,
      companySlug,
      details: { bankName: existing.bankName, accountName: existing.accountName },
    });

    return apiOk({
      ...account,
      balance: num(account.balance, 3).toFixed(3),
      message: "Bank account deactivated successfully",
    });
  })();
}
