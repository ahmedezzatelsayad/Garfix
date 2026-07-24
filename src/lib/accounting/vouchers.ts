/**
 * vouchers.ts — Phase 13: Receipt/Payment voucher processing
 *
 * Features:
 *  - Create PaymentVoucher record with auto-generated voucherNumber (RV-YYYY-NNNN / PV-YYYY-NNNN)
 *  - Calculate Arabic amount text via numberToArabicText
 *  - Create corresponding Journal Entry (Receipt: Debit Cash/Bank, Credit Client/Revenue; Payment: Debit Supplier/Expense, Credit Cash/Bank)
 *  - Cancel voucher: reverse JE, mark voucher as cancelled, log AccountingAuditLog with reason
 */

import { db } from "@/lib/db";
import { num } from "@/lib/money";
import { logger } from "@/lib/logger";
import { numberToArabicText, type SupportedCurrency } from "@/lib/accounting/arabic-amount-text";
import { logAccountingChange } from "@/lib/accounting/accountant-collab";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoucherType = "receipt" | "payment";

export interface CreateVoucherInput {
  companySlug: string;
  voucherType: VoucherType;
  date: string; // YYYY-MM-DD
  amount: number | string;
  currency: SupportedCurrency;
  payee: string;
  payer: string;
  description?: string;
  reference?: string;
  clientId?: number;
  supplierId?: number;
  bankAccountId?: number;
  glAccountId?: number;
  createdBy: string;
}

export interface VoucherResult {
  voucher: {
    id: number;
    voucherNumber: string;
    voucherType: string;
    date: string;
    amount: string;
    currency: string;
    amountArText: string;
    payee: string;
    payer: string;
    description: string | null;
    reference: string | null;
    clientId: number | null;
    supplierId: number | null;
    bankAccountId: number | null;
    glAccountId: number | null;
    journalEntryId: number | null;
    status: string;
    createdBy: string;
    createdAt: Date;
  };
  journalEntry?: {
    id: number;
    date: string;
    description: string | null;
    reference: string | null;
    status: string;
    lines: Array<{
      accountId: number;
      accountCode: string;
      accountNameAr: string;
      debit: string;
      credit: string;
      description: string | null;
    }>;
  };
}

// ─── 1. createVoucher ─────────────────────────────────────────────────────────

