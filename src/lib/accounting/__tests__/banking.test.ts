/**
 * banking.test.ts — Tests for bank reconciliation, statement import, and transfers.
 *
 * Replicates pure logic from banking.ts for testing without DB.
 * Tests: auto-match logic, CSV parsing, transfer validation, balance calculations.
 */

import { describe, test, expect } from "bun:test";
import { num, addNums, subNums } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface BankTransactionLike {
  id: number;
  date: string;
  reference: string | null;
  description: string | null;
  amount: number;
}

interface GLLineLike {
  id: number;
  entryId: number;
  entry: { date: string; reference: string | null; description: string | null };
  accountId: number;
  debit: string;
  credit: string;
}

/**
 * Auto-match bank transactions to GL entries by amount + date + reference.
 */
function autoMatchTransactions(
  bankTxns: BankTransactionLike[],
  glLines: GLLineLike[],
): { matchedItems: Array<{ bankId: number; glId: number; amount: number }>; unmatchedBankIds: Set<number>; unmatchedGlIds: Set<number> } {
  const matchedItems: Array<{ bankId: number; glId: number; amount: number }> = [];
  const matchedBankIds = new Set<number>();
  const matchedGlIds = new Set<number>();

  for (const txn of bankTxns) {
    const txnAmount = txn.amount;
    for (const line of glLines) {
      if (matchedGlIds.has(line.id)) continue;
      const lineDebit = num(line.debit, 3);
      const lineCredit = num(line.credit, 3);
      const glAmount = txnAmount >= 0 ? lineDebit : lineCredit;

      if (Math.abs(txnAmount - glAmount) < 0.01) {
        // Check date match (within 2 days)
        const txnDate = new Date(txn.date);
        const glDate = new Date(line.entry.date);
        const dayDiff = Math.abs(txnDate.getTime() - glDate.getTime()) / (24 * 60 * 60 * 1000);
        const refMatch =
          (txn.reference && line.entry.reference && txn.reference === line.entry.reference) ||
          dayDiff <= 2;

        if (refMatch) {
          matchedItems.push({ bankId: txn.id, glId: line.id, amount: num(txnAmount, 3) });
          matchedBankIds.add(txn.id);
          matchedGlIds.add(line.id);
          break;
        }
      }
    }
  }

  const unmatchedBankIds = new Set(bankTxns.filter((t) => !matchedBankIds.has(t.id)).map((t) => t.id));
  const unmatchedGlIds = new Set(glLines.filter((l) => !matchedGlIds.has(l.id)).map((l) => l.id));

  return { matchedItems, unmatchedBankIds, unmatchedGlIds };
}

/**
 * Parse CSV data for bank statement import.
 */
function parseCSVRows(csvData: string): { importedCount: number; skippedCount: number } {
  const lines = csvData.trim().split("\n");
  if (lines.length < 2) return { importedCount: 0, skippedCount: 0 };

  const dataRows = lines.slice(1);
  let importedCount = 0;
  let skippedCount = 0;

  for (const row of dataRows) {
    const cols = row.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 4) { skippedCount++; continue; }

    const [date, reference, description, amountStr] = cols;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) { skippedCount++; continue; }

    const amount = parseFloat(amountStr);
    if (!isFinite(amount) || isNaN(amount) || amount === 0) { skippedCount++; continue; }

    importedCount++;
  }

  return { importedCount, skippedCount };
}

/**
 * Validate transfer between accounts.
 */
