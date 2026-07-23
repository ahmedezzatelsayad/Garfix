/**
 * inventory-costing.test.ts — Tests for COGS & Inventory Valuation.
 *
 * Replicates pure logic from inventory-costing.ts for testing without DB.
 * Tests: FIFO costing, weighted average costing, standard cost, landed cost allocation.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

interface MovementLike {
  qty: string;
  unitCost?: string | null;
}

/**
 * FIFO costing: consume earliest purchase costs first.
 */
function calculateFIFO(
  movements: MovementLike[],
  qtySold: number,
): { cogsPerUnit: number; totalCOGS: number; remainingQty: number; remainingValue: number } {
  let remainingQty = qtySold;
  let totalCOGS = 0;
  let remainingOnHand = 0;
  let remainingOnHandValue = 0;

  for (const m of movements) {
    const layerQty = num(m.qty, 3);
    const layerCost = num(m.unitCost, 3);
    if (remainingQty > 0 && layerQty > 0) {
      const consumed = Math.min(remainingQty, layerQty);
      totalCOGS += consumed * layerCost;
      remainingQty -= consumed;
      const layerRemainder = layerQty - consumed;
      remainingOnHand += layerRemainder;
      remainingOnHandValue += layerRemainder * layerCost;
    } else {
      remainingOnHand += layerQty;
      remainingOnHandValue += layerQty * layerCost;
    }
  }

  const cogsPerUnit = qtySold > 0 ? totalCOGS / qtySold : 0;
  return { cogsPerUnit, totalCOGS, remainingQty: remainingOnHand, remainingValue: remainingOnHandValue };
}

/**
 * Weighted average costing: total cost / total quantity on hand.
 */
function calculateWeightedAverage(
  movements: MovementLike[],
  qtySold: number,
): { cogsPerUnit: number; totalCOGS: number; remainingQty: number; remainingValue: number } {
  let totalQty = 0;
  let totalValue = 0;

  for (const m of movements) {
    const layerQty = num(m.qty, 3);
    const layerCost = num(m.unitCost, 3);
    totalQty += layerQty;
    totalValue += layerQty * layerCost;
  }

  const avgUnitCost = totalQty > 0 ? totalValue / totalQty : 0;
  const totalCOGS = qtySold * avgUnitCost;
  const remainingOnHand = totalQty - qtySold;
  const remainingOnHandValue = remainingOnHand * avgUnitCost;

  return { cogsPerUnit: avgUnitCost, totalCOGS, remainingQty: remainingOnHand, remainingValue: remainingOnHandValue };
}

/**
 * Standard cost: use a predefined standard cost per unit.
 */
function calculateStandardCost(
  standardCost: number,
  qtySold: number,
  onHandQty: number,
): { cogsPerUnit: number; totalCOGS: number; remainingQty: number; remainingValue: number } {
  const totalCOGS = qtySold * standardCost;
  const remainingOnHand = onHandQty - qtySold;
  const remainingOnHandValue = remainingOnHand * standardCost;
  return { cogsPerUnit: standardCost, totalCOGS, remainingQty: remainingOnHand, remainingValue: remainingOnHandValue };
}

/**
 * Landed cost allocation by quantity.
 */
function allocateLandedCostByQuantity(
  totalCost: number,
  lines: Array<{ itemId?: number; quantity: number }>,
): Array<{ itemId?: number; allocatedCost: number; newUnitCost: number }> {
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  if (totalQty <= 0) throw new Error("Total base for allocation is zero");

  return lines.map((line) => {
    const proportion = line.quantity / totalQty;
    const allocatedCost = totalCost * proportion;
    const costPerUnit = allocatedCost / line.quantity;
    return { itemId: line.itemId, allocatedCost: num(allocatedCost, 3), newUnitCost: num(costPerUnit, 3) };
  });
}

/**
 * Landed cost allocation by value.
 */
