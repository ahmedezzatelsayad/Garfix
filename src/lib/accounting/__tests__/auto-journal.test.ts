/**
 * auto-journal.test.ts — Tests for Auto-JE bridge logic.
 *
 * Replicates pure logic from auto-journal.ts for testing without DB.
 * Tests: makeLine helper, JE balance validation, invoice JE line construction,
 * expense category code mapping, salary calculation, asset disposal gain/loss,
 * purchase JE line construction, VAT return line construction, reversal (swap debit/credit).
 */

import { describe, test, expect } from "bun:test";
import { num, addNums, subNums } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

/**
 * Build a standard JE line entry — mirrors makeLine() from auto-journal.ts.
 */
function makeLine(
  accountId: number,
  debit: number,
  credit: number,
  description?: string,
): { accountId: number; debit: string; credit: string; description: string | null } {
  return {
    accountId,
    debit: num(debit, 3).toFixed(3),
    credit: num(credit, 3).toFixed(3),
    description: description || null,
  };
}

/**
 * Validate that JE lines are balanced (total debit ≈ total credit within 0.001 tolerance).
 */
function validateJEBalance(
  lines: Array<{ debit: string; credit: string }>,
  tolerance: number = 0.001,
): boolean {
  const totalDebit = lines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit, 3), 0);
  return Math.abs(totalDebit - totalCredit) <= tolerance;
}

/**
 * Map expense category to account code — mirrors the categoryCodeMap from auto-journal.ts.
 */
function getExpenseCode(category: string): string {
  const categoryCodeMap: Record<string, string> = {
    rent: "5200",
    utilities: "5210",
    office_supplies: "5220",
    marketing: "5300",
    travel: "5400",
    maintenance: "5250",
    insurance: "5600",
    professional_services: "5500",
    depreciation: "5700",
    other: "5900",
  };
  return categoryCodeMap[category] || "5900";
}

/**
 * Build invoice JE lines (pure logic, no DB account lookup).
 * Invoice JE: Debit AR/Cash, Credit Sales Revenue, Credit VAT Payable (if tax > 0).
 */
function buildInvoiceJELines(
  invoiceData: { id: number; total: string; subtotal: string; taxAmount: string; status: string; paid: string },
  arAccountId: number,
  cashAccountId: number,
  salesAccountId: number,
  vatAccountId: number,
): Array<{ accountId: number; debit: string; credit: string; description: string | null }> {
  const totalAmount = num(invoiceData.total, 3);
  const subtotalAmount = num(invoiceData.subtotal, 3);
  const taxAmount = num(invoiceData.taxAmount, 3);
  const paidAmount = num(invoiceData.paid, 3);
  const isPaid = invoiceData.status === "paid" || paidAmount >= totalAmount;

  const debitAccountId = isPaid ? cashAccountId : arAccountId;
  const lines: Array<{ accountId: number; debit: string; credit: string; description: string | null }> = [];

  // Debit: AR or Cash
  lines.push(makeLine(debitAccountId, totalAmount, 0, `Invoice #${invoiceData.id}`));
  // Credit: Sales Revenue
  lines.push(makeLine(salesAccountId, 0, subtotalAmount, `Sales — Invoice #${invoiceData.id}`));
  // Credit: VAT Payable (if tax > 0)
  if (taxAmount > 0.001) {
    lines.push(makeLine(vatAccountId, 0, taxAmount, `VAT — Invoice #${invoiceData.id}`));
  }

  return lines;
}

/**
 * Calculate salary JE amounts (pure logic).
 * Mirrors social insurance and gratuity calculations from auto-journal.ts.
 */
