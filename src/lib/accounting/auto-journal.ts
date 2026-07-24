/**
 * auto-journal.ts — Auto-JE bridges that create journal entries automatically
 * when operational events happen (invoice creation, payment, expense, payroll, etc.).
 *
 * Phase 1 (Double-Entry Enhancements) of the GarfiX ERP accounting module.
 * ALL monetary values as String (no Float), use num() from money.ts with 3 decimal scale.
 * ALL mutations MUST log audit via logAudit.
 * ALL functions use db.$transaction for atomicity (JE + lines + balance updates).
 */
import { db } from "@/lib/db";
import { num, addNums, subNums, toNum } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Source types for auto-generated journal entries. */
export type AutoJESourceType =
  | "invoice_create"
  | "invoice_payment"
  | "invoice_cancel"
  | "expense_create"
  | "salary_payment"
  | "purchase_create"
  | "purchase_payment"
  | "depreciation"
  | "voucher_receipt"
  | "voucher_payment"
  | "bank_deposit"
  | "bank_withdrawal"
  | "bank_fee"
  | "bank_transfer"
  | "reversal"
  | "opening_balance"
  | "vat_return"
  | "fx_revaluation"
  | "asset_disposal"
  | "lc_utilization"
  | "inter_company";

export interface InvoiceData {
  id: number;
  companySlug: string;
  total: string;
  subtotal: string;
  taxAmount: string;
  taxRate: string;
  status: string;
  paid: string;
  clientId?: number | null;
  issueDate: string;
}

export interface ExpenseData {
  companySlug: string;
  amount: string;
  category: string; // maps to expense account code
  description?: string;
  date: string;
  paidVia: "cash" | "bank" | "payable"; // determines credit side
  id?: number;
}

export interface SalaryData {
  id: number;
  companySlug: string;
  employeeId: number;
  month: string;
  baseSalary: string;
  allowances: string;
  deductions: string;
  bonus: string;
  netSalary: string;
  isPaid: boolean;
}

export interface EmployeeData {
  id: number;
  name: string;
  companySlug: string;
  baseSalary: string;
  currency: string;
  bankAccount?: string | null;
}

export interface PurchaseInvoiceData {
  id: number;
  companySlug: string;
  totalAmount: string;
  supplierId?: number | null;
  date: string;
  vatAmount?: string;
  vatReceivable?: boolean;
}

export interface VATReturnData {
  companySlug: string;
  vatDue: string;
  period: string;
  date: string;
  id?: number;
}

