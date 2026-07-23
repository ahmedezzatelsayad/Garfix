/**
 * commissions.test.ts — Tests for Sales commissions calculation (Phase 13).
 *
 * Replicates pure logic from commissions.ts for testing without DB.
 * Tests: commission rate extraction, commission amount calculation,
 * salesperson aggregation, total commissions summation, JE line construction,
 * commission rate parsing from description, validation logic, monetary string formatting.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface CommissionEntry {
  salespersonId: number;
  name: string;
  totalSales: string;
  commissionRate: string;
  commissionAmount: string;
}

/**
 * Extract commission rate from a description string.
 * Mirrors: description.match(/rate:\s*(\d+\.?\d*)%/i)
 * Default rate: 5%
 */
function extractCommissionRate(description: string | null, defaultRate: number = 5): number {
  if (!description) return defaultRate;
  const rateMatch = description.match(/rate:\s*(\d+\.?\d*)%/i);
  if (rateMatch) return parseFloat(rateMatch[1]);
  return defaultRate;
}

/**
 * Calculate commission amount for a salesperson.
 * commissionAmount = totalSales * commissionRate / 100
 */
function calculateCommissionAmount(totalSales: number, commissionRate: number): number {
  return num(totalSales * commissionRate / 100, 3);
}

/**
 * Aggregate sales totals per salesperson from invoice data.
 * Each invoice is attributed to the salesperson by email.
 */
interface InvoiceLike {
  id: number;
  total: string;
  createdByEmail: string | null;
}

interface EmployeeLike {
  id: number;
  name: string;
  email: string | null;
  commissionRate: number;
}

