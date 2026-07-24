// @ts-nocheck
/**
 * ai-fabric/__tests__/digital-twin-profit.test.ts — Phase 7-8 tests.
 *
 * Tests the Digital Twin (Phase 7) and Profit Engine (Phase 8).
 * All tests use the actual Prisma client (SQLite) — no mocks for DB.
 * Every assertion verifies data comes from real DB queries.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "@/lib/db";
import {
  buildCompanySnapshot,
  getCachedSnapshot,
  type CompanySnapshot,
} from "@/lib/ai-fabric/digital-twin";
import {
  saveProfitSnapshot,
  getProfitHistory,
  getPlatformProfit,
} from "@/lib/ai-fabric/profit-engine";

// ─── Test Constants ─────────────────────────────────────────────────────────

const TEST_SLUG = "test-twin-co";
const TEST_SLUG_2 = "test-twin-co-2";

// ─── Helpers ───────────────────────────────────────────────────────────────

async function cleanTestData() {
  await db.aIRequestLog.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.aIRequestLog.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
  await db.aIMemoryEntry.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.aIMemoryEntry.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
  await db.profitSnapshot.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.profitSnapshot.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
  // Delete in correct FK order: InventoryItem → Warehouse → ProductCatalog → Client
  await db.inventoryItem.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.inventoryItem.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
  await db.warehouse.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.warehouse.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
  await db.productCatalog.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.productCatalog.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
  await db.client.deleteMany({ where: { companySlug: TEST_SLUG } });
  await db.client.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
  // Delete runtimes for our test companies
  for (const slug of [TEST_SLUG, TEST_SLUG_2]) {
    const company = await db.company.findUnique({ where: { slug } });
    if (company) {
      await db.companyRuntime.deleteMany({ where: { companyId: company.id } });
    }
  }
  await db.company.deleteMany({
    where: { slug: { in: [TEST_SLUG, TEST_SLUG_2] } },
  });
}

/** Create a test company and optionally a runtime entry. */
async function createTestCompany(slug: string, plan = "business") {
  const company = await db.company.create({
    data: {
      name: `Test ${slug}`,
      slug,
      plan,
      subscriptionStatus: "active",
    },
  });

  // Create a CompanyRuntime for profit engine worker cost calculation
  await db.companyRuntime.create({
    data: {
      companyId: company.id,
      workerPoolSize: 4,
      status: "active",
    },
  });

  return company;
}

// ─── Test Suite: Digital Twin (Phase 7) ─────────────────────────────────────