export interface AssetDisposalData {
  id: number;
  companySlug: string;
  acquisitionCost: string;
  accumulatedDepreciation: string;
  disposalAmount: string;
  disposalDate?: string;
  glAccountId?: number | null;
  depreciationAccountId?: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

/**
 * Look up an Account by its code for the given companySlug.
 * Throws if not found.
 */
async function getAccountByCode(
  tx: typeof db | Parameters<Parameters<typeof db.$transaction>[0]>[0],
  companySlug: string,
  code: string,
): Promise<{ id: number; type: string; balance: string }> {
  const acc = await tx.account.findFirst({
    where: { companySlug, code },
  });
  if (!acc) {
    throw new Error(`Account code "${code}" not found for company "${companySlug}"`);
  }
  return { id: acc.id, type: acc.type, balance: acc.balance.toString() };
}

/**
 * Update account balances for a set of journal lines (within a transaction).
 * Uses the isDebitNormal check exactly like the existing journal-entries POST route.
 */
async function updateAccountBalances(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  lines: { accountId: number; debit: string; credit: string }[],
  companySlug: string,
): Promise<void> {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await tx.account.findMany({
    where: { id: { in: accountIds }, companySlug },
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const deltas = new Map<number, number>();
  for (const line of lines) {
    const acc = accountMap.get(line.accountId);
    if (!acc) continue;
    const isDebitNormal = acc.type === "asset" || acc.type === "expense";
    const delta = isDebitNormal
      ? num(line.debit, 3) - num(line.credit, 3)
      : num(line.credit, 3) - num(line.debit, 3);
    deltas.set(line.accountId, (deltas.get(line.accountId) || 0) + delta);
  }

  for (const [accountId, delta] of deltas) {
    const acc = accountMap.get(accountId)!;
    const currentBalance = num(acc.balance, 3);
    await tx.account.update({
      where: { id: accountId },
      data: { balance: (currentBalance + delta).toFixed(3) },
    });
  }
}

/**
 * Build a standard JE line entry.
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

// ── Auto-JE Functions ────────────────────────────────────────────────────────────

/**
 * createInvoiceJE — When an invoice is created (sent/paid):
 *   Debit: Accounts Receivable (code 1100) or Cash (1000/1010) if paid
 *   Credit: Sales Revenue (code 4000)
 *   Credit: VAT Payable (code 2100) if tax > 0
 *   sourceType: "invoice_create", sourceId: invoice.id
 */
export async function createInvoiceJE(
  invoice: InvoiceData,
  companySlug: string,
  countryCode: string | null,
  userEmail: string,
  userUid: string,
): Promise<{ id: number; [key: string]: unknown }> {
  const totalAmount = num(invoice.total, 3);
  const subtotalAmount = num(invoice.subtotal, 3);
  const taxAmount = num(invoice.taxAmount, 3);
  const paidAmount = num(invoice.paid, 3);
  const isPaid = invoice.status === "paid" || paidAmount >= totalAmount;

  const arAccount = await getAccountByCode(db, companySlug, "1100");
  const salesAccount = await getAccountByCode(db, companySlug, "4000");

  // Determine the debit account: AR if unpaid, Cash/Bank if paid
  let debitAccountId: number;
  let debitAccountType: string;
  if (isPaid) {
    // Paid invoice: debit Cash/Bank
    const cashAccount = await getAccountByCode(db, companySlug, "1010");
    debitAccountId = cashAccount.id;
    debitAccountType = cashAccount.type;
  } else if (paidAmount > 0) {
    // Partially paid: split between AR and Cash
    // We still debit full amount to AR; the payment will create a separate JE
    debitAccountId = arAccount.id;
    debitAccountType = arAccount.type;
  } else {
    // Unpaid: debit AR
    debitAccountId = arAccount.id;
    debitAccountType = arAccount.type;
  }

  const lines: { accountId: number; debit: string; credit: string; description: string | null }[] = [];

  // Debit: AR or Cash
  lines.push(makeLine(debitAccountId, totalAmount, 0, `Invoice #${invoice.id}`));

  // Credit: Sales Revenue
  lines.push(makeLine(salesAccount.id, 0, subtotalAmount, `Sales — Invoice #${invoice.id}`));

  // Credit: VAT Payable (if tax > 0)
  if (taxAmount > 0.001) {
    const vatPayableAccount = await getAccountByCode(db, companySlug, "2100");
    lines.push(makeLine(vatPayableAccount.id, 0, taxAmount, `VAT — Invoice #${invoice.id}`));
  }

  // Validate balanced entry
  const totalDebit = lines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit, 3), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Invoice JE not balanced: debit=${totalDebit.toFixed(3)}, credit=${totalCredit.toFixed(3)}`);
  }

  const entry = await db.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companySlug,
        date: invoice.issueDate,
        description: `Invoice #${invoice.id} — ${isPaid ? "paid" : "receivable"}`,
        status: "posted",
        sourceType: "invoice_create",
        sourceId: invoice.id,
        createdBy: userEmail,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    // Update account balances (posted status)
    await updateAccountBalances(tx, lines, companySlug);

    return created;
  });

  await logAudit({
    userEmail,
    userUid,
    action: "auto_je_create",
    entity: "journal_entry",
    entityId: entry.id,
    companySlug,
    details: { sourceType: "invoice_create", sourceId: invoice.id, totalDebit, totalCredit },
  });

  return entry;
}

/**
 * createInvoicePaymentJE — When payment received for an invoice:
 *   Debit: Cash/Bank (code 1010 or 1000)
 *   Credit: Accounts Receivable (code 1100)
 *   sourceType: "invoice_payment", sourceId: invoice.id
 */
