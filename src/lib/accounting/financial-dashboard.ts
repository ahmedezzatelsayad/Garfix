/**
 * financial-dashboard.ts — Financial dashboard metrics engine (Phase 10).
 *
 * Provides dashboard metrics, period comparison, and budget vs actual reporting.
 * All monetary values stored as String; uses num() for arithmetic.
 */
import { db } from "@/lib/db";
import { num, toNum, subNums } from "@/lib/money";
import { logger } from "@/lib/logger";

// ─── Dashboard Metrics ───────────────────────────────────────────────────

export interface DashboardMetrics {
  revenue: number;
  expenses: number;
  netProfit: number;
  cashPosition: number;
  accountsReceivable: number;
  accountsPayable: number;
  inventoryValue: number;
  trends: {
    revenueChange: number | null;
    expenseChange: number | null;
    profitChange: number | null;
    cashChange: number | null;
  };
}

/**
 * Get dashboard metrics for a company within a date range.
 * Includes trend comparison vs previous period.
 */
export async function getDashboardMetrics(
  companySlug: string,
  periodFrom: string,
  periodTo: string,
): Promise<{ ok: boolean; metrics?: DashboardMetrics; error?: string }> {
  try {
    // Current period metrics
    const entries = await db.journalEntry.findMany({
      where: {
        companySlug,
        date: { gte: periodFrom, lte: periodTo },
        status: "posted",
        deletedAt: null,
      },
      include: { lines: { include: { account: true } } },
    });

    let revenue = 0;
    let expenses = 0;

    for (const entry of entries) {
      for (const line of entry.lines) {
        const acc = line.account;
        if (!acc) continue;
        const debit = num(line.debit, 3);
        const credit = num(line.credit, 3);

        if (acc.type === "revenue") {
          revenue += credit - debit;
        } else if (acc.type === "expense") {
          expenses += debit - credit;
        } else if (acc.type === "contra_revenue") {
          revenue -= (debit - credit);
        }
      }
    }

    const netProfit = revenue - expenses;

    // Cash position: sum of cash/bank account balances
    const cashAccounts = await db.account.findMany({
      where: {
        companySlug,
        type: "asset",
        isActive: true,
        OR: [
          { code: { startsWith: "1-1" } }, // Cash accounts typically 1-1xx
          { nameAr: { contains: "نقد" } },
          { nameAr: { contains: "بنك" } },
        ],
      },
    });
    const cashPosition = cashAccounts.reduce(
      (sum, acc) => sum + num(acc.balance, 3), 0
    );

    // Accounts receivable: outstanding invoices
    const outstandingInvoices = await db.invoice.findMany({
      where: {
        companySlug,
        deletedAt: null,
        status: { in: ["sent", "partial", "overdue"] },
      },
      select: { total: true, paid: true },
    });
    const accountsReceivable = outstandingInvoices.reduce(
      (sum, inv) => sum + num(inv.total, 3) - num(inv.paid, 3), 0
    );

    // Accounts payable: outstanding purchase invoices
    const outstandingPurchases = await db.purchaseInvoice.findMany({
      where: {
        companySlug,
        deletedAt: null,
      },
      select: { totalAmount: true },
    });
    const accountsPayable = outstandingPurchases.reduce(
      (sum, pi) => sum + num(pi.totalAmount, 3), 0
    );

    // Inventory value: sum of inventory items cost
    // FIX #10: ProductCatalog has `purchasePrice`, NOT `cost`.
    // FIX #11: Must include `product` relation in the query to access item.product.
    const inventoryItems = await db.inventoryItem.findMany({
      where: { companySlug },
      include: { product: { select: { purchasePrice: true } } },
    });
    const inventoryValue = inventoryItems.reduce(
      (sum, item) => sum + num(item.quantity, 3) * num(item.product?.purchasePrice ?? "0", 3), 0
    );

    // Previous period for trend comparison
    const fromDate = new Date(periodFrom);
    const toDate = new Date(periodTo);
    const periodDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevFrom = new Date(fromDate.getTime() - periodDays * 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
    const prevTo = new Date(fromDate.getTime() - 1 * 1000 * 60 * 60 * 24).toISOString().slice(0, 10);

    const prevEntries = await db.journalEntry.findMany({
      where: {
        companySlug,
        date: { gte: prevFrom, lte: prevTo },
        status: "posted",
        deletedAt: null,
      },
      include: { lines: { include: { account: true } } },
    });

    let prevRevenue = 0;
    let prevExpenses = 0;

    for (const entry of prevEntries) {
      for (const line of entry.lines) {
        const acc = line.account;
        if (!acc) continue;
        const debit = num(line.debit, 3);
        const credit = num(line.credit, 3);

        if (acc.type === "revenue") prevRevenue += credit - debit;
        else if (acc.type === "expense") prevExpenses += debit - credit;
        else if (acc.type === "contra_revenue") prevRevenue -= (debit - credit);
      }
    }

    const prevProfit = prevRevenue - prevExpenses;

    const prevCashAccounts = await db.account.findMany({
      where: {
        companySlug,
        type: "asset",
        isActive: true,
        OR: [
          { code: { startsWith: "1-1" } },
          { nameAr: { contains: "نقد" } },
          { nameAr: { contains: "بنك" } },
        ],
      },
    });

    // For cash trend, we compare current balances vs what they would have been
    // Simplification: compare current cash position vs previous period's ending cash
    // (In production, this would use historical snapshots)
    let prevCash = 0;
    for (const acc of prevCashAccounts) {
      prevCash += num(acc.balance, 3) - (revenue - expenses) + (prevRevenue - prevExpenses);
    }

    const computeChange = (current: number, previous: number): number | null => {
      if (previous === 0) return current > 0 ? 100 : null;
      return ((current - previous) / Math.abs(previous)) * 100;
    };

    const metrics: DashboardMetrics = {
      revenue,
      expenses,
      netProfit,
      cashPosition,
      accountsReceivable,
      accountsPayable,
      inventoryValue,
      trends: {
        revenueChange: computeChange(revenue, prevRevenue),
        expenseChange: computeChange(expenses, prevExpenses),
        profitChange: computeChange(netProfit, prevProfit),
        cashChange: computeChange(cashPosition, prevCash),
      },
    };

    return { ok: true, metrics };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[financial-dashboard] getDashboardMetrics failed", { err: msg });
    return { ok: false, error: msg };
  }
}

/** Alias for dashboard route — delegates to getDashboardMetrics. */
export async function getFinancialDashboard(
  companySlug: string,
  periodFrom?: string,
  periodTo?: string,
) {
  const from = periodFrom || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = periodTo || new Date().toISOString().slice(0, 10);
  return getDashboardMetrics(companySlug, from, to);
}

// ─── Period Comparison ───────────────────────────────────────────────────

export interface PeriodData {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
  cash: number;
}

export interface PeriodComparisonResult {
  periods: PeriodData[];
  changes: Array<{
    fromPeriod: string;
    toPeriod: string;
    revenueChange: number | null;
    expenseChange: number | null;
    profitChange: number | null;
    cashChange: number | null;
  }>;
}

/**
 * Compare 2+ periods side-by-side.
 * For each period: revenue, expenses, net profit, cash.
 * Calculate % change between consecutive periods.
 */
export async function getPeriodComparison(
  companySlug: string,
  periods: string[], // e.g. ["2024-01", "2024-02", "2024-03"]
): Promise<{ ok: boolean; result?: PeriodComparisonResult; error?: string }> {
  try {
    if (periods.length < 2) {
      return { ok: false, error: "يجب تقديم فترتين أو أكثر للمقارنة" };
    }

    const periodData: PeriodData[] = [];

    for (const period of periods) {
      // Parse period to date range
      let from: string;
      let to: string;

      if (period.length === 4) {
        // Year: 2024 → 2024-01-01 to 2024-12-31
        from = `${period}-01-01`;
        to = `${period}-12-31`;
      } else if (period.length === 7 && period.includes("-")) {
        // Month: 2024-01 → 2024-01-01 to 2024-01-31
        const [year, month] = period.split("-");
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        from = `${year}-${month}-01`;
        to = `${year}-${month}-${lastDay}`;
      } else if (period.includes("Q")) {
        // Quarter: 2024-Q1 → 2024-01-01 to 2024-03-31
        const [year, qStr] = period.split("-Q");
        const q = parseInt(qStr);
        const qFromMonth = (q - 1) * 3 + 1;
        from = `${year}-${String(qFromMonth).padStart(2, "0")}-01`;
        const qToMonth = q * 3;
        const lastDay = new Date(parseInt(year), qToMonth, 0).getDate();
        to = `${year}-${String(qToMonth).padStart(2, "0")}-${lastDay}`;
      } else {
        // Assume it's a date range already or invalid
        continue;
      }

      const entries = await db.journalEntry.findMany({
        where: {
          companySlug,
          date: { gte: from, lte: to },
          status: "posted",
          deletedAt: null,
        },
        include: { lines: { include: { account: true } } },
      });

      let revenue = 0;
      let expenses = 0;

      for (const entry of entries) {
        for (const line of entry.lines) {
          const acc = line.account;
          if (!acc) continue;
          const debit = num(line.debit, 3);
          const credit = num(line.credit, 3);

          if (acc.type === "revenue") revenue += credit - debit;
          else if (acc.type === "expense") expenses += debit - credit;
          else if (acc.type === "contra_revenue") revenue -= (debit - credit);
        }
      }

      const profit = revenue - expenses;

      // Cash position
      const cashAccounts = await db.account.findMany({
        where: {
          companySlug,
          type: "asset",
          isActive: true,
          OR: [
            { code: { startsWith: "1-1" } },
            { nameAr: { contains: "نقد" } },
            { nameAr: { contains: "بنك" } },
          ],
        },
      });
      const cash = cashAccounts.reduce(
        (sum, acc) => sum + num(acc.balance, 3), 0
      );

      periodData.push({ period, revenue, expenses, profit, cash });
    }

    // Calculate changes between consecutive periods
    const changes: Array<{
      fromPeriod: string;
      toPeriod: string;
      revenueChange: number | null;
      expenseChange: number | null;
      profitChange: number | null;
      cashChange: number | null;
    }> = [];

    const computeChange = (current: number, previous: number): number | null => {
      if (previous === 0) return current > 0 ? 100 : null;
      return ((current - previous) / Math.abs(previous)) * 100;
    };

    for (let i = 1; i < periodData.length; i++) {
      const prev = periodData[i - 1];
      const curr = periodData[i];
      changes.push({
        fromPeriod: prev.period,
        toPeriod: curr.period,
        revenueChange: computeChange(curr.revenue, prev.revenue),
        expenseChange: computeChange(curr.expenses, prev.expenses),
        profitChange: computeChange(curr.profit, prev.profit),
        cashChange: computeChange(curr.cash, prev.cash),
      });
    }

    return {
      ok: true,
      result: { periods: periodData, changes },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[financial-dashboard] getPeriodComparison failed", { err: msg });
    return { ok: false, error: msg };
  }
}

// ─── Budget vs Actual ────────────────────────────────────────────────────

export interface BudgetVsActualAccount {
  code: string;
  nameAr: string;
  planned: number;
  actual: number;
  variance: number;
  variancePercent: number | null;
}

export interface BudgetVsActualResult {
  accounts: BudgetVsActualAccount[];
}

/**
 * Compare budgeted (planned) amounts vs actual GL amounts.
 * For each budgeted account: planned amount vs actual, variance and variance %.
 */
export async function getBudgetVsActual(
  companySlug: string,
  fiscalYear: number,
  periodName: string,
): Promise<{ ok: boolean; result?: BudgetVsActualResult; error?: string }> {
  try {
    // Get budget entries for this period
    const budgets = await db.budget.findMany({
      where: {
        companySlug,
        fiscalYear,
        periodName,
      },
      include: {
        account: { select: { id: true, code: true, nameAr: true, type: true } },
      },
    });

    if (budgets.length === 0) {
      return { ok: false, error: `لا توجد ميزانية للفترة ${periodName} من السنة ${fiscalYear}` };
    }

    // Parse periodName to date range for GL actuals
    let from: string;
    let to: string;

    if (periodName.includes("Q")) {
      // Quarter: 2024-Q1
      const [year, qStr] = periodName.split("-Q");
      const q = parseInt(qStr);
      const qFromMonth = (q - 1) * 3 + 1;
      from = `${year}-${String(qFromMonth).padStart(2, "0")}-01`;
      const qToMonth = q * 3;
      const lastDay = new Date(parseInt(year), qToMonth, 0).getDate();
      to = `${year}-${String(qToMonth).padStart(2, "0")}-${lastDay}`;
    } else if (periodName.length === 7 && periodName.includes("-")) {
      // Month: 2024-01
      const [year, month] = periodName.split("-");
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      from = `${year}-${month}-01`;
      to = `${year}-${month}-${lastDay}`;
    } else if (periodName.length === 4) {
      // Year: 2024
      from = `${periodName}-01-01`;
      to = `${periodName}-12-31`;
    } else {
      return { ok: false, error: `صيغة الفترة غير صالحة: ${periodName}` };
    }

    // Get actual GL amounts for each budgeted account
    const accountIds = budgets.map((b) => b.accountId);

    const entries = await db.journalEntry.findMany({
      where: {
        companySlug,
        date: { gte: from, lte: to },
        status: "posted",
        deletedAt: null,
      },
      include: {
        lines: {
          where: { accountId: { in: accountIds } },
          include: { account: true },
        },
      },
    });

    // Compute actual amounts per account
    const actualMap = new Map<number, number>();
    for (const entry of entries) {
      for (const line of entry.lines) {
        const acc = line.account;
        if (!acc) continue;
        const debit = num(line.debit, 3);
        const credit = num(line.credit, 3);
        const isDebitNormal = acc.type === "asset" || acc.type === "expense";
        const amount = isDebitNormal ? debit - credit : credit - debit;
        actualMap.set(acc.id, (actualMap.get(acc.id) || 0) + amount);
      }
    }

    // Build budget vs actual comparison
    const accounts: BudgetVsActualAccount[] = budgets.map((b) => {
      const planned = num(b.plannedAmount, 3);
      const actual = actualMap.get(b.accountId) || num(b.actualAmount, 3);
      const variance = actual - planned;
      const variancePercent = planned !== 0 ? ((variance / Math.abs(planned)) * 100) : null;

      return {
        code: b.account.code,
        nameAr: b.account.nameAr,
        planned,
        actual,
        variance,
        variancePercent,
      };
    });

    // Update budget actual amounts
    for (const b of budgets) {
      const actual = actualMap.get(b.accountId) || num(b.actualAmount, 3);
      const variance = actual - num(b.plannedAmount, 3);
      await db.budget.update({
        where: { id: b.id },
        data: {
          actualAmount: actual.toFixed(3),
          variance: variance.toFixed(3),
        },
      });
    }

    return { ok: true, result: { accounts } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[financial-dashboard] getBudgetVsActual failed", { err: msg });
    return { ok: false, error: msg };
  }
}
