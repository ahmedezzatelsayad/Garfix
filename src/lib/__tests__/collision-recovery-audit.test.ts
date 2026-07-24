// @ts-nocheck
/**
 * collision-recovery-audit.test.ts — Full behavior coverage of the inventory
 * sync entrypoints in src/lib/inventorySync.ts.
 *
 * This file delivers the integration scenarios deferred by
 * docs/GATE2_TEST_SUITE.md §2 (collision-recovery-audit). The earlier
 * inventorySync.test.ts shipped only an export + isReviewQueueWarning smoke
 * test because the mock surface (fake `tx` + mock matchProduct) is large.
 * This file builds that mock surface once and reuses it across 7 scenarios.
 *
 * Strategy:
 *  - We use the REAL `matchProduct` from `@/lib/productMatcher` (do NOT mock
 *    that module — mocking it would leak into productMatcher.test.ts because
 *    Bun's `mock.module` is global across test files by default).
 *  - We control matchProduct's behavior via the `tx` argument that
 *    syncInventoryOnSale/Purchase pass to it. Specifically, `tx.productAlias.
 *    findUnique` is a stateful mock whose return values are queued per-test.
 *  - We monkey-patch `db.featureFlag` and `db.platformSettings` (used by
 *    matchProduct's getTenantConfig) in beforeAll/afterAll. We do NOT use
 *    `mock.module("@/lib/db", …)` because that would also leak into
 *    productMatcher.test.ts.
 *  - `makeTx(opts)` builds a fresh transaction client per test whose every
 *    Prisma method is a `mock()` so we can assert exact call counts + arg
 *    shapes via `toHaveBeenCalledTimes` / `toHaveBeenCalledWith` /
 *    `mock.calls[i][0]`.
 *
 * Covered scenarios (per docs/GATE2_TEST_SUITE.md §2):
 *   Sale path:
 *     1. sale-happy-path
 *     2. sale-oversell-block
 *     3. sale-no-inventory-block
 *     4. sale-collision-recovery-success
 *     5. sale-collision-recovery-fail
 *   Purchase path:
 *     6. purchase-happy-path-existing
 *     7. purchase-happy-path-new-inventory
 */
import { describe, it, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";

// Import db so we can monkey-patch its featureFlag / platformSetting.
// We deliberately do NOT call mock.module("@/lib/db", …) here — that would
// replace the db export globally and break productMatcher.test.ts (whose
// dbMock supplies the productAlias fixture data its tests depend on).
import { db } from "@/lib/db";
import { invalidateKillSwitchCache } from "@/lib/productMatcher";

// Import the sync entrypoints AFTER the db import is resolved.
import { syncInventoryOnSale, syncInventoryOnPurchase } from "@/lib/inventorySync";

// ─── Monkey-patch db.featureFlag + db.platformSettings ─────────────────────────
//
// matchProduct's getTenantConfig reads the kill-switch flag + per-tenant
// thresholds from the global `db` (not from `tx`). We need it to return
// kill-switch ON and no custom thresholds. We save the originals and restore
// them in afterAll so other test files are unaffected.

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
  /**
   * Queue of return values for tx.productAlias.findUnique. Each call to
   * findUnique shifts the next value off. If the queue is empty, findUnique
   * returns null. This lets us control matchProduct's exact-match result
   * across multiple calls (e.g. null on first call, alias on retry).
   */
  aliasReturns?: any[];
  /** Object returned by tx.productCatalog.findUnique (defaults to null). */
  product?: any;
  /** If true, tx.productCatalog.create throws a P2002-style unique-constraint error. */
  productCatalogCreateThrows?: boolean;
  /** Object returned by tx.inventoryItem.findUnique (defaults to null). */
  inventoryItem?: any;
}

/**
 * Build a fresh fake Prisma transaction client. Each method is a `mock()`
 * so we can assert call counts and arguments precisely.
 */
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

/** A canonical alias fixture that matchProduct's exact-match path will return. */
const ALIAS_COCACOLA = {
  alias: "Coca Cola",
  product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
};

beforeEach(() => {
  // matchProduct caches tenant config for 60s. Bust it so each test starts
  // fresh and picks up our monkey-patched db.featureFlag.
  invalidateKillSwitchCache();
});

// ─── Sale path ────────────────────────────────────────────────────────────────