export async function createVoucher(input: CreateVoucherInput): Promise<VoucherResult> {
  const amountNum = num(input.amount, 3);

  // Generate voucher number: RV-YYYY-NNNN or PV-YYYY-NNNN
  const prefix = input.voucherType === "receipt" ? "RV" : "PV";
  const year = input.date.slice(0, 4);

  // Find the latest voucher number for this company + type + year
  const lastVoucher = await db.paymentVoucher.findFirst({
    where: {
      companySlug: input.companySlug,
      voucherNumber: { startsWith: `${prefix}-${year}-` },
    },
    orderBy: { voucherNumber: "desc" },
  });

  let nextSeq = 1;
  if (lastVoucher) {
    const lastSeq = parseInt(lastVoucher.voucherNumber.split("-")[2] || "0", 10);
    nextSeq = lastSeq + 1;
  }
  const voucherNumber = `${prefix}-${year}-${String(nextSeq).padStart(4, "0")}`;

  // Calculate Arabic amount text
  const amountArText = numberToArabicText(amountNum, input.currency);

  // Create the voucher + JE in a single transaction
  const result = await db.$transaction(async (tx) => {
    // ── Determine accounts for the JE ────────────────────────────────────
    //
    // Receipt Voucher (RV): cash received from client
    //   Debit: Cash/Bank account (bankAccountId → BankAccount.glAccountId, or glAccountId)
    //   Credit: Client revenue account (clientId → find client's AR or Revenue account)
    //
    // Payment Voucher (PV): cash paid to supplier
    //   Debit: Supplier/Expense account (supplierId → find supplier's AP or Expense account)
    //   Credit: Cash/Bank account (bankAccountId → BankAccount.glAccountId, or glAccountId)

    let debitAccountId: number;
    let creditAccountId: number;
    let debitDescription: string;
    let creditDescription: string;

    if (input.voucherType === "receipt") {
      // Debit: Cash/Bank
      if (input.bankAccountId) {
        const bankAcc = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId } });
        debitAccountId = bankAcc?.glAccountId ?? input.glAccountId ?? await findDefaultCashAccount(tx, input.companySlug);
      } else if (input.glAccountId) {
        debitAccountId = input.glAccountId;
      } else {
        debitAccountId = await findDefaultCashAccount(tx, input.companySlug);
      }
      debitDescription = `سند قبض - ${input.payer}`;

      // Credit: Client AR / Revenue
      if (input.clientId) {
        creditAccountId = await findClientARAccount(tx, input.companySlug, input.clientId);
      } else {
        creditAccountId = await findDefaultRevenueAccount(tx, input.companySlug);
      }
      creditDescription = `سند قبض - ${input.payee}`;
    } else {
      // Payment Voucher
      // Debit: Supplier/Expense
      if (input.supplierId) {
        debitAccountId = await findSupplierAPAccount(tx, input.companySlug, input.supplierId);
      } else if (input.glAccountId) {
        debitAccountId = input.glAccountId;
      } else {
        debitAccountId = await findDefaultExpenseAccount(tx, input.companySlug);
      }
      debitDescription = `سند دفع - ${input.payee}`;

      // Credit: Cash/Bank
      if (input.bankAccountId) {
        const bankAcc = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId } });
        creditAccountId = bankAcc?.glAccountId ?? input.glAccountId ?? await findDefaultCashAccount(tx, input.companySlug);
      } else if (input.glAccountId) {
        creditAccountId = input.glAccountId;
      } else {
        creditAccountId = await findDefaultCashAccount(tx, input.companySlug);
      }
      creditDescription = `سند دفع - ${input.payer}`;
    }

    // Create the Journal Entry
    const je = await tx.journalEntry.create({
      data: {
        companySlug: input.companySlug,
        date: input.date,
        description: input.description || `${prefix === "RV" ? "سند قبض" : "سند دفع"} ${voucherNumber}`,
        reference: voucherNumber,
        status: "posted",
        currency: input.currency,
        createdBy: input.createdBy,
        sourceType: "voucher",
        lines: {
          create: [
            {
              accountId: debitAccountId,
              debit: amountNum.toFixed(3),
              credit: "0.000",
              description: debitDescription,
            },
            {
              accountId: creditAccountId,
              debit: "0.000",
              credit: amountNum.toFixed(3),
              description: creditDescription,
            },
          ],
        },
      },
      include: {
        lines: { include: { account: { select: { code: true, nameAr: true } } } },
      },
    });

    // Update account balances (posted JE)
    const debitAccount = await tx.account.findUnique({ where: { id: debitAccountId } });
    const creditAccount = await tx.account.findUnique({ where: { id: creditAccountId } });

    if (debitAccount) {
      const isDebitNormal = debitAccount.type === "asset" || debitAccount.type === "expense";
      const delta = isDebitNormal ? amountNum : -amountNum;
      await tx.account.update({
        where: { id: debitAccountId },
        data: { balance: (num(debitAccount.balance, 3) + delta).toFixed(3) },
      });
    }

    if (creditAccount) {
      const isDebitNormal = creditAccount.type === "asset" || creditAccount.type === "expense";
      const delta = isDebitNormal ? -amountNum : amountNum;
      await tx.account.update({
        where: { id: creditAccountId },
        data: { balance: (num(creditAccount.balance, 3) + delta).toFixed(3) },
      });
    }

    // Create the PaymentVoucher
    const voucher = await tx.paymentVoucher.create({
      data: {
        companySlug: input.companySlug,
        voucherNumber,
        voucherType: input.voucherType,
        date: input.date,
        amount: amountNum.toFixed(3),
        currency: input.currency,
        amountArText,
        payee: input.payee,
        payer: input.payer,
        description: input.description || null,
        reference: input.reference || null,
        clientId: input.clientId || null,
        supplierId: input.supplierId || null,
        bankAccountId: input.bankAccountId || null,
        glAccountId: input.glAccountId || null,
        journalEntryId: je.id,
        status: "posted",
        createdBy: input.createdBy,
      },
    });

    // Log accounting audit
    await logAccountingChange(
      input.companySlug,
      input.createdBy,
      "create",
      "voucher",
      voucher.id,
      null,
      { voucherNumber, voucherType: input.voucherType, amount: amountNum.toFixed(3), jeId: je.id },
      null,
    );

    return { voucher, je };
  });

  logger.info("[vouchers] created", { companySlug: input.companySlug, voucherNumber, jeId: result.je.id });

  return {
    voucher: {
      id: result.voucher.id,
      voucherNumber: result.voucher.voucherNumber,
      voucherType: result.voucher.voucherType,
      date: result.voucher.date,
      amount: result.voucher.amount.toString(),
      currency: result.voucher.currency,
      amountArText: result.voucher.amountArText!,
      payee: result.voucher.payee,
      payer: result.voucher.payer,
      description: result.voucher.description,
      reference: result.voucher.reference,
      clientId: result.voucher.clientId,
      supplierId: result.voucher.supplierId,
      bankAccountId: result.voucher.bankAccountId,
      glAccountId: result.voucher.glAccountId,
      journalEntryId: result.voucher.journalEntryId,
      status: result.voucher.status,
      createdBy: result.voucher.createdBy,
      createdAt: result.voucher.createdAt,
    },
    journalEntry: {
      id: result.je.id,
      date: result.je.date,
      description: result.je.description,
      reference: result.je.reference,
      status: result.je.status,
      lines: result.je.lines.map((l) => ({
        accountId: l.accountId,
        accountCode: l.account.code,
        accountNameAr: l.account.nameAr,
        debit: l.debit.toString(),
        credit: l.credit.toString(),
        description: l.description,
      })),
    },
  };
}

