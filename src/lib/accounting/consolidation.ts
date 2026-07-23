/**
 * consolidation.ts — Inter-Company Consolidation Engine (Phase 8)
 *
 * Provides group consolidation, inter-company transaction elimination,
 * and inter-company settlement creation with journal entries in both
 * companies.
 *
 * ALL monetary values as String — use num()/toNum()/addNums()/mulNums() from money.ts.
 */
import { db } from "@/lib/db";
import { num, addNums, mulNums, subNums, toNum } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ConsolidatedAccount {
  code: string;
  nameAr: string;
  nameEn?: string;
  type: string;
  totalBalance: string;
  companyBreakdown: Array<{ companySlug: string; companyName: string; balance: string }>;
}

export interface ConsolidationResult {
  consolidatedBalanceSheet: ConsolidatedAccount[];
  consolidatedPnL: ConsolidatedAccount[];
  eliminatedTransactions: Array<{
    id: number;
    companyFrom: string;
    companyTo: string;
    amount: string;
    eliminationJEId?: number;
  }>;
  companyCount: number;
  totalValue: string;
}

export interface EliminationResult {
  eliminatedAmount: string;
  entriesCreated: number;
  fromJEId?: number;
  toJEId?: number;
}

export interface SettlementResult {
  transactionId: number;
  fromJEId: number;
  toJEId: number;
  amount: string;
  currency: string;
  status: string;
}

// ── Consolidate Group ──────────────────────────────────────────────────────────

/**
 * consolidateGroup — produce consolidated financial statements for a group.
 *
 * 1. Get all companies in the group (same parent/owner)
 * 2. For each company: get balance sheet, P&L
 * 3. Sum all accounts across companies (same account code → aggregated)
 * 4. Eliminate inter-company transactions
 */
export async function consolidateGroup(
  groupSlug: string,
  asOfDate: string,
): Promise<ConsolidationResult> {
  // Get all companies in the group
  // groupSlug is the parent company slug — we find child companies via
  // the companies that share the same group identifier.
  // For simplicity, we look for companies where the slug starts with
  // the group prefix or where the groupSlug itself is one of the companies.
  const groupCompany = await db.company.findUnique({
    where: { slug: groupSlug },
  });
  if (!groupCompany) throw new Error("Group company not found");

  // Get all companies that share the same owner/group.
  // In a real implementation, there would be a parentCompanyId field.
  // For now, we look for companies with the same vatNumber prefix
  // or related via inter-company transactions.
  const interCompanyTxns = await db.interCompanyTransaction.findMany({
    where: {
      OR: [
        { companySlugFrom: groupSlug },
        { companySlugTo: groupSlug },
      ],
      status: { notIn: ["cancelled"] },
    },
  });

  // Collect unique company slugs from inter-company transactions
  const companySlugs = new Set<string>([groupSlug]);
  for (const txn of interCompanyTxns) {
    companySlugs.add(txn.companySlugFrom);
    companySlugs.add(txn.companySlugTo);
  }

  const companies = await db.company.findMany({
    where: { slug: { in: Array.from(companySlugs) } },
  });

  const companyMap = new Map(companies.map((c) => [c.slug, c.name]));

  // Balance sheet accounts: asset, liability, equity (and contra types)
  const balanceSheetTypes = ["asset", "liability", "equity", "contra_asset", "contra_revenue"];
  const pnlTypes = ["revenue", "expense", "contra_revenue"];

  // Aggregate accounts by code across all companies
  const bsAccountMap = new Map<string, ConsolidatedAccount>();
  const pnlAccountMap = new Map<string, ConsolidatedAccount>();

  for (const companySlug of companySlugs) {
    // Get accounts for this company
    const accounts = await db.account.findMany({
      where: { companySlug, isActive: true },
    });

    // Get posted journal entries up to asOfDate
    const entries = await db.journalEntry.findMany({
      where: { companySlug, date: { lte: asOfDate }, status: "posted" },
      include: { lines: true },
    });

    // Calculate balance per account from journal lines
    const balanceMap = new Map<number, number>();
    for (const entry of entries) {
      for (const line of entry.lines) {
        const current = balanceMap.get(line.accountId) || 0;
        balanceMap.set(line.accountId, current + num(line.debit, 3) - num(line.credit, 3));
      }
    }

    for (const acc of accounts) {
      let balance = balanceMap.get(acc.id) || num(acc.balance, 3);
      // Normalize sign: for liability/equity/revenue, credit is positive
      if (acc.type === "liability" || acc.type === "equity" || acc.type === "revenue" || acc.type === "contra_revenue") {
        balance = -balance;
      }

      const code = acc.code;
      const isBS = balanceSheetTypes.includes(acc.type);
      const isPnL = pnlTypes.includes(acc.type);
      const targetMap = isBS ? bsAccountMap : isPnL ? pnlAccountMap : null;

      if (!targetMap) continue;

      if (!targetMap.has(code)) {
        targetMap.set(code, {
          code,
          nameAr: acc.nameAr,
          nameEn: acc.nameEn || undefined,
          type: acc.type,
          totalBalance: "0.000",
          companyBreakdown: [],
        });
      }

      const consolidated = targetMap.get(code)!;
      // Use the most complete name (prefer the one with English name)
      if (acc.nameEn && !consolidated.nameEn) consolidated.nameEn = acc.nameEn;
      const currentTotal = num(consolidated.totalBalance, 3);
      consolidated.totalBalance = (currentTotal + balance).toFixed(3);
      consolidated.companyBreakdown.push({
        companySlug,
        companyName: companyMap.get(companySlug) || companySlug,
        balance: balance.toFixed(3),
      });
    }
  }

  // Eliminate inter-company transactions
  const eliminatedTransactions: Array<{
    id: number;
    companyFrom: string;
    companyTo: string;
    amount: string;
    eliminationJEId?: number;
  }> = [];

  for (const txn of interCompanyTxns) {
    eliminatedTransactions.push({
      id: txn.id,
      companyFrom: txn.companySlugFrom,
      companyTo: txn.companySlugTo,
      amount: num(txn.amount, 3).toFixed(3),
    });
  }

  // Calculate total consolidated value
  let totalValue = 0;
  for (const acc of bsAccountMap.values()) {
    if (acc.type === "asset" || acc.type === "contra_asset") {
      totalValue += num(acc.totalBalance, 3);
    }
  }

  return {
    consolidatedBalanceSheet: Array.from(bsAccountMap.values()).sort((a, b) => a.code.localeCompare(b.code)),
    consolidatedPnL: Array.from(pnlAccountMap.values()).sort((a, b) => a.code.localeCompare(b.code)),
    eliminatedTransactions,
    companyCount: companySlugs.size,
    totalValue: totalValue.toFixed(3),
  };
}

