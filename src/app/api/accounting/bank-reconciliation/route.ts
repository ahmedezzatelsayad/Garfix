/**
 * /api/accounting/bank-reconciliation
 * GET — list reconciliations for company & bank account
 * POST — start a reconciliation
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { reconcileBankAccount } from "@/lib/accounting/banking";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  bankAccountId: z.number().int(),
  periodStart: z.string().min(1), // YYYY-MM-DD
  periodEnd: z.string().min(1), // YYYY-MM-DD
  statementBalance: z.union([z.number(), z.string()]),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };

  const bankAccountId = sp.get("bankAccountId");
  if (bankAccountId) where.bankAccountId = parseInt(bankAccountId, 10);

  const reconciliations = await db.bankReconciliation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      bankAccount: { select: { id: true, bankName: true, accountName: true, currency: true } },
    },
  });

  return NextResponse.json({
    reconciliations: reconciliations.map((r) => ({
      ...r,
      statementBalance: num(r.statementBalance, 3).toFixed(3),
      bookBalance: num(r.bookBalance, 3).toFixed(3),
      adjustedBalance: num(r.adjustedBalance, 3).toFixed(3),
      difference: num(r.difference, 3).toFixed(3),
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate period dates
  if (data.periodStart > data.periodEnd) {
    return apiError("periodStart must be before periodEnd", 400);
  }

  // Validate bank account belongs to company
  const bankAccount = await db.bankAccount.findUnique({
    where: { id: data.bankAccountId },
  });
  if (!bankAccount) return apiError("Bank account not found", 404);
  if (bankAccount.companySlug !== data.companySlug) return apiError("Bank account does not belong to this company", 403);

  // Run reconciliation engine
  const reconResult = await reconcileBankAccount(
    data.companySlug,
    data.bankAccountId,
    data.periodStart,
    data.periodEnd,
    String(data.statementBalance),
  );

  // Create BankReconciliation record
  const reconciliation = await db.bankReconciliation.create({
    data: {
      companySlug: data.companySlug,
      bankAccountId: data.bankAccountId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      statementBalance: reconResult.statementBalance,
      bookBalance: reconResult.bookBalance,
      adjustedBalance: reconResult.adjustedBalance,
      difference: reconResult.difference,
      status: "draft",
    },
    include: {
      bankAccount: { select: { id: true, bankName: true, accountName: true, currency: true } },
    },
  });

  // Mark matched bank transactions as reconciled
  for (const match of reconResult.matchedItems) {
    await db.bankTransaction.update({
      where: { id: match.bankTransactionId },
      data: {
        isReconciled: true,
        reconciledWith: "journal_entry",
        reconciledId: match.journalEntryLineId,
      },
    });
  }

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "bank_reconciliation",
    entityId: reconciliation.id,
    companySlug: data.companySlug,
    details: {
      bankAccountId: data.bankAccountId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      statementBalance: reconResult.statementBalance,
      bookBalance: reconResult.bookBalance,
      adjustedBalance: reconResult.adjustedBalance,
      difference: reconResult.difference,
      matchedCount: reconResult.matchedItems.length,
      unmatchedBank: reconResult.unmatchedBankItems.length,
      unmatchedGl: reconResult.unmatchedGlItems.length,
    },
  });

  return apiOk({
    reconciliation: {
      ...reconciliation,
      statementBalance: num(reconciliation.statementBalance, 3).toFixed(3),
      bookBalance: num(reconciliation.bookBalance, 3).toFixed(3),
      adjustedBalance: num(reconciliation.adjustedBalance, 3).toFixed(3),
      difference: num(reconciliation.difference, 3).toFixed(3),
    },
    details: reconResult,
  }, 201);
});