// ─── 2. cancelVoucher ─────────────────────────────────────────────────────────

export async function cancelVoucher(
  companySlug: string,
  voucherId: number,
  reason: string,
  userEmail: string,
): Promise<{ ok: boolean; reversedJEId: number }> {
  const voucher = await db.paymentVoucher.findUnique({
    where: { id: voucherId },
  });
  if (!voucher) throw new Error("Voucher not found");
  if (voucher.companySlug !== companySlug) throw new Error("Voucher does not belong to this company");
  if (voucher.status === "cancelled") throw new Error("Voucher is already cancelled");

  const originalJEId = voucher.journalEntryId;

  // Reverse the JE and update voucher status in a transaction
  const result = await db.$transaction(async (tx) => {
    let reversedJEId = 0;

    if (originalJEId) {
      const originalJE = await tx.journalEntry.findUnique({
        where: { id: originalJEId },
        include: { lines: true },
      });

      if (originalJE && originalJE.status === "posted") {
        // Create a reversal JE
        const reversalJE = await tx.journalEntry.create({
          data: {
            companySlug,
            date: new Date().toISOString().slice(0, 10),
            description: `إلغاء سند ${voucher.voucherNumber} - ${reason}`,
            reference: `REV-${voucher.voucherNumber}`,
            status: "posted",
            currency: voucher.currency,
            createdBy: userEmail,
            sourceType: "voucher_cancel",
            sourceId: voucherId,
            lines: {
              create: originalJE.lines.map((l) => ({
                accountId: l.accountId,
                debit: l.credit, // swap debit/credit
                credit: l.debit, // swap debit/credit
                description: `إلغاء - ${l.description || ""}`,
              })),
            },
          },
        });

        // Update account balances for reversal
        const accountIds = [...new Set(originalJE.lines.map((l) => l.accountId))];
        const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } });
        const accountMap: Map<any, any> = new Map(accounts.map((a) => [a.id, a]));

        for (const line of originalJE.lines) {
          const acc = accountMap.get(line.accountId);
          if (!acc) continue;
          const isDebitNormal = acc.type === "asset" || acc.type === "expense";
          // Reversal: swap the effect
          const reversalDelta = isDebitNormal
            ? num(line.credit, 3) - num(line.debit, 3) // original debit added, reversal subtracts
            : num(line.debit, 3) - num(line.credit, 3); // original credit added, reversal subtracts
          await tx.account.update({
            where: { id: acc.id },
            data: { balance: (num(acc.balance, 3) + reversalDelta).toFixed(3) },
          });
        }

        reversedJEId = reversalJE.id;
      }
    }

    // Mark voucher as cancelled
    await tx.paymentVoucher.update({
      where: { id: voucherId },
      data: { status: "cancelled" },
    });

    // Log accounting audit
    await logAccountingChange(
      companySlug,
      userEmail,
      "cancel",
      "voucher",
      voucherId,
      { status: voucher.status, amount: voucher.amount },
      { status: "cancelled", reversedJEId },
      reason,
    );

    return { reversedJEId };
  });

  logger.info("[vouchers] cancelled", { companySlug, voucherId, reason, reversedJEId: result.reversedJEId });

  return { ok: true, reversedJEId: result.reversedJEId };
}

