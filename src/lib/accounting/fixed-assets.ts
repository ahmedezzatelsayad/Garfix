/**
 * fixed-assets.ts — Fixed asset depreciation engine and disposal logic.
 *
 * Phase 5 of the GarfiX ERP accounting module.
 * All monetary values as String (no Float), using num() from money.ts.
 */
import { db } from "@/lib/db";
import { num, subNums, addNums, mulNums } from "@/lib/money";

// ────────────────────────────────────────────────────────────────────────────
// Depreciation Calculation
// ────────────────────────────────────────────────────────────────────────────

export interface DepreciationResult {
  annualDepreciation: string;
  monthlyDepreciation: string;
  newBookValue: string;
  newAccumulatedDepreciation: string;
  method: string;
  formula: string;
}

interface AssetData {
  acquisitionCost: string;
  salvageValue: string;
  usefulLifeYears: number;
  currentBookValue: string;
  accumulatedDepreciation: string;
  depreciationMethod: string; // straight_line | declining_balance
  decliningRate: string;
}

/**
 * Calculate depreciation for a fixed asset.
 *
 * - Straight-line: (cost - salvage) / usefulLifeYears
 * - Declining balance: bookValue * decliningRate / 100
 * - Returns: annual, monthly, new book value, new accumulated depreciation
 */