function aggregateSalesByPerson(
  invoices: InvoiceLike[],
  employees: EmployeeLike[],
): Map<number, { name: string; totalSales: number; commissionRate: number }> {
  // Create a map of employee email → employee data
  const employeeMap = new Map<string, EmployeeLike>();
  for (const emp of employees) {
    if (emp.email) {
      employeeMap.set(emp.email, emp);
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

  return salesByPerson;
}

/**
 * Build commission entries from aggregated sales data.
 * Mirrors the calculation loop from calculateSalesCommissions.
 */
function buildCommissionEntries(
  salesByPerson: Map<number, { name: string; totalSales: number; commissionRate: number }>,
): CommissionEntry[] {
  const commissions: CommissionEntry[] = [];
  let totalCommissions = 0;

  for (const [salespersonId, data] of salesByPerson) {
    const commissionAmount = calculateCommissionAmount(data.totalSales, data.commissionRate);
    totalCommissions += commissionAmount;

    commissions.push({
      salespersonId,
      name: data.name,
      totalSales: num(data.totalSales, 3).toFixed(3),
      commissionRate: data.commissionRate.toFixed(2),
      commissionAmount: commissionAmount.toFixed(3),
    });
  }

  return commissions;
}

/**
 * Calculate total commissions from a list of entries.
 */
function calculateTotalCommissions(commissions: CommissionEntry[]): string {
  const total = commissions.reduce<number>((sum, c) => sum + num(c.commissionAmount, 3), 0);
  return num(total, 3).toFixed(3);
}

/**
 * Validate commission JE data.
 * Mirrors validation from postCommissionsJE.
 */
function validateCommissionJE(commissions: CommissionEntry[]): string | null {
  const totalAmount = commissions.reduce<number>((sum, c) => sum + num(c.commissionAmount, 3), 0);
  if (totalAmount <= 0) return "Total commission amount must be greater than zero";
  return null;
}

/**
 * Build commission JE lines (Debit Commission Expense, Credit Commissions Payable).
 */
function buildCommissionJELines(
  totalAmount: number,
  expenseAccountId: number,
  payableAccountId: number,
  periodFrom: string,
  periodTo: string,
): Array<{ accountId: number; debit: string; credit: string; description: string }> {
  return [
    {
      accountId: expenseAccountId,
      debit: num(totalAmount, 3).toFixed(3),
      credit: "0.000",
      description: "عمولات مبيعات مستحقة",
    },
    {
      accountId: payableAccountId,
      debit: "0.000",
      credit: num(totalAmount, 3).toFixed(3),
      description: "عمولات مبيعات مستحقة",
    },
  ];
}

/**
 * Build commission record description for storing in Commission model.
 * Mirrors the description format from postCommissionsJE.
 */
function buildCommissionRecordDescription(
  periodFrom: string,
  periodTo: string,
  commissionRate: string,
): string {
  return `عمولات مبيعات ${periodFrom} - ${periodTo} (rate:${commissionRate}%)`;
}

/**
 * Calculate JE reference string for commission posting.
 */
function buildCommissionReference(periodFrom: string, periodTo: string): string {
  return `COMM-${periodFrom}-${periodTo}`;
}

/**
 * Calculate JE description for commission posting.
 */
function buildCommissionJEDescription(periodFrom: string, periodTo: string): string {
  return `عمولات المبيعات - ${periodFrom} إلى ${periodTo}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("commissions: commission rate extraction (استخراج معدل العمولة)", () => {
  test("Description 'rate:5%' → extracts 5", () => {
    expect(extractCommissionRate("rate:5%")).toBe(5);
  });

  test("Description 'rate:10%' → extracts 10", () => {
    expect(extractCommissionRate("rate:10%")).toBe(10);
  });

  test("Description 'rate:7.5%' → extracts 7.5", () => {
    expect(extractCommissionRate("rate:7.5%")).toBe(7.5);
  });

  test("Description 'عمولات مبيعات rate:12.5%' → extracts 12.5", () => {
    expect(extractCommissionRate("عمولات مبيعات rate:12.5%")).toBe(12.5);
  });

  test("Description with RATE: (case-insensitive) → extracts rate", () => {
    expect(extractCommissionRate("RATE:8%")).toBe(8);
  });

  test("Description without rate → default 5%", () => {
    expect(extractCommissionRate("regular commission description")).toBe(5);
  });

  test("Null description → default 5%", () => {
    expect(extractCommissionRate(null)).toBe(5);
  });

  test("Empty description → default 5%", () => {
    expect(extractCommissionRate("")).toBe(5);
  });

  test("Custom default rate: 3% when description is null", () => {
    expect(extractCommissionRate(null, 3)).toBe(3);
  });

  test("Description 'rate:0%' → extracts 0", () => {
    expect(extractCommissionRate("rate:0%")).toBe(0);
  });
});

describe("commissions: commission amount calculation (حساب مقدار العمولة)", () => {
  test("1000 sales × 5% rate = 50.000 commission", () => {
    expect(calculateCommissionAmount(1000, 5)).toBe(50);
  });

  test("2000 sales × 10% rate = 200.000 commission", () => {
    expect(calculateCommissionAmount(2000, 10)).toBe(200);
  });

  test("5000 sales × 7.5% rate = 375.000 commission", () => {
    expect(calculateCommissionAmount(5000, 7.5)).toBe(375);
  });

  test("0 sales × any rate = 0 commission", () => {
    expect(calculateCommissionAmount(0, 10)).toBe(0);
  });

  test("100 sales × 0% rate = 0 commission", () => {
    expect(calculateCommissionAmount(100, 0)).toBe(0);
  });

  test("100000 sales × 2.5% rate = 2500.000 commission", () => {
    expect(calculateCommissionAmount(100000, 2.5)).toBe(2500);
  });

  test("333.333 sales × 3% rate = 10.000 (rounded to 3 decimals)", () => {
    const result = calculateCommissionAmount(333.333, 3);
    expect(result).toBe(num(10, 3)); // 333.333 * 0.03 ≈ 10.000
  });

  test("Very large sales: 1000000 × 5% = 50000", () => {
    expect(calculateCommissionAmount(1000000, 5)).toBe(50000);
  });
});

describe("commissions: salesperson aggregation (تجميع المبيعات حسب البائع)", () => {
  const employees: EmployeeLike[] = [
    { id: 1, name: "أحمد", email: "ahmed@co.com", commissionRate: 5 },
    { id: 2, name: "سارة", email: "sara@co.com", commissionRate: 7 },
  ];

  test("2 invoices from same salesperson → aggregated total", () => {
    const invoices: InvoiceLike[] = [
      { id: 1, total: "500.000", createdByEmail: "ahmed@co.com" },
      { id: 2, total: "300.000", createdByEmail: "ahmed@co.com" },
    ];
    const result = aggregateSalesByPerson(invoices, employees);
    expect(result.get(1)!.totalSales).toBe(800);
    expect(result.size).toBe(1);
  });

  test("2 invoices from different salespeople → separate totals", () => {
    const invoices: InvoiceLike[] = [
      { id: 1, total: "1000.000", createdByEmail: "ahmed@co.com" },
      { id: 2, total: "2000.000", createdByEmail: "sara@co.com" },
    ];
    const result = aggregateSalesByPerson(invoices, employees);
    expect(result.get(1)!.totalSales).toBe(1000);
    expect(result.get(2)!.totalSales).toBe(2000);
    expect(result.size).toBe(2);
  });

  test("Invoice with null email → skipped (no salesperson match)", () => {
    const invoices: InvoiceLike[] = [
      { id: 1, total: "500.000", createdByEmail: null },
    ];
    const result = aggregateSalesByPerson(invoices, employees);
    expect(result.size).toBe(0);
  });

  test("Invoice from unknown email → skipped (not an employee)", () => {
    const invoices: InvoiceLike[] = [
      { id: 1, total: "500.000", createdByEmail: "unknown@co.com" },
    ];
    const result = aggregateSalesByPerson(invoices, employees);
    expect(result.size).toBe(0);
  });

  test("Employee without email → excluded from matching", () => {
    const employeesWithNoEmail: EmployeeLike[] = [
      { id: 3, name: "محمد", email: null, commissionRate: 5 },
    ];
    const invoices: InvoiceLike[] = [
      { id: 1, total: "500.000", createdByEmail: "mohammed@co.com" },
    ];
    const result = aggregateSalesByPerson(invoices, employeesWithNoEmail);
    expect(result.size).toBe(0);
  });

  test("Multiple invoices: mixed known and unknown emails", () => {
    const invoices: InvoiceLike[] = [
      { id: 1, total: "500.000", createdByEmail: "ahmed@co.com" },
      { id: 2, total: "200.000", createdByEmail: "unknown@co.com" },
      { id: 3, total: "300.000", createdByEmail: null },
      { id: 4, total: "100.000", createdByEmail: "ahmed@co.com" },
    ];
    const result = aggregateSalesByPerson(invoices, employees);
    expect(result.size).toBe(1);
    expect(result.get(1)!.totalSales).toBe(600); // 500 + 100
  });
});

describe("commissions: commission entries building (بناء سجلات العمولات)", () => {
  test("Single salesperson: 1000 sales × 5% = 50 commission", () => {
    const salesMap = new Map<number, { name: string; totalSales: number; commissionRate: number }>();
    salesMap.set(1, { name: "أحمد", totalSales: 1000, commissionRate: 5 });

    const entries = buildCommissionEntries(salesMap);
    expect(entries.length).toBe(1);
    expect(entries[0].commissionAmount).toBe("50.000");
    expect(entries[0].totalSales).toBe("1000.000");
    expect(entries[0].commissionRate).toBe("5.00");
  });

  test("Two salespeople with different rates", () => {
    const salesMap = new Map<number, { name: string; totalSales: number; commissionRate: number }>();
    salesMap.set(1, { name: "أحمد", totalSales: 2000, commissionRate: 5 });
    salesMap.set(2, { name: "سارة", totalSales: 3000, commissionRate: 7 });

    const entries = buildCommissionEntries(salesMap);
    expect(entries.length).toBe(2);
    expect(entries[0].commissionAmount).toBe("100.000"); // 2000 * 5%
    expect(entries[1].commissionAmount).toBe("210.000"); // 3000 * 7%
  });

  test("All monetary values are 3-decimal strings", () => {
    const salesMap = new Map<number, { name: string; totalSales: number; commissionRate: number }>();
    salesMap.set(1, { name: "أحمد", totalSales: 1234.567, commissionRate: 5 });

    const entries = buildCommissionEntries(salesMap);
    expect(entries[0].totalSales).toMatch(/^\d+\.\d{3}$/);
    expect(entries[0].commissionAmount).toMatch(/^\d+\.\d{3}$/);
  });

  test("Commission rate is 2-decimal string", () => {
    const salesMap = new Map<number, { name: string; totalSales: number; commissionRate: number }>();
    salesMap.set(1, { name: "أحمد", totalSales: 500, commissionRate: 7.5 });

    const entries = buildCommissionEntries(salesMap);
    expect(entries[0].commissionRate).toMatch(/^\d+\.\d{2}$/);
    expect(entries[0].commissionRate).toBe("7.50");
  });

  test("Empty sales map → no entries", () => {
    const entries = buildCommissionEntries(new Map());
    expect(entries.length).toBe(0);
  });
});

describe("commissions: total commissions calculation (مجموع العمولات)", () => {
  test("Single entry: 50.000 → total = 50.000", () => {
    const entries: CommissionEntry[] = [
      { salespersonId: 1, name: "أحمد", totalSales: "1000.000", commissionRate: "5.00", commissionAmount: "50.000" },
    ];
    expect(calculateTotalCommissions(entries)).toBe("50.000");
  });

  test("Two entries: 50.000 + 210.000 = 260.000", () => {
    const entries: CommissionEntry[] = [
      { salespersonId: 1, name: "أحمد", totalSales: "1000.000", commissionRate: "5.00", commissionAmount: "50.000" },
      { salespersonId: 2, name: "سارة", totalSales: "3000.000", commissionRate: "7.00", commissionAmount: "210.000" },
    ];
    expect(calculateTotalCommissions(entries)).toBe("260.000");
  });

  test("Three entries with fractional amounts sum correctly", () => {
    const entries: CommissionEntry[] = [
      { salespersonId: 1, name: "A", totalSales: "333.333", commissionRate: "5.00", commissionAmount: "16.667" },
      { salespersonId: 2, name: "B", totalSales: "500.000", commissionRate: "3.00", commissionAmount: "15.000" },
      { salespersonId: 3, name: "C", totalSales: "200.000", commissionRate: "10.00", commissionAmount: "20.000" },
    ];
    expect(calculateTotalCommissions(entries)).toBe("51.667");
  });

  test("Empty entries → total = 0.000", () => {
    expect(calculateTotalCommissions([])).toBe("0.000");
  });

  test("Total is always a 3-decimal string", () => {
    const entries: CommissionEntry[] = [
      { salespersonId: 1, name: "أحمد", totalSales: "1000.000", commissionRate: "5.00", commissionAmount: "50.000" },
    ];
    const total = calculateTotalCommissions(entries);
    expect(total).toMatch(/^\d+\.\d{3}$/);
  });
});

describe("commissions: JE validation (التحقق من قيد العمولات)", () => {
  test("Valid commissions with positive total → no error", () => {
    const entries: CommissionEntry[] = [
      { salespersonId: 1, name: "أحمد", totalSales: "1000.000", commissionRate: "5.00", commissionAmount: "50.000" },
    ];
    expect(validateCommissionJE(entries)).toBeNull();
  });

  test("Zero total commission → error", () => {
    const entries: CommissionEntry[] = [
      { salespersonId: 1, name: "أحمد", totalSales: "0.000", commissionRate: "5.00", commissionAmount: "0.000" },
    ];
    expect(validateCommissionJE(entries)).toContain("greater than zero");
  });

  test("Empty commissions list → zero total → error", () => {
    expect(validateCommissionJE([])).toContain("greater than zero");
  });
});

describe("commissions: JE line construction (بناء قيد العمولات)", () => {
  const expenseId = 1;
  const payableId = 2;

  test("JE is balanced: debit = credit", () => {
    const lines = buildCommissionJELines(150, expenseId, payableId, "2025-01", "2025-06");
    const totalDebit = lines.reduce((s, l) => s + num(l.debit, 3), 0);
    const totalCredit = lines.reduce((s, l) => s + num(l.credit, 3), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.001);
  });

  test("Debit line: Commission Expense account with Arabic description", () => {
    const lines = buildCommissionJELines(100, expenseId, payableId, "2025-01", "2025-06");
    expect(lines[0].accountId).toBe(expenseId);
    expect(lines[0].debit).toBe("100.000");
    expect(lines[0].credit).toBe("0.000");
    expect(lines[0].description).toBe("عمولات مبيعات مستحقة");
  });

  test("Credit line: Commissions Payable account with Arabic description", () => {
    const lines = buildCommissionJELines(100, expenseId, payableId, "2025-01", "2025-06");
    expect(lines[1].accountId).toBe(payableId);
    expect(lines[1].debit).toBe("0.000");
    expect(lines[1].credit).toBe("100.000");
    expect(lines[1].description).toBe("عمولات مبيعات مستحقة");
  });

  test("JE lines have exactly 2 entries", () => {
    const lines = buildCommissionJELines(500, expenseId, payableId, "2025-01", "2025-06");
    expect(lines.length).toBe(2);
  });

  test("All amounts are 3-decimal strings", () => {
    const lines = buildCommissionJELines(123.456, expenseId, payableId, "2025-01", "2025-06");
    for (const l of lines) {
      expect(l.debit).toMatch(/^\d+\.\d{3}$/);
      expect(l.credit).toMatch(/^\d+\.\d{3}$/);
    }
  });
});

describe("commissions: JE reference and description (مرجع ووصف القيد)", () => {
  test("Reference format: COMM-periodFrom-periodTo", () => {
    expect(buildCommissionReference("2025-01-01", "2025-06-30")).toBe("COMM-2025-01-01-2025-06-30");
  });

  test("Description includes Arabic label and period range", () => {
    const desc = buildCommissionJEDescription("2025-01", "2025-06");
    expect(desc).toContain("عمولات المبيعات");
    expect(desc).toContain("2025-01");
    expect(desc).toContain("2025-06");
  });
});

describe("commissions: commission record description (وصف سجل العمولة)", () => {
  test("Description format includes period and rate", () => {
    const desc = buildCommissionRecordDescription("2025-01-01", "2025-06-30", "5.00");
    expect(desc).toContain("عمولات مبيعات");
    expect(desc).toContain("rate:5.00%");
    expect(desc).toContain("2025-01-01");
    expect(desc).toContain("2025-06-30");
  });

  test("Rate is embedded in description for future extraction", () => {
    const desc = buildCommissionRecordDescription("2025-01", "2025-06", "7.50");
    // This rate should be extractable by extractCommissionRate
    expect(extractCommissionRate(desc)).toBe(7.5);
  });

  test("Round-trip: rate extracted from generated description matches original", () => {
    const rate = 10;
    const desc = buildCommissionRecordDescription("2025-01", "2025-12", rate.toFixed(2));
    expect(extractCommissionRate(desc)).toBe(rate);
  });
});

describe("commissions: edge cases (حالات خاصة)", () => {
  test("Very small sales amount: 0.001 × 5% = 0.000 (rounds to zero)", () => {
    const commission = calculateCommissionAmount(0.001, 5);
    expect(commission).toBe(0); // 0.001 * 0.05 = 0.00005 → rounds to 0
  });

  test("Fractional commission rate: 2.5% on 4000 = 100.000", () => {
    expect(calculateCommissionAmount(4000, 2.5)).toBe(100);
  });

  test("Negative sales total (returns/adjustments) × 5% = negative commission", () => {
    const commission = calculateCommissionAmount(-100, 5);
    expect(commission).toBe(-5);
  });

  test("Commission rate 0% → always 0 commission regardless of sales", () => {
    expect(calculateCommissionAmount(1000000, 0)).toBe(0);
  });

  test("100% commission rate (full commission) → sales = commission", () => {
    expect(calculateCommissionAmount(500, 100)).toBe(500);
  });
});