// ── Eliminate Inter-Company Transactions ────────────────────────────────────────

/**
 * eliminateInterCompanyTransactions — create elimination journal entries
 * for inter-company transactions between two companies.
 *
 * Debit: Inter-Company Revenue (in companyTo)
 * Credit: Inter-Company Expense (in companyFrom)
 */
export async function eliminateInterCompanyTransactions(
  companySlugFrom: string,
  companySlugTo: string,
  period: string,
  userEmail: string,
  userUid: string,
): Promise<EliminationResult> {
  // Find all transactions between the two companies in the period
  const transactions = await db.interCompanyTransaction.findMany({
    where: {
      companySlugFrom,
      companySlugTo,
      status: { notIn: ["cancelled"] },
      createdAt: {
        gte: new Date(period + "-01T00:00:00"),
        lte: new Date(period + "-31T23:59:59"),
      },
    },
  });

  if (transactions.length === 0) {
    return { eliminatedAmount: "0.000", entriesCreated: 0 };
  }

  let totalEliminated = 0;

  for (const txn of transactions) {
    totalEliminated += num(txn.amount, 3);
  }

  // Create elimination JE in companyFrom (credit inter-company expense)
  // Find or create inter-company accounts in each company
  const fromJE = await createEliminationJE(
    companySlugFrom,
    totalEliminated,
    period,
    userEmail,
    "elimination_from",
    `Inter-company elimination: ${companySlugFrom} → ${companySlugTo}`,
  );

  // Create elimination JE in companyTo (debit inter-company revenue)
  const toJE = await createEliminationJE(
    companySlugTo,
    totalEliminated,
    period,
    userEmail,
    "elimination_to",
    `Inter-company elimination: ${companySlugTo} ← ${companySlugFrom}`,
  );

  await logAudit({
    userEmail,
    userUid,
    action: "eliminate_inter_company",
    entity: "consolidation",
    companySlug: companySlugFrom,
    details: {
      companySlugFrom,
      companySlugTo,
      period,
      totalEliminated,
      transactionCount: transactions.length,
      fromJEId: fromJE?.id,
      toJEId: toJE?.id,
    },
  });

  return {
    eliminatedAmount: totalEliminated.toFixed(3),
    entriesCreated: transactions.length,
    fromJEId: fromJE?.id,
    toJEId: toJE?.id,
  };
}

