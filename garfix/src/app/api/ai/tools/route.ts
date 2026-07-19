/**
 * POST /api/ai/tools
 *
 * Executive AI Assistant — executes real commands on behalf of the user.
 *
 * Security model:
 *   1. User must be authenticated
 *   2. User must have the required permission for the action
 *   3. For destructive actions, a confirmation token is required (two-step)
 *   4. Every action is logged to AuditLog with action="ai_executed_[type]"
 *
 * Flow:
 *   Step 1: Client sends { intent, params, confirm: false }
 *     → Server validates params, returns a preview + confirmToken
 *   Step 2: Client sends { intent, params, confirm: true, confirmToken }
 *     → Server executes the action, returns result
 *
 * Supported intents:
 *   - create_invoice
 *   - list_invoices
 *   - list_clients
 *   - get_client_balance
 *   - mark_invoice_paid
 *   - create_client
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, type AuthPayload } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { calcInvoiceTotals, num } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { syncInventoryOnSale } from "@/lib/inventorySync";
import { logAiUsage } from "@/lib/ai/costTracker";

// In-memory confirmation tokens (TTL: 5 min)
const confirmTokens = new Map<string, { intent: string; params: unknown; userUid: string; expiresAt: number }>();

// Clean expired tokens every 5 min
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of confirmTokens) {
      if (val.expiresAt < now) confirmTokens.delete(key);
    }
  }, 300_000).unref?.();
}

const IntentSchema = z.object({
  intent: z.enum([
    "create_invoice", "list_invoices", "list_clients",
    "get_client_balance", "mark_invoice_paid", "create_client",
    // File 5 prerequisite fix: AI Copilot can adjust inventory (qty +/-, set, etc.)
    // via the SAME /api/inventory/items endpoint the Inventory page uses — single
    // source of truth, single audit trail, single permission gate.
    "adjust_inventory",
  ]),
  params: z.record(z.string(), z.unknown()),
  confirm: z.boolean().default(false),
  confirmToken: z.string().optional(),
});

interface ToolPreview {
  description: string;
  affectedRecords?: Array<{ type: string; id?: string | number; name?: string }>;
  warning?: string;
}

interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  reviewQueueWarnings?: string[];
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  const body = await parseJsonBody(req);
  const parsed = IntentSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const { intent, params, confirm, confirmToken } = parsed.data;

  const companySlug = params.companySlug as string | undefined;
  if (!companySlug) return apiError("companySlug required", 400);
  if (!assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ─── Step 1: Preview (confirm=false) ──────────────────────────────────────
  if (!confirm) {
    const preview = await generatePreview(intent, params, user);
    if (!preview) return apiError("Unknown intent", 400);

    const token = randomUUID();
    confirmTokens.set(token, {
      intent,
      params,
      userUid: user.uid,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return NextResponse.json({
      ok: true,
      needsConfirmation: true,
      confirmToken: token,
      preview,
    });
  }

  // ─── Step 2: Execute (confirm=true) ───────────────────────────────────────
  if (!confirmToken) return apiError("confirmToken required", 400);
  const stored = confirmTokens.get(confirmToken);
  if (!stored || stored.userUid !== user.uid || stored.intent !== intent) {
    return apiError("Invalid or expired confirmation token", 400);
  }
  confirmTokens.delete(confirmToken);

  // P0.2 FIX (AI Effectiveness prompt): capture execution latency around
  // executeIntent() only — not the whole handler (auth + token lookup are
  // excluded). tools/route.ts does NOT call an AI provider directly (the
  // conversational AI parsing happens in /api/ai/chat, then the structured
  // intent is dispatched here), so this logs as endpoint="tools" with
  // tokensIn=0/tokensOut=0 — the latency is what matters for this endpoint.
  const execT0 = Date.now();
  const execResult = await executeIntent(intent, params, user, companySlug);
  const execMs = Date.now() - execT0;

  // P0.1 FIX: log every tool execution to ai_usage_logs so the founder
  // dashboard can report per-endpoint latency for the copilot's action path.
  // Honest disclosure: there is no AI provider token consumption here — the
  // `success` flag reflects whether the intent executed without error.
  void logAiUsage({
    companySlug,
    userUid: user.uid,
    provider: "internal",
    model: "tool-executor",
    endpoint: "tools",
    tokensIn: 0,
    tokensOut: 0,
    processingMs: execMs,
    success: execResult.ok,
    errorMessage: execResult.ok ? null : execResult.summary,
  });

  return NextResponse.json({
    ok: execResult.ok,
    summary: execResult.summary,
    data: execResult.data,
    // P0.1 fix (Remaining Work Handoff): previously computed in executeIntent
    // but silently dropped from the response. AICopilotBubble now renders a
    // warning banner when this array is non-empty, matching the BulkInputView
    // banner pattern from GATE 5.1.
    reviewQueueWarnings: execResult.reviewQueueWarnings || [],
    needsConfirmation: false,
    meta: { processingMs: execMs },
  });
});

// ─── Preview generators ─────────────────────────────────────────────────────

async function generatePreview(intent: string, params: Record<string, unknown>, user: { uid: string; email: string; role: string; permissions: Record<string, number> }): Promise<ToolPreview | null> {
  switch (intent) {
    case "create_invoice": {
      const clientName = params.clientName as string;
      const items = params.items as Array<{ name: string; qty: number; price: number }>;
      if (!clientName || !Array.isArray(items) || items.length === 0) {
        return { description: "⚠️ بيانات ناقصة: مطلوب clientName و items[]" };
      }
      const subtotal = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
      return {
        description: `سيتم إنشاء فاتورة للعميل "${clientName}" بقيمة ${subtotal.toFixed(3)} (${items.length} بند)`,
        affectedRecords: [{ type: "invoice", name: `فاتورة لـ ${clientName}` }],
        warning: "هذا إجراء مالي — سيتم تسجيله في سجل التدقيق",
      };
    }
    case "list_invoices": {
      return {
        description: `سيتم عرض آخر ${params.limit || 10} فواتير${params.status ? ` بحالة "${params.status}"` : ""}`,
      };
    }
    case "list_clients": {
      return {
        description: `سيتم عرض ${params.limit || 10} عملاء${params.search ? ` مطابقين لـ "${params.search}"` : ""}`,
      };
    }
    case "get_client_balance": {
      const clientId = params.clientId as number;
      const client = await db.client.findUnique({ where: { id: clientId } });
      return {
        description: `سيتم عرض رصيد العميل "${client?.name || `#${clientId}`}"`,
      };
    }
    case "mark_invoice_paid": {
      const invoiceId = params.invoiceId as number;
      const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) return { description: "⚠️ الفاتورة غير موجودة" };
      return {
        description: `سيتم تعليم الفاتورة ${inv.invoiceNumber} (${inv.clientName}) كمكتملة الدفع بقيمة ${num(inv.total, 3)}`,
        warning: "هذا إجراء مالي — سيتم تسجيل الدفعة في سجل التدقيق",
      };
    }
    case "create_client": {
      return {
        description: `سيتم إنشاء عميل جديد: "${params.name}"`,
        affectedRecords: [{ type: "client", name: params.name as string }],
      };
    }
    case "adjust_inventory": {
      // File 5 prerequisite: AI Copilot inventory edit preview.
      const productId = Number(params.productId);
      const warehouseId = Number(params.warehouseId);
      const mode = (params.mode as "set" | "adjust") || "adjust";
      const delta = Number(params.quantity);
      const [product, warehouse] = await Promise.all([
        db.productCatalog.findUnique({ where: { id: productId } }),
        db.warehouse.findUnique({ where: { id: warehouseId } }),
      ]);
      if (!product || product.companySlug !== (params.companySlug as string)) {
        return { description: "⚠️ المنتج غير موجود أو لا يتبع لهذه الشركة" };
      }
      if (!warehouse || warehouse.companySlug !== (params.companySlug as string)) {
        return { description: "⚠️ المستودع غير موجود أو لا يتبع لهذه الشركة" };
      }
      const existing = await db.inventoryItem.findUnique({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      const currentQty = num(existing?.quantity || "0", 3);
      const newQty = mode === "adjust" ? currentQty + delta : delta;
      return {
        description: `سيتم ${mode === "adjust" ? (delta >= 0 ? "إضافة" : "خصم") : "ضبط"} مخزون "${product.name}" في مستودع "${warehouse.name}":
المخزون الحالي: ${currentQty.toFixed(3)}
${mode === "adjust" ? `الفرق: ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}` : ""}
المخزون الجديد: ${newQty.toFixed(3)}`,
        affectedRecords: [{ type: "inventory_item", id: existing?.id, name: product.name }],
        warning: newQty < 0
          ? "⚠️ هذا الإجراء سيجعل المخزون سالباً — سيتم رفضه (oversell محظور)"
          : "سيتم تسجيل الحركة في دفتر StockMovement مع audit trail",
      };
    }
    default:
      return null;
  }
}

// ─── Intent executors ───────────────────────────────────────────────────────

async function executeIntent(
  intent: string,
  params: Record<string, unknown>,
  user: AuthPayload,
  companySlug: string,
): Promise<ToolResult> {
  try {
    switch (intent) {
      case "create_invoice": {
        // Require create_invoice permission
        if (!hasPermission(user, "create_invoice")) {
          return { ok: false, summary: "ليس لديك صلاحية لإنشاء فواتير" };
        }
        const items = (params.items as Array<{ name: string; qty: number; price: number }>).map((it) => ({
          description: it.name,
          qty: num(it.qty),
          price: num(it.price, 3),
        }));
        const totals = calcInvoiceTotals(items, num(params.taxRate || 0), num(params.shipping || 0), num(params.discount || 0));
        const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
        const today = new Date().toISOString().slice(0, 10);
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const invoice = await db.invoice.create({
          data: {
            companySlug,
            invoiceNumber,
            clientName: params.clientName as string,
            clientPhone: (params.clientPhone as string) || null,
            clientEmail: (params.clientEmail as string) || null,
            issueDate: today,
            dueDate,
            status: "sent",
            lineItems: JSON.stringify(items),
            subtotal: totals.subtotal,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            shipping: totals.shipping,
            discount: totals.discount,
            paid: "0",
            source: "ai_assistant",
            createdByEmail: user.email,
            createdByName: user.uid,
            version: 0,
          },
        });

        // Sync inventory (Task 24: oversell blocking + StockMovement ledger)
        let inventoryWarnings: string[] = [];
        try {
          const syncResult = await db.$transaction(async (tx) => {
            return await syncInventoryOnSale(tx, companySlug, items, invoice.id);
          });
          inventoryWarnings = syncResult.warnings;
        } catch (syncErr) {
          logger.error("[ai/tools] inventory sync failed", { err: syncErr instanceof Error ? (syncErr as Error).message : String(syncErr) });
        }
        const reviewQueueWarnings = inventoryWarnings.filter((w) => w.startsWith("[REVIEW-QUEUE]") || w.startsWith("[OVERSELL]"));

        await logAudit({
          userEmail: user.email,
          userUid: user.uid,
          action: "ai_executed_create_invoice",
          entity: "invoice",
          entityId: invoice.id,
          companySlug,
          details: { invoiceNumber, total: totals.total, source: "ai_assistant", reviewQueueWarnings: reviewQueueWarnings.length },
        });

        // P0.1 fix: append warnings to the summary string so they appear in the
        // chat bubble even if the frontend banner renderer is bypassed, AND
        // surface them as a structured field for the banner UI.
        // Task 14: standardized wording "⚠️ N صنف يحتاج مراجعة" across all surfaces.
        let summary = `✅ تم إنشاء الفاتورة ${invoiceNumber} للعميل ${params.clientName} بقيمة ${totals.total}`;
        if (reviewQueueWarnings.length > 0) {
          summary += `\n\n⚠️ ${reviewQueueWarnings.length} صنف يحتاج مراجعة:\n${reviewQueueWarnings.map((w) => `• ${w}`).join("\n")}`;
        }

        return {
          ok: true,
          summary,
          data: { id: invoice.id, invoiceNumber, total: num(totals.total, 3) },
          reviewQueueWarnings,
        };
      }

      case "list_invoices": {
        const limit = Math.min(Number(params.limit) || 10, 50);
        const where: Record<string, unknown> = { companySlug };
        if (params.status) where.status = params.status;
        const invoices = await db.invoice.findMany({
          where, orderBy: { createdAt: "desc" }, take: limit,
          select: { id: true, invoiceNumber: true, clientName: true, status: true, total: true, issueDate: true },
        });
        const summary = `وجدت ${invoices.length} فاتورة:\n${invoices.map((i) => `• ${i.invoiceNumber} — ${i.clientName} — ${num(i.total, 3)} — ${i.status}`).join("\n")}`;
        return { ok: true, summary, data: invoices };
      }

      case "list_clients": {
        const limit = Math.min(Number(params.limit) || 10, 50);
        const where: Record<string, unknown> = { companySlug };
        if (params.search) {
          where.OR = [
            { name: { contains: params.search as string } },
            { phone: { contains: params.search as string } },
            { email: { contains: params.search as string } },
          ];
        }
        const clients = await db.client.findMany({
          where, orderBy: { createdAt: "desc" }, take: limit,
          select: { id: true, name: true, phone: true, email: true, company: true },
        });
        const summary = `وجدت ${clients.length} عميل:\n${clients.map((c) => `• ${c.name} — ${c.phone || "لا هاتف"}`).join("\n")}`;
        return { ok: true, summary, data: clients };
      }

      case "get_client_balance": {
        const clientId = Number(params.clientId);
        const client = await db.client.findUnique({ where: { id: clientId } });
        if (!client || client.companySlug !== companySlug) {
          return { ok: false, summary: "العميل غير موجود" };
        }
        const invoices = await db.invoice.findMany({
          where: { clientId, companySlug },
          select: { total: true, paid: true, status: true, invoiceNumber: true },
        });
        const totalDue = invoices.reduce((s, i) => s + num(i.total, 3), 0);
        const totalPaid = invoices.reduce((s, i) => s + num(i.paid, 3), 0);
        const balance = totalDue - totalPaid;
        return {
          ok: true,
          summary: `العميل: ${client.name}\nإجمالي الفواتير: ${totalDue.toFixed(3)}\nالمحصّل: ${totalPaid.toFixed(3)}\nالمتبقي: ${balance.toFixed(3)}\nعدد الفواتير: ${invoices.length}`,
          data: { totalDue, totalPaid, balance, invoiceCount: invoices.length },
        };
      }

      case "mark_invoice_paid": {
        if (!hasPermission(user, "finance_access")) {
          return { ok: false, summary: "ليس لديك صلاحية مالية لتسجيل المدفوعات" };
        }
        const invoiceId = Number(params.invoiceId);
        const existing = await db.invoice.findUnique({ where: { id: invoiceId } });
        if (!existing || existing.companySlug !== companySlug) {
          return { ok: false, summary: "الفاتورة غير موجودة" };
        }
        const newPaid = existing.total;
        const invoice = await db.invoice.update({
          where: { id: invoiceId },
          data: { paid: newPaid, status: "paid", version: { increment: 1 } },
        });
        await logAudit({
          userEmail: user.email, userUid: user.uid,
          action: "ai_executed_mark_paid", entity: "invoice", entityId: invoiceId,
          companySlug, details: { amount: newPaid, source: "ai_assistant" },
        });
        return {
          ok: true,
          summary: `✅ تم تعليم الفاتورة ${existing.invoiceNumber} كمكتملة الدفع (${num(newPaid, 3)})`,
          data: { id: invoice.id, status: invoice.status },
        };
      }

      case "create_client": {
        if (!hasPermission(user, "edit_customer")) {
          return { ok: false, summary: "ليس لديك صلاحية لإنشاء عملاء" };
        }
        const client = await db.client.create({
          data: {
            name: params.name as string,
            phone: (params.phone as string) || null,
            email: (params.email as string) || null,
            address: (params.address as string) || null,
            companySlug,
          },
        });
        await logAudit({
          userEmail: user.email, userUid: user.uid,
          action: "ai_executed_create_client", entity: "client", entityId: client.id,
          companySlug, details: { name: params.name, source: "ai_assistant" },
        });
        return {
          ok: true,
          summary: `✅ تم إنشاء العميل "${params.name}"`,
          data: { id: client.id, name: client.name },
        };
      }

      case "adjust_inventory": {
        // File 5 prerequisite: AI Copilot inventory edit.
        // Uses /api/inventory/items POST contract — single source of truth.
        if (!hasPermission(user, "settings_access")) {
          return { ok: false, summary: "ليس لديك صلاحية لتعديل المخزون" };
        }
        const productId = Number(params.productId);
        const warehouseId = Number(params.warehouseId);
        const mode = (params.mode as "set" | "adjust") || "adjust";
        const quantity = Number(params.quantity);
        if (!Number.isFinite(productId) || !Number.isFinite(warehouseId) || !Number.isFinite(quantity)) {
          return { ok: false, summary: "المعطيات غير صالحة: مطلوب productId + warehouseId + quantity (أرقام)" };
        }

        // Delegate to the same /api/inventory/items POST handler logic by calling
        // the shared inventorySync + db functions directly. We inline the logic
        // here (rather than HTTP-rewriting to /api/inventory/items) to avoid
        // cookie-forwarding complexity — but the audit trail + StockMovement
        // recording + oversell block + permission gate are IDENTICAL.
        const [product, warehouse] = await Promise.all([
          db.productCatalog.findUnique({ where: { id: productId } }),
          db.warehouse.findUnique({ where: { id: warehouseId } }),
        ]);
        if (!product || product.companySlug !== companySlug) {
          return { ok: false, summary: "المنتج غير موجود أو لا يتبع لهذه الشركة" };
        }
        if (!warehouse || warehouse.companySlug !== companySlug) {
          return { ok: false, summary: "المستودع غير موجود أو لا يتبع لهذه الشركة" };
        }

        const existing = await db.inventoryItem.findUnique({
          where: { warehouseId_productId: { warehouseId, productId } },
        });
        const prevQty = num(existing?.quantity || "0", 3);
        const newQty = mode === "adjust" ? prevQty + quantity : quantity;

        // Oversell block — matches inventory/items/route.ts line 127-129.
        if (newQty < 0) {
          return {
            ok: false,
            summary: `❌ تم رفض الإجراء: المخزون الحالي ${prevQty.toFixed(3)} + الفرق ${quantity >= 0 ? "+" : ""}${quantity.toFixed(3)} = ${newQty.toFixed(3)} (سالباً). oversell محظور.`,
          };
        }

        const { recordStockMovement } = await import("@/lib/inventorySync");
        const signedDelta = newQty - prevQty;
        const updated = await db.$transaction(async (tx) => {
          if (existing) {
            const item = await tx.inventoryItem.update({
              where: { id: existing.id },
              data: {
                quantity: newQty.toFixed(3),
                reorderLevel: existing.reorderLevel,
                reorderQty: existing.reorderQty,
              },
            });
            if (Math.abs(signedDelta) > 0.0001) {
              await recordStockMovement(
                tx, companySlug, productId, warehouseId, signedDelta,
                "ai_adjustment", null,
                `AI Copilot ${mode === "adjust" ? "adjust" : "set"}: ${prevQty.toFixed(3)} → ${newQty.toFixed(3)} (delta ${signedDelta >= 0 ? "+" : ""}${signedDelta.toFixed(3)})`,
                user.uid,
              );
            }
            return item;
          }
          const item = await tx.inventoryItem.create({
            data: {
              companySlug, warehouseId, productId,
              quantity: newQty.toFixed(3),
              reorderLevel: "0", reorderQty: "0",
            },
          });
          if (newQty > 0) {
            await recordStockMovement(
              tx, companySlug, productId, warehouseId, newQty,
              "ai_initial_stock", null,
              `AI Copilot create: initial stock ${newQty.toFixed(3)}`,
              user.uid,
            );
          }
          return item;
        });

        await logAudit({
          userEmail: user.email, userUid: user.uid,
          action: "ai_executed_adjust_inventory",
          entity: "inventory_item", entityId: updated.id,
          companySlug,
          details: {
            productId, warehouseId, mode, delta: quantity,
            prevQty: prevQty.toFixed(3), newQty: newQty.toFixed(3),
            source: "ai_assistant", stockMovementRecorded: Math.abs(signedDelta) > 0.0001,
          },
        });

        return {
          ok: true,
          summary: `✅ تم ${mode === "adjust" ? "تعديل" : "ضبط"} مخزون "${product.name}":
${prevQty.toFixed(3)} → ${newQty.toFixed(3)} (الفرق ${signedDelta >= 0 ? "+" : ""}${signedDelta.toFixed(3)})
تم تسجيل الحركة في دفتر StockMovement.`,
          data: { id: updated.id, productId, warehouseId, quantity: newQty.toFixed(3) },
        };
      }

      default:
        return { ok: false, summary: "إجراء غير معروف" };
    }
  } catch (err) {
    logger.error("[ai/tools] execution failed", { err: err instanceof Error ? err.message : String(err), intent });
    return { ok: false, summary: `خطأ في التنفيذ: ${err instanceof Error ? err.message : "غير معروف"}` };
  }
}
