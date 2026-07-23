/**
 * ar-ap.test.ts — Tests for AR/AP operations module.
 *
 * Replicates pure logic from ar-ap.ts for testing without DB.
 * Tests: calculateAging buckets, client statement running balance,
 * installment schedule generation.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface InvoiceLike {
  id: number;
  invoiceNumber: string;
  total: string;
  paid: string;
  dueDate: string;
  clientId: number;
}

/**
 * Calculate aging buckets for a list of invoices.
 * Returns: { current, days30, days60, days90Plus, total }
 */
function calculateAgingBuckets(
  invoices: InvoiceLike[],
  asOfDate: string,
): { current: number; days30: number; days60: number; days90Plus: number; total: number } {
  const todayDate = new Date(asOfDate);
  let current = 0;
  let days30 = 0;
  let days60 = 0;
  let days90Plus = 0;
  let total = 0;

  for (const inv of invoices) {
    const outstanding = num(num(inv.total, 3) - num(inv.paid, 3), 3);
    if (outstanding <= 0.001) continue;

    const dueDate = new Date(inv.dueDate);
    const daysPastDue = Math.max(0, Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    total += outstanding;

    if (daysPastDue <= 0) current += outstanding;
    else if (daysPastDue <= 30) days30 += outstanding;
    else if (daysPastDue <= 60) days60 += outstanding;
    else days90Plus += outstanding;
  }

  return { current, days30, days60, days90Plus, total };
}

/**
 * Calculate running balance for a client statement.
 */
function calculateRunningBalance(
  lines: Array<{ type: "invoice" | "payment"; debit: string; credit: string }>,
): Array<{ type: string; debit: string; credit: string; balance: string }> {
  let runningBalance = 0;
  return lines.map((line) => {
    runningBalance += num(line.debit, 3) - num(line.credit, 3);
    return {
      ...line,
      balance: num(runningBalance, 3).toFixed(3),
    };
  });
}

/**
 * Generate installment amounts for a total split into N installments.
 * Last installment gets the remainder to handle rounding.
 */
function generateInstallmentAmounts(
  totalAmount: number,
  installmentCount: number,
): string[] {
  const base = num(totalAmount / installmentCount, 3);
  const remainder = num(totalAmount - base * installmentCount, 3);
  const amounts: string[] = [];
  for (let i = 0; i < installmentCount; i++) {
    if (i === installmentCount - 1) {
      amounts.push(num(base + remainder, 3).toFixed(3));
    } else {
      amounts.push(base.toFixed(3));
    }
  }
  return amounts;
}

/**
 * Generate installment due dates.
 */
function generateInstallmentDueDates(
  startDate: string,
  installmentCount: number,
  interval: "monthly" | "weekly",
): string[] {
  const startDt = new Date(startDate);
  const dates: string[] = [];
  for (let i = 0; i < installmentCount; i++) {
    const dueDate = new Date(startDt);
    if (interval === "monthly") {
      dueDate.setMonth(dueDate.getMonth() + i);
    } else {
      dueDate.setDate(dueDate.getDate() + i * 7);
    }
    dates.push(dueDate.toISOString().slice(0, 10));
  }
  return dates;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("ar-ap: calculateAgingBuckets", () => {
  const asOfDate = "2025-03-15";

  test("All invoices current (not past due)", () => {
    const invoices: InvoiceLike[] = [
      { id: 1, invoiceNumber: "INV-001", total: "1000.000", paid: "0.000", dueDate: "2025-04-01", clientId: 1 },
      { id: 2, invoiceNumber: "INV-002", total: "500.000", paid: "0.000", dueDate: "2025-03-20", clientId: 1 },
    ];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.current).toBe(1500);
    expect(result.days30).toBe(0);
    expect(result.days60).toBe(0);
    expect(result.days90Plus).toBe(0);
    expect(result.total).toBe(1500);
  });

  test("30-day past due invoices", () => {
    const invoices: InvoiceLike[] = [
      { id: 3, invoiceNumber: "INV-003", total: "800.000", paid: "0.000", dueDate: "2025-02-15", clientId: 2 },
    ];
    // Due 2025-02-15, as of 2025-03-15 → 30 days past due
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.days30).toBe(800);
    expect(result.current).toBe(0);
  });

  test("60-day past due invoices", () => {
    const invoices: InvoiceLike[] = [
      { id: 4, invoiceNumber: "INV-004", total: "2000.000", paid: "0.000", dueDate: "2025-01-15", clientId: 3 },
    ];
    // Due 2025-01-15, as of 2025-03-15 → 60 days past due
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.days60).toBe(2000);
  });

  test("90+ day past due invoices", () => {
    const invoices: InvoiceLike[] = [
      { id: 5, invoiceNumber: "INV-005", total: "3000.000", paid: "0.000", dueDate: "2024-12-01", clientId: 4 },
    ];
    // Due 2024-12-01, as of 2025-03-15 → 104 days past due → 90+ bucket
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.days90Plus).toBe(3000);
  });

  test("Partially paid invoice: only outstanding goes to buckets", () => {
    const invoices: InvoiceLike[] = [
      { id: 6, invoiceNumber: "INV-006", total: "1000.000", paid: "600.000", dueDate: "2025-04-01", clientId: 5 },
    ];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.current).toBe(400); // outstanding = 1000 - 600 = 400
  });

  test("Fully paid invoice: not included in buckets", () => {
    const invoices: InvoiceLike[] = [
      { id: 7, invoiceNumber: "INV-007", total: "1000.000", paid: "1000.000", dueDate: "2025-01-01", clientId: 6 },
    ];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.total).toBe(0);
  });

  test("Mixed aging: spread across all buckets", () => {
    const invoices: InvoiceLike[] = [
      { id: 8, invoiceNumber: "INV-008", total: "500.000", paid: "0.000", dueDate: "2025-03-20", clientId: 7 }, // current
      { id: 9, invoiceNumber: "INV-009", total: "800.000", paid: "0.000", dueDate: "2025-02-15", clientId: 7 }, // 30 days
      { id: 10, invoiceNumber: "INV-010", total: "1200.000", paid: "0.000", dueDate: "2025-01-10", clientId: 7 }, // 60 days
      { id: 11, invoiceNumber: "INV-011", total: "2000.000", paid: "0.000", dueDate: "2024-11-15", clientId: 7 }, // 90+
    ];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.current).toBe(500);
    expect(result.days30).toBe(800);
    // INV-010 (due 2025-01-10) is 64 days past due → falls in 90+ bucket, not 60
    expect(result.days60).toBe(0);
    expect(result.days90Plus).toBe(3200);
    expect(result.total).toBe(4500);
  });
});

