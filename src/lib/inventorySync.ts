/**
 * inventorySync.ts — Shared inventory-update logic for ALL invoice-creation paths.
 *
 * Features:
 * - Bilingual product matching via matchProduct()
 * - Collision recovery (race condition on new product creation)
 * - Oversell BLOCKING (Task 24: block with warning, not backorder)
 * - StockMovement ledger recording (every quantity change)
 * - [REVIEW-QUEUE] + [OVERSELL] warnings surfaced to callers
 */

import { db } from "./db";
import { num } from "./money";
import { logger } from "./logger";
import { matchProduct } from "./productMatcher";

export interface InventoryLineItem {
  description: string;
  qty: number;
  price: number;
}

export function isReviewQueueWarning(w: string): boolean {
  return w.startsWith("[REVIEW-QUEUE]");
}

export async function recordStockMovement(
  tx: any, companySlug: string, productId: number | null, warehouseId: number,
  signedQty: number, sourceType: string, sourceId: number | null,
  note?: string, createdBy: string = "system",
): Promise<void> {
  try {
    await tx.stockMovement.create({
      data: { companySlug, productId, warehouseId, qty: signedQty.toFixed(3), sourceType, sourceId, note: note ?? null, createdBy },
    });
  } catch (err) {
    logger.error("[inventory-sync] failed to record stock movement", { companySlug, productId, signedQty, sourceType, err: err instanceof Error ? err.message : String(err) });
  }
}

export interface InventorySyncResult {
  productsCreated: number;
  inventoryUpdated: number;
  warehouseUsed: string | null;
  warnings: string[];
}

export async function syncInventoryOnSale(
  tx: any, companySlug: string, items: InventoryLineItem[], invoiceId: number,
): Promise<InventorySyncResult> {
  const warnings: string[] = [];
  let productsCreated = 0;
  let inventoryUpdated = 0;

  const warehouse = await tx.warehouse.findFirst({ where: { companySlug, isActive: true }, orderBy: { id: "asc" } });
  if (!warehouse) {
    warnings.push(`No active warehouse found for company "${companySlug}" — inventory update skipped`);
    return { productsCreated: 0, inventoryUpdated: 0, warehouseUsed: null, warnings };
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const qty = num(item.qty, 3);
    if (qty <= 0) continue;

    const match = await matchProduct({ description: item.description, qty, price: item.price, companySlug, invoiceId, lineItemIndex: idx }, tx);

    let product;
    if (match.productId) {
      product = await tx.productCatalog.findUnique({ where: { id: match.productId } });
    }

    if (!product) {
      try {
        product = await tx.productCatalog.create({ data: { name: item.description, code: null, sellingPrice: item.price.toFixed(3), companySlug } });
        productsCreated++;
        await tx.productAlias.create({ data: { productCatalogId: product.id, companySlug, alias: item.description, language: "unspecified", source: "auto", confidence: 0.5, isVerified: false, createdBy: "inventory-sync" } });
      } catch (createErr: any) {
        logger.warn("[inventory-sync] product create collision — re-querying", { companySlug, description: item.description, err: createErr?.message });
        const reMatch = await matchProduct({ description: item.description, qty, price: item.price, companySlug, invoiceId, lineItemIndex: idx }, tx);
        if (reMatch.productId) product = await tx.productCatalog.findUnique({ where: { id: reMatch.productId } });
        if (!product) {
          const warningMsg = `[REVIEW-QUEUE] Invoice #${invoiceId} line ${idx}: product "${item.description}" orphaned (collision-recovery failed; inventory NOT decremented for qty ${qty})`;
          warnings.push(warningMsg);
          logger.error("[inventory-sync] collision-recovery failed — orphan invoice item", { companySlug, invoiceId, lineItemIndex: idx, description: item.description, qty });
          try {
            await tx.productMatchAudit.create({ data: { companySlug, inputText: item.description, matchedProductId: null, matchedAlias: null, confidence: 0, tier: "collision-recovery-failed", action: "collision-recovery-skipped", invoiceId, createdBy: "inventory-sync-collision-fallback" } });
            await recordStockMovement(tx, companySlug, null, warehouse.id, 0, "collision-recovery", invoiceId, `orphan item: "${item.description}" qty ${qty} — inventory NOT decremented`);
          } catch (auditErr) {
            logger.error("[inventory-sync] failed to write collision-recovery audit entry", { companySlug, invoiceId, err: auditErr instanceof Error ? auditErr.message : String(auditErr) });
          }
          continue;
        }
      }
    }

    const invItem = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } } });

    if (invItem) {
      const currentQty = num(invItem.quantity, 3);
      const newQty = currentQty - qty;
      // TASK 24: oversell BLOCKED
      if (newQty < 0) {
        const overQty = Math.abs(newQty).toFixed(3);
        warnings.push(`[OVERSELL] المنتج "${item.description}" (id=${product.id}): المخزون الحالي ${currentQty.toFixed(3)}، الكمية المطلوبة ${qty.toFixed(3)}، النقص ${overQty}. لم يتم خصم المخزون.`);
        logger.warn("[inventory-sync] oversell blocked", { companySlug, invoiceId, description: item.description, productId: product.id, currentQty, requestedQty: qty, overQty });
        await recordStockMovement(tx, companySlug, product.id, warehouse.id, 0, "sale", invoiceId, `oversell blocked: requested ${qty}, available ${currentQty}, shortage ${overQty}`);
        continue;
      }
      await tx.inventoryItem.update({ where: { id: invItem.id }, data: { quantity: newQty.toFixed(3) } });
      await recordStockMovement(tx, companySlug, product.id, warehouse.id, -qty, "sale", invoiceId);
      inventoryUpdated++;
    } else {
      // TASK 24: no existing inventory = oversell BLOCKED
      warnings.push(`[OVERSELL] المنتج "${item.description}" (id=${product.id}): لا يوجد مخزون مسجل لهذا المنتج. لم يتم خصم المخزون.`);
      logger.warn("[inventory-sync] oversell blocked — no existing inventory", { companySlug, invoiceId, description: item.description, productId: product.id, requestedQty: qty });
      await recordStockMovement(tx, companySlug, product.id, warehouse.id, 0, "sale", invoiceId, `oversell blocked: no existing inventory, requested ${qty}`);
      continue;
    }
  }

  return { productsCreated, inventoryUpdated, warehouseUsed: warehouse.name, warnings };
}

