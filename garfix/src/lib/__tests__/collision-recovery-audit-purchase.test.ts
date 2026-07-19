/**
 * collision-recovery-audit-purchase.test.ts — Purchase-side collision recovery.
 *
 * Mirrors the sale-side coverage in `collision-recovery-audit.test.ts` for
 * the `syncInventoryOnPurchase` path. The sale-side file already covers
 * 2 purchase scenarios (happy-path-existing + happy-path-new-inventory) at
 * the end of its describe block; this file adds the missing collision-
 * recovery scenarios for the purchase path that the spec calls out.
 *
 * Source spec: `01_P1_COLLISION_RECOVERY.md` GATE 2.
 *
 * Coverage:
 *   1. purchase-collision-recovery-success — create throws P2002, retry
 *      match returns the product → normal flow (increment existing invItem
 *      or create new invItem + record movement).
 *   2. purchase-collision-recovery-fail — create throws, retry returns null
 *      → [REVIEW-QUEUE] warning + audit tier="collision-recovery-failed"
 *      + zero-qty StockMovement with sourceType "collision-recovery".
 *   3. purchase-collision-recovery-fail writes the real invoiceId on the
 *      audit row (NOT null) — verifies the GATE 1 requirement that the
 *      audit entry be traceable to the originating purchase invoice.
 *   4. purchase-collision-recovery-fail surfaces the warning in
 *      `result.warnings` (the caller's responsibility to forward as
 *      `reviewQueueWarnings` in the HTTP response).
 *
 * HONESTY NOTE — REAL RACE CONDITION vs SCHEMA/SHAPE (per GATE 2)
 * =================================================================
 * These tests do NOT trigger a REAL race condition. They MOCK the P2002
 * unique-constraint violation by setting `productCatalogCreateThrows: true`
 * in the fake `tx`. This verifies the SCHEMA + SHAPE of the recovery path
 * (audit row fields, StockMovement fields, warning prefix) — NOT the
 * actual concurrency behavior under a real Postgres + Prisma deployment.
 *
 * Per `01_P1_COLLISION_RECOVERY.md` GATE 2:
 *   > صراحة قول هل التست بيعمل trigger حقيقي للـ race condition ولا بيتحقق
 *   > من الـ schema/shape بس — لو التاني، سجّله كـ open item (P2)
 *
 * OPEN ITEM (P2): A real race-condition test would require either:
 *   (a) Two concurrent `syncInventoryOnPurchase` calls sharing a real
 *       Postgres connection (so the second one's INSERT actually hits the
 *       unique constraint), OR
 *   (b) A Prisma client mock that throws P2002 on the FIRST call only
 *       (already what we do here) AND a separate test that verifies the
 *       retry path picks up the row the first call inserted (which would
 *       require a real DB transaction).
 * Both are out of scope for this test-suite rebuild. The schema/shape
 * verification here is sufficient to confirm the recovery code path is
 * wired correctly; the real-race behavior is a separate P2 follow-up.
 *
 * MOCK STRATEGY
 * =============
 * Same monkey-patching pattern as `collision-recovery-audit.test.ts`:
 * - Use the REAL `matchProduct` (not mocked).
 * - Monkey-patch `db.featureFlag` + `db.platformSetting` so the matcher's
 *   `getTenantConfig` sees kill-switch ON + no custom thresholds.
 * - Build a fresh fake `tx` per test via `makeTx(opts)` whose every Prisma
 *   method is a `mock()` so we can assert call counts + arg shapes.
 */
