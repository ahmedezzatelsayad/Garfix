// @ts-nocheck
/**
 * inventorySync.test.ts — smoke + behavior tests for the inventory sync helpers.
 *
 * Coverage:
 *  - `isReviewQueueWarning()` recognizes the `[REVIEW-QUEUE]` prefix.
 *  - `isReviewQueueWarning()` rejects the `[OVERSELL]` prefix (different
 *    warning class — oversell is a soft block, not a review-queue entry).
 *  - `isReviewQueueWarning()` rejects arbitrary messages and empty strings.
 *  - Export smoke test: the two public sync entrypoints and the stock-movement
 *    helper exist with the expected arities.
 *
 * The `syncInventoryOnSale` / `syncInventoryOnPurchase` functions are tightly
 * coupled to a Prisma transaction client (`tx`) and to `matchProduct()`; full
 * behavior coverage of the oversell / collision-recovery paths requires an
 * integration test fixture (mock tx + mock matchProduct) that is large enough
 * to belong in `collision-recovery-audit.test.ts` (deferred — see
 * docs/GATE2_TEST_SUITE.md).
 */
import { describe, it, expect } from "bun:test";
import {
  isReviewQueueWarning,
  syncInventoryOnSale,
  syncInventoryOnPurchase,
  recordStockMovement,
} from "@/lib/inventorySync";

describe("isReviewQueueWarning", () => {
  it("recognizes the [REVIEW-QUEUE] prefix", () => {
    expect(isReviewQueueWarning("[REVIEW-QUEUE] something happened")).toBe(true);
  });

  it("recognizes an empty [REVIEW-QUEUE] tag (just the prefix)", () => {
    expect(isReviewQueueWarning("[REVIEW-QUEUE]")).toBe(true);
  });

  it("rejects the [OVERSELL] prefix — oversell is a different warning class", () => {
    expect(isReviewQueueWarning("[OVERSELL] product X ran out")).toBe(false);
  });

  it("rejects arbitrary error messages", () => {
    expect(isReviewQueueWarning("No active warehouse found for company X")).toBe(false);
    expect(isReviewQueueWarning("Something went wrong")).toBe(false);
  });

  it("rejects empty / falsy input", () => {
    expect(isReviewQueueWarning("")).toBe(false);
  });

  it("does NOT match if [REVIEW-QUEUE] appears later in the string (only prefix counts)", () => {
    expect(isReviewQueueWarning("Error: [REVIEW-QUEUE] tag in middle")).toBe(false);
  });
});

describe("export smoke test", () => {
  it("exports the three sync entrypoints as functions", () => {
    expect(typeof isReviewQueueWarning).toBe("function");
    expect(typeof syncInventoryOnSale).toBe("function");
    expect(typeof syncInventoryOnPurchase).toBe("function");
    expect(typeof recordStockMovement).toBe("function");
  });

  it("syncInventoryOnSale has arity 4 (tx, companySlug, items, invoiceId)", () => {
    expect(syncInventoryOnSale.length).toBe(4);
  });

  it("syncInventoryOnPurchase has arity 4 (tx, companySlug, items, purchaseInvoiceId)", () => {
    expect(syncInventoryOnPurchase.length).toBe(4);
  });

  it("recordStockMovement has arity 7+ (tx, companySlug, productId, warehouseId, signedQty, sourceType, sourceId, ...)", () => {
    expect(recordStockMovement.length).toBeGreaterThanOrEqual(7);
  });
});

// ─── Deferred integration tests ───────────────────────────────────────────────
//
// The following behaviors are documented in the master plan but require a
// heavier fixture (mock `tx` object implementing warehouse/productCatalog/
// inventoryItem/productAlias/productMatchAudit/stockMovement + a mock for
// matchProduct). They are deferred to `collision-recovery-audit.test.ts`
// (see docs/GATE2_TEST_SUITE.md):
//
//   - Sale: existing inventory → quantity decremented, StockMovement recorded.
//   - Sale: oversell (qty > current) → [OVERSELL] warning, inventory NOT decremented.
//   - Sale: no existing inventory → [OVERSELL] warning, inventory NOT decremented.
//   - Sale: collision on product create → re-query, on success proceed.
//   - Sale: collision on product create → re-query fails → [REVIEW-QUEUE] + audit.
//   - Purchase: existing inventory → quantity incremented.
//   - Purchase: no existing inventory → new inventoryItem created.
//
// These were not written in this pass because the mock surface is large and
// brittle, and the unit-level coverage of the underlying matchProduct() in
// productMatcher.test.ts already exercises the matching logic that drives
// most of the branching above.
