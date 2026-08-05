/**
 * /api/accounting/fiscal/[year]
 * POST (close) / POST (reopen) — Fiscal year close and reopen operations
 *
 * - Close a fiscal year with trial balance snapshot
 * - Reopen a closed fiscal year with audit logging
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, hasPermission } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const CloseYearSchema = z.object({
  companySlug: z.string().min(1),
  notes: z.string().optional(),
  confirmRetainedEarnings: z.boolean().default(false), // Explicit confirmation
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
  const startDate = new Date(year, 0, 1); // Jan 1
  const endDate = new Date(year, 11, 31, 23, 59, 59, 999); // Dec 31

  // Get all accounts for this company
  const accounts = await db.account.findMany({
    where: { companyId, isActive: true },
    orderBy: { code: "asc" },
  });

  // Get journal entries for the year
  const journalEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      date: { gte: startDate, lte: endDate },
      status: "posted",
      deletedAt: null,
    },
    include: { lines: true },
  });

  // Calculate balances per account
  const accountBalances = new Map<string, { debit: number; credit: number }>();
  
  for (const account of accounts) {
    accountBalances.set(account.id, { debit: 0, credit: 0 });
  }

  for (const je of journalEntries) {
    for (const line of je.lines) {
      const current = accountBalances.get(line.accountId);
      if (current) {
        current.debit += num(line.debit, 3);
        current.credit += num(line.credit, 3);
      }
    }
  }

  // Build snapshot
  const snapshot = accounts.map((account) => {
    const balances = accountBalances.get(account.id) || { debit: 0, credit: 0 };
    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountNameAr: account.nameAr,
      accountType: account.type,
      openingBalance: num(account.balance, 3),
      totalDebit: balances.debit,
      totalCredit: balances.credit,
      closingBalance: 0, // Will be calculated
    };
  });

  // Calculate closing balances
  let totalDebits = 0;
  let totalCredits = 0;

  for (const item of snapshot) {
    if (item.accountType === "asset" || item.accountType === "expense") {
      item.closingBalance = item.openingBalance + item.totalDebit - item.totalCredit;
      totalDebits += Math.max(0, item.closingBalance);
    } else {
      item.closingBalance = item.openingBalance + item.totalCredit - item.totalDebit;
      totalCredits += Math.max(0, item.closingBalance);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    accounts: snapshot,
    totals: { totalDebits, totalCredits },
  };
}

// ─── POST: Close fiscal year ─────────────────────────────────────────────────

export async function POST_close(req: NextRequest, ctx: RouteContext) {
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

  // Get company
  const company = await db.company.findUnique({ where: { slug: data.companySlug } });
  if (!company) {
    return apiError("الشركة غير موجودة", 404);
  }

  // Check if already closed
  const existingClose = await db.fiscalYearClose.findUnique({
    where: { companyId_year: { companyId: company.id, year } },
  });

  if (existingClose && !existingClose.isReopened) {
    return apiError(`السنة المالية ${year} مغلقة بالفعل`, 409);
  }

  // Generate trial balance snapshot
  const trialBalanceSnapshot = await generateTrialBalanceSnapshot(
    company.id,
    data.companySlug,
    year,
  );

  // Calculate retained earnings (simplified: Revenue - Expenses)
  const snapshot = trialBalanceSnapshot as { 
    accounts: Array<{ accountType: string; totalDebit: number; totalCredit: number }>;
  };
  
  let retainedEarnings = 0;
  for (const acc of snapshot.accounts) {
    if (acc.accountType === "revenue") {
      retainedEarnings += acc.totalCredit - acc.totalDebit;
    } else if (acc.accountType === "expense") {
      retainedEarnings -= acc.totalDebit - acc.totalCredit;
    }
  }

  // Create or update fiscal year close record
  const closeRecord = await db.fiscalYearClose.upsert({
    where: { companyId_year: { companyId: company.id, year } },
    create: {
      companyId: company.id,
      companySlug: data.companySlug,
      year,
      closedAt: new Date(),
      closedBy: user.email,
      openingRetainedEarnings: retainedEarnings,
      notes: data.notes || null,
      trialBalanceSnapshot: trialBalanceSnapshot as object,
      isReopened: false,
    },
    update: {
      closedAt: new Date(),
      closedBy: user.email,
      openingRetainedEarnings: retainedEarnings,
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
      retainedEarnings,
      notes: data.notes,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `تم إغلاق السنة المالية ${year} بنجاح`,
    closeRecord,
    retainedEarnings,
    trialBalanceSummary: {
      totalAccounts: snapshot.accounts.length,
      totalDebits: (trialBalanceSnapshot as { totals: { totalDebits: number } }).totals.totalDebits,
      totalCredits: (trialBalanceSnapshot as { totals: { totalCredits: number } }).totals.totalCredits,
    },
  });
}

// ─── POST: Reopen fiscal year ────────────────────────────────────────────────

export async function POST_reopen(req: NextRequest, ctx: RouteContext) {
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

  // Get company
  const company = await db.company.findUnique({ where: { slug: data.companySlug } });
  if (!company) {
    return apiError("الشركة غير موجودة", 404);
  }

  // Check if closed
  const existingClose = await db.fiscalYearClose.findUnique({
    where: { companyId_year: { companyId: company.id, year } },
  });

  if (!existingClose || existingClose.isReopened) {
    return apiError(`السنة المالية ${year} ليست مغلقة`, 400);
  }

  // Update record to mark as reopened
  const updated = await db.fiscalYearClose.update({
    where: { id: existingClose.id },
    data: {
      isReopened: true,
      reopenedAt: new Date(),
      reopenedBy: user.email,
    },
  });

  // Reopen fiscal periods for this year
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
    },
  });

  return NextResponse.json({
    ok: true,
    message: `تم إعادة فتح السنة المالية ${year} بنجاح`,
    closeRecord: updated,
    warning: "تم إعادة فتح السنة المالية. يرجى مراجعة جميع القيود بعناية.",
  });
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") || "close";

  if (action === "reopen") {
    return POST_reopen(req, ctx);
  }
  
  return POST_close(req, ctx);
});