export async function createInvoicePaymentJE(
  invoice: InvoiceData,
  paymentAmount: string | number,
  companySlug: string,
  countryCode: string | null,
  userEmail: string,
  userUid: string,
): Promise<{ id: number; [key: string]: unknown }> {
  const paymentAmt = num(paymentAmount, 3);

  const cashAccount = await getAccountByCode(db, companySlug, "1010");
  const arAccount = await getAccountByCode(db, companySlug, "1100");

  const lines = [
    makeLine(cashAccount.id, paymentAmt, 0, `Payment received — Invoice #${invoice.id}`),
    makeLine(arAccount.id, 0, paymentAmt, `AR reduction — Invoice #${invoice.id}`),
  ];

  const entry = await db.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companySlug,
        date: new Date().toISOString().slice(0, 10),
        description: `Payment received for Invoice #${invoice.id}`,
        status: "posted",
        sourceType: "invoice_payment",
        sourceId: invoice.id,
        createdBy: userEmail,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    await updateAccountBalances(tx, lines, companySlug);

    return created;
  });

  await logAudit({
    userEmail,
    userUid,
    action: "auto_je_create",
    entity: "journal_entry",
    entityId: entry.id,
    companySlug,
    details: { sourceType: "invoice_payment", sourceId: invoice.id, paymentAmount: paymentAmt.toFixed(3) },
  });

  return entry;
}

/**
 * createInvoiceCancelJE — Reverse the original invoice JE by swapping debit/credit:
 *   sourceType: "invoice_cancel", sourceId: invoice.id
 */
export async function createInvoiceCancelJE(
  invoice: InvoiceData,
  companySlug: string,
  countryCode: string | null,
  userEmail: string,
  userUid: string,
): Promise<{ id: number; [key: string]: unknown }> {
  // Find the original invoice JE
  const originalJE = await db.journalEntry.findFirst({
    where: {
      companySlug,
      sourceType: "invoice_create",
      sourceId: invoice.id,
      status: "posted",
    },
    include: { lines: true },
  });

  if (!originalJE) {
    throw new Error(`No original JE found for invoice #${invoice.id} to cancel`);
  }

  // Swap debit/credit on every line
  const swappedLines = originalJE.lines.map((l) => ({
    accountId: l.accountId,
    debit: num(l.credit, 3).toFixed(3),
    credit: num(l.debit, 3).toFixed(3),
    description: l.description || null,
  }));

  const entry = await db.$transaction(async (tx) => {
    // Create reversal entry
    const created = await tx.journalEntry.create({
      data: {
        companySlug,
        date: new Date().toISOString().slice(0, 10),
        description: `Cancel Invoice #${invoice.id} — reversal of JE #${originalJE.id}`,
        status: "posted",
        sourceType: "invoice_cancel",
        sourceId: invoice.id,
        createdBy: userEmail,
        lines: { create: swappedLines },
      },
      include: { lines: true },
    });

    // Update account balances for the reversal
    await updateAccountBalances(tx, swappedLines, companySlug);

    // Mark original JE as reversed
    await tx.journalEntry.update({
      where: { id: originalJE.id },
      data: { status: "reversed" },
    });

    return created;
  });

  await logAudit({
    userEmail,
    userUid,
    action: "auto_je_cancel",
    entity: "journal_entry",
    entityId: entry.id,
    companySlug,
    details: { sourceType: "invoice_cancel", sourceId: invoice.id, originalJEId: originalJE.id },
  });

  return entry;
}

/**
 * createExpenseJE — For expenses:
 *   Debit: Expense account (based on category)
 *   Credit: Cash/Bank (1010) or Accounts Payable (2000)
 *   sourceType: "expense_create"
 */
export async function createExpenseJE(
  expenseData: ExpenseData,
  companySlug: string,
  countryCode: string | null,
  userEmail: string,
  userUid: string,
): Promise<{ id: number; [key: string]: unknown }> {
  const amount = num(expenseData.amount, 3);

  // Map expense category to account code
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
  const expenseCode = categoryCodeMap[expenseData.category] || "5900";

  const expenseAccount = await getAccountByCode(db, companySlug, expenseCode);
  let creditAccountId: number;
  let creditDescription: string;

  if (expenseData.paidVia === "cash" || expenseData.paidVia === "bank") {
    const cashAccount = await getAccountByCode(db, companySlug, "1010");
    creditAccountId = cashAccount.id;
    creditDescription = `Cash/Bank — Expense: ${expenseData.category}`;
  } else {
    const apAccount = await getAccountByCode(db, companySlug, "2000");
    creditAccountId = apAccount.id;
    creditDescription = `Accounts Payable — Expense: ${expenseData.category}`;
  }

  const lines = [
    makeLine(expenseAccount.id, amount, 0, `Expense: ${expenseData.category} — ${expenseData.description || ""}`),
    makeLine(creditAccountId, 0, amount, creditDescription),
  ];

  const entry = await db.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companySlug,
        date: expenseData.date,
        description: expenseData.description || `Expense: ${expenseData.category}`,
        status: "posted",
        sourceType: "expense_create",
        sourceId: expenseData.id || null,
        createdBy: userEmail,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    await updateAccountBalances(tx, lines, companySlug);

    return created;
  });

  await logAudit({
    userEmail,
    userUid,
    action: "auto_je_create",
    entity: "journal_entry",
    entityId: entry.id,
    companySlug,
    details: { sourceType: "expense_create", category: expenseData.category, amount: amount.toFixed(3) },
  });

  return entry;
}

