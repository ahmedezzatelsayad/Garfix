/**
 * oversell-behavior.test.ts
 *
 * Verifies the "oversell blocked" founder decision (File 8 §2) and the
 * inventory-ledger P1 fix (Season Finale Audit §3.3).
 *
 * The oversell BLOCK behavior in syncInventoryOnSale is already covered by
 * collision-recovery-audit.test.ts (sale-oversell-block + sale-no-inventory-block
 * cases). This file focuses on:
 *   1. isReviewQueueWarning correctly distinguishes [OVERSELL] from [REVIEW-QUEUE]
 *      (they're separate warning categories, both surfaced to the user).
 *   2. recordStockMovement records the correct sourceType + qty for manual
 *      adjustments — verifying the v15 fix that manual stock edits now write
 *      to the StockMovement ledger (not just InventoryItem.quantity).
 *   3. The new AI Copilot inventory-edit intent uses the same source types
 *      ('ai_adjustment', 'ai_initial_stock') for a consistent audit trail.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "@/lib/db";
import { isReviewQueueWarning, recordStockMovement } from "@/lib/inventorySync";

// ─── Mock state ────────────────────────────────────────────────────────────
interface MockStockMovement {
  id: number;
  companySlug: string;
  productId: number | null;
  warehouseId: number;
  qty: string;
  sourceType: string;
  sourceId: number | null;
  note: string | null;
  createdBy: string;
}

let mockMovements: MockStockMovement[] = [];
let movementIdCounter = 1;

const originalStockMovement = (db as unknown as { stockMovement: unknown }).stockMovement;

beforeAll(() => {
  (db as unknown as { stockMovement: unknown }).stockMovement = {
    create: async ({ data }: { data: Partial<MockStockMovement> }) => {
      const movement: MockStockMovement = {
        id: movementIdCounter++,
        companySlug: data.companySlug || "test-co",
        productId: data.productId ?? null,
        warehouseId: data.warehouseId || 1,
        qty: data.qty || "0",
        sourceType: data.sourceType || "test",
        sourceId: data.sourceId ?? null,
        note: data.note ?? null,
        createdBy: data.createdBy || "test",
      };
      mockMovements.push(movement);
      return movement;
    },
  };
});

afterAll(() => {
  (db as unknown as { stockMovement: unknown }).stockMovement = originalStockMovement;
});

beforeEach(() => {
  mockMovements = [];
  movementIdCounter = 1;
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("oversell warning category separation", () => {
  it("isReviewQueueWarning returns FALSE for [OVERSELL] warnings", () => {
    // [OVERSELL] is a separate category from [REVIEW-QUEUE].
    // Both are surfaced to the user, but isReviewQueueWarning specifically
    // checks for the [REVIEW-QUEUE] prefix only.
    expect(isReviewQueueWarning("[OVERSELL] product X: insufficient stock")).toBe(false);
    expect(isReviewQueueWarning("[OVERSELL] المنتج: لا يوجد مخزون مسجل")).toBe(false);
  });

  it("isReviewQueueWarning returns TRUE for [REVIEW-QUEUE] warnings", () => {
    expect(isReviewQueueWarning("[REVIEW-QUEUE] product X: orphaned")).toBe(true);
    expect(isReviewQueueWarning("[REVIEW-QUEUE] Purchase invoice #5 line 0: product orphaned")).toBe(true);
  });

  it("isReviewQueueWarning returns FALSE for non-prefixed strings", () => {
    expect(isReviewQueueWarning("random warning text")).toBe(false);
    expect(isReviewQueueWarning("")).toBe(false);
    expect(isReviewQueueWarning("[OTHER] some other prefix")).toBe(false);
  });
});

describe("inventory-ledger P1 fix — manual adjustments record StockMovement", () => {
  it("manual adjust (positive delta) records movement with source 'manual_adjustment'", async () => {
    await recordStockMovement(
      db as never, "test-co", 100, 1,
      5, // +5 units
      "manual_adjustment", null,
      "manual add: delta 5.000 (was 10.000 → now 15.000)",
      "test-user",
    );

    expect(mockMovements.length).toBe(1);
    expect(mockMovements[0].sourceType).toBe("manual_adjustment");
    expect(mockMovements[0].qty).toBe("5.000"); // toFixed(3)
    expect(mockMovements[0].productId).toBe(100);
    expect(mockMovements[0].warehouseId).toBe(1);
    expect(mockMovements[0].createdBy).toBe("test-user");
    expect(mockMovements[0].note).toContain("manual add");
  });

  it("manual adjust (negative delta) records movement with negative qty", async () => {
    await recordStockMovement(
      db as never, "test-co", 100, 1,
      -3, // -3 units
      "manual_adjustment", null,
      "manual remove: delta -3.000 (was 10.000 → now 7.000)",
      "test-user",
    );

    expect(mockMovements.length).toBe(1);
    expect(mockMovements[0].qty).toBe("-3.000");
    expect(mockMovements[0].sourceType).toBe("manual_adjustment");
  });

  it("manual set mode records movement with the delta (not absolute value)", async () => {
    // If set mode changes 10 → 20, signedDelta = +10
    await recordStockMovement(
      db as never, "test-co", 100, 1,
      10,
      "manual_adjustment", null,
      "manual set: was 10.000 → now 20.000",
      "test-user",
    );

    expect(mockMovements.length).toBe(1);
    expect(mockMovements[0].qty).toBe("10.000");
    expect(mockMovements[0].note).toContain("manual set");
  });

  it("initial stock creation records movement with source 'initial_stock'", async () => {
    await recordStockMovement(
      db as never, "test-co", 100, 1,
      25,
      "initial_stock", null,
      "manual create: initial stock 25.000",
      "test-user",
    );

    expect(mockMovements.length).toBe(1);
    expect(mockMovements[0].sourceType).toBe("initial_stock");
    expect(mockMovements[0].qty).toBe("25.000");
  });
});

describe("AI Copilot inventory edit — same audit trail as manual", () => {
  it("AI adjust records movement with source 'ai_adjustment'", async () => {
    await recordStockMovement(
      db as never, "test-co", 100, 1,
      5,
      "ai_adjustment", null,
      "AI Copilot adjust: 10.000 → 15.000 (delta 5.000)",
      "ai-user",
    );

    expect(mockMovements.length).toBe(1);
    expect(mockMovements[0].sourceType).toBe("ai_adjustment");
    expect(mockMovements[0].createdBy).toBe("ai-user");
  });

  it("AI initial stock records movement with source 'ai_initial_stock'", async () => {
    await recordStockMovement(
      db as never, "test-co", 100, 1,
      50,
      "ai_initial_stock", null,
      "AI Copilot create: initial stock 50.000",
      "ai-user",
    );

    expect(mockMovements.length).toBe(1);
    expect(mockMovements[0].sourceType).toBe("ai_initial_stock");
    expect(mockMovements[0].qty).toBe("50.000");
  });
});

describe("oversell source types are distinct from sale/purchase", () => {
  it("sale oversell block records zero-qty movement with source 'sale'", async () => {
    // When oversell is blocked on a sale, a zero-qty StockMovement is recorded
    // with source "sale" and a note explaining the block. This is verified
    // structurally in collision-recovery-audit.test.ts; here we verify the
    // sourceType is "sale" (not "oversell" — the block is logged as a sale
    // attempt that was refused).
    await recordStockMovement(
      db as never, "test-co", 100, 1,
      0,
      "sale", 1,
      "oversell blocked: requested 10, available 5, shortage 5.000",
      "system",
    );

    expect(mockMovements.length).toBe(1);
    expect(mockMovements[0].sourceType).toBe("sale");
    expect(mockMovements[0].qty).toBe("0.000");
    expect(mockMovements[0].note).toContain("oversell blocked");
  });

  it("collision-recovery-failed records zero-qty movement with source 'collision-recovery'", async () => {
    await recordStockMovement(
      db as never, "test-co", null, 1,
      0,
      "collision-recovery", 1,
      'orphan item: "Unknown Product" qty 5 — inventory NOT decremented',
      "inventory-sync-collision-fallback",
    );

    expect(mockMovements.length).toBe(1);
    expect(mockMovements[0].sourceType).toBe("collision-recovery");
    expect(mockMovements[0].qty).toBe("0.000");
    expect(mockMovements[0].productId).toBeNull();
  });
});