// ─── Helper: Find default accounts ────────────────────────────────────────────

async function findDefaultCashAccount(tx: any, companySlug: string): Promise<number> {
  // Find the first asset account with code starting with "1" (cash/bank range)
  const cashAccount = await tx.account.findFirst({
    where: { companySlug, type: "asset", isActive: true },
    orderBy: { code: "asc" },
  });
  if (!cashAccount) throw new Error("No cash/bank account found for this company. Please create an asset account first.");
  return cashAccount.id;
}

async function findDefaultRevenueAccount(tx: any, companySlug: string): Promise<number> {
  const revenueAccount = await tx.account.findFirst({
    where: { companySlug, type: "revenue", isActive: true },
    orderBy: { code: "asc" },
  });
  if (!revenueAccount) throw new Error("No revenue account found for this company. Please create a revenue account first.");
  return revenueAccount.id;
}

async function findDefaultExpenseAccount(tx: any, companySlug: string): Promise<number> {
  const expenseAccount = await tx.account.findFirst({
    where: { companySlug, type: "expense", isActive: true },
    orderBy: { code: "asc" },
  });
  if (!expenseAccount) throw new Error("No expense account found for this company. Please create an expense account first.");
  return expenseAccount.id;
}

async function findClientARAccount(tx: any, companySlug: string, clientId: number): Promise<number> {
  // Find AR (Accounts Receivable) account — typically code 1200 or similar
  const arAccount = await tx.account.findFirst({
    where: { companySlug, type: "asset", code: { startsWith: "12" }, isActive: true },
    orderBy: { code: "asc" },
  });
  if (!arAccount) {
    // Fallback: find any asset account
    return findDefaultRevenueAccount(tx, companySlug);
  }
  return arAccount.id;
}

async function findSupplierAPAccount(tx: any, companySlug: string, supplierId: number): Promise<number> {
  // Find AP (Accounts Payable) account — typically code 2100 or similar
  const apAccount = await tx.account.findFirst({
    where: { companySlug, type: "liability", code: { startsWith: "21" }, isActive: true },
    orderBy: { code: "asc" },
  });
  if (!apAccount) {
    // Fallback: find any expense account
    return findDefaultExpenseAccount(tx, companySlug);
  }
  return apAccount.id;
}