describe("Digital Twin — Phase 7", () => {
  beforeAll(async () => {
    await cleanTestData();
    await createTestCompany(TEST_SLUG);
  });

  afterAll(async () => {
    await cleanTestData();
  });

  beforeEach(async () => {
    // Clean all test data but keep the company and runtime
    await db.aIMemoryEntry.deleteMany({ where: { companySlug: TEST_SLUG } });
    await db.client.deleteMany({ where: { companySlug: TEST_SLUG } });
    await db.inventoryItem.deleteMany({ where: { companySlug: TEST_SLUG } });
    await db.warehouse.deleteMany({ where: { companySlug: TEST_SLUG } });
    await db.productCatalog.deleteMany({ where: { companySlug: TEST_SLUG } });
  });

  it("should build a snapshot with all fields from real DB queries", async () => {
    // Seed: 3 clients
    // Source: db.client.count
    for (let i = 0; i < 3; i++) {
      await db.client.create({
        data: {
          name: `Client ${i}`,
          companySlug: TEST_SLUG,
        },
      });
    }

    // Seed: 2 products
    // Source: db.productCatalog.findMany take 10
    for (let i = 0; i < 2; i++) {
      await db.productCatalog.create({
        data: {
          name: `Product ${i}`,
          code: `P${i}`,
          companySlug: TEST_SLUG,
        },
      });
    }

    // Seed: 1 warehouse (required for inventory items)
    const warehouse = await db.warehouse.create({
      data: {
        name: "WH1",
        code: "WH1",
        companySlug: TEST_SLUG,
      },
    });

    // Seed products with IDs for inventory
    const products = await db.productCatalog.findMany({
      where: { companySlug: TEST_SLUG },
      select: { id: true },
    });

    // Seed: 2 inventory items
    // Source: db.inventoryItem.aggregate + findMany
    for (let i = 0; i < 2; i++) {
      await db.inventoryItem.create({
        data: {
          companySlug: TEST_SLUG,
          warehouseId: warehouse.id,
          productId: products[i].id,
          quantity: "10",
          reorderLevel: "5",
        },
      });
    }

    // Seed: 1 decision memory
    // Source: db.aIMemoryEntry where category='decision'
    await db.aIMemoryEntry.create({
      data: {
        companySlug: TEST_SLUG,
        category: "decision",
        content: JSON.stringify({ decision: "increase prices" }),
      },
    });

    // Build the snapshot
    const snapshot = await buildCompanySnapshot(TEST_SLUG);

    // Verify all fields come from real DB queries
    // Source: db.client.count
    expect(snapshot.customerCount).toBe(3);

    // Source: db.productCatalog.findMany
    expect(snapshot.topProducts).toHaveLength(2);
    expect(snapshot.topProducts[0].name).toBe("Product 1");

    // Source: db.inventoryItem.aggregate + findMany
    expect(snapshot.inventorySummary.totalItems).toBe(2);
    expect(snapshot.inventorySummary.totalQuantity).toBe(20);
    expect(snapshot.inventorySummary.lowStockItems).toBe(0);

    // Source: db.aIMemoryEntry where category='decision'
    expect(snapshot.recentDecisions).toHaveLength(1);
    expect(snapshot.companySlug).toBe(TEST_SLUG);
    expect(snapshot.builtAt).toBeTruthy();
  });

  it("should cache the snapshot in AIMemoryEntry with category=digital-twin", async () => {
    const snapshot = await buildCompanySnapshot(TEST_SLUG);

    // Source: db.aIMemoryEntry.findFirst where category='digital-twin'
    const cached = await db.aIMemoryEntry.findFirst({
      where: { companySlug: TEST_SLUG, category: "digital-twin" },
    });

    expect(cached).not.toBeNull();
    expect(cached!.category).toBe("digital-twin");

    const parsed = JSON.parse(cached!.content) as CompanySnapshot;
    expect(parsed.companySlug).toBe(TEST_SLUG);
    expect(parsed.builtAt).toBe(snapshot.builtAt);
  });

  it("should return cached snapshot via getCachedSnapshot (not expired)", async () => {
    // Build snapshot (caches it)
    await buildCompanySnapshot(TEST_SLUG);

    // Immediately retrieve — should be cached (well within 15 min TTL)
    const cached = await getCachedSnapshot(TEST_SLUG);

    expect(cached).not.toBeNull();
    expect(cached!.companySlug).toBe(TEST_SLUG);
    expect(cached!.builtAt).toBeTruthy();
  });

  it("should return null from getCachedSnapshot when no snapshot exists", async () => {
    // Don't build any snapshot for a different slug
    const cached = await getCachedSnapshot("nonexistent-company-slug");
    expect(cached).toBeNull();
  });

  it("should handle company with zero clients, products, and inventory", async () => {
    const snapshot = await buildCompanySnapshot(TEST_SLUG);

    // Source: db.client.count — should be 0 (no clients seeded)
    expect(snapshot.customerCount).toBe(0);

    // Source: db.productCatalog.findMany — empty
    expect(snapshot.topProducts).toHaveLength(0);

    // Source: db.inventoryItem.aggregate — 0
    expect(snapshot.inventorySummary.totalItems).toBe(0);
    expect(snapshot.inventorySummary.totalQuantity).toBe(0);
    expect(snapshot.inventorySummary.lowStockItems).toBe(0);

    // Source: db.aIMemoryEntry where category='decision' — empty
    expect(snapshot.recentDecisions).toHaveLength(0);
  });

  it("should detect low stock items correctly", async () => {
    // Create warehouse
    const warehouse = await db.warehouse.create({
      data: { name: "WH2", code: "WH2", companySlug: TEST_SLUG },
    });

    const product = await db.productCatalog.create({
      data: { name: "Low Item", companySlug: TEST_SLUG },
    });

    // quantity (2) <= reorderLevel (5) → low stock
    await db.inventoryItem.create({
      data: {
        companySlug: TEST_SLUG,
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: "2",
        reorderLevel: "5",
      },
    });

    const snapshot = await buildCompanySnapshot(TEST_SLUG);
    // Source: db.inventoryItem.findMany where quantity <= reorderLevel
    expect(snapshot.inventorySummary.lowStockItems).toBe(1);
    expect(snapshot.inventorySummary.totalQuantity).toBe(2);
  });
});

