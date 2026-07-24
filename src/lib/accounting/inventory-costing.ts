/**
 * inventory-costing.ts — Inventory Costing Methods Engine (Phase 6)
 *
 * Provides FIFO, Weighted Average, and Standard Cost costing methods,
 * inventory valuation reports, landed cost allocation, and inventory
 * adjustment journal entries.
 *
 * ALL monetary values are String — use num()/toNum()/addNums()/mulNums() from money.ts.
 */
import { db } from "@/lib/db";
import { num, addNums, mulNums, subNums, toNum } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CostingMethod = "fifo" | "weighted_average" | "standard_cost";

export interface COGSResult {
  cogsPerUnit: string;
  totalCOGS: string;
  costingMethod: CostingMethod;
  remainingQty: string;
  remainingValue: string;
}

export interface InventoryValuationItem {
  itemId: number;
  name: string;
  qty: string;
  unitCost: string;
  totalValue: string;
  method: CostingMethod;
}

export interface InventoryValuationResult {
  items: InventoryValuationItem[];
  totalValue: string;
}

export interface LandedCostAllocationInput {
  allocationId: number;
  costType: string;
  totalCost: string;
  allocationMethod: "quantity" | "value" | "weight" | "volume";
  lines: LandedCostLineInput[];
}

export interface LandedCostLineInput {
  itemId?: number;
  productId?: number;
  baseQuantity?: string;
  baseValue?: string;
  weight?: string;
  volume?: string;
}

export interface LandedCostAllocationResult {
  lines: Array<{
    itemId?: number;
    productId?: number;
    allocatedCost: string;
    newUnitCost: string;
  }>;
}

export interface InventoryAdjustmentInput {
  companySlug: string;
  userEmail: string;
  userUid: string;
  itemId: number;
  bookQty: string;
  physicalQty: string;
  unitCost: string;
  description?: string;
  date: string;
  inventoryAccountId: number;
  cogsAccountId: number;
}

// ── FIFO Costing ───────────────────────────────────────────────────────────────

/**
 * calculateCOGS — compute COGS for a sale using the specified costing method.
 *
 * FIFO: consume earliest purchase costs first.
 * Weighted Average: total cost / total quantity on hand.
 * Standard Cost: use a predefined standard cost per unit.
 */
export async function calculateCOGS(
  companySlug: string,
  itemId: number,
  quantitySold: string,
  costingMethod: CostingMethod,
): Promise<COGSResult> {
  const qtySold = num(quantitySold, 3);
  if (qtySold <= 0) {
    return {
      cogsPerUnit: "0.000",
      totalCOGS: "0.000",
      costingMethod,
      remainingQty: "0.000",
      remainingValue: "0.000",
    };
  }

  // Get all inbound stock movements for this item, ordered by date (FIFO order)
  const movements = await db.stockMovement.findMany({
    where: {
      companySlug,
      productId: itemId,
      sourceType: "purchase",
    },
    orderBy: { createdAt: "asc" },
  });

  if (costingMethod === "fifo") {
    return calculateFIFO(movements.map(m => ({ qty: m.qty, unitCost: m.unitCost?.toString() })), qtySold, costingMethod);
  }

  if (costingMethod === "weighted_average") {
    return calculateWeightedAverage(movements.map(m => ({ qty: m.qty, unitCost: m.unitCost?.toString() })), qtySold, costingMethod);
  }

  if (costingMethod === "standard_cost") {
    return calculateStandardCost(companySlug, itemId, qtySold, costingMethod);
  }

  throw new Error(`Unknown costing method: ${costingMethod}`);
}

function calculateFIFO(
  movements: Array<{ qty: string; unitCost?: string | null }>,
  qtySold: number,
  costingMethod: CostingMethod,
): COGSResult {
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
      // Remaining in this layer after consumption
      const layerRemainder = layerQty - consumed;
      remainingOnHand += layerRemainder;
      remainingOnHandValue += layerRemainder * layerCost;
    } else {
      remainingOnHand += layerQty;
      remainingOnHandValue += layerQty * layerCost;
    }
  }

  const cogsPerUnit = qtySold > 0 ? totalCOGS / qtySold : 0;

  return {
    cogsPerUnit: cogsPerUnit.toFixed(3),
    totalCOGS: totalCOGS.toFixed(3),
    costingMethod,
    remainingQty: remainingOnHand.toFixed(3),
    remainingValue: remainingOnHandValue.toFixed(3),
  };
}

function calculateWeightedAverage(
  movements: Array<{ qty: string; unitCost?: string | null }>,
  qtySold: number,
  costingMethod: CostingMethod,
): COGSResult {
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
  const cogsPerUnit = avgUnitCost;

  return {
    cogsPerUnit: cogsPerUnit.toFixed(3),
    totalCOGS: totalCOGS.toFixed(3),
    costingMethod,
    remainingQty: remainingOnHand.toFixed(3),
    remainingValue: remainingOnHandValue.toFixed(3),
  };
}