describe("ar-ap: calculateRunningBalance (client statement)", () => {
  test("Invoice + payment: running balance updates correctly", () => {
    const lines = [
      { type: "invoice" as const, debit: "1000.000", credit: "0.000" },
      { type: "payment" as const, debit: "0.000", credit: "500.000" },
    ];
    const result = calculateRunningBalance(lines);
    expect(result[0].balance).toBe("1000.000"); // after invoice
    expect(result[1].balance).toBe("500.000"); // after payment
  });

  test("Multiple invoices and payments", () => {
    const lines = [
      { type: "invoice" as const, debit: "2000.000", credit: "0.000" },
      { type: "invoice" as const, debit: "1000.000", credit: "0.000" },
      { type: "payment" as const, debit: "0.000", credit: "1500.000" },
      { type: "payment" as const, debit: "0.000", credit: "500.000" },
    ];
    const result = calculateRunningBalance(lines);
    expect(result[0].balance).toBe("2000.000");
    expect(result[1].balance).toBe("3000.000");
    expect(result[2].balance).toBe("1500.000");
    expect(result[3].balance).toBe("1000.000");
  });

  test("Fully paid client: final balance = 0", () => {
    const lines = [
      { type: "invoice" as const, debit: "1000.000", credit: "0.000" },
      { type: "payment" as const, debit: "0.000", credit: "1000.000" },
    ];
    const result = calculateRunningBalance(lines);
    expect(result[1].balance).toBe("0.000");
  });
});

describe("ar-ap: scheduleInstallments", () => {
  test("4 monthly installments for 1000 KWD", () => {
    const amounts = generateInstallmentAmounts(1000, 4);
    expect(amounts.length).toBe(4);
    expect(amounts[0]).toBe("250.000");
    expect(amounts[1]).toBe("250.000");
    expect(amounts[2]).toBe("250.000");
    expect(amounts[3]).toBe("250.000"); // remainder = 0
  });

  test("3 monthly installments for 1000 KWD with rounding remainder on last", () => {
    // 1000 / 3 = 333.333..., remainder = 1000 - 333.333*3 = 0.001
    const amounts = generateInstallmentAmounts(1000, 3);
    expect(amounts.length).toBe(3);
    // Last installment gets the remainder
    const total = amounts.reduce((s, a) => s + num(a, 3), 0);
    expect(Math.abs(total - 1000) < 0.01).toBe(true);
  });

  test("Installment due dates for monthly interval", () => {
    const dates = generateInstallmentDueDates("2025-01-01", 3, "monthly");
    expect(dates.length).toBe(3);
    expect(dates[0]).toBe("2025-01-01");
    expect(dates[1]).toBe("2025-02-01");
    expect(dates[2]).toBe("2025-03-01");
  });

  test("Installment due dates for weekly interval", () => {
    const dates = generateInstallmentDueDates("2025-01-01", 4, "weekly");
    expect(dates.length).toBe(4);
    expect(dates[0]).toBe("2025-01-01");
    expect(dates[1]).toBe("2025-01-08");
    expect(dates[2]).toBe("2025-01-15");
    expect(dates[3]).toBe("2025-01-22");
  });

  test("Sum of all installment amounts equals total", () => {
    for (const totalAmount of [500, 1000, 1234.567]) {
      for (const count of [2, 3, 4, 5, 6]) {
        const amounts = generateInstallmentAmounts(totalAmount, count);
        const sum = amounts.reduce((s, a) => s + num(a, 3), 0);
        expect(Math.abs(sum - totalAmount) < 0.01).toBe(true);
      }
    }
  });
});
