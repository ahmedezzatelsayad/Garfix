/**
 * /api/accounting/inter-company/[id]/settle
 * POST — settle an inter-company transaction
 *
 * FIX: accountId:0 placeholder replaced with proper inter-company
 * receivable/payable accounts from DB. Added $transaction wrapper
 * to ensure atomicity (JE creation + transaction update).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const SettleSchema = z.object({
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const transactionId = parseInt(id, 10);

  const body = await parseJsonBody(req);
  const parsed = SettleSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const existing = await db.interCompanyTransaction.findUnique({
    where: { id: transactionId },
  });
  if (!existing) return apiError("Inter-company transaction not found", 404);

  // Verify user has access to at least one of the companies involved
  let user: { email: string; uid: string };
  const accessFrom = await requirePermissionForCompany(req, "finance_access", existing.companySlugFrom);
  if ("error" in accessFrom) {
    const accessTo = await requirePermissionForCompany(req, "finance_access", existing.companySlugTo);
    if ("error" in accessTo) return accessTo.error;
    user = accessTo.user;
  } else {
    user = accessFrom.user;
  }

  // Only pending transactions can be settled
  if (existing.status !== "pending") {
    return apiError(`Cannot settle transaction in "${existing.status}" status. Only pending transactions can be settled.`, 400);
  }

  // Resolve proper inter-company accounts for both companies
  // For the "from" company: debit Inter-Company Receivable, credit the offsetting account
  // For the "to" company: debit the offsetting account, credit Inter-Company Payable
  const icReceivableFrom = await db.account.findFirst({
    where: {
      companySlug: existing.companySlugFrom,
      type: "asset",
      isActive: true,
      OR: [
        { code: { startsWith: "13" } }, // Inter-company receivable range
        { nameAr: { contains: "شركات" } },
        { nameAr: { contains: "ذمم" } },
      ],
    },
    orderBy: { code: "asc" },
  });

  const icPayableTo = await db.account.findFirst({
    where: {
      companySlug: existing.companySlugTo,
      type: "liability",
      isActive: true,
      OR: [
        { code: { startsWith: "22" } }, // Inter-company payable range
        { nameAr: { contains: "شركات" } },
        { nameAr: { contains: "ذمم" } },
      ],
    },
    orderBy: { code: "asc" },
  });

  // Fallback: if no dedicated IC accounts found, use the first asset/liability account
  const receivableAccountFrom = icReceivableFrom || await db.account.findFirst({
    where: { companySlug: existing.companySlugFrom, type: "asset", isActive: true },
    orderBy: { code: "asc" },
  });

  const payableAccountTo = icPayableTo || await db.account.findFirst({
    where: { companySlug: existing.companySlugTo, type: "liability", isActive: true },
    orderBy: { code: "asc" },
  });

  if (!receivableAccountFrom) {
    return apiError(`No active asset account found in company "${existing.companySlugFrom}" for inter-company settlement`, 400);
  }
  if (!payableAccountTo) {
    return apiError(`No active liability account found in company "${existing.companySlugTo}" for inter-company settlement`, 400);
  }

  // Also find offsetting accounts (cash/bank for the payer, revenue/asset for the payee)
  const cashAccountFrom = await db.account.findFirst({
    where: { companySlug: existing.companySlugFrom, type: "asset", isActive: true, code: { startsWith: "11" } },
    orderBy: { code: "asc" },
  }) || receivableAccountFrom;

  const offsetAccountTo = await db.account.findFirst({
    where: { companySlug: existing.companySlugTo, type: "asset", isActive: true, code: { startsWith: "11" } },
    orderBy: { code: "asc" },
  }) || payableAccountTo;

  // Perform all operations in a single $transaction for atomicity
  const result = await db.$transaction(async (tx) => {
    // Create JE for the "from" company
    const jeFrom = await tx.journalEntry.create({
      data: {
        companySlug: existing.companySlugFrom,
        date: new Date().toISOString().slice(0, 10),
        description: `Inter-company settlement with ${existing.companySlugTo} — transaction #${transactionId}`,
        status: "posted",
        sourceType: "inter_company_settlement",
        sourceId: transactionId,
        createdBy: user.email,
        lines: {
          create: [
            {
              accountId: receivableAccountFrom.id,
              debit: existing.amount,
              credit: "0.000",
              description: `Settlement: inter-company receivable from ${existing.companySlugTo}`,
            },
            {
              accountId: cashAccountFrom.id,
              debit: "0.000",
              credit: existing.amount,
              description: `Settlement: offset account for inter-company payment`,
            },
          ],
        },
      },
    });

    // Create JE for the "to" company
    const jeTo = await tx.journalEntry.create({
      data: {
        companySlug: existing.companySlugTo,
        date: new Date().toISOString().slice(0, 10),
        description: `Inter-company settlement with ${existing.companySlugFrom} — transaction #${transactionId}`,
        status: "posted",
        sourceType: "inter_company_settlement",
        sourceId: transactionId,
        createdBy: user.email,
        lines: {
          create: [
            {
              accountId: offsetAccountTo.id,
              debit: existing.amount,
              credit: "0.000",
              description: `Settlement: incoming inter-company payment from ${existing.companySlugFrom}`,
            },
            {
              accountId: payableAccountTo.id,
              debit: "0.000",
              credit: existing.amount,
              description: `Settlement: inter-company payable to ${existing.companySlugFrom}`,
            },
          ],
        },
      },
    });

    // Update account balances for both companies
    const allLineAccounts = [
      { id: receivableAccountFrom.id, type: receivableAccountFrom.type, debit: existing.amount, credit: "0.000" },
      { id: cashAccountFrom.id, type: cashAccountFrom.type, debit: "0.000", credit: existing.amount },
      { id: offsetAccountTo.id, type: offsetAccountTo.type, debit: existing.amount, credit: "0.000" },
      { id: payableAccountTo.id, type: payableAccountTo.type, debit: "0.000", credit: existing.amount },
    ];

    // Fetch current balances
    const accountIds = [...new Set(allLineAccounts.map((l) => l.id))];
    const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    for (const line of allLineAccounts) {
      const acc = accountMap.get(line.id);
      if (!acc) continue;
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      const delta = isDebitNormal
        ? num(line.debit, 3) - num(line.credit, 3)
        : num(line.credit, 3) - num(line.debit, 3);
      await tx.account.update({
        where: { id: acc.id },
        data: { balance: (num(acc.balance, 3) + delta).toFixed(3) },
      });
    }

    // Update the inter-company transaction status
    const transaction = await tx.interCompanyTransaction.update({
      where: { id: transactionId },
      data: {
        status: "settled",
        settledAt: new Date(),
        journalEntryIdFrom: jeFrom.id,
        journalEntryIdTo: jeTo.id,
      },
    });

    return { jeFromId: jeFrom.id, jeToId: jeTo.id, transaction };
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "settle_inter_company",
    entity: "inter_company_transaction",
    entityId: transactionId,
    companySlug: data.companySlug,
    details: {
      from: existing.companySlugFrom,
      to: existing.companySlugTo,
      amount: num(existing.amount, 3),
      currency: existing.currency,
      jeFromId: result.jeFromId,
      jeToId: result.jeToId,
      receivableAccountId: receivableAccountFrom.id,
      payableAccountId: payableAccountTo.id,
    },
  });

  return apiOk({
    ok: true,
    transaction: {
      ...result.transaction,
      amount: num(result.transaction.amount, 3),
    },
    jeFromId: result.jeFromId,
    jeToId: result.jeToId,
  });
});