async function calculateStandardCost(
  companySlug: string,
  productId: number,
  qtySold: number,
  costingMethod: CostingMethod,
): Promise<COGSResult> {
  // Use the product's purchasePrice as the standard cost
  const product = await db.productCatalog.findFirst({
    where: { id: productId, companySlug },
  });

  const standardCost = product ? num(product.purchasePrice, 3) : 0;
  const totalCOGS = qtySold * standardCost;

  // Get current on-hand quantity from inventory items
  const inventoryItems = await db.inventoryItem.findMany({
    where: { companySlug, productId },
  });
  const totalOnHand = inventoryItems.reduce((s: number, i: { quantity: string }) => s + num(i.quantity, 3), 0);
  const remainingOnHand = totalOnHand - qtySold;
  const remainingOnHandValue = remainingOnHand * standardCost;

  return {
    cogsPerUnit: standardCost.toFixed(3),
    totalCOGS: totalCOGS.toFixed(3),
    costingMethod,
    remainingQty: remainingOnHand.toFixed(3),
    remainingValue: remainingOnHandValue.toFixed(3),
  };
}

// ── Inventory Valuation ─────────────────────────────────────────────────────────

/**
 * runInventoryValuation — calculate inventory value for all items in a company
 * as of a given date, using each item's costing method.
 */
export async function runInventoryValuation(
  companySlug: string,
  asOfDate: string,
): Promise<InventoryValuationResult> {
  // Default costing method — could be stored per-product or per-company in future
  const costingMethod: CostingMethod = "weighted_average";

  // Get all inventory items for the company
  const inventoryItems = await db.inventoryItem.findMany({
    where: { companySlug },
    include: { product: true },
  });

  const items: InventoryValuationItem[] = [];
  let totalValue = 0;

  for (const invItem of inventoryItems) {
    const qty = num(invItem.quantity, 3);

    // Get purchase movements for this product up to asOfDate
    const movements = await db.stockMovement.findMany({
      where: {
        companySlug,
        productId: invItem.productId,
        sourceType: "purchase",
        createdAt: { lte: new Date(asOfDate + "T23:59:59") },
      },
      orderBy: { createdAt: "asc" },
    });

    // Calculate weighted average unit cost from inbound movements
    let totalQty = 0;
    let totalCostValue = 0;
    for (const m of movements) {
      const mQty = num(m.qty, 3);
      const mCost = num(m.unitCost ?? "0", 3);
      totalQty += mQty;
      totalCostValue += mQty * mCost;
    }

    const unitCost = totalQty > 0 ? totalCostValue / totalQty : num(invItem.product.purchasePrice ?? "0", 3);
    const itemTotalValue = qty * unitCost;
    totalValue += itemTotalValue;

    items.push({
      itemId: invItem.id,
      name: invItem.product.name,
      qty: qty.toFixed(3),
      unitCost: unitCost.toFixed(3),
      totalValue: itemTotalValue.toFixed(3),
      method: costingMethod,
    });
  }

  return {
    items,
    totalValue: totalValue.toFixed(3),
  };
}

// ── Landed Cost Allocation ──────────────────────────────────────────────────────

/**
 * calculateLandedCost — distribute landed costs (shipping, customs, clearance, insurance)
 * across items based on the allocation method (by quantity, by value, by weight, by volume).
 *
 * Updates each item's effective cost per unit.
 */
export function calculateLandedCost(
  allocation: LandedCostAllocationInput,
): LandedCostAllocationResult {
  const totalCost = num(allocation.totalCost, 3);
  const method = allocation.allocationMethod;

  // Calculate the base total for proportional allocation
  let baseTotal = 0;
  const lineBases: number[] = [];

  for (const line of allocation.lines) {
    let base = 0;
    if (method === "quantity") {
      base = num(line.baseQuantity ?? "0", 3);
    } else if (method === "value") {
      base = num(line.baseValue ?? "0", 3);
    } else if (method === "weight") {
      base = num(line.weight ?? "0", 3);
    } else if (method === "volume") {
      base = num(line.volume ?? "0", 3);
    }
    lineBases.push(base);
    baseTotal += base;
  }

  if (baseTotal <= 0) {
    throw new Error(`Total base for allocation method "${method}" is zero — cannot allocate landed cost`);
  }

  const resultLines: Array<{
    itemId?: number;
    productId?: number;
    allocatedCost: string;
    newUnitCost: string;
  }> = [];

  for (let i = 0; i < allocation.lines.length; i++) {
    const line = allocation.lines[i];
    const base = lineBases[i];
    const proportion = base / baseTotal;
    const allocatedCost = totalCost * proportion;

    // Calculate new unit cost: allocated cost / quantity
    const lineQty = num(line.baseQuantity ?? "0", 3);
    const costPerUnit = lineQty > 0 ? allocatedCost / lineQty : 0;

    resultLines.push({
      itemId: line.itemId,
      productId: line.productId,
      allocatedCost: allocatedCost.toFixed(3),
      newUnitCost: costPerUnit.toFixed(3),
    });
  }

  return { lines: resultLines };
}