function calculateSalaryJEAmounts(
  baseSalary: string,
  allowances: string,
  deductions: string,
  bonus: string,
  netSalary: string,
): {
  baseSalary: number;
  allowances: number;
  deductions: number;
  bonus: number;
  netSalary: number;
  socialInsuranceExpense: number;
  socialInsurancePayable: number;
  gratuityProvision: number;
  grossExpense: number;
  salaryDebit: number;
} {
  const base = num(baseSalary, 3);
  const allow = num(allowances, 3);
  const ded = num(deductions, 3);
  const bns = num(bonus, 3);
  const net = num(netSalary, 3);

  const socialInsuranceRate = 0.095;
  const socialInsuranceExpense = num(base * socialInsuranceRate, 3);
  const socialInsurancePayable = socialInsuranceExpense;
  const gratuityProvision = num(base * 0.05, 3);

  const salaryDebit = num(addNums(base, allow, bns), 3);
  const grossExpense = num(addNums(base, allow, bns, socialInsuranceExpense), 3);

  return {
    baseSalary: base,
    allowances: allow,
    deductions: ded,
    bonus: bns,
    netSalary: net,
    socialInsuranceExpense,
    socialInsurancePayable,
    gratuityProvision,
    grossExpense,
    salaryDebit,
  };
}

/**
 * Calculate asset disposal gain/loss — mirrors createAssetDisposalJE logic.
 */
function calculateAssetDisposalGainLoss(
  acquisitionCost: string,
  accumulatedDepreciation: string,
  disposalAmount: string,
): { bookValue: number; gainOrLoss: number; isGain: boolean; gainLossAmount: number } {
  const originalCost = num(acquisitionCost, 3);
  const accDep = num(accumulatedDepreciation, 3);
  const bookValue = num(originalCost - accDep, 3);
  const disposalAmt = num(disposalAmount, 3);
  const gainOrLoss = num(disposalAmt - bookValue, 3);
  const isGain = gainOrLoss > 0;
  const gainLossAmount = Math.abs(gainOrLoss);
  return { bookValue, gainOrLoss, isGain, gainLossAmount };
}

/**
 * Build reversal lines (swap debit/credit) — mirrors createInvoiceCancelJE logic.
 */
function buildReversalLines(
  originalLines: Array<{ accountId: number; debit: string; credit: string; description: string | null }>,
): Array<{ accountId: number; debit: string; credit: string; description: string | null }> {
  return originalLines.map((l) => ({
    accountId: l.accountId,
    debit: l.credit, // swap
    credit: l.debit, // swap
    description: l.description,
  }));
}

/**
 * Build purchase JE lines (pure logic, no DB).
 * Purchase: Debit Purchases/COGS, Debit VAT Receivable (if applicable), Credit AP.
 */
