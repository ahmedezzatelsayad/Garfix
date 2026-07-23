/**
 * commissions.ts — Phase 13: Sales commissions calculation
 *
 * Features:
 *  - calculateSalesCommissions: Get all invoices in period, sum per salesperson, apply commission rate
 *  - postCommissionsJE: Create JE (Debit Commission Expense, Credit Commissions Payable)
 */

import { db } from "@/lib/db";
import { num } from "@/lib/money";
import { logger } from "@/lib/logger";
import { logAccountingChange } from "@/lib/accounting/accountant-collab";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommissionEntry {
  salespersonId: number;
  name: string;
  totalSales: string;
  commissionRate: string;
  commissionAmount: string;
}

export interface CommissionResult {
  periodFrom: string;
  periodTo: string;
  commissions: CommissionEntry[];
  totalCommissions: string;
}

// ─── 1. calculateSalesCommissions ─────────────────────────────────────────────

export async function calculateSalesCommissions(
  companySlug: string,
  periodFrom: string,
  periodTo: string,
): Promise<CommissionResult> {
  // Get all invoices in the period that are not cancelled/deleted
  const invoices = await db.invoice.findMany({
    where: {
      companySlug,
      issueDate: { gte: periodFrom, lte: periodTo },
      status: { notIn: ["cancelled"] },
      deletedAt: null,
    },
    select: {
      id: true,
      total: true,
      createdByName: true,
      createdByEmail: true,
    },
  });

  // Get all employees (sales reps) for this company
  const employees = await db.employee.findMany({
    where: { companySlug, isActive: true },
  });

  // Create a map of employee email → employee data
  const employeeMap = new Map<string, { id: number; name: string; commissionRate: number }>();
  for (const emp of employees) {
    // Default commission rate: 5% (can be configured per employee via notes or future schema addition)
    // For now, we check if the employee has a commission percentage stored (from Commission model)
    const existingCommissions = await db.commission.findMany({
      where: { employeeId: emp.id, companySlug, type: "sales" },
      orderBy: { date: "desc" },
      take: 1,
    });

    // Extract rate from description if stored, or default to 5%
    let commissionRate = 5; // default 5%
    if (existingCommissions.length > 0 && existingCommissions[0].description) {
      const rateMatch = existingCommissions[0].description.match(/rate:\s*(\d+\.?\d*)%/i);
      if (rateMatch) commissionRate = parseFloat(rateMatch[1]);
    }

    if (emp.email) {
      employeeMap.set(emp.email, { id: emp.id, name: emp.name, commissionRate });
    }
  }

  // Sum total sales per salesperson (matched by createdByEmail)
  const salesByPerson = new Map<number, { name: string; totalSales: number; commissionRate: number }>();

  for (const invoice of invoices) {
    const salespersonEmail = invoice.createdByEmail;
    if (!salespersonEmail) continue;

    const empData = employeeMap.get(salespersonEmail);
    if (!empData) continue;

    const current = salesByPerson.get(empData.id) || { name: empData.name, totalSales: 0, commissionRate: empData.commissionRate };
    current.totalSales += num(invoice.total, 3);
    salesByPerson.set(empData.id, current);
  }

  // Calculate commission amounts
  const commissions: CommissionEntry[] = [];
  let totalCommissions = 0;

  for (const [salespersonId, data] of salesByPerson) {
    const commissionAmount = num(data.totalSales * data.commissionRate / 100, 3);
    totalCommissions += commissionAmount;

    commissions.push({
      salespersonId,
      name: data.name,
      totalSales: num(data.totalSales, 3).toFixed(3),
      commissionRate: data.commissionRate.toFixed(2),
      commissionAmount: commissionAmount.toFixed(3),
    });
  }

  logger.info("[commissions] calculated", { companySlug, periodFrom, periodTo, count: commissions.length, total: totalCommissions.toFixed(3) });

  return {
    periodFrom,
    periodTo,
    commissions,
    totalCommissions: num(totalCommissions, 3).toFixed(3),
  };
}

// ─── 2. postCommissionsJE ─────────────────────────────────────────────────────