export function calculateDepreciation(asset: AssetData): DepreciationResult {
  const cost = num(asset.acquisitionCost, 3);
  const salvage = num(asset.salvageValue, 3);
  const usefulLife = asset.usefulLifeYears;
  const bookValue = num(asset.currentBookValue, 3);
  const accumulated = num(asset.accumulatedDepreciation, 3);
  const method = asset.depreciationMethod;

  if (usefulLife <= 0) throw new Error("Useful life years must be positive");

  let annualDepreciation: number;
  let formula: string;

  if (method === "straight_line") {
    // Straight-line: (cost - salvage) / usefulLife
    annualDepreciation = num((cost - salvage) / usefulLife, 3);
    formula = `الإهلاك الخطي: (${cost.toFixed(3)} - ${salvage.toFixed(3)}) / ${usefulLife} = ${annualDepreciation.toFixed(3)}`;
  } else if (method === "declining_balance") {
    // Declining balance: bookValue * decliningRate / 100
    const decliningRate = num(asset.decliningRate, 3);
    if (decliningRate <= 0) throw new Error("Declining rate must be positive for declining balance method");
    annualDepreciation = num(bookValue * decliningRate / 100, 3);

    // Ensure book value doesn't go below salvage value
    const newBookValue = num(bookValue - annualDepreciation, 3);
    if (newBookValue < salvage) {
      annualDepreciation = num(bookValue - salvage, 3);
    }

    formula = `إهلاك متناقص: ${bookValue.toFixed(3)} × ${decliningRate}% / 100 = ${annualDepreciation.toFixed(3)}`;
  } else {
    throw new Error(`Unknown depreciation method: ${method}`);
  }

  // Ensure annual depreciation doesn't exceed remaining book value minus salvage
  const remaining = num(bookValue - salvage, 3);
  if (annualDepreciation > remaining) {
    annualDepreciation = remaining;
  }

  // Don't depreciate if already fully depreciated (book value <= salvage)
  if (bookValue <= salvage) {
    annualDepreciation = 0;
  }

  const monthlyDepreciation = num(annualDepreciation / 12, 3);
  const newBookValue = num(bookValue - annualDepreciation, 3);
  const newAccumulatedDepreciation = num(accumulated + annualDepreciation, 3);

  return {
    annualDepreciation: annualDepreciation.toFixed(3),
    monthlyDepreciation: monthlyDepreciation.toFixed(3),
    newBookValue: newBookValue.toFixed(3),
    newAccumulatedDepreciation: newAccumulatedDepreciation.toFixed(3),
    method,
    formula,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Period Depreciation Run
// ────────────────────────────────────────────────────────────────────────────

export interface PeriodDepreciationResult {
  assetId: number;
  assetName: string;
  period: string;
  depreciationAmount: string;
  bookValueAfter: string;
  accumulatedAfter: string;
  method: string;
  status: string; // draft or posted
  journalEntryId?: number;
}

/**
 * Run depreciation for all active fixed assets for a given period.
 *
 * Steps:
 * 1. Get all active fixed assets for the company
 * 2. Calculate depreciation for each for the period
 * 3. Create DepreciationEntry records (draft)
 * 4. Optionally post them (create JEs)
 * 5. Returns: list of depreciation calculations
 */
export async function runDepreciationForPeriod(
  companySlug: string,
  period: string, // YYYY-MM
  postImmediately: boolean = false,
  createdBy: string = "system",
): Promise<PeriodDepreciationResult[]> {
  // 1. Get all active fixed assets
  const assets = await db.fixedAsset.findMany({
    where: {
      companySlug,
      isActive: true,
    },
  });

  if (assets.length === 0) return [];

  const results: PeriodDepreciationResult[] = [];

  for (const asset of assets) {
    // Check if depreciation already exists for this period
    const existingEntry = await db.depreciationEntry.findUnique({
      where: {
        assetId_period: { assetId: asset.id, period },
      },
    });

    if (existingEntry) {
      // Skip if already exists
      results.push({
        assetId: asset.id,
        assetName: asset.nameAr,
        period,
        depreciationAmount: existingEntry.depreciationAmount,
        bookValueAfter: existingEntry.bookValueAfter,
        accumulatedAfter: asset.accumulatedDepreciation,
        method: asset.depreciationMethod,
        status: existingEntry.status,
        journalEntryId: existingEntry.journalEntryId ?? undefined,
      });
      continue;
    }

    // 2. Calculate depreciation
    const depreciation = calculateDepreciation({
      acquisitionCost: asset.acquisitionCost,
      salvageValue: asset.salvageValue,
      usefulLifeYears: asset.usefulLifeYears,
      currentBookValue: asset.currentBookValue,
      accumulatedDepreciation: asset.accumulatedDepreciation,
      depreciationMethod: asset.depreciationMethod,
      decliningRate: asset.decliningRate,
    });

    // Use monthly depreciation for a monthly period
    const monthlyAmount = depreciation.monthlyDepreciation;

    // 3. Create DepreciationEntry record (draft)
    const entry = await db.depreciationEntry.create({
      data: {
        companySlug,
        assetId: asset.id,
        period,
        depreciationAmount: monthlyAmount,
        bookValueAfter: depreciation.newBookValue,
        status: "draft",
      },
    });

    let journalEntryId: number | undefined;

    // 4. Optionally post (create JE)
    if (postImmediately && num(monthlyAmount, 3) > 0) {
      const je = await db.$transaction(async (tx) => {
        // Create JE: Debit depreciation expense, Credit accumulated depreciation
        const journalEntry = await tx.journalEntry.create({
          data: {
            companySlug,
            date: `${period}-01`, // first day of the month
            description: `Monthly depreciation: ${asset.nameAr} (${period})`,
            reference: `DEP-${asset.id}-${period}`,
            currency: "KWD",
            status: "posted",
            createdBy,
            sourceType: "depreciation",
            sourceId: entry.id,
            lines: {
              create: [
                {
                  accountId: asset.expenseAccountId ?? 0,
                  debit: monthlyAmount,
                  credit: "0.000",
                  description: `Depreciation expense: ${asset.nameAr}`,
                },
                {
                  accountId: asset.depreciationAccountId ?? 0,
                  debit: "0.000",
                  credit: monthlyAmount,
                  description: `Accumulated depreciation: ${asset.nameAr}`,
                },
              ],
            },
          },
          include: { lines: true },
        });

        // Update asset book values
        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            currentBookValue: depreciation.newBookValue,
            accumulatedDepreciation: depreciation.newAccumulatedDepreciation,
          },
        });

        // Update depreciation entry status
        await tx.depreciationEntry.update({
          where: { id: entry.id },
          data: {
            status: "posted",
            journalEntryId: journalEntry.id,
          },
        });

        // Update GL account balances
        if (asset.expenseAccountId) {
          const expenseAccount = await tx.account.findUnique({
            where: { id: asset.expenseAccountId },
          });
          if (expenseAccount) {
            await tx.account.update({
              where: { id: asset.expenseAccountId },
              data: { balance: addNums(expenseAccount.balance, monthlyAmount) },
            });
          }
        }

        if (asset.depreciationAccountId) {
          const depAccount = await tx.account.findUnique({
            where: { id: asset.depreciationAccountId },
          });
          if (depAccount) {
            // Contra-asset: credit increases it
            await tx.account.update({
              where: { id: asset.depreciationAccountId },
              data: { balance: addNums(depAccount.balance, monthlyAmount) },
            });
          }
        }

        return journalEntry;
      });

      journalEntryId = je.id;
    }

    results.push({
      assetId: asset.id,
      assetName: asset.nameAr,
      period,
      depreciationAmount: monthlyAmount,
      bookValueAfter: depreciation.newBookValue,
      accumulatedAfter: depreciation.newAccumulatedDepreciation,
      method: asset.depreciationMethod,
      status: postImmediately ? "posted" : "draft",
      journalEntryId,
    });
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Asset Disposal
// ────────────────────────────────────────────────────────────────────────────

export interface DisposalResult {
  assetId: number;
  assetName: string;
  disposalType: string;
  disposalAmount: string;
  disposalDate: string;
  originalCost: string;
  accumulatedDepreciation: string;
  bookValueAtDisposal: string;
  gainLossAmount: string;
  gainLossType: "gain" | "loss" | "none";
  journalEntryId: number;
  summary: string;
}

/**
 * Dispose a fixed asset.
 *
 * Steps:
 * 1. Mark asset as inactive with disposal info
 * 2. Create final depreciation entry (if partial period)
 * 3. Create disposal JE:
 *    - Debit: Cash/Bank (disposal proceeds if sold)
 *    - Debit: Accumulated Depreciation (full amount)
 *    - Credit: Fixed Asset (original cost)
 *    - Debit/Credit: Gain/Loss on Disposal (difference)
 * 4. Returns: disposal summary with gain/loss amount
 */
export async function disposeAsset(
  companySlug: string,
  assetId: number,
  disposalType: string, // sold/scrapped/donated
  disposalAmount: string, // proceeds from sale (0 for scrapped/donated)
  disposalDate: string, // YYYY-MM-DD
  createdBy: string = "system",
): Promise<DisposalResult> {
  const asset = await db.fixedAsset.findUnique({
    where: { id: assetId },
  });

  if (!asset) throw new Error("Fixed asset not found");
  if (asset.companySlug !== companySlug) throw new Error("Asset does not belong to this company");
  if (!asset.isActive) throw new Error("Asset is already disposed or inactive");

  const cost = num(asset.acquisitionCost, 3);
  const accumulated = num(asset.accumulatedDepreciation, 3);
  const bookValue = num(asset.currentBookValue, 3);
  const proceeds = num(disposalAmount, 3);

  // Calculate gain/loss
  const gainLoss = num(proceeds - bookValue, 3);
  let gainLossType: "gain" | "loss" | "none";
  if (gainLoss > 0) gainLossType = "gain";
  else if (gainLoss < 0) gainLossType = "loss";
  else gainLossType = "none";

  // Wrap in a transaction
  const result = await db.$transaction(async (tx) => {
    // 1. Mark asset as inactive with disposal info
    await tx.fixedAsset.update({
      where: { id: assetId },
      data: {
        isActive: false,
        disposalDate,
        disposalType,
        disposalAmount: proceeds.toFixed(3),
        currentBookValue: "0.000", // zeroed out
        accumulatedDepreciation: accumulated.toFixed(3),
      },
    });

    // 2. Create final depreciation entry (if partial period — for simplicity, we assume
    //    the current accumulated depreciation is up to date, no partial period adjustment)

    // 3. Create disposal JE
    //    Debit: Accumulated Depreciation (full amount)
    //    Debit: Cash/Bank (proceeds) — if sold
    //    Credit: Fixed Asset (original cost)
    //    Debit/Credit: Gain/Loss on Disposal (difference)

    const lines: Array<{
      accountId: number;
      debit: string;
      credit: string;
      description: string;
    }> = [];

    // Debit: Accumulated Depreciation (remove the contra-asset)
    if (asset.depreciationAccountId) {
      lines.push({
        accountId: asset.depreciationAccountId,
        debit: accumulated.toFixed(3),
        credit: "0.000",
        description: `Remove accumulated depreciation for disposed asset: ${asset.nameAr}`,
      });
    }

    // Credit: Fixed Asset (remove the asset from books)
    if (asset.glAccountId) {
      lines.push({
        accountId: asset.glAccountId,
        debit: "0.000",
        credit: cost.toFixed(3),
        description: `Remove disposed asset from books: ${asset.nameAr}`,
      });
    }

    // Debit: Cash/Bank (proceeds) — only if sold and has proceeds
    if (proceeds > 0) {
      // Find a bank account or cash GL account for the company
      const bankAccount = await tx.bankAccount.findFirst({
        where: { companySlug, isActive: true, currency: "KWD" },
      });
      if (bankAccount?.glAccountId) {
        lines.push({
          accountId: bankAccount.glAccountId,
          debit: proceeds.toFixed(3),
          credit: "0.000",
          description: `Proceeds from asset disposal: ${asset.nameAr}`,
        });
      }
    }

    // Gain/Loss on Disposal
    if (gainLoss !== 0) {
      // For gain: Credit gain account
      // For loss: Debit loss account
      // We need to find or create a gain/loss on disposal account
      const gainLossAccount = await tx.account.findFirst({
        where: {
          companySlug,
          type: gainLoss > 0 ? "revenue" : "expense",
          code: gainLoss > 0 ? "5900" : "6900", // typical disposal gain/loss codes
        },
      });

      if (gainLossAccount) {
        if (gainLoss > 0) {
          // Gain on disposal — credit
          lines.push({
            accountId: gainLossAccount.id,
            debit: "0.000",
            credit: num(gainLoss, 3).toFixed(3),
            description: `Gain on disposal of asset: ${asset.nameAr}`,
          });
        } else {
          // Loss on disposal — debit
          lines.push({
            accountId: gainLossAccount.id,
            debit: num(Math.abs(gainLoss), 3).toFixed(3),
            credit: "0.000",
            description: `Loss on disposal of asset: ${asset.nameAr}`,
          });
        }
      }
    }

    const je = await tx.journalEntry.create({
      data: {
        companySlug,
        date: disposalDate,
        description: `Asset disposal: ${asset.nameAr} (${disposalType})`,
        reference: `DISP-${assetId}-${disposalDate}`,
        currency: "KWD",
        status: "posted",
        createdBy,
        sourceType: "asset_disposal",
        sourceId: assetId,
        lines: {
          create: lines,
        },
      },
      include: { lines: true },
    });

    // Update GL account balances for the JE
    for (const line of lines) {
      const account = await tx.account.findUnique({
        where: { id: line.accountId },
      });
      if (!account) continue;

      const isDebitNormal = account.type === "asset" || account.type === "expense";
      const delta = isDebitNormal
        ? num(line.debit, 3) - num(line.credit, 3)
        : num(line.credit, 3) - num(line.debit, 3);
      const currentBalance = num(account.balance, 3);

      await tx.account.update({
        where: { id: line.accountId },
        data: { balance: (currentBalance + delta).toFixed(3) },
      });
    }

    // If proceeds were deposited to a bank account, update bank account balance
    if (proceeds > 0) {
      const bankAccount = await tx.bankAccount.findFirst({
        where: { companySlug, isActive: true, currency: "KWD" },
      });
      if (bankAccount) {
        await tx.bankAccount.update({
          where: { id: bankAccount.id },
          data: { balance: addNums(bankAccount.balance, proceeds.toFixed(3)) },
        });
      }
    }

    return je;
  });

  const summary = gainLossType === "gain"
    ? `Asset disposed (${disposalType}). Gain of ${num(gainLoss, 3).toFixed(3)} recognized.`
    : gainLossType === "loss"
    ? `Asset disposed (${disposalType}). Loss of ${num(Math.abs(gainLoss), 3).toFixed(3)} recognized.`
    : `Asset disposed (${disposalType}). No gain or loss.`;

  return {
    assetId,
    assetName: asset.nameAr,
    disposalType,
    disposalAmount: proceeds.toFixed(3),
    disposalDate,
    originalCost: cost.toFixed(3),
    accumulatedDepreciation: accumulated.toFixed(3),
    bookValueAtDisposal: bookValue.toFixed(3),
    gainLossAmount: num(gainLoss, 3).toFixed(3),
    gainLossType,
    journalEntryId: result.id,
    summary,
  };
}
