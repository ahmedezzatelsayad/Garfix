/**
 * /api/accounting/fiscal/[year]
 * POST (close) / POST (reopen) — Fiscal year close and reopen operations
 *
 * P0-6 FIX: Unified year-close behavior. Previously, /fiscal/[year]?action=close
 * only saved a snapshot and marked periods as closed WITHOUT creating closing
 * journal entries. The /fiscal-periods/[id]/close endpoint DID create closing JEs.
 * Now BOTH endpoints create closing JEs and update account balances.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { Prisma } from "@prisma/client";
import { accountingTx } from "@/lib/accounting/tx";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const CloseYearSchema = z.object({
  companySlug: z.string().min(1),
  notes: z.string().optional(),
  confirmRetainedEarnings: z.boolean().default(false),
});

const ReopenYearSchema = z.object({
  companySlug: z.string().min(1),
  reason: z.string().min(5, "السبب مطلوب ويجب أن يكون 5 أحرف على الأقل"),
});

interface RouteContext {
  params: Promise<{ year: string }>;
}

// ─── Helper: Generate Trial Balance Snapshot ─────────────────────────────────

async function generateTrialBalanceSnapshot(
  companyId: string,
  companySlug: string,
  year: number,
): Promise<object> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

  const accounts = await db.account.findMany({
    where: { companyId, isActive: true },
    orderBy: { code: "asc" },
  });

  const journalEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      date: { gte: startDate, lte: endDate },
      status: "posted",
      deletedAt: null,
    },
    include: { lines: true },
  });

  const accountBalances = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  
  for (const account of accounts) {
    accountBalances.set(account.id, { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) });
  }

  for (const je of journalEntries) {
    for (const line of je.lines) {
      const current = accountBalances.get(line.accountId);
      if (current) {
        current.debit = current.debit.plus(new Prisma.Decimal(line.debit ?? 0));
        current.credit = current.credit.plus(new Prisma.Decimal(line.credit ?? 0));
      }
    }
  }

  const snapshot = accounts.map((account) => {
    const balances = accountBalances.get(account.id) || { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountNameAr: account.nameAr,
      accountType: account.type,
      openingBalance: new Prisma.Decimal(account.balance ?? 0).toFixed(3),
      totalDebit: balances.debit.toFixed(3),
      totalCredit: balances.credit.toFixed(3),
      closingBalance: 0,
    };
  });

  let totalDebits = new Prisma.Decimal(0);
  let totalCredits = new Prisma.Decimal(0);

  for (const item of snapshot) {
    const openingBal = new Prisma.Decimal(item.openingBalance);
    const totalDebit = new Prisma.Decimal(item.totalDebit);
    const totalCredit = new Prisma.Decimal(item.totalCredit);

    if (item.accountType === "asset" || item.accountType === "expense") {
      item.closingBalance = Number(openingBal.plus(totalDebit).minus(totalCredit).toFixed(3));
      const cb = new Prisma.Decimal(item.closingBalance);
      if (cb.gt(0)) totalDebits = totalDebits.plus(cb);
    } else {
      item.closingBalance = Number(openingBal.plus(totalCredit).minus(totalDebit).toFixed(3));
      const cb = new Prisma.Decimal(item.closingBalance);
      if (cb.gt(0)) totalCredits = totalCredits.plus(cb);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    accounts: snapshot,
    totals: { totalDebits: totalDebits.toFixed(3), totalCredits: totalCredits.toFixed(3) },
  };
}

// ─── POST: Close fiscal year ─────────────────────────────────────────────────

async function POST_close(req: NextRequest, ctx: RouteContext) {
  const { year: yearStr } = await ctx.params;
  const year = parseInt(yearStr, 10);
  
  if (isNaN(year) || year < 2000 || year > 2100) {
    return apiError("سنة مالية غير صالحة", 400);
  }

  const body = await parseJsonBody(req);
  const parsed = CloseYearSchema.safeParse(body);
  
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "بيانات غير صالحة", 400);
  }
  
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const company = await db.company.findUnique({ where: { slug: data.companySlug } });
  if (!company) {
    return apiError("الشركة غير موجودة", 404);
  }

  const existingClose = await db.fiscalYearClose.findUnique({
    where: { companyId_year: { companyId: company.id, year } },
  });

  if (existingClose && !existingClose.isReopened) {
    return apiError(`السنة المالية ${year} مغلقة بالفعل`, 409);
  }

  const trialBalanceSnapshot = await generateTrialBalanceSnapshot(company.id, data.companySlug, year);

  const snapshot = trialBalanceSnapshot as { 
    accounts: Array<{ accountType: string; accountCode: string; accountId: string; totalDebit: string; totalCredit: string }>; 
  };
  
  // P0-6 FIX: Calculate retained earnings using Decimal (not float)
  let retainedEarnings = new Prisma.Decimal(0);
  for (const acc of snapshot.accounts) {
    if (acc.accountType === "revenue") {
      const credit = new Prisma.Decimal(acc.totalCredit);
      const debit = new Prisma.Decimal(acc.totalDebit);
      retainedEarnings = retainedEarnings.plus(credit.minus(debit));
    } else if (acc.accountType === "expense") {
      const debit = new Prisma.Decimal(acc.totalDebit);
      const credit = new Prisma.Decimal(acc.totalCredit);
      retainedEarnings = retainedEarnings.minus(debit.minus(credit));
    }
  }

  // P0-6 FIX: Create closing journal entries (same as period-close does)
  // This ensures BOTH year-close endpoints produce the same side effects
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

  // AUDIT FIX: Serializable isolation for year-close — prevents concurrent
  // year-close operations from corrupting account balances.
  const closingResult = await accountingTx(async (tx) => {
    // Get all revenue/expense accounts
    const pnlAccounts = await tx.account.findMany({
      where: { 
        companyId: company.id, 
        type: { in: ["revenue", "expense", "contra_revenue"] },
        isActive: true 
      },
    });

    const pnlAccountIds = new Map(pnlAccounts.map(a => [a.id, a]));

    if (pnlAccountIds.size === 0) return { closingJEId: null };

    // Get posted JEs for the year with P&L lines
    const yearJEs = await tx.journalEntry.findMany({
      where: {
        companyId: company.id,
        date: { gte: startDate, lte: endDate },
        status: "posted",
        deletedAt: null,
      },
      include: { lines: true },
    });

    // Compute P&L account balances from journal lines
    const pnlBalances = new Map<string, Prisma.Decimal>(); // accountId -> net (debit-normal)
    for (const je of yearJEs) {
      for (const line of je.lines) {
        if (!pnlAccountIds.has(line.accountId)) continue;
        const debit = new Prisma.Decimal(line.debit ?? 0);
        const credit = new Prisma.Decimal(line.credit ?? 0);
        const current = pnlBalances.get(line.accountId) ?? new Prisma.Decimal(0);
        pnlBalances.set(line.accountId, current.plus(debit).minus(credit));
      }
    }

    // Get retained earnings account (3000)
    const retainedEarningsAccount = await tx.account.findFirst({
      where: { companyId: company.id, code: "3000" },
    });

    const closingLines: { accountId: string; debit: string; credit: string; description: string | null }[] = [];

    for (const [accountId, netBalance] of pnlBalances) {
      const acc = pnlAccountIds.get(accountId)!;
      if (netBalance.abs().lte(new Prisma.Decimal("0.001"))) continue;

      if (acc.type === "revenue") {
        // Revenue credit-normal: positive balance means more credits → debit to close
        closingLines.push({
          accountId,
          debit: netBalance.negated().toFixed(3),
          credit: "0.000",
          description: `Year-close: close revenue ${acc.code}`,
        });
      } else if (acc.type === "contra_revenue") {
        // Contra-revenue debit-normal: positive balance means more debits → credit to close
        closingLines.push({
          accountId,
          debit: "0.000",
          credit: netBalance.toFixed(3),
          description: `Year-close: close contra revenue ${acc.code}`,
        });
      } else if (acc.type === "expense") {
        // Expense debit-normal: positive balance means more debits → credit to close
        closingLines.push({
          accountId,
          debit: "0.000",
          credit: netBalance.toFixed(3),
          description: `Year-close: close expense ${acc.code}`,
        });
      }
    }

    if (retainedEarningsAccount && retainedEarnings.gt(new Prisma.Decimal("0.001"))) {
      // Net income: credit retained earnings
      closingLines.push({
        accountId: retainedEarningsAccount.id,
        debit: "0.000",
        credit: retainedEarnings.toFixed(3),
        description: `Year-close: net income to retained earnings`,
      });
    } else if (retainedEarningsAccount && retainedEarnings.lt(new Prisma.Decimal("-0.001"))) {
      // Net loss: debit retained earnings
      closingLines.push({
        accountId: retainedEarningsAccount.id,
        debit: retainedEarnings.abs().toFixed(3),
        credit: "0.000",
        description: `Year-close: net loss to retained earnings`,
      });
    }

    if (closingLines.length === 0) return { closingJEId: null };

    // Validate balanced
    const totalDebit = closingLines.reduce((s, l) => s.plus(new Prisma.Decimal(l.debit)), new Prisma.Decimal(0));
    const totalCredit = closingLines.reduce((s, l) => s.plus(new Prisma.Decimal(l.credit)), new Prisma.Decimal(0));
    if (totalDebit.minus(totalCredit).abs().gt(new Prisma.Decimal("0.01"))) {
      throw new Error(`Year-close JE not balanced: debit=${totalDebit.toFixed(3)}, credit=${totalCredit.toFixed(3)}`);
    }

    const closingJE = await tx.journalEntry.create({
      data: {
        number: `JE-YEARCLOSE-${year}-${Date.now()}`,
        companyId: company.id,
        companySlug: data.companySlug,
        date: endDate,
        description: `Year-end closing entries for FY${year}`,
        status: "posted",
        sourceType: "opening_balance",
        createdBy: user.email,
        lines: { create: closingLines },
      },
      include: { lines: true },
    });

    return { closingJEId: closingJE.id };
  });

  // Create or update fiscal year close record
  const closeRecord = await db.fiscalYearClose.upsert({
    where: { companyId_year: { companyId: company.id, year } },
    create: {
      companyId: company.id,
      companySlug: data.companySlug,
      year,
      closedAt: new Date(),
      closedBy: user.email,
      openingRetainedEarnings: retainedEarnings.toFixed(3),
      notes: data.notes || null,
      trialBalanceSnapshot: trialBalanceSnapshot as object,
      isReopened: false,
    },
    update: {
      closedAt: new Date(),
      closedBy: user.email,
      openingRetainedEarnings: retainedEarnings.toFixed(3),
      notes: data.notes || null,
      trialBalanceSnapshot: trialBalanceSnapshot as object,
      isReopened: false,
      reopenedAt: null,
      reopenedBy: null,
    },
  });

  // Close fiscal periods for this year
  await db.fiscalPeriod.updateMany({
    where: {
      companyId: company.id,
      startDate: { gte: new Date(year, 0, 1) },
      endDate: { lte: new Date(year, 11, 31) },
      status: "open",
    },
    data: { status: "closed" },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "close_fiscal_year",
    entity: "fiscal_year_close",
    entityId: closeRecord.id,
    companySlug: data.companySlug,
    details: {
      year,
      retainedEarnings: retainedEarnings.toFixed(3),
      notes: data.notes,
      closingJEId: closingResult.closingJEId,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `تم إغلاق السنة المالية ${year} بنجاح`,
    closeRecord,
    retainedEarnings: retainedEarnings.toFixed(3),
    closingJEId: closingResult.closingJEId,
    trialBalanceSummary: {
      totalAccounts: snapshot.accounts.length,
      totalDebits: (trialBalanceSnapshot as { totals: { totalDebits: string } }).totals.totalDebits,
      totalCredits: (trialBalanceSnapshot as { totals: { totalCredits: string } }).totals.totalCredits,
    },
  });
}

// ─── POST: Reopen fiscal year ────────────────────────────────────────────────

async function POST_reopen(req: NextRequest, ctx: RouteContext) {
  const { year: yearStr } = await ctx.params;
  const year = parseInt(yearStr, 10);
  
  if (isNaN(year) || year < 2000 || year > 2100) {
    return apiError("سنة مالية غير صالحة", 400);
  }

  const body = await parseJsonBody(req);
  const parsed = ReopenYearSchema.safeParse(body);
  
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "بيانات غير صالحة", 400);
  }
  
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const company = await db.company.findUnique({ where: { slug: data.companySlug } });
  if (!company) {
    return apiError("الشركة غير موجودة", 404);
  }

  const existingClose = await db.fiscalYearClose.findUnique({
    where: { companyId_year: { companyId: company.id, year } },
  });

  if (!existingClose || existingClose.isReopened) {
    return apiError(`السنة المالية ${year} ليست مغلقة`, 400);
  }

  // P0-6 FIX: Also reverse the closing JE (same as period reopen does)
  const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
  const closingJE = await db.journalEntry.findFirst({
    where: {
      companyId: company.id,
      date: endDate,
      description: { contains: `Year-end closing entries for FY${year}` },
      status: "posted",
      deletedAt: null,
    },
    include: { lines: true },
  });

  if (closingJE) {
    // AUDIT FIX: Serializable isolation for year-reopen reversal.
    await accountingTx(async (tx) => {
      const swappedLines = closingJE.lines.map((l) => ({
        accountId: l.accountId,
        debit: (l.credit ?? 0).toFixed(3),
        credit: (l.debit ?? 0).toFixed(3),
        description: l.description || null,
      }));

      await tx.journalEntry.create({
        data: {
          number: `JE-YEARREOPEN-${year}-${Date.now()}`,
          companyId: company.id,
          companySlug: data.companySlug,
          date: new Date(),
          description: `Reopen FY${year} — reversal of year-close JE #${closingJE.id}`,
          status: "posted",
          sourceType: "reversal",
          sourceId: String(closingJE.id),
          createdBy: user.email,
          lines: { create: swappedLines },
        },
      });

      await tx.journalEntry.update({
        where: { id: closingJE.id },
        data: { status: "reversed" },
      });
    });
  }

  const updated = await db.fiscalYearClose.update({
    where: { id: existingClose.id },
    data: {
      isReopened: true,
      reopenedAt: new Date(),
      reopenedBy: user.email,
    },
  });

  await db.fiscalPeriod.updateMany({
    where: {
      companyId: company.id,
      startDate: { gte: new Date(year, 0, 1) },
      endDate: { lte: new Date(year, 11, 31) },
      status: "closed",
    },
    data: { status: "open" },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "reopen_fiscal_year",
    entity: "fiscal_year_close",
    entityId: existingClose.id,
    companySlug: data.companySlug,
    details: {
      year,
      reason: data.reason,
      originalClosedAt: existingClose.closedAt,
      originalClosedBy: existingClose.closedBy,
      reversedClosingJE: closingJE?.id ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `تم إعادة فتح السنة المالية ${year} بنجاح`,
    closeRecord: updated,
    reversedClosingJE: closingJE?.id ?? null,
    warning: "تم إعادة فتح السنة المالية وعكس قيود الإغلاق. يرجى مراجعة جميع القيود بعناية.",
  });
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const authResult = await resolveAuth(req);
  if (!authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimitResponse(req, "post:accounting-fiscal-year", LIMITS.API_WRITE);
  if (rl) return rl;

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "close";

  if (action === "reopen") {
    return POST_reopen(req, ctx);
  }
  
  return POST_close(req, ctx);
});