/**
 * createSalaryPaymentJE — Payroll journal entry:
 *   Debit: Salaries & Wages (code 5100)
 *   Debit: Social Insurance Expense (code 5120)
 *   Credit: Cash/Bank (code 1010)
 *   Credit: Social Insurance Payable (code 2110)
 *   Credit: Gratuity Provision (code 2120)
 *   sourceType: "salary_payment", sourceId: salary.id
 */
export async function createSalaryPaymentJE(
  salary: SalaryData,
  employee: EmployeeData,
  companySlug: string,
  countryCode: string | null,
  userEmail: string,
  userUid: string,
): Promise<{ id: number; [key: string]: unknown }> {
  const baseSalary = num(salary.baseSalary, 3);
  const allowances = num(salary.allowances, 3);
  const deductions = num(salary.deductions, 3);
  const bonus = num(salary.bonus, 3);
  const netSalary = num(salary.netSalary, 3);

  // Gulf-specific: social insurance ~9.5% employer share, gratuity provision
  const socialInsuranceRate = 0.095; // typical Gulf rate
  const socialInsuranceExpense = num(baseSalary * socialInsuranceRate, 3);
  const socialInsurancePayable = socialInsuranceExpense; // same amount — employer portion payable to authority
  const gratuityProvision = num(baseSalary * 0.05, 3); // typical Gulf end-of-service provision

  const salariesAccount = await getAccountByCode(db, companySlug, "5100");
  const socialInsuranceExpAccount = await getAccountByCode(db, companySlug, "5120");
  const cashAccount = await getAccountByCode(db, companySlug, "1010");
  const socialInsurancePayableAccount = await getAccountByCode(db, companySlug, "2110");
  const gratuityProvisionAccount = await getAccountByCode(db, companySlug, "2120");

  // Total gross salary expense = base + allowances + bonus + social insurance expense
  const grossExpense = addNums(baseSalary, allowances, bonus, socialInsuranceExpense);

  const lines = [
    // Debit: Salaries & Wages (base + allowances + bonus)
    makeLine(salariesAccount.id, num(addNums(baseSalary, allowances, bonus), 3), 0, `Salary — ${employee.name} — ${salary.month}`),
    // Debit: Social Insurance Expense (employer share)
    makeLine(socialInsuranceExpAccount.id, socialInsuranceExpense, 0, `Social Insurance (employer) — ${employee.name} — ${salary.month}`),
    // Credit: Cash/Bank (net salary paid to employee)
    makeLine(cashAccount.id, 0, netSalary, `Net salary paid — ${employee.name} — ${salary.month}`),
    // Credit: Social Insurance Payable (employer share payable to authority)
    makeLine(socialInsurancePayableAccount.id, 0, socialInsurancePayable, `Social Insurance payable — ${employee.name} — ${salary.month}`),
    // Credit: Gratuity Provision (end-of-service benefit)
    makeLine(gratuityProvisionAccount.id, 0, gratuityProvision, `Gratuity provision — ${employee.name} — ${salary.month}`),
  ];

  // Validate balanced
  const totalDebit = lines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit, 3), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    // Adjust: add a rounding line if necessary
    const rounding = num(totalDebit - totalCredit, 3);
    if (Math.abs(rounding) <= 0.01) {
      // Small rounding difference — adjust cash line
      const cashLine = lines.find((l) => l.accountId === cashAccount.id)!;
      const newCredit = num(cashLine.credit, 3) + rounding;
      cashLine.credit = num(newCredit, 3).toFixed(3);
    }
  }

  const entry = await db.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companySlug,
        date: salary.month + "-01", // first day of salary month
        description: `Salary payment — ${employee.name} — ${salary.month}`,
        status: "posted",
        sourceType: "salary_payment",
        sourceId: salary.id,
        createdBy: userEmail,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    await updateAccountBalances(tx, lines, companySlug);

    return created;
  });

  await logAudit({
    userEmail,
    userUid,
    action: "auto_je_create",
    entity: "journal_entry",
    entityId: entry.id,
    companySlug,
    details: { sourceType: "salary_payment", sourceId: salary.id, employeeId: employee.id, month: salary.month },
  });

  return entry;
}