import { describe, it, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";

import { db } from "@/lib/db";
import { invalidateKillSwitchCache } from "@/lib/productMatcher";
import { syncInventoryOnPurchase } from "@/lib/inventorySync";

// ─── Monkey-patch db.featureFlag + db.platformSetting ─────────────────────────

const _origFeatureFlag = (db as any).featureFlag;
const _origPlatformSetting = (db as any).platformSetting;

beforeAll(() => {
  (db as any).featureFlag = {
    findUnique: async () => ({ key: "product-auto-matching", isActive: true }),
  };
  (db as any).platformSetting = { findMany: async () => [] };
});

afterAll(() => {
  (db as any).featureFlag = _origFeatureFlag;
  (db as any).platformSetting = _origPlatformSetting;
});

// ─── tx mock factory ──────────────────────────────────────────────────────────

interface TxMocks {
  warehouseFindFirst: ReturnType<typeof mock>;
  productAliasFindUnique: ReturnType<typeof mock>;
  productAliasFindMany: ReturnType<typeof mock>;
  productCatalogFindUnique: ReturnType<typeof mock>;
  productCatalogCreate: ReturnType<typeof mock>;
  productAliasCreate: ReturnType<typeof mock>;
  productMatchAuditCreate: ReturnType<typeof mock>;
  inventoryItemFindUnique: ReturnType<typeof mock>;
  inventoryItemUpdate: ReturnType<typeof mock>;
  inventoryItemCreate: ReturnType<typeof mock>;
  stockMovementCreate: ReturnType<typeof mock>;
}

interface MakeTxOptions {
  /** Queue of return values for tx.productAlias.findUnique. */
  aliasReturns?: any[];
  /** Object returned by tx.productCatalog.findUnique (defaults to null). */
  product?: any;
  /** If true, tx.productCatalog.create throws a P2002-style unique-constraint error. */
  productCatalogCreateThrows?: boolean;
  /** Object returned by tx.inventoryItem.findUnique (defaults to null). */
  inventoryItem?: any;
}

function makeTx(opts: MakeTxOptions = {}): { tx: any; mocks: TxMocks } {
  const aliasQueue = [...(opts.aliasReturns ?? [])];

  const productAliasFindUnique = mock(async () => {
    if (aliasQueue.length === 0) return null;
    return aliasQueue.shift();
  });
  const productAliasFindMany = mock(async () => []); // no fuzzy candidates
  const stockMovementCreate = mock(async (args: any) => ({ id: 1, ...args.data }));
  const inventoryItemUpdate = mock(async (args: any) => ({ id: 1, ...args.data }));
  const inventoryItemCreate = mock(async (args: any) => ({ id: 1, ...args.data }));
  const inventoryItemFindUnique = mock(async () => opts.inventoryItem ?? null);
  const productCatalogFindUnique = mock(async () => opts.product ?? null);
  const productCatalogCreate = mock(async (args: any) => {
    if (opts.productCatalogCreateThrows) {
      const err: any = new Error("Unique constraint failed on (companySlug, name)");
      err.code = "P2002";
      throw err;
    }
    return { id: 999, name: args.data.name, ...args.data };
  });
  const productAliasCreate = mock(async () => ({}));
  const productMatchAuditCreate = mock(async (args: any) => ({ id: 1, ...args.data }));
  const warehouseFindFirst = mock(
    async () => ({ id: 1, name: "Main Warehouse", companySlug: "test-co" }),
  );

  const tx = {
    warehouse: { findFirst: warehouseFindFirst },
    productCatalog: { findUnique: productCatalogFindUnique, create: productCatalogCreate },
    productAlias: { findUnique: productAliasFindUnique, findMany: productAliasFindMany, create: productAliasCreate },
    productMatchAudit: { create: productMatchAuditCreate },
    inventoryItem: {
      findUnique: inventoryItemFindUnique,
      update: inventoryItemUpdate,
      create: inventoryItemCreate,
    },
    stockMovement: { create: stockMovementCreate },
  };
  return {
    tx,
    mocks: {
      warehouseFindFirst,
      productAliasFindUnique,
      productAliasFindMany,
      productCatalogFindUnique,
      productCatalogCreate,
      productAliasCreate,
      productMatchAuditCreate,
      inventoryItemFindUnique,
      inventoryItemUpdate,
      inventoryItemCreate,
      stockMovementCreate,
    },
  };
}

const ALIAS_COCACOLA = {
  alias: "Coca Cola",
  product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
};

beforeEach(() => {
  invalidateKillSwitchCache();
});

// ─── Purchase-side collision recovery tests ──────────────────────────────────

describe("syncInventoryOnPurchase — collision recovery", () => {
  it("1. purchase-collision-recovery-success: create throws P2002 → retry match returns product → increment existing inventory", async () => {
    // First matchProduct call: alias findUnique returns null → no match →
    // create throws P2002. Retry matchProduct call: alias findUnique returns
    // the alias → matchProduct returns productId 42. Recovery succeeds:
    // increment the existing invItem + record a +qty StockMovement.
    const { tx, mocks } = makeTx({
      aliasReturns: [null, ALIAS_COCACOLA],
      product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
      productCatalogCreateThrows: true,
      inventoryItem: { id: 7, quantity: "5.000" },
    });
    const items = [{ description: "Coca Cola", qty: 3, price: 1.0 }];

    const result = await syncInventoryOnPurchase(tx, "test-co", items, 500);

    // Recovery succeeded — no warnings, inventory incremented.
    expect(result.warnings.length).toBe(0);
    expect(result.productsCreated).toBe(0); // create threw, not counted
    expect(result.inventoryUpdated).toBe(1);

    // matchProduct called twice (initial + retry).
    expect(mocks.productAliasFindUnique).toHaveBeenCalledTimes(2);

    // productCatalog.create called once and threw.
    expect(mocks.productCatalogCreate).toHaveBeenCalledTimes(1);

    // productCatalog.findUnique called once (only in the retry branch).
    expect(mocks.productCatalogFindUnique).toHaveBeenCalledTimes(1);

    // Inventory incremented to 8.000 (5 + 3).
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { quantity: "8.000" },
    });

    // StockMovement recorded with +qty, source "purchase".
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    expect(mocks.stockMovementCreate.mock.calls[0][0].data.qty).toBe("3.000");
    expect(mocks.stockMovementCreate.mock.calls[0][0].data.sourceType).toBe("purchase");
    expect(mocks.stockMovementCreate.mock.calls[0][0].data.sourceId).toBe(500);

    // Audit row is a normal "auto-match" entry (NOT collision-recovery-failed).
    expect(mocks.productMatchAuditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.productMatchAuditCreate.mock.calls[0][0].data.tier).toBe("auto-match");
  });

  it("2. purchase-collision-recovery-fail: create throws, retry returns null → [REVIEW-QUEUE] + audit + qty:0 movement", async () => {
    // Both initial + retry match return null → create throws → recovery
    // fails → code writes [REVIEW-QUEUE] warning, audit row with
    // tier="collision-recovery-failed", and a zero-qty StockMovement with
    // sourceType "collision-recovery".
    const { tx, mocks } = makeTx({
      aliasReturns: [null, null],
      product: null,
      productCatalogCreateThrows: true,
    });
    const items = [{ description: "Mystery Purchase Item", qty: 4, price: 2.0 }];

    const result = await syncInventoryOnPurchase(tx, "test-co", items, 501);

    // Inventory NOT touched.
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledTimes(0);
    expect(mocks.inventoryItemCreate).toHaveBeenCalledTimes(0);
    expect(result.inventoryUpdated).toBe(0);

    // [REVIEW-QUEUE] warning pushed (with "Purchase invoice" prefix —
    // distinguishes from sale-side warnings).
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0].startsWith("[REVIEW-QUEUE]")).toBe(true);
    expect(result.warnings[0]).toContain("Purchase invoice");
    expect(result.warnings[0]).toContain("#501");
    expect(result.warnings[0]).toContain("Mystery Purchase Item");

    // Audit entry written with tier "collision-recovery-failed".
    expect(mocks.productMatchAuditCreate).toHaveBeenCalledTimes(1);
    const auditCall = mocks.productMatchAuditCreate.mock.calls[0][0];
    expect(auditCall.data.tier).toBe("collision-recovery-failed");
    expect(auditCall.data.action).toBe("collision-recovery-skipped");
    expect(auditCall.data.matchedProductId).toBeNull();
    expect(auditCall.data.matchedAlias).toBeNull();
    expect(auditCall.data.confidence).toBe(0);
    expect(auditCall.data.invoiceId).toBe(501); // ← real purchase invoice id
    expect(auditCall.data.createdBy).toBe("inventory-sync-purchase-collision-fallback");

    // StockMovement recorded with qty 0 + sourceType "collision-recovery".
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    const mvCall = mocks.stockMovementCreate.mock.calls[0][0];
    expect(mvCall.data.qty).toBe("0.000");
    expect(mvCall.data.sourceType).toBe("collision-recovery");
    expect(mvCall.data.sourceId).toBe(501); // ← same reference as audit
    expect(mvCall.data.productId).toBeNull();
    expect(mvCall.data.note).toContain("orphan purchase item");
    expect(mvCall.data.note).toContain("Mystery Purchase Item");
  });

  it("3. purchase-collision-recovery-fail writes the REAL purchaseInvoiceId on the audit row (NOT null)", async () => {
    // GATE 1 requirement: the audit entry must be traceable to the
    // originating purchase invoice. Verify invoiceId is the real numeric id
    // passed to syncInventoryOnPurchase, not null.
    const { tx, mocks } = makeTx({
      aliasReturns: [null, null],
      product: null,
      productCatalogCreateThrows: true,
    });
    const items = [{ description: "Another Orphan", qty: 1, price: 1.0 }];

    await syncInventoryOnPurchase(tx, "test-co", items, 9999);

    const auditCall = mocks.productMatchAuditCreate.mock.calls[0][0];
    expect(auditCall.data.invoiceId).toBe(9999);
    // The StockMovement also carries the same sourceId for cross-referencing.
    const mvCall = mocks.stockMovementCreate.mock.calls[0][0];
    expect(mvCall.data.sourceId).toBe(9999);
  });

  it("4. purchase-collision-recovery-fail surfaces the warning in result.warnings (caller's responsibility to forward as reviewQueueWarnings)", async () => {
    // The purchase sync function returns warnings in `result.warnings`.
    // The HTTP route handler is responsible for filtering these into
    // `reviewQueueWarnings` in the response body (mirroring the sale-side
    // route in src/app/api/invoices/route.ts). This test verifies the
    // function-level contract; the route-level forwarding is a separate
    // concern (see OPEN ITEM below).
    const { tx } = makeTx({
      aliasReturns: [null, null],
      product: null,
      productCatalogCreateThrows: true,
    });
    const items = [{ description: "Orphan Item X", qty: 2, price: 5.0 }];

    const result = await syncInventoryOnPurchase(tx, "test-co", items, 502);

    expect(result.warnings.length).toBe(1);
    const w = result.warnings[0];
    // The warning carries the [REVIEW-QUEUE] prefix — the caller's filter
    // `warnings.filter(w => w.startsWith("[REVIEW-QUEUE]") || w.startsWith("[OVERSELL]"))`
    // would include it.
    expect(w.startsWith("[REVIEW-QUEUE]")).toBe(true);
    // The warning mentions the purchase invoice number + line index + description.
    expect(w).toContain("#502");
    expect(w).toContain("line 0");
    expect(w).toContain("Orphan Item X");
  });
});

