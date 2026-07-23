/**
 * banking.ts — Bank reconciliation engine, statement import, and account transfers.
 *
 * Phase 3 of the GarfiX ERP accounting module.
 * All monetary values as String (no Float), using num() from money.ts.
 */
import { db } from "@/lib/db";
import { num, addNums, subNums } from "@/lib/money";

// ────────────────────────────────────────────────────────────────────────────
// Bank Reconciliation
// ────────────────────────────────────────────────────────────────────────────

export interface ReconciliationResult {
  matchedItems: MatchedItem[];
  unmatchedBankItems: UnmatchedBankItem[];
  unmatchedGlItems: UnmatchedGlItem[];
  bookBalance: string;
  adjustedBalance: string;
  statementBalance: string;
  difference: string;
}

export interface MatchedItem {
  bankTransactionId: number;
  journalEntryLineId: number;
  amount: string;
  date: string;
  reference: string | null;
}

export interface UnmatchedBankItem {
  bankTransactionId: number;
  date: string;
  reference: string | null;
  description: string | null;
  amount: string;
}

export interface UnmatchedGlItem {
  journalEntryId: number;
  journalEntryLineId: number;
  date: string;
  reference: string | null;
  description: string | null;
  amount: string;
}

/**
 * Reconcile a bank account for a given period.
 *
 * Steps:
 * 1. Get all bank transactions for the period
 * 2. Get all GL entries for the bank account in the period
 * 3. Auto-match: transactions to GL entries (by amount, date, reference)
 * 4. Calculate: book balance = sum of GL entries, adjusted balance = book balance + unreconciled items
 * 5. Return: matched items, unmatched bank items, unmatched GL items, difference
 */