/**
 * createPurchaseJE — Purchase invoice journal entry:
 *   Debit: Purchases/COGS (code 5000 or category-based)
 *   Debit: VAT Receivable (code 2105) if applicable
 *   Credit: Accounts Payable (code 2000)
 *   sourceType: "purchase_create", sourceId: purchaseInvoice.id
 */
export async function createPurchaseJE(
  purchaseInvoice: PurchaseInvoiceData,
  companySlug: string,
  countryCode: string | null,
  userEmail: string,
  userUid: string,
): Promise<{ id: number; [key: string]: unknown }> {
  const totalAmount = num(purchaseInvoice.totalAmount, 3);
  const vatAmount = num(purchaseInvoice.vatAmount || "0", 3);
  const netAmount = num(subNums(totalAmount, vatAmount), 3);

  const purchasesAccount = await getAccountByCode(db, companySlug, "5000");
  const apAccount = await getAccountByCode(db, companySlug, "2000");

  const lines = [
    // Debit: Purchases/COGS
    makeLine(purchasesAccount.id, netAmount, 0, `Purchase — PI #${purchaseInvoice.id}`),
    // Credit: Accounts Payable
    makeLine(apAccount.id, 0, totalAmount, `AP — Purchase PI #${purchaseInvoice.id}`),
  ];

  // Debit: VAT Receivable (if applicable)
  if (vatAmount > 0.001 && purchaseInvoice.vatReceivable) {
    const vatReceivableAccount = await getAccountByCode(db, companySlug, "2105");
    lines.push(makeLine(vatReceivableAccount.id, vatAmount, 0, `VAT Receivable — PI #${purchaseInvoice.id}`));
    // Adjust the AP credit to include VAT
    // Actually: AP credit = net + VAT = total, so the entry is:
    //   Debit: Purchases netAmount
    //   Debit: VAT Receivable vatAmount
    //   Credit: AP totalAmount
    // This is already correct because totalAmount = netAmount + vatAmount
  }

  // Validate balanced
  const totalDebit = lines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit, 3), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Purchase JE not balanced: debit=${totalDebit.toFixed(3)}, credit=${totalCredit.toFixed(3)}`);
  }

  const entry = await db.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companySlug,
        date: purchaseInvoice.date,
        description: `Purchase invoice — PI #${purchaseInvoice.id}`,
        status: "posted",
        sourceType: "purchase_create",
        sourceId: purchaseInvoice.id,
        createdBy: userEmail,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    await updateAccountBalances(tx, lines, companySlug);

    return created;
  });

  await logAudit({
    userEmail,
    userUid,
    action: "auto_je_create",
    entity: "journal_entry",
    entityId: entry.id,
    companySlug,
    details: { sourceType: "purchase_create", sourceId: purchaseInvoice.id, totalAmount: totalAmount.toFixed(3) },
  });

  return entry;
}

/**
 * createVATReturnJE — VAT return payment:
 *   Debit: VAT Payable (code 2100)
 *   Credit: Cash/Bank (code 1010)
 *   sourceType: "vat_return"
 */
export async function createVATReturnJE(
  vatData: VATReturnData,
  companySlug: string,
  countryCode: string | null,
  userEmail: string,
  userUid: string,
): Promise<{ id: number; [key: string]: unknown }> {
  const vatDue = num(vatData.vatDue, 3);

  const vatPayableAccount = await getAccountByCode(db, companySlug, "2100");
  const cashAccount = await getAccountByCode(db, companySlug, "1010");

  const lines = [
    makeLine(vatPayableAccount.id, vatDue, 0, `VAT return payment — ${vatData.period}`),
    makeLine(cashAccount.id, 0, vatDue, `Cash/Bank — VAT return ${vatData.period}`),
  ];

  const entry = await db.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companySlug,
        date: vatData.date,
        description: `VAT return — ${vatData.period}`,
        status: "posted",
        sourceType: "vat_return",
        sourceId: vatData.id || null,
        createdBy: userEmail,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    await updateAccountBalances(tx, lines, companySlug);

    return created;
  });

  await logAudit({
    userEmail,
    userUid,
    action: "auto_je_create",
    entity: "journal_entry",
    entityId: entry.id,
    companySlug,
    details: { sourceType: "vat_return", period: vatData.period, vatDue: vatDue.toFixed(3) },
  });

  return entry;
}

