/**
 * /api/accounting/reports/general-ledger
 * GET — General Ledger Report
 *
 * Provides a detailed general ledger report for a specific account or all accounts,
 * with running balance, date range filtering, and pagination.
 *
 * Query Parameters:
 * - companySlug: (required) Company identifier
 * - accountId: (optional) Specific account ID to filter
 * - fromDate: (optional) Start date filter (YYYY-MM-DD)
 * - toDate: (optional) End date filter (YYYY-MM-DD)
 * - page: (default: 1) Page number for pagination
 * - pageSize: (default: 50) Items per page
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, hasPermission, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { apiError, withErrorHandler } from "@/lib/api";
import { num } from "@/lib/money";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeneralLedgerEntry {
  id: string;
  date: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number; // Running balance
  journalEntryId: string;
  journalEntryNumber: string;
}

interface GeneralLedgerResponse {
  account: {
    id: string;
    code: string;
    name: string;
    nameAr: string | null;
    type: string;
  } | null;
  openingBalance: {
    debit: number;
    credit: number;
    net: number;
  };
  entries: GeneralLedgerEntry[];
  closingBalance: {
    debit: number;
    credit: number;
    net: number;
  };
  totals: {
    totalDebits: number;
    totalCredits: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

// ─── GET: General Ledger Report ──────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  
  if (!companySlug) {
    return apiError("companySlug مطلوب", 400);
  }

  if (!assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "ممنوع" }, { status: 403 });
  }

  const accountId = sp.get("accountId") || null;
  const fromDate = sp.get("fromDate") ? new Date(sp.get("fromDate")!) : null;
  const toDate = sp.get("toDate") ? new Date(sp.get("toDate")!) : null;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(sp.get("pageSize") || "50", 10)));

  // Get company
  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return apiError("الشركة غير موجودة", 404);
  }

  const companyId = company.id;

  // If specific account requested
  if (accountId) {
    return getSingleAccountLedger(
      companyId,
      companySlug,
      accountId,
      fromDate,
      toDate,
      page,
      pageSize,
    );
  }

  // Otherwise return summary for all accounts
  return getAllAccountsLedgerSummary(companyId, companySlug, fromDate, toDate);
});

// ─── Single Account Ledger ──────────────────────────────────────────────────

async function getSingleAccountLedger(
  companyId: string,
  companySlug: string,
  accountId: string,
  fromDate: Date | null,
  toDate: Date | null,
  page: number,
  pageSize: number,
): Promise<NextResponse> {
  // Get account details
  const account = await db.account.findUnique({
    where: { id: accountId, companyId },
  });

  if (!account) {
    return apiError("الحساب غير موجود", 404);
  }

  // Build date filter for journal entries
  const jeWhere: Record<string, unknown> = {
    companyId,
    status: "posted",
    deletedAt: null,
  };

  if (fromDate) {
    jeWhere.date = { ...((jeWhere.date as Record<string, unknown>) || {}), gte: fromDate };
  }
  if (toDate) {
    // End of day for toDate
    const endOfDay = new Date(toDate);
    endOfDay.setHours(23, 59, 59, 999);
    jeWhere.date = { ...((jeWhere.date as Record<string, unknown>) || {}), lte: endOfDay };
  }

  // Get journal entry lines for this account
  const linesWhere: Record<string, unknown> = {
    accountId,
    journalEntry: jeWhere,
  };

  // Count total items
  const totalItems = await db.journalEntryLine.count({
    where: linesWhere,
  });

  // Calculate opening balance (sum of all posted entries before fromDate)
  let openingBalanceNet = num(account.balance, 3); // Start with current balance

  if (fromDate) {
    // Get entries before the from date to calculate opening balance
    const priorLines = await db.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: {
          companyId,
          status: "posted",
          deletedAt: null,
          date: { lt: fromDate },
        },
      },
      include: { journalEntry: { select: { date: true } } },
    });

    openingBalanceNet = 0;
    const isDebitNormal = account.type === "asset" || account.type === "expense";
    
    for (const line of priorLines) {
      if (isDebitNormal) {
        openingBalanceNet += num(line.debit, 3) - num(line.credit, 3);
      } else {
        openingBalanceNet += num(line.credit, 3) - num(line.debit, 3);
      }
    }
  }

  // Fetch paginated entries
  const skip = (page - 1) * pageSize;
  
  const lines = await db.journalEntryLine.findMany({
    where: linesWhere,
    include: {
      journalEntry: {
        select: {
          id: true,
          number: true,
          date: true,
          description: true,
          reference: true,
        },
      },
    },
    orderBy: { journalEntry: { date: "asc" } },
    skip,
    take: pageSize,
  });

  // Build response with running balance
  const isDebitNormal = account.type === "asset" || account.type === "expense";
  let runningBalance = openingBalanceNet;
  let totalDebits = 0;
  let totalCredits = 0;

  const entries: GeneralLedgerEntry[] = lines.map((line) => {
    const debit = num(line.debit, 3);
    const credit = num(line.credit, 3);

    if (isDebitNormal) {
      runningBalance += debit - credit;
    } else {
      runningBalance += credit - debit;
    }

    totalDebits += debit;
    totalCredits += credit;

    return {
      id: line.id,
      date: line.journalEntry.date.toISOString().split("T")[0],
      reference: line.journalEntry.reference,
      description: line.description || line.journalEntry.description,
      debit,
      credit,
      balance: runningBalance,
      journalEntryId: line.journalEntry.id,
      journalEntryNumber: line.journalEntry.number,
    };
  });

  // Format opening/closing balances
  const openingDebit = isDebitNormal && openingBalanceNet > 0 ? Math.abs(openingBalanceNet) : 0;
  const openingCredit = !isDebitNormal && openingBalanceNet > 0 ? Math.abs(openingBalanceNet) : 0;
  const closingDebit = isDebitNormal && runningBalance > 0 ? Math.abs(runningBalance) : 0;
  const closingCredit = !isDebitNormal && runningBalance > 0 ? Math.abs(runningBalance) : 0;

  const response: GeneralLedgerResponse = {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      nameAr: account.nameAr,
      type: account.type,
    },
    openingBalance: {
      debit: openingDebit,
      credit: openingCredit,
      net: openingBalanceNet,
    },
    entries,
    closingBalance: {
      debit: closingDebit,
      credit: closingCredit,
      net: runningBalance,
    },
    totals: {
      totalDebits,
      totalCredits,
    },
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };

  return NextResponse.json(response);
}

// ─── All Accounts Summary ────────────────────────────────────────────────────

async function getAllAccountsLedgerSummary(
  companyId: string,
  companySlug: string,
  fromDate: Date | null,
  toDate: Date | null,
): Promise<NextResponse> {
  // Get all active accounts
  const accounts = await db.account.findMany({
    where: { companyId, isActive: true },
    orderBy: { code: "asc" },
  });

  // DB-08 FIX (Audit v2 · Phase 2): Replace N+1 aggregate-per-account with
  // a single groupBy query. Previously this did one aggregate() per account
  // (~100+ queries per report). Now it's a single groupBy that returns all
  // accounts' totals in one query — ~100x faster.
  const jeWhere: Record<string, unknown> = {
    companyId,
    status: "posted",
    deletedAt: null,
  };

  if (fromDate) {
    jeWhere.date = { gte: fromDate };
  }
  if (toDate) {
    const endOfDay = new Date(toDate);
    endOfDay.setHours(23, 59, 59, 999);
    jeWhere.date = { ...(jeWhere.date as Record<string, unknown> || {}), lte: endOfDay };
  }

  // Single groupBy query — replaces the Promise.all(accounts.map(aggregate))
  const groupedAggregates = await db.journalEntryLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry: jeWhere,
      accountId: { in: accounts.map((a) => a.id) },
    },
    _sum: { debit: true, credit: true },
    _count: true,
  });

  // Build a lookup map for O(1) access
  const aggregateMap = new Map(
    groupedAggregates.map((g) => [g.accountId, g]),
  );

  // Build summary from the single query result
  const summary = accounts.map((account) => {
    const agg = aggregateMap.get(account.id);
    return {
      id: account.id,
      code: account.code,
      name: account.name,
      nameAr: account.nameAr,
      type: account.type,
      currentBalance: num(account.balance, 3),
      totalDebit: num(agg?._sum.debit, 3),
      totalCredit: num(agg?._sum.credit, 3),
      transactionCount: agg?._count || 0,
    };
  });

  return NextResponse.json({
    summary,
    totalAccounts: accounts.length,
    companySlug,
    period: {
      from: fromDate?.toISOString().split("T")[0] || null,
      to: toDate?.toISOString().split("T")[0] || null,
    },
  });
}