export async function postCommissionsJE(
  companySlug: string,
  commissions: CommissionEntry[],
  period: { from: string; to: string },
  createdBy: string,
): Promise<{ jeId: number; lines: Array<{ accountId: number; accountCode: string; accountNameAr: string; debit: string; credit: string }> }> {
  const totalAmount = commissions.reduce<number>((sum, c) => sum + num(c.commissionAmount, 3), 0);
  if (totalAmount <= 0) throw new Error("Total commission amount must be greater than zero");

  // Find Commission Expense account (code 5400 or similar)
  const commissionExpenseAccount = await db.account.findFirst({
    where: {
      companySlug,
      type: "expense",
      isActive: true,
      OR: [
        { code: { startsWith: "54" } }, // commission expense range
        { nameAr: { contains: "عمولة" } },
        { nameEn: { contains: "commission" } },
      ],
    },
    orderBy: { code: "asc" },
  });

  // Fallback: find any expense account
  const expenseAccount = commissionExpenseAccount || await db.account.findFirst({
    where: { companySlug, type: "expense", isActive: true },
    orderBy: { code: "asc" },
  });

  if (!expenseAccount) throw new Error("No expense account found for commissions");

  // Find Commissions Payable account (liability)
  const commissionPayableAccount = await db.account.findFirst({
    where: {
      companySlug,
      type: "liability",
      isActive: true,
      OR: [
        { code: { startsWith: "22" } }, // accrued liabilities range
        { nameAr: { contains: "عمولات" } },
        { nameAr: { contains: "مستحق" } },
        { nameEn: { contains: "commission" } },
        { nameEn: { contains: "payable" } },
      ],
    },
    orderBy: { code: "asc" },
  });

  // Fallback: find any liability account
  const payableAccount = commissionPayableAccount || await db.account.findFirst({
    where: { companySlug, type: "liability", isActive: true },
    orderBy: { code: "asc" },
  });

  if (!payableAccount) throw new Error("No liability account found for commissions payable");

  // Create JE: Debit Commission Expense, Credit Commissions Payable
  // Also create individual Commission records for each salesperson
  const result = await db.$transaction(async (tx) => {
    const je = await tx.journalEntry.create({
      data: {
        companySlug,
        date: period.to, // Use period end date
        description: `عمولات المبيعات - ${period.from} إلى ${period.to}`,
        reference: `COMM-${period.from}-${period.to}`,
        status: "posted",
        createdBy,
        sourceType: "commissions",
        lines: {
          create: [
            {
              accountId: expenseAccount.id,
              debit: num(totalAmount, 3).toFixed(3),
              credit: "0.000",
              description: `عمولات مبيعات مستحقة`,
            },
            {
              accountId: payableAccount.id,
              debit: "0.000",
              credit: num(totalAmount, 3).toFixed(3),
              description: `عمولات مبيعات مستحقة`,
            },
          ],
        },
      },
      include: {
        lines: { include: { account: { select: { code: true, nameAr: true } } } },
      },
    });

    // Update account balances
    // Expense: debit increases balance (debit-normal)
    await tx.account.update({
      where: { id: expenseAccount.id },
      data: { balance: (num(expenseAccount.balance, 3) + num(totalAmount, 3)).toFixed(3) },
    });

    // Liability: credit increases balance (credit-normal)
    await tx.account.update({
      where: { id: payableAccount.id },
      data: { balance: (num(payableAccount.balance, 3) + num(totalAmount, 3)).toFixed(3) },
    });

    // Create Commission records for each salesperson
    for (const comm of commissions) {
      await tx.commission.create({
        data: {
          companySlug,
          employeeId: comm.salespersonId,
          date: period.to,
          type: "sales",
          description: `عمولات مبيعات ${period.from} - ${period.to} (rate:${comm.commissionRate}%)`,
          amount: num(comm.commissionAmount, 3).toFixed(3),
          isPaid: false,
        },
      });
    }

    // Log accounting audit
    await logAccountingChange(
      companySlug,
      createdBy,
      "create",
      "journal_entry",
      je.id,
      null,
      { sourceType: "commissions", totalAmount: num(totalAmount, 3).toFixed(3), period },
      null,
    );

    return je;
  });

  logger.info("[commissions] JE posted", { companySlug, jeId: result.id, totalAmount: num(totalAmount, 3).toFixed(3) });

  return {
    jeId: result.id,
    lines: result.lines.map((l) => ({
      accountId: l.accountId,
      accountCode: l.account.code,
      accountNameAr: l.account.nameAr,
      debit: l.debit,
      credit: l.credit,
    })),
  };
}
