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

import { num } from "./money";
import { logger } from "./logger";
import { matchProduct } from "./productMatcher";

// P5-M6 NOTE: This file's `tx` parameters use `any` because the file has ~13
// schema-drift bugs (e.g. `warehouseId_productId` compound unique constraint
// name mismatch, `createdBy` field missing on ProductMatchAudit,
// `productCatalogId` typed as `any` from upstream `product.id`) that `tx: any`
// was hiding. Fixing these is out of scope for the current lint cleanup — they
// should be addressed in a focused schema-reconciliation sprint.

export interface InventoryLineItem {
  description: string;
  qty: number;
  price: number;
}

export function isReviewQueueWarning(w: string): boolean {
  return w.startsWith("[REVIEW-QUEUE]");
}

export async function recordStockMovement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema-drift deferral: see P5-M6 note above
  tx: any, companySlug: string, productId: string | number | null, warehouseId: string | number,
  signedQty: number, sourceType: string, sourceId: string | number | null,
  note?: string, createdBy: string = "system",
): Promise<void> {
  try {
    // RECONCILED (20260823180000): الجدول الآن موحّد مع المخطط — كل الحقول
    // (type/quantity/sourceType/sourceId/note/createdBy) تُكتب عبر Prisma
    // نظيفًا بلا raw query (كانت الكتابة تفشل صامتة بسبب الأعمدة المزدوجة).
    const moveType = signedQty < 0 ? "out" : signedQty > 0 ? "in" : "adjustment";
    await tx.stockMovement.create({
      data: {
        companySlug,
        productId,
        warehouseRef: warehouseId ? { connect: { id: String(warehouseId) } } : undefined,
        type: moveType,
        sourceType,
        sourceId: sourceId === null ? null : String(sourceId),
        quantity: signedQty.toFixed(3),
        note: note ?? null,
        createdBy,
      },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema-drift deferral: see P5-M6 note above
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
      } catch (createErr: unknown) {
        logger.warn("[inventory-sync] product create collision — re-querying", { companySlug, description: item.description, err: (createErr instanceof Error ? createErr.message : String(createErr)) });
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

    // P0 FIX (مزامنة المخزون): المفتاح المركب warehouseId_productId غير معرّف في
    // schema.prisma (لا يوجد @@unique([warehouseId, productId])) — findUnique كان
    // يرمي خطأ ويفشل حفظ الفاتورة بالكامل. findFirst بنفس الفلتر يعتمد على
    // فهارس موجودة ويعطي نفس السلوك.
    const invItem = await tx.inventoryItem.findFirst({ where: { warehouseId: warehouse.id, productId: product.id } });

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema-drift deferral: see P5-M6 note above
  tx: any, companySlug: string, items: InventoryLineItem[], purchaseInvoiceId: string | number,
): Promise<InventorySyncResult> {
  const warnings: string[] = [];
  let productsCreated = 0;
  let inventoryUpdated = 0;
  // P2-Sprint5-D: PurchaseInvoice.id is a String (cuid) but matchProduct/ProductMatchAudit.invoiceId
  // expect a number — coerce to 0 for non-numeric IDs so audit fields don't error.
  const numericInvoiceId = typeof purchaseInvoiceId === "number" ? purchaseInvoiceId : 0;

  const warehouse = await tx.warehouse.findFirst({ where: { companySlug, isActive: true }, orderBy: { id: "asc" } });
  if (!warehouse) {
    warnings.push(`No active warehouse for "${companySlug}"`);
    return { productsCreated: 0, inventoryUpdated: 0, warehouseUsed: null, warnings };
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const qty = num(item.qty, 3);
    if (qty <= 0) continue;

    const match = await matchProduct({ description: item.description, qty, price: item.price, companySlug, invoiceId: numericInvoiceId, lineItemIndex: idx }, tx);

    let product;
    if (match.productId) product = await tx.productCatalog.findUnique({ where: { id: match.productId } });

    if (!product) {
      try {
        product = await tx.productCatalog.create({ data: { name: item.description, code: null, purchasePrice: item.price.toFixed(3), companySlug } });
        productsCreated++;
        await tx.productAlias.create({ data: { productCatalogId: product.id, companySlug, alias: item.description, language: "unspecified", source: "auto", confidence: 0.5, isVerified: false, createdBy: "inventory-sync-purchase" } });
      } catch (createErr: unknown) {
        logger.warn("[inventory-sync-purchase] collision", { companySlug, description: item.description, err: (createErr instanceof Error ? createErr.message : String(createErr)) });
        const reMatch = await matchProduct({ description: item.description, qty, price: item.price, companySlug, invoiceId: numericInvoiceId, lineItemIndex: idx }, tx);
        if (reMatch.productId) product = await tx.productCatalog.findUnique({ where: { id: reMatch.productId } });
        if (!product) {
          warnings.push(`[REVIEW-QUEUE] Purchase invoice #${purchaseInvoiceId} line ${idx}: product "${item.description}" orphaned`);
          try {
            await tx.productMatchAudit.create({ data: { companySlug, inputText: item.description, matchedProductId: null, matchedAlias: null, confidence: 0, tier: "collision-recovery-failed", action: "collision-recovery-skipped", invoiceId: numericInvoiceId, createdBy: "inventory-sync-purchase-collision-fallback" } });
            await recordStockMovement(tx, companySlug, null, warehouse.id, 0, "collision-recovery", purchaseInvoiceId, `orphan purchase item: "${item.description}" qty ${qty}`);
          } catch (auditErr) { logger.error("[inventory-sync-purchase] audit failed", { err: auditErr instanceof Error ? auditErr.message : String(auditErr) }); }
          continue;
        }
      }
    }

    // P0 FIX (مزامنة المخزون): المفتاح المركب warehouseId_productId غير معرّف في
    // schema.prisma (لا يوجد @@unique([warehouseId, productId])) — findUnique كان
    // يرمي خطأ ويفشل حفظ الفاتورة بالكامل. findFirst بنفس الفلتر يعتمد على
    // فهارس موجودة ويعطي نفس السلوك.
    const invItem = await tx.inventoryItem.findFirst({ where: { warehouseId: warehouse.id, productId: product.id } });
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