describe("syncInventoryOnSale", () => {
  it("1. sale-happy-path: product matched, inventory sufficient → decrement + record movement", async () => {
    const { tx, mocks } = makeTx({
      aliasReturns: [ALIAS_COCACOLA],
      product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
      inventoryItem: { id: 7, quantity: "10.000" },
    });
    const items = [{ description: "Coca Cola", qty: 2, price: 1.0 }];

    const result = await syncInventoryOnSale(tx, "test-co", items, 100);

    expect(result.warnings.length).toBe(0);
    expect(result.productsCreated).toBe(0);
    expect(result.inventoryUpdated).toBe(1);
    expect(result.warehouseUsed).toBe("Main Warehouse");

    // No product creation — match succeeded directly.
    expect(mocks.productCatalogCreate).toHaveBeenCalledTimes(0);
    expect(mocks.productAliasCreate).toHaveBeenCalledTimes(0);

    // Inventory decremented to 8.000.
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { quantity: "8.000" },
    });

    // StockMovement ledger entry: -qty, source "sale", no note.
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    expect(mocks.stockMovementCreate).toHaveBeenCalledWith({
      data: {
        companySlug: "test-co",
        productId: 42,
        warehouseId: 1,
        qty: "-2.000",
        sourceType: "sale",
        sourceId: 100,
        note: null,
        createdBy: "system",
      },
    });
  });

  it("2. sale-oversell-block: qty > currentQty → no update, [OVERSELL] warning, qty:0 movement", async () => {
    const { tx, mocks } = makeTx({
      aliasReturns: [ALIAS_COCACOLA],
      product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
      inventoryItem: { id: 7, quantity: "1.000" }, // only 1 in stock
    });
    const items = [{ description: "Coca Cola", qty: 5, price: 1.0 }];

    const result = await syncInventoryOnSale(tx, "test-co", items, 101);

    // Inventory NOT updated.
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledTimes(0);
    expect(result.inventoryUpdated).toBe(0);

    // Warning pushed with [OVERSELL] prefix.
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0].startsWith("[OVERSELL]")).toBe(true);

    // StockMovement recorded with qty 0 + note mentioning "oversell".
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    const call = mocks.stockMovementCreate.mock.calls[0][0];
    expect(call.data.qty).toBe("0.000");
    expect(call.data.sourceType).toBe("sale");
    expect(call.data.note).toContain("oversell");
    expect(call.data.productId).toBe(42);
  });

  it("3. sale-no-inventory-block: product exists but no invItem → [OVERSELL] warning, no create", async () => {
    const { tx, mocks } = makeTx({
      aliasReturns: [ALIAS_COCACOLA],
      product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
      inventoryItem: null, // no inventory row for this product+warehouse
    });
    const items = [{ description: "Coca Cola", qty: 2, price: 1.0 }];

    const result = await syncInventoryOnSale(tx, "test-co", items, 102);

    // Sale path does NOT create inventory rows — only purchase does.
    expect(mocks.inventoryItemCreate).toHaveBeenCalledTimes(0);
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledTimes(0);

    // [OVERSELL] warning pushed.
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0].startsWith("[OVERSELL]")).toBe(true);

    // StockMovement recorded with qty 0 + note mentioning "no existing inventory".
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    const call = mocks.stockMovementCreate.mock.calls[0][0];
    expect(call.data.qty).toBe("0.000");
    expect(call.data.note).toContain("no existing inventory");
  });

  it("4. sale-collision-recovery-success: create throws P2002 → retry match returns product → normal flow", async () => {
    // First matchProduct call: productAlias.findUnique returns null → no exact
    // match, findMany returns [] → no fuzzy match → matchProduct returns
    // { productId: null }. Code tries tx.productCatalog.create → throws.
    // Retry matchProduct call: productAlias.findUnique returns the alias →
    // matchProduct returns { productId: 42 }. Code calls findUnique to
    // recover the product, then proceeds with the normal inventory flow.
    const { tx, mocks } = makeTx({
      aliasReturns: [null, ALIAS_COCACOLA],
      product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
      productCatalogCreateThrows: true,
      inventoryItem: { id: 7, quantity: "10.000" },
    });
    const items = [{ description: "Coca Cola", qty: 2, price: 1.0 }];

    const result = await syncInventoryOnSale(tx, "test-co", items, 103);

    // Recovery succeeded — no warnings, inventory decremented normally.
    expect(result.warnings.length).toBe(0);
    expect(result.productsCreated).toBe(0); // create threw, not counted
    expect(result.inventoryUpdated).toBe(1);

    // matchProduct called twice (initial + retry).
    expect(mocks.productAliasFindUnique).toHaveBeenCalledTimes(2);

    // productCatalog.create called once and threw.
    expect(mocks.productCatalogCreate).toHaveBeenCalledTimes(1);

    // productCatalog.findUnique called once (only in the retry branch —
    // initial match returned null so findUnique was skipped).
    expect(mocks.productCatalogFindUnique).toHaveBeenCalledTimes(1);

    // Inventory decremented to 8.000.
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { quantity: "8.000" },
    });

    // StockMovement recorded with -qty.
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    expect(mocks.stockMovementCreate.mock.calls[0][0].data.qty).toBe("-2.000");

    // matchProduct's buildResult writes a normal "auto-match" audit entry on
    // the retry (NOT a "collision-recovery-failed" entry — that only appears
    // in the fail path, test 5 below).
    expect(mocks.productMatchAuditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.productMatchAuditCreate.mock.calls[0][0].data.tier).toBe("auto-match");
  });

  it("5. sale-collision-recovery-fail: create throws, retry returns null → [REVIEW-QUEUE] + audit + qty:0", async () => {
    // Both initial + retry match return null → create throws → recovery
    // fails → code writes [REVIEW-QUEUE] warning, audit, and a zero-qty
    // StockMovement with sourceType "collision-recovery".
    const { tx, mocks } = makeTx({
      aliasReturns: [null, null],
      product: null,
      productCatalogCreateThrows: true,
    });
    const items = [{ description: "Mystery Product", qty: 3, price: 2.0 }];

    const result = await syncInventoryOnSale(tx, "test-co", items, 104);

    // Inventory NOT touched.
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledTimes(0);
    expect(mocks.inventoryItemCreate).toHaveBeenCalledTimes(0);
    expect(result.inventoryUpdated).toBe(0);

    // [REVIEW-QUEUE] warning pushed.
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0].startsWith("[REVIEW-QUEUE]")).toBe(true);

    // Audit entry written with tier "collision-recovery-failed".
    expect(mocks.productMatchAuditCreate).toHaveBeenCalledTimes(1);
    const auditCall = mocks.productMatchAuditCreate.mock.calls[0][0];
    expect(auditCall.data.tier).toBe("collision-recovery-failed");
    expect(auditCall.data.action).toBe("collision-recovery-skipped");
    expect(auditCall.data.matchedProductId).toBeNull();
    expect(auditCall.data.invoiceId).toBe(104);

    // StockMovement recorded with qty 0 + sourceType "collision-recovery".
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    const mvCall = mocks.stockMovementCreate.mock.calls[0][0];
    expect(mvCall.data.qty).toBe("0.000");
    expect(mvCall.data.sourceType).toBe("collision-recovery");
    expect(mvCall.data.productId).toBeNull();
  });
});