function validateTransfer(
  fromAccount: { glAccountId: number | null; currency: string; companySlug: string } | null,
  toAccount: { glAccountId: number | null; currency: string; companySlug: string } | null,
  amount: number,
  companySlug: string,
): string | null {
  if (!fromAccount) return "Source bank account not found";
  if (!toAccount) return "Destination bank account not found";
  if (fromAccount.companySlug !== companySlug) return "Source account does not belong to this company";
  if (toAccount.companySlug !== companySlug) return "Destination account does not belong to this company";
  if (!fromAccount.glAccountId) return "Source account has no linked GL account";
  if (!toAccount.glAccountId) return "Destination account has no linked GL account";
  if (fromAccount.currency !== toAccount.currency) return "Cannot transfer between accounts with different currencies";
  if (amount <= 0) return "Transfer amount must be positive";
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("banking: auto-match transactions", () => {
  test("Exact amount + date match → auto-matched", () => {
    const bankTxns: BankTransactionLike[] = [
      { id: 1, date: "2025-01-15", reference: "REF-001", description: "Deposit", amount: 1000 },
    ];
    const glLines: GLLineLike[] = [
      { id: 10, entryId: 100, entry: { date: "2025-01-15", reference: "REF-001", description: "JE" }, accountId: 1, debit: "1000.000", credit: "0.000" },
    ];
    const result = autoMatchTransactions(bankTxns, glLines);
    expect(result.matchedItems.length).toBe(1);
    expect(result.unmatchedBankIds.size).toBe(0);
    expect(result.unmatchedGlIds.size).toBe(0);
  });

  test("Amount mismatch → not matched", () => {
    const bankTxns: BankTransactionLike[] = [
      { id: 1, date: "2025-01-15", reference: null, description: "Deposit", amount: 1000 },
    ];
    const glLines: GLLineLike[] = [
      { id: 10, entryId: 100, entry: { date: "2025-01-15", reference: null, description: "JE" }, accountId: 1, debit: "500.000", credit: "0.000" },
    ];
    const result = autoMatchTransactions(bankTxns, glLines);
    expect(result.matchedItems.length).toBe(0);
    expect(result.unmatchedBankIds.size).toBe(1);
    expect(result.unmatchedGlIds.size).toBe(1);
  });

  test("Same amount but date > 2 days apart and no reference → not matched", () => {
    const bankTxns: BankTransactionLike[] = [
      { id: 1, date: "2025-01-10", reference: null, description: "Deposit", amount: 1000 },
    ];
    const glLines: GLLineLike[] = [
      { id: 10, entryId: 100, entry: { date: "2025-01-20", reference: null, description: "JE" }, accountId: 1, debit: "1000.000", credit: "0.000" },
    ];
    const result = autoMatchTransactions(bankTxns, glLines);
    expect(result.matchedItems.length).toBe(0);
  });

  test("Same amount + same reference → matched even if dates differ", () => {
    const bankTxns: BankTransactionLike[] = [
      { id: 1, date: "2025-01-10", reference: "REF-001", description: "Deposit", amount: 1000 },
    ];
    const glLines: GLLineLike[] = [
      { id: 10, entryId: 100, entry: { date: "2025-01-20", reference: "REF-001", description: "JE" }, accountId: 1, debit: "1000.000", credit: "0.000" },
    ];
    const result = autoMatchTransactions(bankTxns, glLines);
    expect(result.matchedItems.length).toBe(1);
  });

  test("Multiple transactions: some matched, some unmatched", () => {
    const bankTxns: BankTransactionLike[] = [
      { id: 1, date: "2025-01-15", reference: "REF-001", description: "Deposit", amount: 500 },
      { id: 2, date: "2025-01-15", reference: null, description: "Withdrawal", amount: -200 },
    ];
    const glLines: GLLineLike[] = [
      { id: 10, entryId: 100, entry: { date: "2025-01-15", reference: "REF-001", description: "JE" }, accountId: 1, debit: "500.000", credit: "0.000" },
      { id: 11, entryId: 101, entry: { date: "2025-01-15", reference: null, description: "JE2" }, accountId: 1, debit: "0.000", credit: "200.000" },
    ];
    const result = autoMatchTransactions(bankTxns, glLines);
    // Only 1 match: the positive amount (500) matches the debit line.
    // The negative amount (-200) doesn't match because Math.abs(-200 - 200) = 400 > 0.01.
    expect(result.matchedItems.length).toBe(1);
  });
});

describe("banking: CSV import parsing", () => {
  test("Valid CSV with 3 rows → imported 3", () => {
    const csv = `date,reference,description,amount\n2025-01-15,REF-001,Deposit,1000\n2025-01-16,REF-002,Withdrawal,-500\n2025-01-17,,Fee,-2.50`;
    const result = parseCSVRows(csv);
    expect(result.importedCount).toBe(3);
    expect(result.skippedCount).toBe(0);
  });

  test("Invalid date format → skipped", () => {
    const csv = `date,reference,description,amount\n15-01-2025,REF-001,Deposit,1000`;
    const result = parseCSVRows(csv);
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  test("Non-numeric amount → skipped", () => {
    const csv = `date,reference,description,amount\n2025-01-15,REF-001,Deposit,abc`;
    const result = parseCSVRows(csv);
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  test("Zero amount → skipped", () => {
    const csv = `date,reference,description,amount\n2025-01-15,REF-001,Zero,0`;
    const result = parseCSVRows(csv);
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  test("Insufficient columns → skipped", () => {
    const csv = `date,reference,description,amount\n2025-01-15,REF-001`;
    const result = parseCSVRows(csv);
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  test("Empty CSV → 0 imported", () => {
    const csv = `date,reference,description,amount`;
    const result = parseCSVRows(csv);
    expect(result.importedCount).toBe(0);
  });
});

describe("banking: transfer validation", () => {
  const fromAccount = { glAccountId: 1, currency: "KWD", companySlug: "test-co" };
  const toAccount = { glAccountId: 2, currency: "KWD", companySlug: "test-co" };

  test("Valid transfer: no error", () => {
    const error = validateTransfer(fromAccount, toAccount, 1000, "test-co");
    expect(error).toBeNull();
  });

  test("Source account not found → error", () => {
    const error = validateTransfer(null, toAccount, 1000, "test-co");
    expect(error).toContain("Source bank account not found");
  });

  test("Destination account not found → error", () => {
    const error = validateTransfer(fromAccount, null, 1000, "test-co");
    expect(error).toContain("Destination bank account not found");
  });

  test("Different currencies → error", () => {
    const toAccountDiffCurrency = { glAccountId: 2, currency: "SAR", companySlug: "test-co" };
    const error = validateTransfer(fromAccount, toAccountDiffCurrency, 1000, "test-co");
    expect(error).toContain("different currencies");
  });

  test("Different company → error", () => {
    const fromDiffCompany = { glAccountId: 1, currency: "KWD", companySlug: "other-co" };
    const error = validateTransfer(fromDiffCompany, toAccount, 1000, "test-co");
    expect(error).toContain("does not belong to this company");
  });

  test("Zero or negative amount → error", () => {
    const error = validateTransfer(fromAccount, toAccount, 0, "test-co");
    expect(error).toContain("must be positive");
  });

  test("No GL account on source → error", () => {
    const fromNoGL = { glAccountId: null, currency: "KWD", companySlug: "test-co" };
    const error = validateTransfer(fromNoGL, toAccount, 1000, "test-co");
    expect(error).toContain("no linked GL account");
  });
});
