/**
 * fixed-assets.test.ts — Tests for fixed asset depreciation and disposal.
 *
 * Pure function tests (no DB needed) for calculateDepreciation.
 * Tests: straight-line, declining balance, edge cases, disposal gain/loss.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic from fixed-assets.ts ──────────────────────────────────

interface AssetData {
  acquisitionCost: string;
  salvageValue: string;
  usefulLifeYears: number;
  currentBookValue: string;
  accumulatedDepreciation: string;
  depreciationMethod: string;
  decliningRate: string;
}

function calculateDepreciation(asset: AssetData): {
  annualDepreciation: string;
  monthlyDepreciation: string;
  newBookValue: string;
  newAccumulatedDepreciation: string;
} {
  const cost = num(asset.acquisitionCost, 3);
  const salvage = num(asset.salvageValue, 3);
  const usefulLife = asset.usefulLifeYears;
  const bookValue = num(asset.currentBookValue, 3);
  const accumulated = num(asset.accumulatedDepreciation, 3);
  const method = asset.depreciationMethod;

  if (usefulLife <= 0) throw new Error("Useful life years must be positive");

  let annualDepreciation: number;

  if (method === "straight_line") {
    annualDepreciation = num((cost - salvage) / usefulLife, 3);
  } else if (method === "declining_balance") {
    const decliningRate = num(asset.decliningRate, 3);
    if (decliningRate <= 0) throw new Error("Declining rate must be positive for declining balance method");
    annualDepreciation = num(bookValue * decliningRate / 100, 3);
    const newBV = num(bookValue - annualDepreciation, 3);
    if (newBV < salvage) {
      annualDepreciation = num(bookValue - salvage, 3);
    }
  } else {
    throw new Error(`Unknown depreciation method: ${method}`);
  }

  // Ensure annual depreciation doesn't exceed remaining book value minus salvage
  const remaining = num(bookValue - salvage, 3);
  if (annualDepreciation > remaining) annualDepreciation = remaining;

  // Don't depreciate if already fully depreciated
  if (bookValue <= salvage) annualDepreciation = 0;

  const monthlyDepreciation = num(annualDepreciation / 12, 3);
  const newBookValue = num(bookValue - annualDepreciation, 3);
  const newAccumulatedDepreciation = num(accumulated + annualDepreciation, 3);

  return {
    annualDepreciation: annualDepreciation.toFixed(3),
    monthlyDepreciation: monthlyDepreciation.toFixed(3),
    newBookValue: newBookValue.toFixed(3),
    newAccumulatedDepreciation: newAccumulatedDepreciation.toFixed(3),
  };
}

// Disposal gain/loss calculation (replicated from source)
function calculateDisposalGainLoss(
  disposalAmount: number,
  currentBookValue: number,
): { gainLoss: number; gainLossType: "gain" | "loss" | "none" } {
  const gainLoss = num(disposalAmount - currentBookValue, 3);
  let gainLossType: "gain" | "loss" | "none";
  if (gainLoss > 0) gainLossType = "gain";
  else if (gainLoss < 0) gainLossType = "loss";
  else gainLossType = "none";
  return { gainLoss, gainLossType };
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("fixed-assets: calculateDepreciation (straight-line)", () => {
  test("Basic straight-line: cost=10000, salvage=1000, life=5 years", () => {
    const asset: AssetData = {
      acquisitionCost: "10000.000",
      salvageValue: "1000.000",
      usefulLifeYears: 5,
      currentBookValue: "10000.000",
      accumulatedDepreciation: "0.000",
      depreciationMethod: "straight_line",
      decliningRate: "0",
    };
    const result = calculateDepreciation(asset);
    // Annual = (10000 - 1000) / 5 = 1800
    expect(result.annualDepreciation).toBe("1800.000");
    // Monthly = 1800 / 12 = 150
    expect(result.monthlyDepreciation).toBe("150.000");
    // New book value = 10000 - 1800 = 8200
    expect(result.newBookValue).toBe("8200.000");
    // New accumulated = 0 + 1800 = 1800
    expect(result.newAccumulatedDepreciation).toBe("1800.000");
  });

  test("Straight-line: cost=5000, salvage=0, life=10 years", () => {
    const asset: AssetData = {
      acquisitionCost: "5000.000",
      salvageValue: "0.000",
      usefulLifeYears: 10,
      currentBookValue: "5000.000",
      accumulatedDepreciation: "0.000",
      depreciationMethod: "straight_line",
      decliningRate: "0",
    };
    const result = calculateDepreciation(asset);
    // Annual = (5000 - 0) / 10 = 500
    expect(result.annualDepreciation).toBe("500.000");
    expect(result.monthlyDepreciation).toBe("41.667");
  });

  test("Straight-line: salvage = cost → no depreciation", () => {
    const asset: AssetData = {
      acquisitionCost: "5000.000",
      salvageValue: "5000.000",
      usefulLifeYears: 10,
      currentBookValue: "5000.000",
      accumulatedDepreciation: "0.000",
      depreciationMethod: "straight_line",
      decliningRate: "0",
    };
    const result = calculateDepreciation(asset);
    expect(result.annualDepreciation).toBe("0.000");
    expect(result.newBookValue).toBe("5000.000");
  });
});

describe("fixed-assets: calculateDepreciation (declining balance)", () => {
  test("Declining balance: bookValue=10000, rate=20%", () => {
    const asset: AssetData = {
      acquisitionCost: "10000.000",
      salvageValue: "1000.000",
      usefulLifeYears: 5,
      currentBookValue: "10000.000",
      accumulatedDepreciation: "0.000",
      depreciationMethod: "declining_balance",
      decliningRate: "20",
    };
    const result = calculateDepreciation(asset);
    // Annual = 10000 × 20% = 2000
    expect(result.annualDepreciation).toBe("2000.000");
    expect(result.newBookValue).toBe("8000.000");
  });

  test("Declining balance: ensures book value doesn't go below salvage", () => {
    // Book value = 1100, salvage = 1000, rate = 40%
    // 1100 * 40% = 440 → new book value = 660 < 1000 (salvage)
    // So depreciation = 1100 - 1000 = 100
    const asset: AssetData = {
      acquisitionCost: "10000.000",
      salvageValue: "1000.000",
      usefulLifeYears: 5,
      currentBookValue: "1100.000",
      accumulatedDepreciation: "8900.000",
      depreciationMethod: "declining_balance",
      decliningRate: "40",
    };
    const result = calculateDepreciation(asset);
    expect(result.annualDepreciation).toBe("100.000");
    expect(result.newBookValue).toBe("1000.000");
  });

  test("Declining balance: zero rate throws error", () => {
    const asset: AssetData = {
      acquisitionCost: "10000.000",
      salvageValue: "1000.000",
      usefulLifeYears: 5,
      currentBookValue: "10000.000",
      accumulatedDepreciation: "0.000",
      depreciationMethod: "declining_balance",
      decliningRate: "0",
    };
    expect(() => calculateDepreciation(asset)).toThrow("Declining rate must be positive");
  });
});

describe("fixed-assets: edge cases", () => {
  test("Useful life = 0 throws error", () => {
    const asset: AssetData = {
      acquisitionCost: "10000.000",
      salvageValue: "0.000",
      usefulLifeYears: 0,
      currentBookValue: "10000.000",
      accumulatedDepreciation: "0.000",
      depreciationMethod: "straight_line",
      decliningRate: "0",
    };
    expect(() => calculateDepreciation(asset)).toThrow("Useful life years must be positive");
  });

  test("Unknown method throws error", () => {
    const asset: AssetData = {
      acquisitionCost: "10000.000",
      salvageValue: "0.000",
      usefulLifeYears: 5,
      currentBookValue: "10000.000",
      accumulatedDepreciation: "0.000",
      depreciationMethod: "unknown_method",
      decliningRate: "0",
    };
    expect(() => calculateDepreciation(asset)).toThrow("Unknown depreciation method");
  });

  test("Already fully depreciated (bookValue ≤ salvage) → depreciation = 0", () => {
    const asset: AssetData = {
      acquisitionCost: "10000.000",
      salvageValue: "1000.000",
      usefulLifeYears: 5,
      currentBookValue: "1000.000",
      accumulatedDepreciation: "9000.000",
      depreciationMethod: "straight_line",
      decliningRate: "0",
    };
    const result = calculateDepreciation(asset);
    expect(result.annualDepreciation).toBe("0.000");
    expect(result.newBookValue).toBe("1000.000");
  });
});

describe("fixed-assets: disposal gain/loss", () => {
  test("Disposal at book value → no gain or loss", () => {
    const result = calculateDisposalGainLoss(5000, 5000);
    expect(result.gainLossType).toBe("none");
    expect(result.gainLoss).toBe(0);
  });

  test("Disposal above book value → gain", () => {
    const result = calculateDisposalGainLoss(6000, 5000);
    expect(result.gainLossType).toBe("gain");
    expect(result.gainLoss).toBe(1000);
  });

  test("Disposal below book value → loss", () => {
    const result = calculateDisposalGainLoss(3000, 5000);
    expect(result.gainLossType).toBe("loss");
    expect(result.gainLoss).toBe(-2000);
  });

  test("Scrapped asset (disposal=0) → loss equal to book value", () => {
    const result = calculateDisposalGainLoss(0, 5000);
    expect(result.gainLossType).toBe("loss");
    expect(result.gainLoss).toBe(-5000);
  });
});