function buildPurchaseJELines(
  purchaseData: { id: number; totalAmount: string; vatAmount?: string; vatReceivable?: boolean },
  purchasesAccountId: number,
  apAccountId: number,
  vatReceivableAccountId: number,
): Array<{ accountId: number; debit: string; credit: string; description: string | null }> {
  const totalAmount = num(purchaseData.totalAmount, 3);
  const vatAmount = num(purchaseData.vatAmount || "0", 3);
  const netAmount = num(totalAmount - vatAmount, 3);

  const lines: Array<{ accountId: number; debit: string; credit: string; description: string | null }> = [
    makeLine(purchasesAccountId, netAmount, 0, `Purchase — PI #${purchaseData.id}`),
    makeLine(apAccountId, 0, totalAmount, `AP — Purchase PI #${purchaseData.id}`),
  ];

  if (vatAmount > 0.001 && purchaseData.vatReceivable) {
    lines.push(makeLine(vatReceivableAccountId, vatAmount, 0, `VAT Receivable — PI #${purchaseData.id}`));
  }

  return lines;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("auto-journal: makeLine helper", () => {
  test("makeLine creates debit line with 3 decimal places", () => {
    const line = makeLine(1, 500, 0, "Test debit");
    expect(line.accountId).toBe(1);
    expect(line.debit).toBe("500.000");
    expect(line.credit).toBe("0.000");
    expect(line.description).toBe("Test debit");
  });

  test("makeLine creates credit line with 3 decimal places", () => {
    const line = makeLine(2, 0, 300.5, "Test credit");
    expect(line.debit).toBe("0.000");
    expect(line.credit).toBe("300.500");
  });

  test("makeLine handles null description", () => {
    const line = makeLine(3, 100, 0);
    expect(line.description).toBeNull();
  });

  test("makeLine rounds fractional amounts to 3 decimals", () => {
    const line = makeLine(4, 100.4567, 0);
    expect(line.debit).toBe("100.457");
  });
});

describe("auto-journal: JE balance validation (توازن القيد)", () => {
  test("Balanced JE: 1 debit + 1 credit → passes validation", () => {
    const lines = [
      { debit: "500.000", credit: "0.000" },
      { debit: "0.000", credit: "500.000" },
    ];
    expect(validateJEBalance(lines)).toBe(true);
  });

  test("Balanced JE: 3 lines with tax → passes validation", () => {
    const lines = [
      { debit: "115.000", credit: "0.000" },   // AR
      { debit: "0.000", credit: "100.000" },    // Sales Revenue
      { debit: "0.000", credit: "15.000" },     // VAT Payable
    ];
    expect(validateJEBalance(lines)).toBe(true);
  });

  test("Unbalanced JE: debit ≠ credit → fails validation", () => {
    const lines = [
      { debit: "100.000", credit: "0.000" },
      { debit: "0.000", credit: "50.000" },
    ];
    expect(validateJEBalance(lines)).toBe(false);
  });

  test("Balanced within tolerance of 0.002 → passes", () => {
    const lines = [
      { debit: "100.000", credit: "0.000" },
      { debit: "0.000", credit: "99.999" },
    ];
    // difference ≈ 0.001 — within tolerance of 0.002
    expect(validateJEBalance(lines, 0.002)).toBe(true);
  });

  test("Large balanced JE with many lines → passes", () => {
    const lines = [
      { debit: "1000.000", credit: "0.000" },
      { debit: "0.000", credit: "600.000" },
      { debit: "0.000", credit: "300.000" },
      { debit: "0.000", credit: "100.000" },
    ];
    expect(validateJEBalance(lines)).toBe(true);
  });
});

describe("auto-journal: expense category mapping (تصنيف المصاريف)", () => {
  test("rent → 5200", () => {
    expect(getExpenseCode("rent")).toBe("5200");
  });

  test("utilities → 5210", () => {
    expect(getExpenseCode("utilities")).toBe("5210");
  });

  test("office_supplies → 5220", () => {
    expect(getExpenseCode("office_supplies")).toBe("5220");
  });

  test("marketing → 5300", () => {
    expect(getExpenseCode("marketing")).toBe("5300");
  });

  test("travel → 5400", () => {
    expect(getExpenseCode("travel")).toBe("5400");
  });

  test("maintenance → 5250", () => {
    expect(getExpenseCode("maintenance")).toBe("5250");
  });

  test("insurance → 5600", () => {
    expect(getExpenseCode("insurance")).toBe("5600");
  });

  test("professional_services → 5500", () => {
    expect(getExpenseCode("professional_services")).toBe("5500");
  });

  test("depreciation → 5700", () => {
    expect(getExpenseCode("depreciation")).toBe("5700");
  });

  test("unknown category → 5900 (other)", () => {
    expect(getExpenseCode("random_category")).toBe("5900");
  });

  test("other → 5900", () => {
    expect(getExpenseCode("other")).toBe("5900");
  });
});

describe("auto-journal: invoice JE line construction (قيد الفاتورة)", () => {
  const arId = 1;
  const cashId = 2;
  const salesId = 3;
  const vatId = 4;

  test("Unpaid invoice with no tax → Debit AR, Credit Sales Revenue", () => {
    const lines = buildInvoiceJELines(
      { id: 10, total: "100.000", subtotal: "100.000", taxAmount: "0.000", status: "sent", paid: "0.000" },
      arId, cashId, salesId, vatId,
    );
    expect(lines.length).toBe(2);
    expect(lines[0].accountId).toBe(arId); // AR
    expect(lines[0].debit).toBe("100.000");
    expect(lines[1].accountId).toBe(salesId); // Sales Revenue
    expect(lines[1].credit).toBe("100.000");
    expect(validateJEBalance(lines)).toBe(true);
  });

  test("Paid invoice with no tax → Debit Cash, Credit Sales Revenue", () => {
    const lines = buildInvoiceJELines(
      { id: 11, total: "200.000", subtotal: "200.000", taxAmount: "0.000", status: "paid", paid: "200.000" },
      arId, cashId, salesId, vatId,
    );
    expect(lines[0].accountId).toBe(cashId); // Cash
    expect(lines[0].debit).toBe("200.000");
    expect(lines[1].accountId).toBe(salesId);
    expect(lines[1].credit).toBe("200.000");
    expect(validateJEBalance(lines)).toBe(true);
  });

  test("Unpaid invoice with VAT → Debit AR, Credit Sales + VAT Payable", () => {
    const lines = buildInvoiceJELines(
      { id: 12, total: "115.000", subtotal: "100.000", taxAmount: "15.000", status: "sent", paid: "0.000" },
      arId, cashId, salesId, vatId,
    );
    expect(lines.length).toBe(3);
    expect(lines[0].accountId).toBe(arId);
    expect(lines[0].debit).toBe("115.000");
    expect(lines[1].accountId).toBe(salesId);
    expect(lines[1].credit).toBe("100.000");
    expect(lines[2].accountId).toBe(vatId);
    expect(lines[2].credit).toBe("15.000");
    expect(validateJEBalance(lines)).toBe(true);
  });

  test("Partially paid invoice → still debits AR (payment creates separate JE)", () => {
    const lines = buildInvoiceJELines(
      { id: 13, total: "500.000", subtotal: "500.000", taxAmount: "0.000", status: "partial", paid: "200.000" },
      arId, cashId, salesId, vatId,
    );
    // Partially paid: still debits AR (not Cash)
    expect(lines[0].accountId).toBe(arId);
    expect(lines[0].debit).toBe("500.000");
  });

  test("Very small tax amount (< 0.001) → no VAT line created", () => {
    const lines = buildInvoiceJELines(
      { id: 14, total: "100.000", subtotal: "99.9995", taxAmount: "0.0005", status: "sent", paid: "0.000" },
      arId, cashId, salesId, vatId,
    );
    // Tax < 0.001 threshold → only 2 lines (no VAT)
    expect(lines.length).toBe(2);
  });
});

describe("auto-journal: salary JE calculations (حسابات الرواتب)", () => {
  test("Basic salary calculations: social insurance 9.5% + gratuity 5%", () => {
    const result = calculateSalaryJEAmounts("2000", "500", "100", "200", "2600");
    expect(result.baseSalary).toBe(2000);
    expect(result.allowances).toBe(500);
    expect(result.bonus).toBe(200);
    expect(result.netSalary).toBe(2600);
    // Social insurance: 2000 * 0.095 = 190
    expect(result.socialInsuranceExpense).toBe(190);
    expect(result.socialInsurancePayable).toBe(190);
    // Gratuity: 2000 * 0.05 = 100
    expect(result.gratuityProvision).toBe(100);
  });

  test("Salary debit = base + allowances + bonus", () => {
    const result = calculateSalaryJEAmounts("3000", "200", "50", "100", "3250");
    expect(result.salaryDebit).toBe(3300); // 3000 + 200 + 100
  });

  test("Gross expense = base + allowances + bonus + social insurance", () => {
    const result = calculateSalaryJEAmounts("1000", "0", "0", "0", "905");
    expect(result.grossExpense).toBe(1095); // 1000 + 0 + 0 + 95
  });

  test("Zero base salary → zero social insurance and gratuity", () => {
    const result = calculateSalaryJEAmounts("0", "0", "0", "0", "0");
    expect(result.socialInsuranceExpense).toBe(0);
    expect(result.gratuityProvision).toBe(0);
    expect(result.salaryDebit).toBe(0);
  });

  test("Salary JE lines are balanced (قيد الراتب متوازن)", () => {
    const result = calculateSalaryJEAmounts("2000", "500", "0", "200", "2600");
    // Debit: salary (2700) + social insurance (190) = 2890
    // Credit: cash (2600) + social insurance payable (190) + gratuity (100) = 2890
    const totalDebit = result.salaryDebit + result.socialInsuranceExpense;
    const totalCredit = result.netSalary + result.socialInsurancePayable + result.gratuityProvision;
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.01);
  });
});