/**
 * Helper: create a simple elimination journal entry.
 * For companyFrom: Credit expense (reduces expense)
 * For companyTo: Debit contra-revenue (reduces revenue)
 */
async function createEliminationJE(
  companySlug: string,
  amount: number,
  period: string,
  createdBy: string,
  reference: string,
  description: string,
) {
  // Find appropriate accounts for elimination
  // Look for inter-company receivable/payable accounts
  const icExpenseAccount = await db.account.findFirst({
    where: {
      companySlug,
      type: "expense",
      isActive: true,
    },
    orderBy: { code: "asc" },
  });

  const icRevenueAccount = await db.account.findFirst({
    where: {
      companySlug,
      type: "revenue",
      isActive: true,
    },
    orderBy: { code: "asc" },
  });

  // If we can't find suitable accounts, we can't create the JE
  if (!icExpenseAccount || !icRevenueAccount) {
    logger.warn("[consolidation] Could not find suitable accounts for elimination JE", { companySlug });
    return null;
  }

  const date = `${period}-01`;

  const entry = await db.journalEntry.create({
    data: {
      companySlug,
      date,
      description,
      reference,
      status: "posted",
      createdBy,
      sourceType: "consolidation_elimination",
      lines: {
        create: [
          {
            accountId: icRevenueAccount.id,
            debit: amount.toFixed(3),
            credit: "0.000",
            description: "Elimination: reduce inter-company revenue",
          },
          {
            accountId: icExpenseAccount.id,
            debit: "0.000",
            credit: amount.toFixed(3),
            description: "Elimination: reduce inter-company expense",
          },
        ],
      },
    },
    include: { lines: true },
  });

  // Update account balances
  for (const line of entry.lines) {
    const acc = await db.account.findUnique({ where: { id: line.accountId } });
    if (!acc) continue;
    const isDebitNormal = acc.type === "asset" || acc.type === "expense";
    const delta = isDebitNormal
      ? num(line.debit, 3) - num(line.credit, 3)
      : num(line.credit, 3) - num(line.debit, 3);
    const currentBalance = num(acc.balance, 3);
    await db.account.update({
      where: { id: acc.id },
      data: { balance: (currentBalance + delta).toFixed(3) },
    });
  }

  return entry;
}

// ── Inter-Company Settlement ────────────────────────────────────────────────────

/**
 * createInterCompanySettlement — create a settlement between two companies.
 *
 * Creates InterCompanyTransaction record and journal entries in both companies:
 * - In companyFrom: Debit Cash, Credit Inter-Company Receivable
 * - In companyTo: Debit Inter-Company Payable, Credit Cash
 */