// ─── Test Suite: Profit Engine (Phase 8) ────────────────────────────────────

describe("Profit Engine — Phase 8", () => {
  beforeAll(async () => {
    await cleanTestData();
    await createTestCompany(TEST_SLUG);
    await createTestCompany(TEST_SLUG_2);
  });

  afterAll(async () => {
    await cleanTestData();
  });

  beforeEach(async () => {
    await db.aIRequestLog.deleteMany({ where: { companySlug: TEST_SLUG } });
    await db.aIRequestLog.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
    await db.profitSnapshot.deleteMany({ where: { companySlug: TEST_SLUG } });
    await db.profitSnapshot.deleteMany({ where: { companySlug: TEST_SLUG_2 } });
  });

  it("should save a profit snapshot with real AI cost from AIRequestLog", async () => {
    const periodStart = new Date("2025-01-01");
    const periodEnd = new Date("2025-01-02");

    // Seed AI request logs with real cost
    // Source: db.aIRequestLog.costUsd — these sum to the AI cost
    await db.aIRequestLog.createMany({
      data: [
        {
          companySlug: TEST_SLUG,
          requestType: "ocr",
          resolvedBy: "ai",
          costUsd: 0.01,
          latencyMs: 500,
          createdAt: new Date("2025-01-01T12:00:00"),
        },
        {
          companySlug: TEST_SLUG,
          requestType: "ocr",
          resolvedBy: "ai",
          costUsd: 0.02,
          latencyMs: 400,
          createdAt: new Date("2025-01-01T13:00:00"),
        },
        {
          companySlug: TEST_SLUG,
          requestType: "ocr",
          resolvedBy: "cache",
          costUsd: 0,
          latencyMs: 5,
          createdAt: new Date("2025-01-01T14:00:00"),
        },
      ],
    });

    const snapshot = await saveProfitSnapshot(TEST_SLUG, periodStart, periodEnd);

    // Source: db.company.plan = 'business' → $99/month → $99/30 * 1 day ≈ $3.30
    expect(snapshot.revenueUsd).toBeGreaterThan(0);

    // Source: db.aIRequestLog.aggregate SUM(costUsd) = 0.01 + 0.02 = 0.03
    expect(snapshot.aiCostUsd).toBe(0.03);

    // Source: ESTIMATED_INFRA_COST_PER_DAY * 1 = $5.00
    expect(snapshot.infraCostUsd).toBe(5);

    // Source: workerPoolSize(4) * ESTIMATED_WORKER_COST_PER_DAY(0.50) * 1 = $2.00
    expect(snapshot.workerCostUsd).toBe(2);

    // Source: revenue - infra - aiCost - workerCost
    expect(snapshot.profitUsd).toBe(
      Math.round((snapshot.revenueUsd - 5 - 0.03 - 2) * 100) / 100,
    );

    // Verify it was persisted to ProfitSnapshot table
    const dbSnapshot = await db.profitSnapshot.findFirst({
      where: { companySlug: TEST_SLUG, periodStart, periodEnd },
    });
    expect(dbSnapshot).not.toBeNull();
    expect(dbSnapshot!.aiCostUsd).toBe(0.03);
  });

  it("should return profit history via getProfitHistory", async () => {
    const day1Start = new Date("2025-01-01");
    const day1End = new Date("2025-01-02");
    const day2Start = new Date("2025-01-02");
    const day2End = new Date("2025-01-03");

    // Save 2 snapshots
    await saveProfitSnapshot(TEST_SLUG, day1Start, day1End);
    await saveProfitSnapshot(TEST_SLUG, day2Start, day2End);

    // Source: db.profitSnapshot.findMany order by periodStart desc
    const history = await getProfitHistory(TEST_SLUG, 10);

    expect(history).toHaveLength(2);
    // Most recent first
    expect(history[0].periodStart.getTime()).toBe(day2Start.getTime());
    expect(history[1].periodStart.getTime()).toBe(day1Start.getTime());

    // Verify each entry has all fields
    for (const entry of history) {
      expect(entry.companySlug).toBe(TEST_SLUG);
      expect(typeof entry.revenueUsd).toBe("number");
      expect(typeof entry.aiCostUsd).toBe("number");
      expect(typeof entry.infraCostUsd).toBe("number");
      expect(typeof entry.workerCostUsd).toBe("number");
      expect(typeof entry.profitUsd).toBe("number");
    }
  });

  it("should limit profit history to requested period count", async () => {
    // Save 5 daily snapshots
    for (let d = 1; d <= 5; d++) {
      const start = new Date(`2025-01-0${d}`);
      const end = new Date(`2025-01-0${d + 1}`);
      await saveProfitSnapshot(TEST_SLUG, start, end);
    }

    // Request only 3
    const history = await getProfitHistory(TEST_SLUG, 3);
    expect(history).toHaveLength(3);
  });

  it("should return empty history for company with no snapshots", async () => {
    const history = await getProfitHistory("nonexistent-company", 10);
    expect(history).toHaveLength(0);
  });

  it("should aggregate platform profit across all companies", async () => {
    const periodStart = new Date("2025-01-01");
    const periodEnd = new Date("2025-01-02");

    // Seed AI cost for both companies
    await db.aIRequestLog.create({
      data: {
        companySlug: TEST_SLUG,
        requestType: "ocr",
        resolvedBy: "ai",
        costUsd: 0.05,
        latencyMs: 300,
        createdAt: new Date("2025-01-01T12:00:00"),
      },
    });
    await db.aIRequestLog.create({
      data: {
        companySlug: TEST_SLUG_2,
        requestType: "ocr",
        resolvedBy: "ai",
        costUsd: 0.03,
        latencyMs: 350,
        createdAt: new Date("2025-01-01T12:00:00"),
      },
    });

    // Save snapshots for both
    const snap1 = await saveProfitSnapshot(TEST_SLUG, periodStart, periodEnd);
    const snap2 = await saveProfitSnapshot(TEST_SLUG_2, periodStart, periodEnd);

    // Source: db.profitSnapshot.aggregate SUM across all companies
    const platform = await getPlatformProfit(periodStart, periodEnd);

    expect(platform.companySlug).toBe("platform");
    expect(platform.companyCount).toBeGreaterThanOrEqual(2);

    // Revenue should be sum of both
    expect(platform.revenueUsd).toBe(
      Math.round((snap1.revenueUsd + snap2.revenueUsd) * 100) / 100,
    );

    // AI cost should be sum: 0.05 + 0.03 = 0.08
    expect(platform.aiCostUsd).toBe(0.08);
  });

  it("should return zeros for platform profit when no snapshots exist", async () => {
    const periodStart = new Date("2099-01-01");
    const periodEnd = new Date("2099-01-02");

    const platform = await getPlatformProfit(periodStart, periodEnd);

    expect(platform.revenueUsd).toBe(0);
    expect(platform.aiCostUsd).toBe(0);
    expect(platform.infraCostUsd).toBe(0);
    expect(platform.workerCostUsd).toBe(0);
    expect(platform.profitUsd).toBe(0);
  });

  it("should use trial plan ($0) for revenue when company is on trial", async () => {
    // Clean and create a trial company
    const trialSlug = "test-trial-co";
    await db.company.deleteMany({ where: { slug: trialSlug } });
    const trialCompany = await db.company.create({
      data: {
        name: "Trial Co",
        slug: trialSlug,
        plan: "trial",
      },
    });
    await db.companyRuntime.create({
      data: { companyId: trialCompany.id, workerPoolSize: 1, status: "active" },
    });

    const periodStart = new Date("2025-03-01");
    const periodEnd = new Date("2025-03-02");

    const snapshot = await saveProfitSnapshot(trialSlug, periodStart, periodEnd);

    // Source: PLAN_REVENUE_MONTHLY_USD['trial'] = 0 → revenue = $0
    expect(snapshot.revenueUsd).toBe(0);
    expect(snapshot.profitUsd).toBeLessThan(0); // costs exceed zero revenue

    // Cleanup
    await db.companyRuntime.deleteMany({ where: { companyId: trialCompany.id } });
    await db.company.delete({ where: { id: trialCompany.id } });
  });
});