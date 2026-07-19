/**
 * /api/inventory/items
 * GET  — list inventory items with stock levels + status (OK / Low / Out)
 * POST — adjust stock (create or update an inventory item)
 *
 * Both require `settings_access` permission.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { recordStockMovement } from "@/lib/inventorySync";

const AdjustSchema = z.object({
  companySlug: z.string().min(1),
  warehouseId: z.number().int().positive(),
  productId: z.number().int().positive(),
  quantity: z.union([z.number(), z.string()]).default("0"),
  reorderLevel: z.union([z.number(), z.string()]).default("0"),
  reorderQty: z.union([z.number(), z.string()]).default("0"),
  batchNumber: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  mode: z.enum(["set", "adjust"]).default("set"), // set = absolute, adjust = +/- delta
});

/** Status: "Out" if quantity <= 0, "Low" if quantity <= reorderLevel, "OK" otherwise. */
function computeStatus(qty: number, reorderLevel: number): "OK" | "Low" | "Out" {
  if (qty <= 0) return "Out";
  if (reorderLevel > 0 && qty <= reorderLevel) return "Low";
  return "OK";
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;

  const warehouseIdParam = sp.get("warehouseId");
  const warehouseId = warehouseIdParam ? parseInt(warehouseIdParam) : undefined;
  const status = sp.get("status") || undefined; // optional filter OK | Low | Out

  const where: Record<string, unknown> = { companySlug };
  if (warehouseId && !Number.isNaN(warehouseId)) where.warehouseId = warehouseId;

  const items = await db.inventoryItem.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: {
      product: true,
      warehouse: true,
    },
    take: 500,
  });

  const mapped = items.map((it) => {
    const qty = num(it.quantity, 3);
    const reorder = num(it.reorderLevel, 3);
    const itemStatus = computeStatus(qty, reorder);
    return {
      id: it.id,
      companySlug: it.companySlug,
      warehouseId: it.warehouseId,
      warehouseName: it.warehouse?.name || "—",
      warehouseCode: it.warehouse?.code || "—",
      productId: it.productId,
      productCode: it.product?.code || null,
      productName: it.product?.name || "—",
      quantity: qty,
      reorderLevel: reorder,
      reorderQty: num(it.reorderQty, 3),
      batchNumber: it.batchNumber,
      expiryDate: it.expiryDate,
      status: itemStatus,
      updatedAt: it.updatedAt,
    };
  });

  const filtered = status ? mapped.filter((m) => m.status === status) : mapped;

  // Summary counts
  const summary = {
    total: mapped.length,
    ok: mapped.filter((m) => m.status === "OK").length,
    low: mapped.filter((m) => m.status === "Low").length,
    out: mapped.filter((m) => m.status === "Out").length,
  };

  return NextResponse.json({ items: filtered, summary });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = AdjustSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "settings_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate warehouse + product belong to the same company
  const [warehouse, product] = await Promise.all([
    db.warehouse.findUnique({ where: { id: data.warehouseId } }),
    db.productCatalog.findUnique({ where: { id: data.productId } }),
  ]);
  if (!warehouse || warehouse.companySlug !== data.companySlug) {
    return apiError("المستودع غير موجود أو لا يتبع لهذه الشركة", 400);
  }
  if (!product || product.companySlug !== data.companySlug) {
    return apiError("المنتج غير موجود أو لا يتبع لهذه الشركة", 400);
  }

  const existing = await db.inventoryItem.findUnique({
    where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } },
  });

  const newQuantity =
    data.mode === "adjust"
      ? num(existing?.quantity || "0", 3) + num(data.quantity, 3)
      : num(data.quantity, 3);

  if (newQuantity < 0) {
    return apiError("لا يمكن تقليل المخزون تحت الصفر", 400);
  }

  if (existing) {
    // Season Finale Audit §3.3 + Apply Founder Decisions §2 fix:
    // recordStockMovement must be called on manual adjustments so the
    // StockMovement ledger stays consistent with InventoryItem.quantity.
    // Wrapped in a transaction so the ledger + inventory update atomically.
    const prevQty = num(existing.quantity, 3);
    const signedDelta = newQuantity - prevQty; // +ve = stock in, -ve = stock out
    const updated = await db.$transaction(async (tx) => {
      const item = await tx.inventoryItem.update({
        where: { id: existing.id },
        data: {
          quantity: newQuantity.toFixed(3),
          reorderLevel: num(data.reorderLevel, 3).toFixed(3),
          reorderQty: num(data.reorderQty, 3).toFixed(3),
          batchNumber: data.batchNumber ?? existing.batchNumber,
          expiryDate: data.expiryDate ?? existing.expiryDate,
        },
      });
      // Only record a movement if the quantity actually changed.
      if (Math.abs(signedDelta) > 0.0001) {
        await recordStockMovement(
          tx, data.companySlug, data.productId, data.warehouseId,
          signedDelta,
          "manual_adjustment",
          null,
          data.mode === "adjust"
            ? `manual ${signedDelta > 0 ? "add" : "remove"}: delta ${signedDelta.toFixed(3)} (was ${prevQty.toFixed(3)} → now ${newQuantity.toFixed(3)})`
            : `manual set: was ${prevQty.toFixed(3)} → now ${newQuantity.toFixed(3)}`,
          user.uid,
        );
      }
      return item;
    });
    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "adjust_stock",
      entity: "inventory_item",
      entityId: updated.id,
      companySlug: data.companySlug,
      details: {
        mode: data.mode,
        delta: data.mode === "adjust" ? data.quantity : null,
        newQuantity: newQuantity.toFixed(3),
        productId: data.productId,
        warehouseId: data.warehouseId,
        stockMovementRecorded: Math.abs(signedDelta) > 0.0001,
      },
    });
    return NextResponse.json({ ok: true, item: updated });
  }

  // Create path: also record an initial-stock StockMovement so the ledger
  // has a row for the starting quantity.
  const initialQty = num(data.quantity, 3);
  const created = await db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        companySlug: data.companySlug,
        warehouseId: data.warehouseId,
        productId: data.productId,
        quantity: initialQty.toFixed(3),
        reorderLevel: num(data.reorderLevel, 3).toFixed(3),
        reorderQty: num(data.reorderQty, 3).toFixed(3),
        batchNumber: data.batchNumber || null,
        expiryDate: data.expiryDate || null,
      },
    });
    if (initialQty > 0) {
      await recordStockMovement(
        tx, data.companySlug, data.productId, data.warehouseId,
        initialQty,
        "initial_stock",
        null,
        `manual create: initial stock ${initialQty.toFixed(3)}`,
        user.uid,
      );
    }
    return item;
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "inventory_item",
    entityId: created.id,
    companySlug: data.companySlug,
    details: { productId: data.productId, warehouseId: data.warehouseId, quantity: data.quantity, stockMovementRecorded: initialQty > 0 },
  });

  return NextResponse.json({ ok: true, item: created }, { status: 201 });
});