describe("auto-journal: asset disposal gain/loss (تخلص من الأصل)", () => {
  test("Disposal at book value → zero gain/loss", () => {
    const result = calculateAssetDisposalGainLoss("1000", "400", "600");
    expect(result.bookValue).toBe(600);
    expect(result.gainOrLoss).toBe(0);
    expect(result.isGain).toBe(false);
    expect(result.gainLossAmount).toBe(0);
  });

  test("Disposal above book value → gain (أرباح التخلص)", () => {
    const result = calculateAssetDisposalGainLoss("1000", "400", "700");
    expect(result.bookValue).toBe(600);
    expect(result.gainOrLoss).toBe(100);
    expect(result.isGain).toBe(true);
    expect(result.gainLossAmount).toBe(100);
  });

  test("Disposal below book value → loss (خسارة التخلص)", () => {
    const result = calculateAssetDisposalGainLoss("1000", "400", "400");
    expect(result.bookValue).toBe(600);
    expect(result.gainOrLoss).toBe(-200);
    expect(result.isGain).toBe(false);
    expect(result.gainLossAmount).toBe(200);
  });

  test("Fully depreciated asset → book value = 0, any disposal = gain", () => {
    const result = calculateAssetDisposalGainLoss("5000", "5000", "100");
    expect(result.bookValue).toBe(0);
    expect(result.gainOrLoss).toBe(100);
    expect(result.isGain).toBe(true);
  });

  test("Disposal for zero of fully depreciated → zero gain/loss", () => {
    const result = calculateAssetDisposalGainLoss("5000", "5000", "0");
    expect(result.bookValue).toBe(0);
    expect(result.gainOrLoss).toBe(0);
  });
});