/**
 * createAssetDisposalJE — Asset disposal:
 *   Debit: Cash/Bank (disposal proceeds) — code 1010
 *   Debit: Accumulated Depreciation — use asset's depreciationAccountId or code 1601
 *   Credit: Fixed Asset (original cost) — use asset's glAccountId or code 1500
 *   Credit/Possibly Debit: Gain/Loss on disposal — code 5800 (loss) or 4800 (gain)
 *   sourceType: "asset_disposal", sourceId: asset.id
 */
export async function createAssetDisposalJE(
  asset: AssetDisposalData,
  disposalAmount: string | number,
  companySlug: string,
  userEmail: string,
  userUid: string,
): Promise<{ id: number; [key: string]: unknown }> {
  const disposalAmt = num(disposalAmount, 3);
  const originalCost = num(asset.acquisitionCost, 3);
  const accDepreciation = num(asset.accumulatedDepreciation, 3);
  const bookValue = num(originalCost - accDepreciation, 3);

  // Gain/Loss = disposal amount - book value
  const gainOrLoss = num(disposalAmt - bookValue, 3);
  const isGain = gainOrLoss > 0;
  const gainLossAmount = Math.abs(gainOrLoss);

  const cashAccount = await getAccountByCode(db, companySlug, "1010");
  const fixedAssetAccount = asset.glAccountId
    ? await db.account.findUnique({ where: { id: asset.glAccountId } })
    : await getAccountByCode(db, companySlug, "1500");
  if (!fixedAssetAccount) throw new Error("Fixed Asset GL account not found");

  const accDepAccount = asset.depreciationAccountId
    ? await db.account.findUnique({ where: { id: asset.depreciationAccountId } })
    : await getAccountByCode(db, companySlug, "1601");
  if (!accDepAccount) throw new Error("Accumulated Depreciation account not found");

  const gainLossAccount = isGain
    ? await getAccountByCode(db, companySlug, "4800") // Gain on disposal → revenue
    : await getAccountByCode(db, companySlug, "5800"); // Loss on disposal → expense

  const lines = [
    // Debit: Cash/Bank (disposal proceeds)
    makeLine(cashAccount.id, disposalAmt, 0, `Asset disposal proceeds — Asset #${asset.id}`),
    // Debit: Accumulated Depreciation (remove accumulated depreciation)
    makeLine(accDepAccount.id, accDepreciation, 0, `Remove accumulated depreciation — Asset #${asset.id}`),
    // Credit: Fixed Asset (remove original cost)
    makeLine(fixedAssetAccount.id, 0, originalCost, `Remove fixed asset — Asset #${asset.id}`),
  ];

  // Gain or Loss on disposal
  if (gainLossAmount > 0.001) {
    if (isGain) {
      // Gain: credit gain account
      lines.push(makeLine(gainLossAccount.id, 0, gainLossAmount, `Gain on asset disposal — Asset #${asset.id}`));
    } else {
      // Loss: debit loss account
      lines.push(makeLine(gainLossAccount.id, gainLossAmount, 0, `Loss on asset disposal — Asset #${asset.id}`));
    }
  }

  // Validate balanced
  const totalDebit = lines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit, 3), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Asset disposal JE not balanced: debit=${totalDebit.toFixed(3)}, credit=${totalCredit.toFixed(3)}`);
  }

  const entry = await db.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companySlug,
        date: asset.disposalDate || new Date().toISOString().slice(0, 10),
        description: `Asset disposal — Asset #${asset.id}`,
        status: "posted",
        sourceType: "asset_disposal",
        sourceId: asset.id,
        createdBy: userEmail,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    await updateAccountBalances(tx, lines, companySlug);

    return created;
  });

  await logAudit({
    userEmail,
    userUid,
    action: "auto_je_create",
    entity: "journal_entry",
    entityId: entry.id,
    companySlug,
    details: { sourceType: "asset_disposal", sourceId: asset.id, disposalAmount: disposalAmt.toFixed(3), gainOrLoss: gainOrLoss.toFixed(3) },
  });

  return entry;
}