// ─── Purchase path ────────────────────────────────────────────────────────────

describe("syncInventoryOnPurchase", () => {
  it("6. purchase-happy-path-existing: product + inventory exist → increment + record movement", async () => {
    const { tx, mocks } = makeTx({
      aliasReturns: [ALIAS_COCACOLA],
      product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
      inventoryItem: { id: 7, quantity: "5.000" },
    });
    const items = [{ description: "Coca Cola", qty: 2, price: 1.0 }];

    const result = await syncInventoryOnPurchase(tx, "test-co", items, 200);

    expect(result.warnings.length).toBe(0);
    expect(result.inventoryUpdated).toBe(1);

    // Inventory incremented to 7.000.
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.inventoryItemUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { quantity: "7.000" },
    });

    // StockMovement recorded with +qty, source "purchase".
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    expect(mocks.stockMovementCreate).toHaveBeenCalledWith({
      data: {
        companySlug: "test-co",
        productId: 42,
        warehouseId: 1,
        qty: "2.000",
        sourceType: "purchase",
        sourceId: 200,
        note: null,
        createdBy: "system",
      },
    });
  });

  it("7. purchase-happy-path-new-inventory: product exists, no inventory → create + record with note", async () => {
    const { tx, mocks } = makeTx({
      aliasReturns: [ALIAS_COCACOLA],
      product: { id: 42, name: "Coca Cola", sellingPrice: "1.000", companySlug: "test-co" },
      inventoryItem: null, // no existing inventory → purchase path CREATES it
    });
    const items = [{ description: "Coca Cola", qty: 3, price: 1.0 }];

    const result = await syncInventoryOnPurchase(tx, "test-co", items, 201);

    expect(result.warnings.length).toBe(0);
    expect(result.inventoryUpdated).toBe(1);

    // New inventory row created with quantity = qty.
    expect(mocks.inventoryItemCreate).toHaveBeenCalledTimes(1);
    const createCall = mocks.inventoryItemCreate.mock.calls[0][0];
    expect(createCall.data.quantity).toBe("3.000");
    expect(createCall.data.productId).toBe(42);
    expect(createCall.data.warehouseId).toBe(1);
    expect(createCall.data.companySlug).toBe("test-co");
    expect(createCall.data.reorderLevel).toBe("0");
    expect(createCall.data.reorderQty).toBe("0");

    // StockMovement recorded with +qty + note "initial stock: no existing inventory".
    expect(mocks.stockMovementCreate).toHaveBeenCalledTimes(1);
    const mvCall = mocks.stockMovementCreate.mock.calls[0][0];
    expect(mvCall.data.qty).toBe("3.000");
    expect(mvCall.data.sourceType).toBe("purchase");
    expect(mvCall.data.note).toBe("initial stock: no existing inventory");
  });
});
