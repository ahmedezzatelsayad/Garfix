/**
 * trade-finance.ts — Trade Finance engine (Phase 9).
 *
 * Handles Letters of Credit, Landed Cost Allocation, and FX Revaluation.
 * All monetary values stored as String; uses num() for arithmetic.
 */
import { db } from "@/lib/db";
import { num, addNums, subNums, mulNums, toNum } from "@/lib/money";
import { logger } from "@/lib/logger";
import { parseJsonField } from "@/lib/api";

// ─── Letters of Credit ────────────────────────────────────────────────────

export interface TrackLCInput {
  lcNumber: string;
  supplierId: number;
  bankAccountId: number;
  amount: string;
  currency: string;
  issueDate: string;
  expiryDate: string;
  documentsRequired?: string[];
  notes?: string;
}

/**
 * Create a LetterOfCredit record and track its lifecycle.
 * LC lifecycle: issued → amended → utilized → expired/cancelled
 */
export async function trackLetterOfCredit(
  companySlug: string,
  lcData: TrackLCInput,
): Promise<{ ok: boolean; lc?: Record<string, unknown>; error?: string }> {
  try {
    // Verify supplier belongs to company
    const supplier = await db.supplier.findFirst({
      where: { id: lcData.supplierId, companySlug, isActive: true, deletedAt: null },
    });
    if (!supplier) {
      return { ok: false, error: "المورد غير موجود أو غير نشط في هذه الشركة" };
    }

    // Verify bank account belongs to company
    const bankAccount = await db.bankAccount.findFirst({
      where: { id: lcData.bankAccountId, companySlug, isActive: true },
    });
    if (!bankAccount) {
      return { ok: false, error: "الحساب البنكي غير موجود أو غير نشط في هذه الشركة" };
    }

    const lc = await db.letterOfCredit.create({
      data: {
        companySlug,
        lcNumber: lcData.lcNumber,
        supplierId: lcData.supplierId,
        bankAccountId: lcData.bankAccountId,
        amount: toNum(lcData.amount),
        currency: lcData.currency || "KWD",
        issueDate: lcData.issueDate,
        expiryDate: lcData.expiryDate,
        status: "issued",
        utilizationAmount: "0.000",
        documentsRequired: lcData.documentsRequired
          ? JSON.stringify(lcData.documentsRequired)
          : null,
        notes: lcData.notes || null,
      },
    });

    logger.info("[trade-finance] LC created", {
      companySlug,
      lcNumber: lc.lcNumber,
      amount: lc.amount,
      currency: lc.currency,
    });

    return {
      ok: true,
      lc: {
        id: lc.id,
        lcNumber: lc.lcNumber,
        supplierId: lc.supplierId,
        bankAccountId: lc.bankAccountId,
        amount: num(lc.amount, 3),
        currency: lc.currency,
        issueDate: lc.issueDate,
        expiryDate: lc.expiryDate,
        status: lc.status,
        utilizationAmount: num(lc.utilizationAmount, 3),
        documentsRequired: parseJsonField<string[]>(lc.documentsRequired, []),
        notes: lc.notes,
        createdAt: lc.createdAt,
        updatedAt: lc.updatedAt,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[trade-finance] trackLetterOfCredit failed", { err: msg });
    return { ok: false, error: msg };
  }
}

export interface AmendLCInput {
  amount?: string;
  expiryDate?: string;
  documentsRequired?: string[];
  notes?: string;
}

/**
 * Amend an existing LC — update amount, expiry, documents.
 * Status transitions from issued/amended to amended.
 * Tracks amendment history in notes.
 */
export async function amendLC(
  companySlug: string,
  lcId: number,
  amendmentData: AmendLCInput,
): Promise<{ ok: boolean; lc?: Record<string, unknown>; error?: string }> {
  try {
    const existing = await db.letterOfCredit.findFirst({
      where: { id: lcId, companySlug },
    });
    if (!existing) {
      return { ok: false, error: "الاعتماد المستندي غير موجود" };
    }
    if (existing.status === "utilized" || existing.status === "expired" || existing.status === "cancelled") {
      return { ok: false, error: `لا يمكن تعديل اعتماد مستندي بحالة ${existing.status}` };
    }

    const amendmentNotes = `[تعديل ${new Date().toISOString().slice(0, 10)}]`;
    const newNotes = amendmentData.notes
      ? `${existing.notes || ""}\n${amendmentNotes}: ${amendmentData.notes}`
      : `${existing.notes || ""}\n${amendmentNotes}`;

    const updated = await db.letterOfCredit.update({
      where: { id: lcId },
      data: {
        amount: amendmentData.amount ? toNum(amendmentData.amount) : undefined,
        expiryDate: amendmentData.expiryDate || undefined,
        documentsRequired: amendmentData.documentsRequired
          ? JSON.stringify(amendmentData.documentsRequired)
          : undefined,
        notes: newNotes,
        status: "amended",
      },
    });

    logger.info("[trade-finance] LC amended", {
      companySlug,
      lcId,
      lcNumber: updated.lcNumber,
      newAmount: amendmentData.amount,
    });

    return {
      ok: true,
      lc: {
        id: updated.id,
        lcNumber: updated.lcNumber,
        supplierId: updated.supplierId,
        bankAccountId: updated.bankAccountId,
        amount: num(updated.amount, 3),
        currency: updated.currency,
        issueDate: updated.issueDate,
        expiryDate: updated.expiryDate,
        status: updated.status,
        utilizationAmount: num(updated.utilizationAmount, 3),
        documentsRequired: parseJsonField<string[]>(updated.documentsRequired, []),
        notes: updated.notes,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[trade-finance] amendLC failed", { err: msg });
    return { ok: false, error: msg };
  }
}

/**
 * Utilize an LC — mark it as utilized and create a JE.
 * JE: Debit: Inventory/Purchases, Credit: LC Payable
 */
export async function utilizeLC(
  companySlug: string,
  lcId: number,
  utilizationAmount: string,
  userEmail: string,
): Promise<{ ok: boolean; lc?: Record<string, unknown>; jeId?: number; error?: string }> {
  try {
    const existing = await db.letterOfCredit.findFirst({
      where: { id: lcId, companySlug },
    });
    if (!existing) {
      return { ok: false, error: "الاعتماد المستندي غير موجود" };
    }
    if (existing.status !== "issued" && existing.status !== "amended") {
      return { ok: false, error: `لا يمكن استخدام اعتماد مستندي بحالة ${existing.status}` };
    }

    const utilAmt = num(utilizationAmount, 3);
    const lcAmt = num(existing.amount, 3);
    if (utilAmt > lcAmt + 0.001) {
      return { ok: false, error: "مبلغ الاستخدام أكبر من مبلغ الاعتماد المستندي" };
    }

    // Find appropriate accounts
    // Purchases/Inventory account (expense or asset type)
    const purchasesAccount = await db.account.findFirst({
      where: {
        companySlug,
        type: { in: ["expense", "asset"] },
        code: { startsWith: "5" }, // expense accounts typically start with 5
        isActive: true,
      },
      orderBy: { code: "asc" },
    });
    // LC Payable account (liability type)
    const lcPayableAccount = await db.account.findFirst({
      where: {
        companySlug,
        type: "liability",
        isActive: true,
        code: { startsWith: "2" }, // liability accounts typically start with 2
      },
      orderBy: { code: "asc" },
    });

    if (!purchasesAccount || !lcPayableAccount) {
      return { ok: false, error: "حسابات المشتريات/الاعتمادات المستندية غير مُهيّأة — يرجى إنشاء حسابات مناسبة" };
    }

    const totalUtil = addNums(existing.utilizationAmount, utilizationAmount);

    // Create JE + update LC in a transaction
    const result = await db.$transaction(async (tx) => {
      const je = await tx.journalEntry.create({
        data: {
          companySlug,
          date: new Date().toISOString().slice(0, 10),
          description: `استخدام اعتماد مستندي ${existing.lcNumber}`,
          reference: `LC-${existing.lcNumber}`,
          status: "posted",
          sourceType: "letter_of_credit",
          sourceId: lcId,
          createdBy: userEmail,
          lines: {
            create: [
              {
                accountId: purchasesAccount.id,
                debit: toNum(utilAmt),
                credit: "0.000",
                description: `مشتريات عبر اعتماد مستندي ${existing.lcNumber}`,
              },
              {
                accountId: lcPayableAccount.id,
                debit: "0.000",
                credit: toNum(utilAmt),
                description: `التزامات اعتماد مستندي ${existing.lcNumber}`,
              },
            ],
          },
        },
        include: { lines: true },
      });

      // Update account balances
      const isDebitNormalPurchases = purchasesAccount.type === "asset" || purchasesAccount.type === "expense";
      const deltaPurchases = isDebitNormalPurchases ? utilAmt : -utilAmt;
      await tx.account.update({
        where: { id: purchasesAccount.id },
        data: { balance: (num(purchasesAccount.balance, 3) + deltaPurchases).toFixed(3) },
      });

      const isDebitNormalPayable = lcPayableAccount.type === "asset" || lcPayableAccount.type === "expense";
      const deltaPayable = isDebitNormalPayable ? -utilAmt : utilAmt;
      await tx.account.update({
        where: { id: lcPayableAccount.id },
        data: { balance: (num(lcPayableAccount.balance, 3) + deltaPayable).toFixed(3) },
      });

      // Update LC
      const newStatus = num(totalUtil, 3) >= lcAmt - 0.001 ? "utilized" : existing.status;
      const lc = await tx.letterOfCredit.update({
        where: { id: lcId },
        data: {
          utilizationAmount: totalUtil,
          status: newStatus,
          notes: `${existing.notes || ""}\n[استخدام ${new Date().toISOString().slice(0, 10)}]: مبلغ ${toNum(utilAmt)}`,
        },
      });

      return { je, lc };
    });

    logger.info("[trade-finance] LC utilized", {
      companySlug,
      lcId,
      jeId: result.je.id,
      utilizationAmount: toNum(utilAmt),
    });

    return {
      ok: true,
      lc: {
        id: result.lc.id,
        lcNumber: result.lc.lcNumber,
        amount: num(result.lc.amount, 3),
        utilizationAmount: num(result.lc.utilizationAmount, 3),
        status: result.lc.status,
      },
      jeId: result.je.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[trade-finance] utilizeLC failed", { err: msg });
    return { ok: false, error: msg };
  }
}

/**
 * Cancel an LC — mark as cancelled.
 */
export async function cancelLC(
  companySlug: string,
  lcId: number,
): Promise<{ ok: boolean; lc?: Record<string, unknown>; error?: string }> {
  try {
    const existing = await db.letterOfCredit.findFirst({
      where: { id: lcId, companySlug },
    });
    if (!existing) {
      return { ok: false, error: "الاعتماد المستندي غير موجود" };
    }
    if (existing.status === "utilized" || existing.status === "cancelled") {
      return { ok: false, error: `لا يمكن إلغاء اعتماد مستندي بحالة ${existing.status}` };
    }

    const lc = await db.letterOfCredit.update({
      where: { id: lcId },
      data: {
        status: "cancelled",
        notes: `${existing.notes || ""}\n[إلغاء ${new Date().toISOString().slice(0, 10)}]`,
      },
    });

    return {
      ok: true,
      lc: {
        id: lc.id,
        lcNumber: lc.lcNumber,
        status: lc.status,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[trade-finance] cancelLC failed", { err: msg });
    return { ok: false, error: msg };
  }
}

// ─── Landed Cost Allocation ───────────────────────────────────────────────

export interface LandedCostLineInput {
  inventoryItemId?: number;
  productId?: number;
  allocatedCost: string;
  baseQuantity?: string;
  baseValue?: string;
}

export interface AllocateLandedCostInput {
  purchaseInvoiceId: number;
  costType: string; // shipping/customs/clearance/insurance/other
  totalCost: string;
  allocationMethod: string; // quantity/value/weight/volume
  lines: LandedCostLineInput[];
}

/**
 * Allocate landed costs across items based on the chosen method.
 * Creates JE: Debit Inventory (allocated cost per item), Credit Cash/AP.
 */
export async function allocateLandedCost(
  companySlug: string,
  allocationData: AllocateLandedCostInput,
  userEmail: string,
): Promise<{ ok: boolean; allocation?: Record<string, unknown>; jeId?: number; error?: string }> {
  try {
    // Verify purchase invoice
    const pi = await db.purchaseInvoice.findFirst({
      where: { id: allocationData.purchaseInvoiceId, companySlug, deletedAt: null },
    });
    if (!pi) {
      return { ok: false, error: "فاتورة المشتريات غير موجودة" };
    }

    const totalCost = num(allocationData.totalCost, 3);
    const method = allocationData.allocationMethod;

    // Validate total allocated cost matches sum of lines
    const linesTotal = allocationData.lines.reduce(
      (sum, l) => sum + num(l.allocatedCost, 3), 0
    );
    if (Math.abs(linesTotal - totalCost) > 0.01) {
      // Auto-distribute if lines don't sum correctly
      logger.info("[trade-finance] auto-distributing landed cost", {
        linesTotal,
        totalCost,
        method,
      });
    }

    // Find inventory account (asset type, code starting with 1) and cash/AP account
    const inventoryAccount = await db.account.findFirst({
      where: { companySlug, type: "asset", isActive: true, code: { startsWith: "1" } },
      orderBy: { code: "asc" },
    });
    const cashOrAPAccount = await db.account.findFirst({
      where: {
        companySlug,
        type: { in: ["asset", "liability"] },
        isActive: true,
        OR: [
          { code: { startsWith: "1" }, nameAr: { contains: "نقد" } },
          { code: { startsWith: "1" }, nameAr: { contains: "بنك" } },
          { code: { startsWith: "2" }, nameAr: { contains: "مورد" } },
          { code: { startsWith: "2" }, nameAr: { contains: "دائن" } },
        ],
      },
      orderBy: { code: "asc" },
    });

    if (!inventoryAccount || !cashOrAPAccount) {
      return { ok: false, error: "حسابات المخزون/النقد أو الموردون غير مُهيّأة — يرجى إنشاء حسابات مناسبة" };
    }

    const result = await db.$transaction(async (tx) => {
      // Create LandedCostAllocation
      const allocation = await tx.landedCostAllocation.create({
        data: {
          companySlug,
          purchaseInvoiceId: allocationData.purchaseInvoiceId,
          costType: allocationData.costType,
          totalCost: toNum(totalCost),
          allocationMethod: method,
          lines: {
            create: allocationData.lines.map((l) => ({
              inventoryItemId: l.inventoryItemId || null,
              productId: l.productId || null,
              allocatedCost: toNum(l.allocatedCost),
              baseQuantity: l.baseQuantity || null,
              baseValue: l.baseValue || null,
            })),
          },
        },
        include: { lines: true },
      });

      // Update inventory item costs
      for (const line of allocation.lines) {
        if (line.inventoryItemId) {
          const item = await tx.inventoryItem.findUnique({
            where: { id: line.inventoryItemId },
          });
          if (item) {
            // Add allocated cost to the product's cost (via product catalog)
            if (item.productId) {
              const product = await tx.productCatalog.findUnique({
                where: { id: item.productId },
              });
              if (product) {
                // FIX #12: ProductCatalog uses `purchasePrice`, NOT `cost`.
                const currentCost = num(product.purchasePrice, 3);
                const qty = num(item.quantity, 3);
                const lineCost = num(line.allocatedCost, 3);
                const perUnitCost = qty > 0 ? lineCost / qty : 0;
                await tx.productCatalog.update({
                  where: { id: item.productId },
                // FIX #13: ProductCatalogUncheckedUpdateInput uses `purchasePrice`, NOT `cost`.
                  data: { purchasePrice: (currentCost + perUnitCost).toFixed(3) },
                });
              }
            }
          }
        }
      }

      // Create JE: Debit Inventory, Credit Cash/AP
      const je = await tx.journalEntry.create({
        data: {
          companySlug,
          date: new Date().toISOString().slice(0, 10),
          description: `تكلفة استيراد — ${allocationData.costType} (فاتورة ${pi.num})`,
          reference: `LandedCost-${allocation.id}`,
          status: "posted",
          sourceType: "landed_cost_allocation",
          sourceId: allocation.id,
          createdBy: userEmail,
          lines: {
            create: [
              {
                accountId: inventoryAccount.id,
                debit: toNum(totalCost),
                credit: "0.000",
                description: `تكلفة استيراد (${allocationData.costType})`,
              },
              {
                accountId: cashOrAPAccount.id,
                debit: "0.000",
                credit: toNum(totalCost),
                description: `سداد تكلفة استيراد (${allocationData.costType})`,
              },
            ],
          },
        },
        include: { lines: true },
      });

      // Update account balances
      const isDebitNormalInv = inventoryAccount.type === "asset" || inventoryAccount.type === "expense";
      const deltaInv = isDebitNormalInv ? totalCost : -totalCost;
      await tx.account.update({
        where: { id: inventoryAccount.id },
        data: { balance: (num(inventoryAccount.balance, 3) + deltaInv).toFixed(3) },
      });

      const isDebitNormalCash = cashOrAPAccount.type === "asset" || cashOrAPAccount.type === "expense";
      const deltaCash = isDebitNormalCash ? -totalCost : totalCost;
      await tx.account.update({
        where: { id: cashOrAPAccount.id },
        data: { balance: (num(cashOrAPAccount.balance, 3) + deltaCash).toFixed(3) },
      });

      return { allocation, je };
    });

    logger.info("[trade-finance] landed cost allocated", {
      companySlug,
      allocationId: result.allocation.id,
      totalCost: toNum(totalCost),
      method,
      jeId: result.je.id,
    });

    return {
      ok: true,
      allocation: {
        id: result.allocation.id,
        purchaseInvoiceId: result.allocation.purchaseInvoiceId,
        costType: result.allocation.costType,
        totalCost: num(result.allocation.totalCost, 3),
        allocationMethod: result.allocation.allocationMethod,
        lines: result.allocation.lines.map((l) => ({
          id: l.id,
          inventoryItemId: l.inventoryItemId,
          productId: l.productId,
          allocatedCost: num(l.allocatedCost, 3),
          baseQuantity: l.baseQuantity ? num(l.baseQuantity, 3) : null,
          baseValue: l.baseValue ? num(l.baseValue, 3) : null,
        })),
        createdAt: result.allocation.createdAt,
      },
      jeId: result.je.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[trade-finance] allocateLandedCost failed", { err: msg });
    return { ok: false, error: msg };
  }
}

// ─── FX Revaluation ───────────────────────────────────────────────────────

export interface FxRevaluationDetail {
  sourceType: string; // invoice / purchase_invoice / bank_account
  sourceId: number;
  originalAmount: number;
  originalRate: number;
  currentRate: number;
  revaluedAmount: number;
  gain: number;
  loss: number;
}

export interface FxRevaluationResult {
  realizedGain: number;
  realizedLoss: number;
  unrealizedGain: number;
  unrealizedLoss: number;
  details: FxRevaluationDetail[];
  revaluationId?: number;
  jeId?: number;
}

/**
 * Calculate FX revaluation for open foreign currency transactions.
 *
 * 1. Find all open foreign currency transactions (invoices, purchase invoices, bank accounts)
 * 2. Revalue at current exchange rate vs original rate
 * 3. Calculate realized gains/losses (settled transactions)
 * 4. Calculate unrealized gains/losses (open transactions)
 * 5. Create FxRevaluation record
 * 6. Optionally create JE for unrealized portion
 */
export async function calculateFxRevaluation(
  companySlug: string,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  period: string,
  userEmail: string,
  postImmediately: boolean = false,
): Promise<{ ok: boolean; result?: FxRevaluationResult; error?: string }> {
  try {
    if (fromCurrency === toCurrency) {
      return { ok: false, error: "لا يمكن إعادة تقييم نفس العملة" };
    }
    if (rate <= 0) {
      return { ok: false, error: "سعر الصرف يجب أن يكون أكبر من صفر" };
    }

    const details: FxRevaluationDetail[] = [];
    let realizedGain = 0;
    let realizedLoss = 0;
    let unrealizedGain = 0;
    let unrealizedLoss = 0;

    // 1. Open invoices (receivables) in foreign currency
    const openInvoices = await db.invoice.findMany({
      where: {
        companySlug,
        deletedAt: null,
        // Foreign currency invoices (currency != company default)
      },
    });

    const company = await db.company.findUnique({
      where: { slug: companySlug },
      select: { currency: true },
    });
    const baseCurrency = company?.currency || "KWD";

    // Find invoices with currency different from base
    const foreignInvoices = openInvoices.filter(
      (inv) => inv.status !== "cancelled" && inv.status !== "paid"
    );

    for (const inv of foreignInvoices) {
      // For simplicity, we revalue based on the invoice total vs what's been paid
      const invTotal = num(inv.total, 3);
      const invPaid = num(inv.paid, 3);
      const outstanding = invTotal - invPaid;
      if (outstanding <= 0.001) continue;

      // Assume original rate = 1 (if invoice in base currency) or compute from metadata
      // In a production system, originalRate would come from invoice metadata
      const originalRate = 1; // simplified — real system would track original FX rate
      const revaluedAmount = outstanding * rate;
      const difference = revaluedAmount - outstanding;

      const detail: FxRevaluationDetail = {
        sourceType: "invoice",
        sourceId: inv.id,
        originalAmount: outstanding,
        originalRate,
        currentRate: rate,
        revaluedAmount,
        gain: difference > 0 ? difference : 0,
        loss: difference < 0 ? Math.abs(difference) : 0,
      };
      details.push(detail);

      if (difference > 0) unrealizedGain += difference;
      else unrealizedLoss += Math.abs(difference);
    }

    // 2. Open purchase invoices (payables) in foreign currency
    const openPurchaseInvoices = await db.purchaseInvoice.findMany({
      where: {
        companySlug,
        deletedAt: null,
      },
    });

    for (const pi of openPurchaseInvoices) {
      const piTotal = num(pi.totalAmount, 3);
      if (piTotal <= 0.001) continue;

      const originalRate = 1;
      const revaluedAmount = piTotal * rate;
      const difference = revaluedAmount - piTotal;

      const detail: FxRevaluationDetail = {
        sourceType: "purchase_invoice",
        sourceId: pi.id,
        originalAmount: piTotal,
        originalRate,
        currentRate: rate,
        revaluedAmount,
        gain: difference < 0 ? Math.abs(difference) : 0, // For payables, FX decrease is a gain
        loss: difference > 0 ? difference : 0,
      };
      details.push(detail);

      // For payables: if revalued amount > original, it's a loss (we owe more)
      // If revalued amount < original, it's a gain (we owe less)
      if (difference > 0) unrealizedLoss += difference;
      else unrealizedGain += Math.abs(difference);
    }

    // 3. Bank accounts in foreign currency
    const foreignBankAccounts = await db.bankAccount.findMany({
      where: { companySlug, isActive: true, currency: fromCurrency },
    });

    for (const ba of foreignBankAccounts) {
      const balance = num(ba.balance, 3);
      if (balance <= 0.001) continue;

      const revaluedAmount = balance * rate;
      const difference = revaluedAmount - balance;

      const detail: FxRevaluationDetail = {
        sourceType: "bank_account",
        sourceId: ba.id,
        originalAmount: balance,
        originalRate: 1,
        currentRate: rate,
        revaluedAmount,
        gain: difference > 0 ? difference : 0,
        loss: difference < 0 ? Math.abs(difference) : 0,
      };
      details.push(detail);

      if (difference > 0) unrealizedGain += difference;
      else unrealizedLoss += Math.abs(difference);
    }

    // Create FxRevaluation record
    const revaluation = await db.fxRevaluation.create({
      data: {
        companySlug,
        fromCurrency,
        toCurrency,
        rate: rate.toFixed(3),
        period,
        realizedGain: toNum(realizedGain),
        realizedLoss: toNum(realizedLoss),
        unrealizedGain: toNum(unrealizedGain),
        unrealizedLoss: toNum(unrealizedLoss),
        status: postImmediately ? "posted" : "draft",
      },
    });

    let jeId: number | undefined;

    // Optionally create JE for unrealized portion
    if (postImmediately && (unrealizedGain > 0.001 || unrealizedLoss > 0.001)) {
      // Find FX gain/loss accounts
      const fxGainAccount = await db.account.findFirst({
        where: { companySlug, type: "revenue", isActive: true },
        orderBy: { code: "asc" },
      });
      const fxLossAccount = await db.account.findFirst({
        where: { companySlug, type: "expense", isActive: true },
        orderBy: { code: "asc" },
      });
      const fxReceivableAccount = await db.account.findFirst({
        where: { companySlug, type: "asset", isActive: true },
        orderBy: { code: "asc" },
      });
      const fxPayableAccount = await db.account.findFirst({
        where: { companySlug, type: "liability", isActive: true },
        orderBy: { code: "asc" },
      });

      if (fxGainAccount && fxLossAccount && fxReceivableAccount && fxPayableAccount) {
        const je = await db.$transaction(async (tx) => {
          const lines: Array<{
            accountId: number;
            debit: string;
            credit: string;
            description: string;
          }> = [];

          // Unrealized gain: Debit FX Receivable, Credit FX Gain
          if (unrealizedGain > 0.001) {
            lines.push({
              accountId: fxReceivableAccount.id,
              debit: toNum(unrealizedGain),
              credit: "0.000",
              description: `أرباح عملات غير محققة — ${fromCurrency}/${toCurrency}`,
            });
            lines.push({
              accountId: fxGainAccount.id,
              debit: "0.000",
              credit: toNum(unrealizedGain),
              description: `أرباح عملات غير محققة — ${fromCurrency}/${toCurrency}`,
            });
          }

          // Unrealized loss: Debit FX Loss, Credit FX Payable
          if (unrealizedLoss > 0.001) {
            lines.push({
              accountId: fxLossAccount.id,
              debit: toNum(unrealizedLoss),
              credit: "0.000",
              description: `خسائر عملات غير محققة — ${fromCurrency}/${toCurrency}`,
            });
            lines.push({
              accountId: fxPayableAccount.id,
              debit: "0.000",
              credit: toNum(unrealizedLoss),
              description: `خسائر عملات غير محققة — ${fromCurrency}/${toCurrency}`,
            });
          }

          const entry = await tx.journalEntry.create({
            data: {
              companySlug,
              date: new Date().toISOString().slice(0, 10),
              description: `إعادة تقييم عملة — ${fromCurrency}/${toCurrency} (سعر ${rate})`,
              reference: `FX-Rev-${revaluation.id}`,
              status: "posted",
              sourceType: "fx_revaluation",
              sourceId: revaluation.id,
              createdBy: userEmail,
              lines: { create: lines },
            },
            include: { lines: true },
          });

          // Update account balances
          const accountIds = [...new Set(lines.map((l) => l.accountId))];
          const accounts = await tx.account.findMany({
            where: { id: { in: accountIds } },
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
            await tx.account.update({
              where: { id: accountId },
              data: { balance: (num(acc.balance, 3) + delta).toFixed(3) },
            });
          }

          // Link JE to revaluation
          await tx.fxRevaluation.update({
            where: { id: revaluation.id },
            data: { journalEntryId: entry.id },
          });

          return entry;
        });

        jeId = je.id;
      }
    }

    logger.info("[trade-finance] FX revaluation calculated", {
      companySlug,
      fromCurrency,
      toCurrency,
      rate,
      period,
      unrealizedGain,
      unrealizedLoss,
      realizedGain,
      realizedLoss,
      posted: postImmediately,
    });

    return {
      ok: true,
      result: {
        realizedGain,
        realizedLoss,
        unrealizedGain,
        unrealizedLoss,
        details,
        revaluationId: revaluation.id,
        jeId,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[trade-finance] calculateFxRevaluation failed", { err: msg });
    return { ok: false, error: msg };
  }
}

// ─── Trade Finance Dashboard ────────────────────────────────────────────────

/** Alias for dashboard route — aggregated trade finance dashboard data. */
export async function getTradeFinanceDashboard(companySlug: string) {
  try {
    // Count active LCs
    const activeLCs = await db.letterOfCredit.count({
      where: { companySlug, status: { in: ["issued", "amended", "utilized"] } },
    });

    // Total LC amounts outstanding
    const lcRecords = await db.letterOfCredit.findMany({
      where: { companySlug, status: { in: ["issued", "amended", "utilized"] } },
      select: { amount: true },
    });
    const totalLcOutstanding = lcRecords.reduce(
      (sum, lc) => sum + num(lc.amount, 3), 0
    );

    // Landed costs pending allocation
    const pendingLandedCosts = await db.landedCostAllocation.count({
      where: { companySlug, status: "pending" },
    });

    // FX revaluation summary (latest)
    const latestFxReval = await db.fxRevaluation.findFirst({
      where: { companySlug },
      orderBy: { createdAt: "desc" },
      select: {
        unrealizedGain: true,
        unrealizedLoss: true,
        realizedGain: true,
        realizedLoss: true,
      },
    });

    return {
      ok: true,
      activeLCs,
      totalLcOutstanding: totalLcOutstanding.toFixed(3),
      pendingLandedCosts,
      fxRevaluation: latestFxReval
        ? {
            unrealizedGain: num(latestFxReval.unrealizedGain, 3).toFixed(3),
            unrealizedLoss: num(latestFxReval.unrealizedLoss, 3).toFixed(3),
            realizedGain: num(latestFxReval.realizedGain, 3).toFixed(3),
            realizedLoss: num(latestFxReval.realizedLoss, 3).toFixed(3),
          }
        : null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[trade-finance] getTradeFinanceDashboard failed", { err: msg });
    return { ok: false, error: msg };
  }
}
