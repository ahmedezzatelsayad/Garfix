/**
 * tax-compliance.ts — Tax Filing Engine (Phase 7)
 *
 * Provides VAT return generation, Zakat calculation (Saudi only),
 * filing reminders, and retention compliance checks.
 *
 * ALL monetary values as String — use num()/toNum()/addNums()/mulNums() from money.ts.
 * ALL country-specific calculations use getCountryConfig from gulfConfig.ts.
 */
import { db } from "@/lib/db";
import { num, addNums, mulNums, subNums, toNum } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import {
  getCountryConfig,
  getRetentionYears,
  GULF_COUNTRIES,
  type CountryConfig,
} from "@/lib/gulfConfig";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VATReturnResult {
  totalSales: string;
  totalPurchases: string;
  vatOnSales: string;
  vatOnPurchases: string;
  vatDue: string;
  countryConfig: CountryConfig | null;
  filingId?: number;
}

export interface ZakatResult {
  zakatBase: string;
  zakatRate: string;
  zakatAmount: string;
  breakdown: {
    equity: string;
    longTermLiabilities: string;
    fixedAssets: string;
    longTermInvestments: string;
  };
}

export interface FilingReminder {
  country: string;
  taxType: string;
  nextDeadline: string;
  daysUntil: number;
  isOverdue: boolean;
}

export interface RetentionComplianceResult {
  country: string;
  retentionYears: number;
  recordsAtRisk: number;
  canAutoDelete: boolean;
}

// ── VAT Return ──────────────────────────────────────────────────────────────────

/**
 * generateVATReturn — compute VAT return for a given period.
 *
 * 1. Get all invoices (sales) in period → totalSales, vatOnSales
 * 2. Get all purchase invoices in period → totalPurchases, vatOnPurchases
 * 3. Calculate: vatDue = vatOnSales - vatOnPurchases
 * 4. Use getCountryConfig(country) for VAT rate
 * 5. Create TaxFiling record
 */
export async function generateVATReturn(
  companySlug: string,
  country: string,
  periodFrom: string,
  periodTo: string,
  userEmail: string,
  userUid: string,
): Promise<VATReturnResult> {
  const countryConfig = getCountryConfig(country);
  if (!countryConfig) {
    throw new Error(`Country config not found for: ${country}`);
  }

  if (!countryConfig.vatApplicable) {
    throw new Error(`VAT is not applicable in ${countryConfig.nameEn} (${country})`);
  }

  const vatRate = countryConfig.vatRate;

  // Get all sales invoices in the period
  const salesInvoices = await db.invoice.findMany({
    where: {
      companySlug,
      issueDate: { gte: periodFrom, lte: periodTo },
      status: { notIn: ["draft", "cancelled"] },
      deletedAt: null,
    },
  });

  let totalSales = 0;
  let vatOnSales = 0;
  for (const inv of salesInvoices) {
    const subtotal = num(inv.subtotal, 3);
    const taxAmount = num(inv.taxAmount, 3);
    totalSales += subtotal;
    vatOnSales += taxAmount;
  }

  // Get all purchase invoices in the period
  const purchaseInvoices = await db.purchaseInvoice.findMany({
    where: {
      companySlug,
      date: { gte: periodFrom, lte: periodTo },
      deletedAt: null,
    },
  });

  let totalPurchases = 0;
  let vatOnPurchases = 0;
  for (const pi of purchaseInvoices) {
    const totalAmount = num(pi.totalAmount, 3);
    totalPurchases += totalAmount;
    // Estimate VAT on purchases using country VAT rate
    vatOnPurchases += totalAmount * (vatRate / 100);
  }

  const vatDue = vatOnSales - vatOnPurchases;

  // Create TaxFiling record
  const filing = await db.taxFiling.create({
    data: {
      companySlug,
      country,
      taxType: "vat",
      periodFrom,
      periodTo,
      totalSales: totalSales.toFixed(3),
      totalPurchases: totalPurchases.toFixed(3),
      vatDue: vatDue.toFixed(3),
      status: "draft",
    },
  });

  await logAudit({
    userEmail,
    userUid,
    action: "generate_vat_return",
    entity: "tax_filing",
    entityId: filing.id,
    companySlug,
    details: { country, periodFrom, periodTo, vatRate, totalSales, vatOnSales, totalPurchases, vatOnPurchases, vatDue },
  });

  return {
    totalSales: totalSales.toFixed(3),
    totalPurchases: totalPurchases.toFixed(3),
    vatOnSales: vatOnSales.toFixed(3),
    vatOnPurchases: vatOnPurchases.toFixed(3),
    vatDue: vatDue.toFixed(3),
    countryConfig,
    filingId: filing.id,
  };
}