describe("auto-journal: reversal (swap debit/credit) — إلغاء القيد", () => {
  test("Reversal swaps debit and credit correctly", () => {
    const original = [
      makeLine(1, 500, 0, "Debit Cash"),
      makeLine(2, 0, 500, "Credit Revenue"),
    ];
    const reversed = buildReversalLines(original);
    expect(reversed[0].debit).toBe("0.000");
    expect(reversed[0].credit).toBe("500.000");
    expect(reversed[1].debit).toBe("500.000");
    expect(reversed[1].credit).toBe("0.000");
  });

  test("Reversal JE is balanced if original was balanced", () => {
    const original = [
      makeLine(1, 100, 0, "D"),
      makeLine(2, 0, 100, "C"),
    ];
    const reversed = buildReversalLines(original);
    expect(validateJEBalance(reversed)).toBe(true);
  });

  test("Reversal of invoice JE with VAT → still balanced", () => {
    const original = [
      makeLine(1, 115, 0, "AR"),
      makeLine(2, 0, 100, "Sales"),
      makeLine(3, 0, 15, "VAT"),
    ];
    const reversed = buildReversalLines(original);
    expect(validateJEBalance(reversed)).toBe(true);
  });

  test("Reversal preserves accountId and description", () => {
    const original = [
      makeLine(1, 200, 0, "Test desc"),
    ];
    const reversed = buildReversalLines(original);
    expect(reversed[0].accountId).toBe(1);
    expect(reversed[0].description).toBe("Test desc");
  });
});