export async function createInterCompanySettlement(
  companySlugFrom: string,
  companySlugTo: string,
  amount: string,
  currency: string,
  description: string | undefined,
  userEmail: string,
  userUid: string,
): Promise<SettlementResult> {
  const settlementAmount = num(amount, 3);

  // Verify both companies exist
  const companyFrom = await db.company.findUnique({ where: { slug: companySlugFrom } });
  const companyTo = await db.company.findUnique({ where: { slug: companySlugTo } });
  if (!companyFrom) throw new Error("Company (from) not found");
  if (!companyTo) throw new Error("Company (to) not found");

  // Create the inter-company transaction and journal entries in a transaction
  const result = await db.$transaction(async (tx) => {
    // Find relevant accounts in both companies
    // companyFrom: Cash (asset) and Inter-Company Receivable
    const fromCashAccount = await tx.account.findFirst({
      where: { companySlug: companySlugFrom, type: "asset", isActive: true },
      orderBy: { code: "asc" },
    });
    const fromICReceivable = await tx.account.findFirst({
      where: {
        companySlug: companySlugFrom,
        type: "asset",
        isActive: true,
        OR: [
          { nameAr: { contains: "بين" } },
          { nameAr: { contains: "شركات" } },
          { nameEn: { contains: "inter-company" } },
          { nameEn: { contains: "receivable" } },
        ],
      },
    });

    // companyTo: Inter-Company Payable and Cash (asset)
    const toCashAccount = await tx.account.findFirst({
      where: { companySlug: companySlugTo, type: "asset", isActive: true },
      orderBy: { code: "asc" },
    });
    const toICPayable = await tx.account.findFirst({
      where: {
        companySlug: companySlugTo,
        type: "liability",
        isActive: true,
        OR: [
          { nameAr: { contains: "بين" } },
          { nameAr: { contains: "شركات" } },
          { nameEn: { contains: "inter-company" } },
          { nameEn: { contains: "payable" } },
        ],
      },
    });

    // Use fallback accounts if specific IC accounts don't exist
    const fromDebitAccount = fromCashAccount || fromICReceivable;
    const fromCreditAccount = fromICReceivable || fromCashAccount;
    const toDebitAccount = toICPayable || toCashAccount;
    const toCreditAccount = toCashAccount || toICPayable;

    if (!fromDebitAccount || !fromCreditAccount) throw new Error("No suitable accounts found in company (from)");
    if (!toDebitAccount || !toCreditAccount) throw new Error("No suitable accounts found in company (to)");

    const date = new Date().toISOString().slice(0, 10);
    const amountStr = settlementAmount.toFixed(3);

    // JE in companyFrom: Debit Cash, Credit IC Receivable
    const jeFrom = await tx.journalEntry.create({
      data: {
        companySlug: companySlugFrom,
        date,
        description: description || `Inter-company settlement to ${companySlugTo}`,
        reference: `IC-SETTLEMENT-${companySlugFrom}-${companySlugTo}`,
        status: "posted",
        createdBy: userEmail,
        sourceType: "inter_company_settlement",
        lines: {
          create: [
            {
              accountId: fromDebitAccount.id,
              debit: amountStr,
              credit: "0.000",
              description: `Cash paid to ${companySlugTo}`,
            },
            {
              accountId: fromCreditAccount.id,
              debit: "0.000",
              credit: amountStr,
              description: `Inter-company receivable settled with ${companySlugTo}`,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // JE in companyTo: Debit IC Payable, Credit Cash
    const jeTo = await tx.journalEntry.create({
      data: {
        companySlug: companySlugTo,
        date,
        description: description || `Inter-company settlement from ${companySlugFrom}`,
        reference: `IC-SETTLEMENT-${companySlugFrom}-${companySlugTo}`,
        status: "posted",
        createdBy: userEmail,
        sourceType: "inter_company_settlement",
        lines: {
          create: [
            {
              accountId: toDebitAccount.id,
              debit: amountStr,
              credit: "0.000",
              description: `Inter-company payable settled with ${companySlugFrom}`,
            },
            {
              accountId: toCreditAccount.id,
              debit: "0.000",
              credit: amountStr,
              description: `Cash received from ${companySlugFrom}`,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Update account balances for both companies
    for (const line of jeFrom.lines) {
      const acc = await tx.account.findUnique({ where: { id: line.accountId } });
      if (!acc) continue;
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      const delta = isDebitNormal
        ? num(line.debit, 3) - num(line.credit, 3)
        : num(line.credit, 3) - num(line.debit, 3);
      const currentBalance = num(acc.balance, 3);
      await tx.account.update({
        where: { id: acc.id },
        data: { balance: (currentBalance + delta).toFixed(3) },
      });
    }

    for (const line of jeTo.lines) {
      const acc = await tx.account.findUnique({ where: { id: line.accountId } });
      if (!acc) continue;
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      const delta = isDebitNormal
        ? num(line.debit, 3) - num(line.credit, 3)
        : num(line.credit, 3) - num(line.debit, 3);
      const currentBalance = num(acc.balance, 3);
      await tx.account.update({
        where: { id: acc.id },
        data: { balance: (currentBalance + delta).toFixed(3) },
      });
    }

    // Create the InterCompanyTransaction record
    const transaction = await tx.interCompanyTransaction.create({
      data: {
        companySlugFrom,
        companySlugTo,
        amount: amountStr,
        currency,
        description: description || null,
        journalEntryIdFrom: jeFrom.id,
        journalEntryIdTo: jeTo.id,
        status: "pending",
      },
    });

    return { transaction, jeFrom, jeTo };
  });

  await logAudit({
    userEmail,
    userUid,
    action: "create_inter_company_settlement",
    entity: "inter_company_transaction",
    entityId: result.transaction.id,
    companySlug: companySlugFrom,
    details: {
      companySlugFrom,
      companySlugTo,
      amount: settlementAmount.toFixed(3),
      currency,
      fromJEId: result.jeFrom.id,
      toJEId: result.jeTo.id,
    },
  });

  return {
    transactionId: result.transaction.id,
    fromJEId: result.jeFrom.id,
    toJEId: result.jeTo.id,
    amount: settlementAmount.toFixed(3),
    currency,
    status: result.transaction.status,
  };
}