export async function reconcileBankAccount(
  companySlug: string,
  bankAccountId: number,
  periodStart: string,
  periodEnd: string,
  statementBalance: string,
): Promise<ReconciliationResult> {
  // 1. Get bank transactions for the period
  const bankTxns = await db.bankTransaction.findMany({
    where: {
      companySlug,
      bankAccountId,
      date: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { date: "asc" },
  });

  // 2. Get GL entries for the bank account in the period
  // The bank account is linked to a GL account via glAccountId
  const bankAccount = await db.bankAccount.findUnique({
    where: { id: bankAccountId },
  });
  if (!bankAccount) throw new Error("Bank account not found");

  const glAccountId = bankAccount.glAccountId;
  if (!glAccountId) throw new Error("Bank account has no linked GL account");

  const glLines = await db.journalEntryLine.findMany({
    where: {
      accountId: glAccountId,
      entry: {
        companySlug,
        date: { gte: periodStart, lte: periodEnd },
        status: "posted",
        deletedAt: null,
      },
    },
    include: { entry: true },
    orderBy: { entry: { date: "asc" } },
  });

  // 3. Auto-match: transactions to GL entries by amount, date, reference
  const matchedItems: MatchedItem[] = [];
  const matchedBankIds = new Set<number>();
  const matchedGlIds = new Set<number>();

  // First pass: exact match on amount + date + reference
  for (const txn of bankTxns) {
    const txnAmount = num(txn.amount, 3);
    for (const line of glLines) {
      if (matchedGlIds.has(line.id)) continue;
      // For a bank account (asset), deposits = debit, withdrawals = credit
      // Match: deposit (positive amount) → debit line; withdrawal (negative) → credit line
      const lineDebit = num(line.debit, 3);
      const lineCredit = num(line.credit, 3);
      const glAmount = txnAmount >= 0 ? lineDebit : lineCredit;

      if (Math.abs(txnAmount - glAmount) < 0.01) {
        // Check date match (within 2 days tolerance)
        const txnDate = new Date(txn.date);
        const glDate = new Date(line.entry.date);
        const dayDiff = Math.abs(txnDate.getTime() - glDate.getTime()) / (24 * 60 * 60 * 1000);

        // Check reference match or date proximity
        const refMatch =
          (txn.reference && line.entry.reference && txn.reference === line.entry.reference) ||
          dayDiff <= 2;

        if (refMatch) {
          matchedItems.push({
            bankTransactionId: txn.id,
            journalEntryLineId: line.id,
            amount: num(txnAmount, 3).toFixed(3),
            date: txn.date,
            reference: txn.reference || line.entry.reference || null,
          });
          matchedBankIds.add(txn.id);
          matchedGlIds.add(line.id);
          break;
        }
      }
    }
  }

  // 4. Unmatched items
  const unmatchedBankItems: UnmatchedBankItem[] = bankTxns
    .filter((t) => !matchedBankIds.has(t.id))
    .map((t) => ({
      bankTransactionId: t.id,
      date: t.date,
      reference: t.reference,
      description: t.description,
      amount: num(t.amount, 3).toFixed(3),
    }));

  const unmatchedGlItems: UnmatchedGlItem[] = glLines
    .filter((l) => !matchedGlIds.has(l.id))
    .map((l) => ({
      journalEntryId: l.entryId,
      journalEntryLineId: l.id,
      date: l.entry.date,
      reference: l.entry.reference,
      description: l.entry.description,
      amount: num(num(l.debit, 3) - num(l.credit, 3), 3).toFixed(3),
    }));

  // 5. Calculate balances
  // Book balance = sum of all GL entries for this account in the period
  let bookBalanceNum = 0;
  for (const line of glLines) {
    // For an asset account, debit increases, credit decreases
    bookBalanceNum += num(line.debit, 3) - num(line.credit, 3);
  }
  const bookBalance = num(bookBalanceNum, 3).toFixed(3);

  // Adjusted balance = book balance + unreconciled bank deposits - unreconciled bank withdrawals
  let unreconciledAdjustment = 0;
  for (const item of unmatchedBankItems) {
    unreconciledAdjustment += num(item.amount, 3);
  }
  const adjustedBalance = addNums(bookBalance, num(unreconciledAdjustment, 3).toFixed(3));

  // Difference = statement balance - adjusted balance
  const difference = subNums(statementBalance, adjustedBalance);

  return {
    matchedItems,
    unmatchedBankItems,
    unmatchedGlItems,
    bookBalance,
    adjustedBalance,
    statementBalance: num(statementBalance, 3).toFixed(3),
    difference,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Bank Statement Import
// ────────────────────────────────────────────────────────────────────────────

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  summary: {
    totalDeposits: string;
    totalWithdrawals: string;
    totalFees: string;
  };
}

/**
 * Import bank statement from CSV data.
 *
 * Expected CSV columns: date, reference, description, amount
 * Auto-tags transaction type based on amount sign.
 */
export async function importBankStatement(
  companySlug: string,
  bankAccountId: number,
  csvData: string,
): Promise<ImportResult> {
  // Parse CSV rows
  const lines = csvData.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("CSV data must have at least a header row and one data row");
  }

  // Skip header row
  const dataRows = lines.slice(1);
  let importedCount = 0;
  let skippedCount = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalFees = 0;

  // Verify bank account exists
  const bankAccount = await db.bankAccount.findUnique({
    where: { id: bankAccountId },
  });
  if (!bankAccount) throw new Error("Bank account not found");
  if (bankAccount.companySlug !== companySlug) throw new Error("Bank account does not belong to this company");

  const transactions: Array<{
    companySlug: string;
    bankAccountId: number;
    date: string;
    reference: string | null;
    description: string | null;
    amount: string;
    transactionType: string;
    importedFrom: string;
    rawRow: string;
  }> = [];

  for (const row of dataRows) {
    const cols = row.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 4) {
      skippedCount++;
      continue;
    }

    const [date, reference, description, amountStr] = cols;

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      skippedCount++;
      continue;
    }

    // Parse amount
    const amount = parseFloat(amountStr);
    if (!isFinite(amount) || isNaN(amount)) {
      skippedCount++;
      continue;
    }

    // Auto-tag transaction type based on amount sign
    let transactionType: string;
    if (amount > 0) {
      transactionType = "deposit";
      totalDeposits += amount;
    } else if (amount < 0) {
      // Check if it looks like a fee (small negative amount)
      if (Math.abs(amount) < 5) {
        transactionType = "fee";
        totalFees += Math.abs(amount);
      } else {
        transactionType = "withdrawal";
        totalWithdrawals += Math.abs(amount);
      }
    } else {
      skippedCount++; // Zero amount rows are meaningless
      continue;
    }

    transactions.push({
      companySlug,
      bankAccountId,
      date,
      reference: reference || null,
      description: description || null,
      amount: num(amount, 3).toFixed(3),
      transactionType,
      importedFrom: "csv",
      rawRow: row,
    });
    importedCount++;
  }

  // Bulk create bank transactions
  if (transactions.length > 0) {
    await db.bankTransaction.createMany({ data: transactions });
  }

  return {
    importedCount,
    skippedCount,
    summary: {
      totalDeposits: num(totalDeposits, 3).toFixed(3),
      totalWithdrawals: num(totalWithdrawals, 3).toFixed(3),
      totalFees: num(totalFees, 3).toFixed(3),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Transfer Between Accounts
// ────────────────────────────────────────────────────────────────────────────

export interface TransferResult {
  withdrawalTransactionId: number;
  depositTransactionId: number;
  journalEntryId: number;
  fromNewBalance: string;
  toNewBalance: string;
}

/**
 * Transfer funds between two bank accounts.
 *
 * Steps:
 * 1. Create withdrawal BankTransaction from source
 * 2. Create deposit BankTransaction to destination
 * 3. Create JE: Debit destination account, Credit source account
 * 4. Update both account balances
 */
export async function transferBetweenAccounts(
  companySlug: string,
  fromAccountId: number,
  toAccountId: number,
  amount: string,
  currency: string,
  date: string,
  description: string,
  createdBy: string,
): Promise<TransferResult> {
  const amountNum = num(amount, 3);
  if (amountNum <= 0) throw new Error("Transfer amount must be positive");

  // Get both bank accounts with their GL accounts
  const fromAccount = await db.bankAccount.findUnique({ where: { id: fromAccountId } });
  const toAccount = await db.bankAccount.findUnique({ where: { id: toAccountId } });

  if (!fromAccount) throw new Error("Source bank account not found");
  if (!toAccount) throw new Error("Destination bank account not found");

  if (fromAccount.companySlug !== companySlug) throw new Error("Source account does not belong to this company");
  if (toAccount.companySlug !== companySlug) throw new Error("Destination account does not belong to this company");

  if (!fromAccount.glAccountId) throw new Error("Source account has no linked GL account");
  if (!toAccount.glAccountId) throw new Error("Destination account has no linked GL account");

  if (fromAccount.currency !== toAccount.currency) {
    throw new Error("Cannot transfer between accounts with different currencies");
  }

  // Wrap everything in a transaction
  const result = await db.$transaction(async (tx) => {
    // 1. Create withdrawal BankTransaction from source
    const withdrawalTxn = await tx.bankTransaction.create({
      data: {
        companySlug,
        bankAccountId: fromAccountId,
        date,
        reference: `TRF-${Date.now()}`,
        description: `Transfer to ${toAccount.accountName}: ${description}`,
        amount: num(-amountNum, 3).toFixed(3),
        transactionType: "transfer",
        importedFrom: "manual",
      },
    });

    // 2. Create deposit BankTransaction to destination
    const depositTxn = await tx.bankTransaction.create({
      data: {
        companySlug,
        bankAccountId: toAccountId,
        date,
        reference: `TRF-${Date.now()}`,
        description: `Transfer from ${fromAccount.accountName}: ${description}`,
        amount: num(amountNum, 3).toFixed(3),
        transactionType: "transfer",
        importedFrom: "manual",
      },
    });

    // 3. Create JE: Debit destination account, Credit source account
    const je = await tx.journalEntry.create({
      data: {
        companySlug,
        date,
        description: `Bank transfer: ${description}`,
        reference: `TRF-${withdrawalTxn.id}-${depositTxn.id}`,
        currency,
        status: "posted",
        createdBy,
        sourceType: "bank_transfer",
        lines: {
          create: [
            {
              accountId: toAccount.glAccountId!,
              debit: num(amountNum, 3).toFixed(3),
              credit: "0.000",
              description: `Transfer from ${fromAccount.accountName}`,
            },
            {
              accountId: fromAccount.glAccountId!,
              debit: "0.000",
              credit: num(amountNum, 3).toFixed(3),
              description: `Transfer to ${toAccount.accountName}`,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // 4. Update both account balances
    const fromNewBalance = subNums(fromAccount.balance, amount);
    const toNewBalance = addNums(toAccount.balance, amount);

    await tx.bankAccount.update({
      where: { id: fromAccountId },
      data: { balance: fromNewBalance },
    });

    await tx.bankAccount.update({
      where: { id: toAccountId },
      data: { balance: toNewBalance },
    });

    // Also update GL account balances
    await tx.account.update({
      where: { id: fromAccount.glAccountId! },
      data: { balance: subNums(
        (await tx.account.findUnique({ where: { id: fromAccount.glAccountId! } }))!.balance,
        amount,
      ) },
    });

    await tx.account.update({
      where: { id: toAccount.glAccountId! },
      data: { balance: addNums(
        (await tx.account.findUnique({ where: { id: toAccount.glAccountId! } }))!.balance,
        amount,
      ) },
    });

    return {
      withdrawalTransactionId: withdrawalTxn.id,
      depositTransactionId: depositTxn.id,
      journalEntryId: je.id,
      fromNewBalance,
      toNewBalance,
    };
  });

  return result;
}