export async function syncInventoryOnPurchase(
  tx: any, companySlug: string, items: InventoryLineItem[], purchaseInvoiceId: number,
): Promise<InventorySyncResult> {
  const warnings: string[] = [];
  let productsCreated = 0;
  let inventoryUpdated = 0;

  const warehouse = await tx.warehouse.findFirst({ where: { companySlug, isActive: true }, orderBy: { id: "asc" } });
  if (!warehouse) {
    warnings.push(`No active warehouse for "${companySlug}"`);
    return { productsCreated: 0, inventoryUpdated: 0, warehouseUsed: null, warnings };
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const qty = num(item.qty, 3);
    if (qty <= 0) continue;

    const match = await matchProduct({ description: item.description, qty, price: item.price, companySlug, invoiceId: purchaseInvoiceId, lineItemIndex: idx }, tx);

    let product;
    if (match.productId) product = await tx.productCatalog.findUnique({ where: { id: match.productId } });

    if (!product) {
      try {
        product = await tx.productCatalog.create({ data: { name: item.description, code: null, purchasePrice: item.price.toFixed(3), companySlug } });
        productsCreated++;
        await tx.productAlias.create({ data: { productCatalogId: product.id, companySlug, alias: item.description, language: "unspecified", source: "auto", confidence: 0.5, isVerified: false, createdBy: "inventory-sync-purchase" } });
      } catch (createErr: any) {
        logger.warn("[inventory-sync-purchase] collision", { companySlug, description: item.description, err: createErr?.message });
        const reMatch = await matchProduct({ description: item.description, qty, price: item.price, companySlug, invoiceId: purchaseInvoiceId, lineItemIndex: idx }, tx);
        if (reMatch.productId) product = await tx.productCatalog.findUnique({ where: { id: reMatch.productId } });
        if (!product) {
          warnings.push(`[REVIEW-QUEUE] Purchase invoice #${purchaseInvoiceId} line ${idx}: product "${item.description}" orphaned`);
          try {
            await tx.productMatchAudit.create({ data: { companySlug, inputText: item.description, matchedProductId: null, matchedAlias: null, confidence: 0, tier: "collision-recovery-failed", action: "collision-recovery-skipped", invoiceId: purchaseInvoiceId, createdBy: "inventory-sync-purchase-collision-fallback" } });
            await recordStockMovement(tx, companySlug, null, warehouse.id, 0, "collision-recovery", purchaseInvoiceId, `orphan purchase item: "${item.description}" qty ${qty}`);
          } catch (auditErr) { logger.error("[inventory-sync-purchase] audit failed", { err: auditErr instanceof Error ? auditErr.message : String(auditErr) }); }
          continue;
        }
      }
    }

    const invItem = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } } });
    if (invItem) {
      const currentQty = num(invItem.quantity, 3);
      await tx.inventoryItem.update({ where: { id: invItem.id }, data: { quantity: (currentQty + qty).toFixed(3) } });
      await recordStockMovement(tx, companySlug, product.id, warehouse.id, qty, "purchase", purchaseInvoiceId);
    } else {
      await tx.inventoryItem.create({ data: { companySlug, warehouseId: warehouse.id, productId: product.id, quantity: qty.toFixed(3), reorderLevel: "0", reorderQty: "0" } });
      await recordStockMovement(tx, companySlug, product.id, warehouse.id, qty, "purchase", purchaseInvoiceId, "initial stock: no existing inventory");
    }
    inventoryUpdated++;
  }

  return { productsCreated, inventoryUpdated, warehouseUsed: warehouse.name, warnings };
}