// ── Zakat Calculation ───────────────────────────────────────────────────────────

/**
 * calculateZakat — compute Zakat for Saudi companies only.
 *
 * Zakat = 2.5% of zakat base
 * Zakat base = equity + long-term liabilities + fixed assets - long-term investments
 *
 * Uses Account balances for the calculation.
 */
export async function calculateZakat(
  companySlug: string,
  userEmail: string,
  userUid: string,
): Promise<ZakatResult> {
  // Verify company is Saudi
  const company = await db.company.findUnique({
    where: { slug: companySlug },
  });
  if (!company) throw new Error("Company not found");
  if (company.country !== "SA") throw new Error("Zakat calculation is only available for Saudi companies (country = SA)");

  // Get accounts for zakat base calculation
  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
  });

  // Calculate balances from posted journal entries
  const entries = await db.journalEntry.findMany({
    where: { companySlug, status: "posted" },
    include: { lines: true },
  });

  const balanceMap = new Map<number, number>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const current = balanceMap.get(line.accountId) || 0;
      balanceMap.set(line.accountId, current + num(line.debit, 3) - num(line.credit, 3));
    }
  }

  // Zakat base components
  let equity = 0;
  let longTermLiabilities = 0;
  let fixedAssets = 0;
  let longTermInvestments = 0;

  for (const acc of accounts) {
    let balance = balanceMap.get(acc.id) || num(acc.balance, 3);
    // Normalize sign: for liability/equity, credit is positive
    if (acc.type === "liability" || acc.type === "equity" || acc.type === "revenue") {
      balance = -balance;
    }
    if (balance < 0) balance = 0; // Use only positive balances

    if (acc.type === "equity") equity += balance;
    else if (acc.type === "liability") longTermLiabilities += balance;
    else if (acc.type === "asset") fixedAssets += balance;
  }

  // Long-term investments typically stored in a specific account type or deduced
  // For simplicity, we look for accounts with code patterns related to investments
  const investmentAccounts = accounts.filter(
    (a) => a.code.startsWith("13") || a.code.startsWith("14") || a.nameAr.includes("استثمار") || a.nameEn?.toLowerCase().includes("investment"),
  );
  for (const acc of investmentAccounts) {
    let balance = balanceMap.get(acc.id) || num(acc.balance, 3);
    longTermInvestments += balance;
  }

  const zakatBase = equity + longTermLiabilities + fixedAssets - longTermInvestments;
  const zakatRate = 0.025; // 2.5%
  const zakatAmount = zakatBase * zakatRate;

  // Create a zakat tax filing record
  const filing = await db.taxFiling.create({
    data: {
      companySlug,
      country: "SA",
      taxType: "zakat",
      periodFrom: new Date().getFullYear().toString() + "-01-01",
      periodTo: new Date().getFullYear().toString() + "-12-31",
      totalSales: "0.000",
      totalPurchases: "0.000",
      vatDue: zakatAmount.toFixed(3), // Using vatDue field for zakat amount
      status: "draft",
    },
  });

  await logAudit({
    userEmail,
    userUid,
    action: "calculate_zakat",
    entity: "tax_filing",
    entityId: filing.id,
    companySlug,
    details: { zakatBase, zakatRate, zakatAmount, equity, longTermLiabilities, fixedAssets, longTermInvestments },
  });

  return {
    zakatBase: zakatBase.toFixed(3),
    zakatRate: zakatRate.toFixed(4),
    zakatAmount: zakatAmount.toFixed(3),
    breakdown: {
      equity: equity.toFixed(3),
      longTermLiabilities: longTermLiabilities.toFixed(3),
      fixedAssets: fixedAssets.toFixed(3),
      longTermInvestments: longTermInvestments.toFixed(3),
    },
  };
}

