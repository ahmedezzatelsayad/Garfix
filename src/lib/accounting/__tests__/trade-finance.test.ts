/**
 * trade-finance.test.ts — Tests for Letters of Credit & FX Revaluation.
 *
 * Replicates pure logic from trade-finance.ts for testing without DB.
 * Tests: LC lifecycle states, FX revaluation gains/losses.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

type LCStatus = "issued" | "amended" | "utilized" | "expired" | "cancelled";

/**
 * Validate LC lifecycle transitions.
 * Valid transitions:
 *   issued → amended, utilized, expired, cancelled
 *   amended → amended, utilized, expired, cancelled
 *   utilized → nothing (terminal)
 *   expired → nothing (terminal)
 *   cancelled → nothing (terminal)
 */
function validateLCTransition(currentStatus: LCStatus, targetStatus: LCStatus): string | null {
  const terminalStates: LCStatus[] = ["utilized", "expired", "cancelled"];

  if (terminalStates.includes(currentStatus)) {
    return `لا يمكن تعديل اعتماد مستندي بحالة ${currentStatus}`;
  }

  if (currentStatus === "issued" || currentStatus === "amended") {
    if (targetStatus === "amended" || targetStatus === "utilized" || targetStatus === "expired" || targetStatus === "cancelled") {
      return null; // valid transition
    }
    return `Invalid transition from ${currentStatus} to ${targetStatus}`;
  }

  return `Invalid status: ${currentStatus}`;
}

/**
 * Calculate FX revaluation: realized and unrealized gains/losses.
 */
function calculateFxRevaluation(
  originalAmount: number,
  originalRate: number,
  currentRate: number,
  isRealized: boolean,
): { revaluedAmount: number; gainLoss: number; gainLossType: "gain" | "loss" | "none" } {
  const originalInBase = num(originalAmount * originalRate, 3);
  const currentInBase = num(originalAmount * currentRate, 3);
  const gainLoss = num(currentInBase - originalInBase, 3);

  let gainLossType: "gain" | "loss" | "none";
  if (gainLoss > 0) gainLossType = "gain";
  else if (gainLoss < 0) gainLossType = "loss";
  else gainLossType = "none";

  return {
    revaluedAmount: currentInBase,
    gainLoss,
    gainLossType,
  };
}

/**
 * Calculate LC utilization amount and remaining.
 */
function calculateLCUtilization(
  lcAmount: number,
  utilizationAmount: number,
): { remaining: number; isFullyUtilized: boolean } {
  const remaining = num(lcAmount - utilizationAmount, 3);
  const isFullyUtilized = remaining <= 0.001;
  return { remaining, isFullyUtilized };
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("trade-finance: LC lifecycle transitions", () => {
  test("issued → amended: valid", () => {
    const error = validateLCTransition("issued", "amended");
    expect(error).toBeNull();
  });

  test("issued → utilized: valid", () => {
    const error = validateLCTransition("issued", "utilized");
    expect(error).toBeNull();
  });

  test("issued → expired: valid", () => {
    const error = validateLCTransition("issued", "expired");
    expect(error).toBeNull();
  });

  test("issued → cancelled: valid", () => {
    const error = validateLCTransition("issued", "cancelled");
    expect(error).toBeNull();
  });

  test("amended → utilized: valid", () => {
    const error = validateLCTransition("amended", "utilized");
    expect(error).toBeNull();
  });

  test("amended → amended: valid (multiple amendments)", () => {
    const error = validateLCTransition("amended", "amended");
    expect(error).toBeNull();
  });

  test("utilized → amended: invalid (terminal state)", () => {
    const error = validateLCTransition("utilized", "amended");
    expect(error).not.toBeNull();
    expect(error).toContain("utilized");
  });

  test("expired → amended: invalid (terminal state)", () => {
    const error = validateLCTransition("expired", "amended");
    expect(error).not.toBeNull();
    expect(error).toContain("expired");
  });

  test("cancelled → issued: invalid (terminal state)", () => {
    const error = validateLCTransition("cancelled", "issued");
    expect(error).not.toBeNull();
    expect(error).toContain("cancelled");
  });
});

describe("trade-finance: FX revaluation", () => {
  test("Currency appreciation → unrealized gain", () => {
    // Original: 10000 USD at rate 0.30 KWD/USD = 3000 KWD
    // Current: 10000 USD at rate 0.32 KWD/USD = 3200 KWD
    // Gain = 3200 - 3000 = 200
    const result = calculateFxRevaluation(10000, 0.30, 0.32, false);
    expect(result.revaluedAmount).toBe(3200);
    expect(result.gainLoss).toBe(200);
    expect(result.gainLossType).toBe("gain");
  });

  test("Currency depreciation → unrealized loss", () => {
    // Original: 10000 USD at rate 0.30 KWD/USD = 3000 KWD
    // Current: 10000 USD at rate 0.28 KWD/USD = 2800 KWD
    // Loss = 2800 - 3000 = -200
    const result = calculateFxRevaluation(10000, 0.30, 0.28, false);
    expect(result.revaluedAmount).toBe(2800);
    expect(result.gainLoss).toBe(-200);
    expect(result.gainLossType).toBe("loss");
  });

  test("No rate change → no gain or loss", () => {
    const result = calculateFxRevaluation(10000, 0.30, 0.30, false);
    expect(result.gainLoss).toBe(0);
    expect(result.gainLossType).toBe("none");
  });

  test("SAR to KWD revaluation with gain", () => {
    // Original: 50000 SAR at rate 0.081 KWD/SAR = 4050 KWD
    // Current: 50000 SAR at rate 0.083 KWD/SAR = 4150 KWD
    const result = calculateFxRevaluation(50000, 0.081, 0.083, true);
    expect(result.gainLoss).toBe(100);
    expect(result.gainLossType).toBe("gain");
  });

  test("Zero original amount → no gain/loss", () => {
    const result = calculateFxRevaluation(0, 0.30, 0.32, false);
    expect(result.gainLoss).toBe(0);
    expect(result.gainLossType).toBe("none");
  });
});

describe("trade-finance: LC utilization", () => {
  test("Partial utilization: remaining amount > 0", () => {
    const result = calculateLCUtilization(10000, 5000);
    expect(result.remaining).toBe(5000);
    expect(result.isFullyUtilized).toBe(false);
  });

  test("Full utilization: remaining ≤ 0", () => {
    const result = calculateLCUtilization(10000, 10000);
    expect(result.remaining).toBe(0);
    expect(result.isFullyUtilized).toBe(true);
  });

  test("Over-utilization: utilization > LC amount", () => {
    const result = calculateLCUtilization(10000, 12000);
    expect(result.remaining).toBe(-2000);
    expect(result.isFullyUtilized).toBe(true);
  });

  test("Zero utilization: remaining = full LC amount", () => {
    const result = calculateLCUtilization(10000, 0);
    expect(result.remaining).toBe(10000);
    expect(result.isFullyUtilized).toBe(false);
  });
});