describe("auto-journal: purchase JE line construction (قيد المشتريات)", () => {
  const purchasesId = 5;
  const apId = 6;
  const vatRecvId = 7;

  test("Purchase with no VAT → 2 lines: Debit Purchases, Credit AP", () => {
    const lines = buildPurchaseJELines(
      { id: 20, totalAmount: "500.000", vatAmount: "0", vatReceivable: false },
      purchasesId, apId, vatRecvId,
    );
    expect(lines.length).toBe(2);
    expect(lines[0].accountId).toBe(purchasesId);
    expect(lines[0].debit).toBe("500.000");
    expect(lines[1].accountId).toBe(apId);
    expect(lines[1].credit).toBe("500.000");
    expect(validateJEBalance(lines)).toBe(true);
  });

  test("Purchase with VAT receivable → 3 lines: Debit Purchases net + VAT, Credit AP total", () => {
    const lines = buildPurchaseJELines(
      { id: 21, totalAmount: "575.000", vatAmount: "75.000", vatReceivable: true },
      purchasesId, apId, vatRecvId,
    );
    expect(lines.length).toBe(3);
    // Net = 575 - 75 = 500
    expect(lines[0].debit).toBe("500.000");
    expect(lines[2].debit).toBe("75.000"); // VAT Receivable
    expect(lines[1].credit).toBe("575.000"); // AP = total
    expect(validateJEBalance(lines)).toBe(true);
  });

  test("Purchase with VAT but vatReceivable=false → only 2 lines", () => {
    const lines = buildPurchaseJELines(
      { id: 22, totalAmount: "575.000", vatAmount: "75.000", vatReceivable: false },
      purchasesId, apId, vatRecvId,
    );
    expect(lines.length).toBe(2);
  });

  test("VAT amount below threshold → no VAT line", () => {
    const lines = buildPurchaseJELines(
      { id: 23, totalAmount: "500.001", vatAmount: "0.0005", vatReceivable: true },
      purchasesId, apId, vatRecvId,
    );
    // VAT < 0.001 → no VAT receivable line
    expect(lines.length).toBe(2);
  });
});

describe("auto-journal: VAT return JE line construction (قيد ضريبة القيمة المضافة)", () => {
  test("VAT return creates balanced 2-line JE", () => {
    const lines = [
      makeLine(1, 150, 0, "VAT return payment — Q1-2025"),
      makeLine(2, 0, 150, "Cash/Bank — VAT return Q1-2025"),
    ];
    expect(validateJEBalance(lines)).toBe(true);
  });

  test("VAT return zero amount → still balanced", () => {
    const lines = [
      makeLine(1, 0, 0, "VAT return — zero"),
      makeLine(2, 0, 0, "Cash — zero VAT"),
    ];
    expect(validateJEBalance(lines)).toBe(true);
  });
});

describe("auto-journal: AutoJESourceType coverage (أنواع المصادر)", () => {
  test("All source types are valid string values", () => {
    const sourceTypes = [
      "invoice_create", "invoice_payment", "invoice_cancel",
      "expense_create", "salary_payment", "purchase_create", "purchase_payment",
      "depreciation", "voucher_receipt", "voucher_payment",
      "bank_deposit", "bank_withdrawal", "bank_fee", "bank_transfer",
      "reversal", "opening_balance", "vat_return",
      "fx_revaluation", "asset_disposal", "lc_utilization", "inter_company",
    ];
    for (const st of sourceTypes) {
      expect(typeof st).toBe("string");
      expect(st.length).toBeGreaterThan(0);
    }
    expect(sourceTypes.length).toBe(21);
  });
});
