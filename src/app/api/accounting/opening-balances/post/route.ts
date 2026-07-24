/**
 * /api/accounting/opening-balances/post
 * POST — Post all draft opening balance entries as a single JE
 *
 * This is the dedicated route for the "action=post" flow that was
 * previously embedded in opening-balances/route.ts POST handler.
 * The frontend calls this route directly via POST /api/accounting/opening-balances/post
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { logAccountingChange } from "@/lib/accounting/accountant-collab";
import { num } from "@/lib/money";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

const PostSchema = z.object({ companySlug: z.string().min(1) });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Get all draft opening balance entries
  const draftEntries = await db.openingBalanceEntry.findMany({
    where: { companySlug: data.companySlug, status: "draft" },
    include: { account: true },
  });

  if (draftEntries.length === 0) return apiError("No draft opening balance entries to post", 400);

  // Validate that the entries are balanced
  let totalDebit = 0;
  let totalCredit = 0;

  const lines: Array<{ accountId: number; debit: string; credit: string; description: string }> = [];
  for (const entry of draftEntries) {
    const amount = num(entry.amount, 3);
    const isDebitNormal = entry.account.type === "asset" || entry.account.type === "expense";

    if (isDebitNormal) {
      totalDebit += amount;
      lines.push({
        accountId: entry.accountId,
        debit: amount.toFixed(3),
        credit: "0.000",
        description: `رصيد افتتاحي - ${entry.account.nameAr}`,
      });
    } else {
      totalCredit += amount;
      lines.push({
        accountId: entry.accountId,
        debit: "0.000",
        credit: amount.toFixed(3),
        description: `رصيد افتتاحي - ${entry.account.nameAr}`,
      });
    }
  }

  // Balancing line to equity if not balanced
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.001) {
    const equityAccount = await db.account.findFirst({
      where: { companySlug: data.companySlug, type: "equity", isActive: true },
      orderBy: { code: "asc" },
    });
    if (!equityAccount) return apiError("Cannot balance opening entries — no equity account found", 400);

    if (totalDebit > totalCredit) {
      totalCredit += diff;
      lines.push({
        accountId: equityAccount.id,
        debit: "0.000",
        credit: num(diff, 3).toFixed(3),
        description: `تسوية أرصدة افتتاحية - ${equityAccount.nameAr}`,
      });
    } else {
      totalDebit += diff;
      lines.push({
        accountId: equityAccount.id,
        debit: num(diff, 3).toFixed(3),
        credit: "0.000",
        description: `تسوية أرصدة افتتاحية - ${equityAccount.nameAr}`,
      });
    }
  }

  const jeDate = draftEntries[0].asOfDate;

  // Create JE + update opening balance entries in a transaction
  const result = await db.$transaction(async (tx) => {
    const je = await tx.journalEntry.create({
      data: {
        companySlug: data.companySlug,
        date: jeDate,
        description: "ترحيل أرصدة افتتاحية",
        reference: "OB-OPENING",
        status: "posted",
        createdBy: user.email,
        sourceType: "opening_balance",
        lines: { create: lines },
      },
    });

    for (const entry of draftEntries) {
      await tx.openingBalanceEntry.update({
        where: { id: entry.id },
        data: { status: "posted", journalEntryId: je.id },
      });
    }

    // Update account balances
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await tx.account.findMany({
      where: { id: { in: accountIds }, companySlug: data.companySlug },
    });
    const accountMap: Map<any, any> = new Map(accounts.map((a) => [a.id, a]));

    for (const line of lines) {
      const acc = accountMap.get(line.accountId);
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

    return { jeId: je.id, totalDebit, totalCredit, entriesPosted: draftEntries.length };
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "post", entity: "opening_balance", companySlug: data.companySlug,
    details: { jeId: result.jeId, entriesPosted: result.entriesPosted, totalDebit: result.totalDebit.toFixed(3), totalCredit: result.totalCredit.toFixed(3) },
  });

  await logAccountingChange(
    data.companySlug, user.email, "post", "opening_balance", null,
    { entriesCount: draftEntries.length, status: "draft" },
    { status: "posted", jeId: result.jeId },
    null,
  );

  return apiOk({ ok: true, ...result });
});