function allocateLandedCostByValue(
  totalCost: number,
  lines: Array<{ itemId?: number; value: number; quantity: number }>,
): Array<{ itemId?: number; allocatedCost: number; newUnitCost: number }> {
  const totalValue = lines.reduce((s, l) => s + l.value, 0);
  if (totalValue <= 0) throw new Error("Total base for allocation is zero");

  return lines.map((line) => {
    const proportion = line.value / totalValue;
    const allocatedCost = totalCost * proportion;
    const costPerUnit = line.quantity > 0 ? allocatedCost / line.quantity : 0;
    return { itemId: line.itemId, allocatedCost: num(allocatedCost, 3), newUnitCost: num(costPerUnit, 3) };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("inventory-costing: FIFO", () => {
  test("Simple FIFO: 3 layers, sell 100 units", () => {
    // Layer 1: 50 units at $10, Layer 2: 100 units at $12, Layer 3: 50 units at $15
    const movements: MovementLike[] = [
      { qty: "50.000", unitCost: "10.000" },
      { qty: "100.000", unitCost: "12.000" },
      { qty: "50.000", unitCost: "15.000" },
    ];
    const result = calculateFIFO(movements, 100);
    // COGS: 50×10 + 50×12 = 500 + 600 = 1100
    expect(result.totalCOGS).toBe(1100);
    expect(result.cogsPerUnit).toBe(11);
    // Remaining: 50×12 + 50×15 = 600 + 750 = 1350, qty = 100
    expect(result.remainingQty).toBe(100);
    expect(result.remainingValue).toBe(1350);
  });

  test("FIFO: sell all inventory → remaining = 0", () => {
    const movements: MovementLike[] = [
      { qty: "100.000", unitCost: "10.000" },
    ];
    const result = calculateFIFO(movements, 100);
    expect(result.totalCOGS).toBe(1000);
    expect(result.remainingQty).toBe(0);
    expect(result.remainingValue).toBe(0);
  });

  test("FIFO: sell more than available → remaining = 0, COGS from available layers", () => {
    const movements: MovementLike[] = [
      { qty: "50.000", unitCost: "10.000" },
    ];
    const result = calculateFIFO(movements, 100);
    // Only 50 units available → COGS = 500, remaining = 0
    expect(result.totalCOGS).toBe(500);
    expect(result.remainingQty).toBe(0);
  });

  test("FIFO: single layer", () => {
    const movements: MovementLike[] = [
      { qty: "200.000", unitCost: "5.000" },
    ];
    const result = calculateFIFO(movements, 50);
    expect(result.totalCOGS).toBe(250); // 50 × 5
    expect(result.cogsPerUnit).toBe(5);
    expect(result.remainingQty).toBe(150);
    expect(result.remainingValue).toBe(750);
  });
});

describe("inventory-costing: Weighted Average", () => {
  test("Weighted average: 3 layers, sell 100 units", () => {
    const movements: MovementLike[] = [
      { qty: "50.000", unitCost: "10.000" },
      { qty: "100.000", unitCost: "12.000" },
      { qty: "50.000", unitCost: "15.000" },
    ];
    const result = calculateWeightedAverage(movements, 100);
    // Total qty = 200, total value = 500 + 1200 + 750 = 2450
    // Avg cost = 2450 / 200 = 12.25
    expect(result.cogsPerUnit).toBe(12.25);
    expect(result.totalCOGS).toBe(1225); // 100 × 12.25
    expect(result.remainingQty).toBe(100);
    expect(result.remainingValue).toBe(1225);
  });

  test("Weighted average: single layer", () => {
    const movements: MovementLike[] = [
      { qty: "100.000", unitCost: "10.000" },
    ];
    const result = calculateWeightedAverage(movements, 50);
    expect(result.cogsPerUnit).toBe(10);
    expect(result.totalCOGS).toBe(500);
    expect(result.remainingQty).toBe(50);
    expect(result.remainingValue).toBe(500);
  });

  test("Weighted average: no inventory → avg = 0, COGS = 0", () => {
    const movements: MovementLike[] = [];
    const result = calculateWeightedAverage(movements, 50);
    expect(result.cogsPerUnit).toBe(0);
    expect(result.totalCOGS).toBe(0);
  });
});

describe("inventory-costing: Standard Cost", () => {
  test("Standard cost: sell 100 units at $5 standard", () => {
    const result = calculateStandardCost(5, 100, 500);
    expect(result.cogsPerUnit).toBe(5);
    expect(result.totalCOGS).toBe(500);
    expect(result.remainingQty).toBe(400);
    expect(result.remainingValue).toBe(2000);
  });

  test("Standard cost: sell all units → remaining = 0", () => {
    const result = calculateStandardCost(10, 200, 200);
    expect(result.totalCOGS).toBe(2000);
    expect(result.remainingQty).toBe(0);
    expect(result.remainingValue).toBe(0);
  });
});

describe("inventory-costing: Landed Cost Allocation", () => {
  test("Allocation by quantity: equal quantities → equal allocation", () => {
    const totalCost = 100;
    const lines = [
      { itemId: 1, quantity: 50 },
      { itemId: 2, quantity: 50 },
    ];
    const result = allocateLandedCostByQuantity(totalCost, lines);
    expect(result[0].allocatedCost).toBe(50); // 100 × 50/100
    expect(result[1].allocatedCost).toBe(50);
    expect(result[0].newUnitCost).toBe(1); // 50 / 50
    expect(result[1].newUnitCost).toBe(1);
  });

  test("Allocation by quantity: unequal quantities", () => {
    const totalCost = 200;
    const lines = [
      { itemId: 1, quantity: 100 },
      { itemId: 2, quantity: 300 },
    ];
    const result = allocateLandedCostByQuantity(totalCost, lines);
    // Item 1: 200 × 100/400 = 50
    // Item 2: 200 × 300/400 = 150
    expect(result[0].allocatedCost).toBe(50);
    expect(result[1].allocatedCost).toBe(150);
  });

  test("Allocation by value: proportional to base value", () => {
    const totalCost = 150;
    const lines = [
      { itemId: 1, value: 1000, quantity: 100 },
      { itemId: 2, value: 2000, quantity: 200 },
    ];
    const result = allocateLandedCostByValue(totalCost, lines);
    // Total value = 3000
    // Item 1: 150 × 1000/3000 = 50, costPerUnit = 50/100 = 0.5
    // Item 2: 150 × 2000/3000 = 100, costPerUnit = 100/200 = 0.5
    expect(result[0].allocatedCost).toBe(50);
    expect(result[1].allocatedCost).toBe(100);
    expect(result[0].newUnitCost).toBe(0.5);
    expect(result[1].newUnitCost).toBe(0.5);
  });

  test("Allocation by quantity: zero total quantity → throws", () => {
    const totalCost = 100;
    const lines = [
      { itemId: 1, quantity: 0 },
      { itemId: 2, quantity: 0 },
    ];
    expect(() => allocateLandedCostByQuantity(totalCost, lines)).toThrow("zero");
  });

  test("Sum of allocated costs equals total landed cost", () => {
    const totalCost = 500;
    const lines = [
      { itemId: 1, quantity: 100 },
      { itemId: 2, quantity: 200 },
      { itemId: 3, quantity: 300 },
    ];
    const result = allocateLandedCostByQuantity(totalCost, lines);
    const totalAllocated = result.reduce((s, r) => s + r.allocatedCost, 0);
    expect(Math.abs(totalAllocated - totalCost) < 0.01).toBe(true);
  });
});