// ─── OPEN ITEM (P2) — purchases route does NOT call syncInventoryOnPurchase ──
//
// While writing these tests, I noticed that `src/app/api/purchases/route.ts`
// (the POST handler) does NOT call `syncInventoryOnPurchase` at all. It just
// creates the PurchaseInvoice record and returns. This means purchase
// invoices currently DON'T update inventory — a real bug, but OUT OF SCOPE
// for this test-suite rebuild task (which is scoped to "DO NOT modify
// production code unless a test reveals a real bug — then fix it minimally";
// the fix here is non-minimal because it requires wiring up the sync call,
// the transaction wrapper, and the warning-surfacing path).
//
// This is recorded as a P2 open item. The tests above verify that
// `syncInventoryOnPurchase` (the FUNCTION) works correctly — including its
// collision-recovery path — so when the route is wired up to call it, the
// behavior will be correct. A follow-up task should:
//   1. Add `db.$transaction(async tx => syncInventoryOnPurchase(tx, ...))`
//      to src/app/api/purchases/route.ts POST handler.
//   2. Surface `result.warnings` as `reviewQueueWarnings` in the response
//      body (mirroring src/app/api/invoices/route.ts).
//   3. Add an integration test that POSTs a purchase invoice and verifies
//      the inventory was actually incremented.