// ── Filing Reminders ────────────────────────────────────────────────────────────

/**
 * getFilingReminders — calculate upcoming filing deadlines.
 *
 * KW: quarterly, SA: monthly/quarterly (VAT), AE: quarterly
 */
export async function getFilingReminders(
  companySlug: string,
): Promise<FilingReminder[]> {
  const company = await db.company.findUnique({
    where: { slug: companySlug },
  });
  if (!company) throw new Error("Company not found");

  // Determine which countries the company operates in
  // Primary country from company settings; can be extended for multi-country
  const countries = [company.country || "KW"];

  // Also check if there are tax filings for other countries
  const existingFilings = await db.taxFiling.findMany({
    where: { companySlug },
    select: { country: true },
    distinct: ["country"],
  });
  for (const f of existingFilings) {
    if (!countries.includes(f.country)) countries.push(f.country);
  }

  const reminders: FilingReminder[] = [];
  const now = new Date();

  for (const countryCode of countries) {
    const config = getCountryConfig(countryCode);
    if (!config) continue;

    // VAT reminders (if applicable)
    if (config.vatApplicable) {
      const vatFilingPeriod = getFilingPeriod(countryCode, "vat");
      const lastFiling = await db.taxFiling.findFirst({
        where: { companySlug, country: countryCode, taxType: "vat" },
        orderBy: { periodTo: "desc" },
      });

      let nextDeadline: Date;
      if (lastFiling) {
        // Next deadline based on last filing period end
        const lastPeriodEnd = new Date(lastFiling.periodTo);
        nextDeadline = calculateNextDeadline(lastPeriodEnd, vatFilingPeriod, countryCode);
      } else {
        // No previous filing — deadline is end of current period
        nextDeadline = calculateNextDeadline(now, vatFilingPeriod, countryCode);
      }

      const daysUntil = Math.ceil((nextDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysUntil < 0;

      reminders.push({
        country: countryCode,
        taxType: "vat",
        nextDeadline: nextDeadline.toISOString().slice(0, 10),
        daysUntil: Math.max(0, daysUntil),
        isOverdue,
      });
    }

    // Zakat reminders (Saudi only)
    if (countryCode === "SA") {
      const zakatFilingPeriod = getFilingPeriod(countryCode, "zakat");
      const lastZakatFiling = await db.taxFiling.findFirst({
        where: { companySlug, country: "SA", taxType: "zakat" },
        orderBy: { periodTo: "desc" },
      });

      let nextDeadline: Date;
      if (lastZakatFiling) {
        const lastPeriodEnd = new Date(lastZakatFiling.periodTo);
        nextDeadline = calculateNextDeadline(lastPeriodEnd, zakatFilingPeriod, countryCode);
      } else {
        nextDeadline = calculateNextDeadline(now, zakatFilingPeriod, countryCode);
      }

      const daysUntil = Math.ceil((nextDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysUntil < 0;

      reminders.push({
        country: countryCode,
        taxType: "zakat",
        nextDeadline: nextDeadline.toISOString().slice(0, 10),
        daysUntil: Math.max(0, daysUntil),
        isOverdue,
      });
    }
  }

  return reminders;
}

/**
 * Get the filing period type for a country + tax type.
 * KW: quarterly, SA: monthly (VAT) / yearly (Zakat), AE: quarterly
 */
function getFilingPeriod(country: string, taxType: string): "monthly" | "quarterly" | "yearly" {
  if (taxType === "zakat") return "yearly";
  if (country === "SA") return "monthly";
  if (country === "KW") return "quarterly";
  if (country === "AE") return "quarterly";
  if (country === "BH") return "quarterly";
  if (country === "OM") return "quarterly";
  // Default quarterly for other VAT-applicable countries
  return "quarterly";
}

/**
 * Calculate the next filing deadline based on the period type and last filing end.
 */
function calculateNextDeadline(lastPeriodEnd: Date, period: "monthly" | "quarterly" | "yearly", country: string): Date {
  // Deadline is typically the end of the following period + grace period
  // Standard: deadline is 28-30 days after the period end
  const graceDays = 28;

  let nextPeriodStart: Date;
  if (period === "monthly") {
    nextPeriodStart = new Date(lastPeriodEnd);
    nextPeriodStart.setMonth(nextPeriodStart.getMonth() + 1);
    nextPeriodStart.setDate(1);
  } else if (period === "quarterly") {
    nextPeriodStart = new Date(lastPeriodEnd);
    nextPeriodStart.setMonth(nextPeriodStart.getMonth() + 3);
    nextPeriodStart.setDate(1);
  } else {
    nextPeriodStart = new Date(lastPeriodEnd);
    nextPeriodStart.setFullYear(nextPeriodStart.getFullYear() + 1);
    nextPeriodStart.setMonth(0);
    nextPeriodStart.setDate(1);
  }

  // Deadline = grace period after next period end
  const deadline = new Date(nextPeriodStart);
  deadline.setDate(deadline.getDate() + graceDays - 1);

  return deadline;
}

// ── Retention Compliance ────────────────────────────────────────────────────────

/**
 * checkRetentionCompliance — check if records comply with retention requirements.
 *
 * Uses getRetentionYears(country) for each country where the company operates.
 * Checks if any records older than retention period but still active.
 */
export async function checkRetentionCompliance(
  companySlug: string,
): Promise<RetentionComplianceResult[]> {
  const company = await db.company.findUnique({
    where: { slug: companySlug },
  });
  if (!company) throw new Error("Company not found");

  const countries = [company.country || "KW"];
  const existingFilings = await db.taxFiling.findMany({
    where: { companySlug },
    select: { country: true },
    distinct: ["country"],
  });
  for (const f of existingFilings) {
    if (!countries.includes(f.country)) countries.push(f.country);
  }

  const now = new Date();
  const results: RetentionComplianceResult[] = [];

  for (const countryCode of countries) {
    const retentionYears = getRetentionYears(countryCode);
    const retentionThreshold = new Date(now);
    retentionThreshold.setFullYear(retentionThreshold.getFullYear() - retentionYears);

    // Count records older than retention period but still active (not deleted)
    const oldInvoices = await db.invoice.count({
      where: {
        companySlug,
        createdAt: { lt: retentionThreshold },
        deletedAt: null,
      },
    });

    const oldPurchaseInvoices = await db.purchaseInvoice.count({
      where: {
        companySlug,
        createdAt: { lt: retentionThreshold },
        deletedAt: null,
      },
    });

    const oldJournalEntries = await db.journalEntry.count({
      where: {
        companySlug,
        createdAt: { lt: retentionThreshold },
        deletedAt: null,
      },
    });

    const recordsAtRisk = oldInvoices + oldPurchaseInvoices + oldJournalEntries;

    // Can auto-delete? Only if ALL related tax filings are accepted/closed
    const openFilings = await db.taxFiling.count({
      where: {
        companySlug,
        country: countryCode,
        status: { notIn: ["accepted", "rejected"] },
      },
    });

    const canAutoDelete = recordsAtRisk > 0 && openFilings === 0;

    results.push({
      country: countryCode,
      retentionYears,
      recordsAtRisk,
      canAutoDelete,
    });
  }

  return results;
}
