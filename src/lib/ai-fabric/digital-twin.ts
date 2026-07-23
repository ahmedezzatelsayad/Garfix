/**
 * ai-fabric/digital-twin.ts — Phase 7: Lightweight company snapshot builder.
 *
 * Builds a cached "digital twin" summary for a company that the AI Fabric
 * cascade can reference. The snapshot is stored in AIMemoryEntry with
 * category='digital-twin' and cached for 15 minutes.
 *
 * Data sources (all real DB queries):
 *   - Customer count: db.client.count
 *   - Top products: db.productCatalog.findMany (take 10)
 *   - Inventory summary: db.inventoryItem.aggregate
 *   - Recent financial decisions: db.aIMemoryEntry (category='decision', take 5)
 *
 * Cache: db.aIMemoryEntry with category='digital-twin', refreshed every 15 min
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompanySnapshot {
  companySlug: string;
  builtAt: string; // ISO timestamp
  customerCount: number;
  topProducts: Array<{ name: string; code: string | null }>;
  inventorySummary: {
    totalItems: number;
    totalQuantity: number;
    lowStockItems: number;
  };
  recentDecisions: Array<{ id: number; content: string; lastAccessedAt: string }>;
}

// Cache TTL: 15 minutes
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Build a lightweight company snapshot from real DB data.
 *
 * Gathers:
 *   1. Customer count — Source: db.client.count({ where: { companySlug, deletedAt: null } })
 *   2. Top products   — Source: db.productCatalog.findMany({ take: 10, orderBy: { createdAt: 'desc' } })
 *   3. Inventory      — Source: db.inventoryItem.aggregate (total items, total qty, low stock)
 *   4. Decisions      — Source: db.aIMemoryEntry.findMany({ category: 'decision', take: 5 })
 */
export async function buildCompanySnapshot(
  companySlug: string,
): Promise<CompanySnapshot> {
  // ── 1. Customer count ──────────────────────────────────────────────────
  // Source: db.client.count where companySlug and not soft-deleted
  const customerCount = await db.client.count({
    where: { companySlug, deletedAt: null },
  });

  // ── 2. Top products by name (most recent 10) ──────────────────────────
  // Source: db.productCatalog.findMany take 10 ordered by createdAt desc
  const topProducts = await db.productCatalog.findMany({
    where: { companySlug },
    select: { name: true, code: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // ── 3. Inventory status summary ────────────────────────────────────────
  // Source: db.inventoryItem.aggregate for total items and total quantity
  const inventoryAgg = await db.inventoryItem.aggregate({
    where: { companySlug },
    _count: true, // total inventory items (rows)
  });

  // Source: db.inventoryItem.aggregate for sum of quantity
  // quantity is stored as String in schema, so we must query and sum manually
  const inventoryItems = await db.inventoryItem.findMany({
    where: { companySlug },
    select: { quantity: true, reorderLevel: true },
  });

  let totalQuantity = 0;
  let lowStockItems = 0;
  for (const item of inventoryItems) {
    const qty = parseFloat(item.quantity) || 0;
    const reorder = parseFloat(item.reorderLevel) || 0;
    totalQuantity += qty;
    if (qty <= reorder) {
      lowStockItems++;
    }
  }

  // ── 4. Recent financial decisions ──────────────────────────────────────
  // Source: db.aIMemoryEntry where category='decision', take 5
  const recentDecisions = await db.aIMemoryEntry.findMany({
    where: {
      companySlug,
      category: "decision",
    },
    select: {
      id: true,
      content: true,
      lastAccessedAt: true,
    },
    orderBy: { lastAccessedAt: "desc" },
    take: 5,
  });

  const snapshot: CompanySnapshot = {
    companySlug,
    builtAt: new Date().toISOString(),
    customerCount,
    topProducts: topProducts.map((p) => ({ name: p.name, code: p.code })),
    inventorySummary: {
      totalItems: inventoryAgg._count,
      totalQuantity: Math.round(totalQuantity * 100) / 100,
      lowStockItems,
    },
    recentDecisions: recentDecisions.map((d) => ({
      id: d.id,
      content: d.content,
      lastAccessedAt: d.lastAccessedAt.toISOString(),
    })),
  };

  // ── Cache the snapshot in AIMemoryEntry ────────────────────────────────
  // Source: db.aIMemoryEntry with category='digital-twin'
  try {
    await db.aIMemoryEntry.upsert({
      where: {
        id: await getSnapshotEntryId(companySlug),
      },
      create: {
        companySlug,
        category: "digital-twin",
        content: JSON.stringify(snapshot),
      },
      update: {
        content: JSON.stringify(snapshot),
        lastAccessedAt: new Date(),
      },
    });
  } catch {
    // If upsert fails (e.g., no existing entry), fall back to create
    await db.aIMemoryEntry.create({
      data: {
        companySlug,
        category: "digital-twin",
        content: JSON.stringify(snapshot),
      },
    });
  }

  logger.info("[digital-twin] built and cached snapshot", {
    companySlug,
    customerCount,
    productCount: topProducts.length,
    inventoryItems: inventoryAgg._count,
  });

  return snapshot;
}

/**
 * Get the cached snapshot for a company. Returns null if not cached or expired.
 *
 * Cache TTL: 15 minutes. Checks lastAccessedAt of the 'digital-twin'
 * AIMemoryEntry. If expired, returns null (caller should call buildCompanySnapshot).
 *
 * Source: db.aIMemoryEntry where category='digital-twin' and companySlug
 */
export async function getCachedSnapshot(
  companySlug: string,
): Promise<CompanySnapshot | null> {
  // Source: db.aIMemoryEntry where category='digital-twin', order by lastAccessedAt desc, take 1
  const entry = await db.aIMemoryEntry.findFirst({
    where: {
      companySlug,
      category: "digital-twin",
    },
    orderBy: { lastAccessedAt: "desc" },
  });

  if (!entry) return null;

  // Check if cache is still valid (15-minute TTL)
  const ageMs = Date.now() - entry.lastAccessedAt.getTime();
  if (ageMs > SNAPSHOT_TTL_MS) {
    return null; // expired — caller should rebuild
  }

  try {
    const snapshot = JSON.parse(entry.content) as CompanySnapshot;

    // Update lastAccessedAt (touch the cache entry)
    await db.aIMemoryEntry.update({
      where: { id: entry.id },
      data: { lastAccessedAt: new Date() },
    });

    return snapshot;
  } catch {
    // Corrupted JSON — return null so caller rebuilds
    return null;
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Find the existing snapshot entry ID for upsert.
 * Returns 0 if no entry exists (upsert will fail, caught by fallback create).
 */
async function getSnapshotEntryId(companySlug: string): Promise<number> {
  const entry = await db.aIMemoryEntry.findFirst({
    where: { companySlug, category: "digital-twin" },
    select: { id: true },
    orderBy: { lastAccessedAt: "desc" },
  });
  return entry?.id ?? 0;
}