// ── Inventory Adjustment ────────────────────────────────────────────────────────

/**
 * recordInventoryAdjustment — create a journal entry for inventory discrepancy
 * (physical count vs book count).
 *
 * Shortfall (physical < book):
 *   Debit: COGS (loss)  |  Credit: Inventory
 *
 * Excess (physical > book):
 *   Debit: Inventory  |  Credit: COGS (gain) or Other Income
 */
export async function recordInventoryAdjustment(
  input: InventoryAdjustmentInput,
): Promise<{ journalEntryId: number; discrepancyQty: string; discrepancyValue: string }> {
  const bookQty = num(input.bookQty, 3);
  const physicalQty = num(input.physicalQty, 3);
  const unitCost = num(input.unitCost, 3);
  const discrepancy = bookQty - physicalQty;
  const discrepancyValue = Math.abs(discrepancy) * unitCost;

  if (Math.abs(discrepancy) < 0.001) {
    // No discrepancy — no adjustment needed
    return {
      journalEntryId: 0,
      discrepancyQty: "0.000",
      discrepancyValue: "0.000",
    };
  }

  const isShortfall = discrepancy > 0; // physical < book

  // Create journal entry for the adjustment
  const entry = await db.journalEntry.create({
    data: {
      companySlug: input.companySlug,
      date: input.date,
      description: input.description || `Inventory adjustment: ${isShortfall ? "shortfall" : "excess"} of ${Math.abs(discrepancy).toFixed(3)} units`,
      reference: `INV-ADJ-${input.itemId}`,
      status: "posted",
      createdBy: input.userEmail,
      sourceType: "inventory_adjustment",
      sourceId: input.itemId,
      lines: {
        create: isShortfall
          ? [
              // Shortfall: Debit COGS, Credit Inventory
              {
                accountId: input.cogsAccountId,
                debit: discrepancyValue.toFixed(3),
                credit: "0.000",
                description: `Inventory shortfall — ${Math.abs(discrepancy).toFixed(3)} units at ${unitCost.toFixed(3)} per unit`,
              },
              {
                accountId: input.inventoryAccountId,
                debit: "0.000",
                credit: discrepancyValue.toFixed(3),
                description: `Inventory shortfall — reduce book quantity`,
              },
            ]
          : [
              // Excess: Debit Inventory, Credit Other Income (use COGS account as offset)
              {
                accountId: input.inventoryAccountId,
                debit: discrepancyValue.toFixed(3),
                credit: "0.000",
                description: `Inventory excess — ${Math.abs(discrepancy).toFixed(3)} units at ${unitCost.toFixed(3)} per unit`,
              },
              {
                accountId: input.cogsAccountId,
                debit: "0.000",
                credit: discrepancyValue.toFixed(3),
                description: `Inventory excess — increase book quantity`,
              },
            ],
      },
    },
    include: { lines: true },
  });

  // Update account balances within the adjustment
  const accountIds = [input.inventoryAccountId, input.cogsAccountId];
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds }, companySlug: input.companySlug },
  });
  const accountMap: Map<any, any> = new Map(accounts.map((a) => [a.id, a]));

  for (const line of entry.lines) {
    const acc = accountMap.get(line.accountId);
    if (!acc) continue;
    const isDebitNormal = acc.type === "asset" || acc.type === "expense";
    const delta = isDebitNormal
      ? num(line.debit, 3) - num(line.credit, 3)
      : num(line.credit, 3) - num(line.debit, 3);
    const currentBalance = num(acc.balance, 3);
    await db.account.update({
      where: { id: acc.id },
      data: { balance: (currentBalance + delta).toFixed(3) },
    });
  }

  // Update inventory item quantity to match physical count
  await db.inventoryItem.update({
    where: { id: input.itemId },
    data: { quantity: physicalQty.toFixed(3) },
  });

  // Audit log
  await logAudit({
    userEmail: input.userEmail,
    userUid: input.userUid,
    action: isShortfall ? "inventory_shortfall" : "inventory_excess",
    entity: "inventory_adjustment",
    entityId: entry.id,
    companySlug: input.companySlug,
    details: {
      itemId: input.itemId,
      bookQty,
      physicalQty,
      discrepancy,
      discrepancyValue,
      journalEntryId: entry.id,
    },
  });

  return {
    journalEntryId: entry.id,
    discrepancyQty: discrepancy.toFixed(3),
    discrepancyValue: discrepancyValue.toFixed(3),
  };
}
