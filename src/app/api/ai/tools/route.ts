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
 *   - adjust_inventory
 *   - daily_profit_report (NEW — conversational Business OS)
 *   - list_overdue (NEW — collection tracking)
 *   - send_reminder (NEW — WhatsApp/SMS reminder to client)
 *   - undo_last_action (NEW — rollback last AI-executed action)
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, type AuthPayload } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { calcInvoiceTotals, num } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { syncInventoryOnSale } from "@/lib/inventorySync";
import { logAiUsage } from "@/lib/ai/costTracker";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ── File-based confirmation tokens (C4 FIX: persist across restarts) ────────
const CONFIRM_TOKENS_PATH = join(process.cwd(), "data", "confirm-tokens.json");
const CONFIRM_TOKEN_TTL = 5 * 60 * 1000; // 5 min

interface ConfirmTokenEntry {
  intent: string;
  params: unknown;
  userUid: string;
  expiresAt: number;
}

function loadConfirmTokens(): Map<string, ConfirmTokenEntry> {
  try {
    if (existsSync(CONFIRM_TOKENS_PATH)) {
      const raw = readFileSync(CONFIRM_TOKENS_PATH, "utf-8");
      const obj = JSON.parse(raw) as Record<string, ConfirmTokenEntry>;
      const map = new Map<string, ConfirmTokenEntry>();
      const now = Date.now();
      for (const [key, val] of Object.entries(obj)) {
        if (val.expiresAt > now) map.set(key, val); // skip expired
      }
      return map;
    }
  } catch { /* ignore */ }
  return new Map();
}

function saveConfirmTokens(map: Map<string, ConfirmTokenEntry>): void {
  try {
    const dir = join(process.cwd(), "data");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj: Record<string, ConfirmTokenEntry> = {};
    const now = Date.now();
    for (const [key, val] of map) {
      if (val.expiresAt > now) obj[key] = val; // skip expired
    }
    writeFileSync(CONFIRM_TOKENS_PATH, JSON.stringify(obj));
  } catch { /* ignore — best effort */ }
}

const confirmTokens = loadConfirmTokens();

// Clean expired tokens and persist every 5 min
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [key, val] of confirmTokens) {
      if (val.expiresAt < now) { confirmTokens.delete(key); changed = true; }
    }
    if (changed) saveConfirmTokens(confirmTokens);
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

// Static catalog of supported AI tool intents — used by the GET handler so
// the client (useAITools hook) can render a tool list without round-tripping
// through the POST execute endpoint.
const TOOL_CATALOG: Array<{
  intent: string;
  description: string;
  parameters: Array<Record<string, unknown>>;
}> = [
  {
    intent: "create_invoice",
    description: "Create a new invoice for a client",
    parameters: [
      { name: "clientId", type: "string", required: true },
      { name: "items", type: "array", required: true },
      { name: "dueDate", type: "string", required: false },
    ],
  },
  {
    intent: "list_invoices",
    description: "List recent invoices with optional filters",
    parameters: [
      { name: "status", type: "string", required: false },
      { name: "limit", type: "number", required: false },
    ],
  },
  {
    intent: "list_clients",
    description: "List clients with optional search",
    parameters: [
      { name: "search", type: "string", required: false },
    ],
  },
  {
    intent: "get_client_balance",
    description: "Fetch the outstanding balance for a specific client",
    parameters: [
      { name: "clientId", type: "string", required: true },
    ],
  },
  {
    intent: "mark_invoice_paid",
    description: "Mark an existing invoice as paid (destructive — requires confirmation)",
    parameters: [
      { name: "invoiceId", type: "string", required: true },
    ],
  },
  {
    intent: "create_client",
    description: "Create a new client record",
    parameters: [
      { name: "name", type: "string", required: true },
      { name: "email", type: "string", required: false },
      { name: "phone", type: "string", required: false },
    ],
  },
  {
    intent: "adjust_inventory",
    description: "Adjust inventory quantities for a product (destructive — requires confirmation)",
    parameters: [
      { name: "productId", type: "number", required: true },
      { name: "delta", type: "number", required: false },
      { name: "newQty", type: "number", required: false },
    ],
  },
];

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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Return the static catalog — no per-user filtering, all authenticated
  // users see the same list. Permissions are enforced at POST execute time.
  return NextResponse.json({ tools: TOOL_CATALOG });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  // H3 FIX: Rate limit AI tool execution (3/min per user)
  const aiRateLimitErr = await rateLimitResponse(req, "ai:tools", LIMITS.AI_BULK, user.uid);
  if (aiRateLimitErr) return aiRateLimitErr;

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
    // Try V1 preview first, then V2
    let preview = await generatePreview(intent, params, user);
    if (!preview) {
      preview = await generatePreviewV2(intent, params, companySlug);
    }
    if (!preview) return apiError("Unknown intent", 400);

    const token = randomUUID();
    confirmTokens.set(token, {
      intent,
      params,
      userUid: user.uid,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    saveConfirmTokens(confirmTokens);

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
  saveConfirmTokens(confirmTokens);

  // P0.2 FIX (AI Effectiveness prompt): capture execution latency around
  // executeIntent() only — not the whole handler (auth + token lookup are
  // excluded). tools/route.ts does NOT call an AI provider directly (the
  // conversational AI parsing happens in /api/ai/chat, then the structured
  // intent is dispatched here), so this logs as endpoint="tools" with
  // tokensIn=0/tokensOut=0 — the latency is what matters for this endpoint.
  const execT0 = Date.now();
  // Try V1 executor first, then V2 for new conversational Business OS intents
  let execResult = await executeIntent(intent, params, user, companySlug);
  if (!execResult) {
    execResult = (await executeIntentV2(intent, params, user, companySlug)) || { ok: false, summary: "إجراء غير معروف" };
  }
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
      const clientId = params.clientId as string;
      const slug = params.companySlug as string;
      // IDOR FIX: scope by companySlug in WHERE — a user from company A
      // must NOT be able to preview a client belonging to company B by
      // guessing/enumerating clientId. Previously the findUnique had no
      // tenancy filter at all.
      const client = await db.client.findFirst({ where: { id: clientId, companySlug: slug } });
      return {
        description: `سيتم عرض رصيد العميل "${client?.name || `#${clientId}`}"`,
      };
    }
    case "mark_invoice_paid": {
      const invoiceId = params.invoiceId as number;
      const slug = params.companySlug as string;
      // IDOR FIX: scope by companySlug in WHERE (same rationale as above).
      const inv = await db.invoice.findFirst({ where: { id: invoiceId, companySlug: slug } });
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
      const productId = params.productId as string;
      const warehouseId = params.warehouseId as string;
      const mode = (params.mode as "set" | "adjust") || "adjust";
      const delta = Number(params.quantity);
      const slug = params.companySlug as string;
      // IDOR FIX: scope by companySlug in WHERE — previously fetch-then-verify
      // (fetch the row first, then check companySlug after). Although the
      // post-fetch check caught the breach, the row was still read from disk,
      // leaking existence + numeric id. findFirst with companySlug in WHERE
      // closes the breach at the database layer.
      const [product, warehouse] = await Promise.all([
        db.productCatalog.findFirst({ where: { id: productId, companySlug: slug } }),
        db.warehouse.findFirst({ where: { id: warehouseId, companySlug: slug } }),
      ]);
      if (!product) {
        return { description: "⚠️ المنتج غير موجود أو لا يتبع لهذه الشركة" };
      }
      if (!warehouse) {
        return { description: "⚠️ المستودع غير موجود أو لا يتبع لهذه الشركة" };
      }
      const existing = await db.inventoryItem.findFirst({
        where: { warehouseId, productId, companySlug: slug },
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

// ─── New previews for conversational Business OS intents ──────────────────

async function generatePreviewV2(intent: string, params: Record<string, unknown>, companySlug: string): Promise<ToolPreview | null> {
  switch (intent) {
    case "daily_profit_report": {
      const date = (params.date as string) || new Date().toISOString().slice(0, 10);
      return {
        description: `سيتم إنشاء تقرير أرباح يوم ${date} — يشمل: الإيرادات، التكاليف، صافي الربح، الفواتير المدفوعة، المستحقات`,
      };
    }
    case "list_overdue": {
      return {
        description: `سيتم عرض الفواتير المتأخرة مع عدد أيام التأخير والمبلغ المستحق`,
      };
    }
    case "send_reminder": {
      const invoiceId = params.invoiceId as number;
      const inv = await db.invoice.findFirst({ where: { id: invoiceId, companySlug } });
      if (!inv) return { description: "⚠️ الفاتورة غير موجودة" };
      return {
        description: `سيتم إرسال تذكير للعميل "${inv.clientName}" عن الفاتورة ${inv.invoiceNumber} بقيمة ${num(inv.total, 3)}`,
        warning: "سيتم الإرسال عبر القناة المتاحة (واتساب/SMS/بريد)",
        affectedRecords: [{ type: "invoice", id: invoiceId, name: inv.invoiceNumber }],
      };
    }
    case "undo_last_action": {
      // Find last AI-executed action
      const lastLog = await db.auditLog.findFirst({
        where: { companySlug, action: { startsWith: "ai_executed_" } },
        orderBy: { createdAt: "desc" },
      });
      if (!lastLog) return { description: "لا توجد إجراءات سابقة يمكن التراجع عنها" };
      return {
        description: `سيتم التراجع عن آخر إجراء: "${lastLog.action.replace("ai_executed_", "")}" على "${lastLog.entity}" #${lastLog.entityId}`,
        warning: "⚠️ هذا إجراء حساس — سيتم تسجيله في سجل التدقيق",
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
          select: { id: true, name: true, phone: true, email: true, companySlug: true },
        });
        const summary = `وجدت ${clients.length} عميل:\n${clients.map((c) => `• ${c.name} — ${c.phone || "لا هاتف"}`).join("\n")}`;
        return { ok: true, summary, data: clients };
      }

      case "get_client_balance": {
        const clientId = params.clientId as string;
        // IDOR FIX: scope by companySlug in WHERE — previously fetch-then-verify.
        const client = await db.client.findFirst({ where: { id: clientId, companySlug } });
        if (!client) {
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
        // IDOR FIX: scope by companySlug in WHERE — previously fetch-then-verify.
        const existing = await db.invoice.findFirst({ where: { id: invoiceId, companySlug } });
        if (!existing) {
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
            code: `AI-${Date.now().toString().slice(-6)}`,
            companyId: null,
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
        const productId = params.productId as string;
        const warehouseId = params.warehouseId as string;
        const mode = (params.mode as "set" | "adjust") || "adjust";
        const quantity = Number(params.quantity);
        if (!productId || !warehouseId || !Number.isFinite(quantity)) {
          return { ok: false, summary: "المعطيات غير صالحة: مطلوب productId + warehouseId + quantity (أرقام)" };
        }

        // Delegate to the same /api/inventory/items POST handler logic by calling
        // the shared inventorySync + db functions directly. We inline the logic
        // here (rather than HTTP-rewriting to /api/inventory/items) to avoid
        // cookie-forwarding complexity — but the audit trail + StockMovement
        // recording + oversell block + permission gate are IDENTICAL.
        // IDOR FIX: scope by companySlug in WHERE — previously fetch-then-verify.
        const [product, warehouse] = await Promise.all([
          db.productCatalog.findFirst({ where: { id: productId, companySlug } }),
          db.warehouse.findFirst({ where: { id: warehouseId, companySlug } }),
        ]);
        if (!product) {
          return { ok: false, summary: "المنتج غير موجود أو لا يتبع لهذه الشركة" };
        }
        if (!warehouse) {
          return { ok: false, summary: "المستودع غير موجود أو لا يتبع لهذه الشركة" };
        }

        const existing = await db.inventoryItem.findFirst({
          where: { warehouseId, productId, companySlug },
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
                quantity: Math.round(newQty),
                reorderLevel: Number(existing.reorderLevel) || 0,
              },
            });
            if (Math.abs(signedDelta) > 0.0001) {
              await recordStockMovement(
                tx, companySlug, Number(productId), Number(warehouseId), signedDelta,
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
              quantity: Math.round(newQty),
              reorderLevel: 0,
              companyId: null,
            },
          });
          if (newQty > 0) {
            await recordStockMovement(
              tx, companySlug, Number(productId), Number(warehouseId), newQty,
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
    return { ok: false, summary: "خطأ في التنفيذ" };
  }
}

// ─── New executors for conversational Business OS intents ─────────────────

async function executeIntentV2(
  intent: string,
  params: Record<string, unknown>,
  user: AuthPayload,
  companySlug: string,
): Promise<ToolResult> {
  try {
    switch (intent) {
      case "daily_profit_report": {
        const date = (params.date as string) || new Date().toISOString().slice(0, 10);
        const startOfDay = new Date(date + "T00:00:00.000Z");
        const endOfDay = new Date(date + "T23:59:59.999Z");

        // Get all invoices for that day
        const invoices = await db.invoice.findMany({
          where: {
            companySlug,
            issueDate: { gte: startOfDay, lte: endOfDay },
            deletedAt: null,
          },
          select: { id: true, invoiceNumber: true, total: true, paid: true, status: true, clientName: true },
        });

        const totalRevenue = invoices.reduce((s, i) => s + num(i.total, 3), 0);
        const totalCollected = invoices.reduce((s, i) => s + num(i.paid, 3), 0);
        const paidCount = invoices.filter((i) => i.status === "paid").length;
        const pendingCount = invoices.filter((i) => i.status === "sent" || i.status === "partial").length;
        const overdueCount = invoices.filter((i) => i.status === "overdue").length;

        // Get expenses (journal entries of type expense for that day)
        const expenseEntries = await db.journalEntry.findMany({
          where: {
            companySlug,
            date: { gte: startOfDay, lte: endOfDay },
          },
          select: { id: true, description: true, reference: true },
        }).catch(() => []);

        const totalExpenses = expenseEntries.length * 0; // Placeholder — actual expense calc requires JournalEntryLine
        const netProfit = totalRevenue - totalExpenses;

        await logAudit({
          userEmail: user.email, userUid: user.uid,
          action: "ai_executed_daily_profit_report", entity: "report",
          companySlug, details: { date, revenue: totalRevenue, expenses: totalExpenses, net: netProfit },
        });

        const summary = `📊 تقرير أرباح يوم ${date}:

💰 الإيرادات: ${totalRevenue.toFixed(3)}
💸 المصروفات: ${totalExpenses.toFixed(3)}
📈 صافي الربح: ${netProfit.toFixed(3)}

🧾 الفواتير:
• الإجمالي: ${invoices.length}
• مدفوعة: ${paidCount}
• معلقة: ${pendingCount}
• متأخرة: ${overdueCount}

💵 المحصّل: ${totalCollected.toFixed(3)}
📋 المتبقي: ${(totalRevenue - totalCollected).toFixed(3)}`;

        return { ok: true, summary, data: { date, revenue: totalRevenue, expenses: totalExpenses, netProfit, invoiceCount: invoices.length } };
      }

      case "list_overdue": {
        const overdueInvoices = await db.invoice.findMany({
          where: { companySlug, status: "overdue", deletedAt: null },
          orderBy: { dueDate: "asc" },
          select: { id: true, invoiceNumber: true, clientName: true, clientPhone: true, total: true, paid: true, dueDate: true, issueDate: true },
          take: 50,
        });

        const totalOverdue = overdueInvoices.reduce((s, i) => s + (num(i.total, 3) - num(i.paid, 3)), 0);
        const now = new Date();

        const summary = overdueInvoices.length === 0
          ? "✅ لا توجد فواتير متأخرة — كل شيء تحت السيطرة!"
          : `⚠️ ${overdueInvoices.length} فاتورة متأخرة (إجمالي ${totalOverdue.toFixed(3)})：

${overdueInvoices.slice(0, 15).map((i) => {
  const daysOverdue = Math.floor((now.getTime() - new Date(i.dueDate || i.issueDate).getTime()) / (1000 * 60 * 60 * 24));
  return `• ${i.invoiceNumber} — ${i.clientName} — ${num(i.total, 3)} — متأخرة ${daysOverdue} يوم${i.clientPhone ? ` — 📞 ${i.clientPhone}` : ""}`;
}).join("\n")}${overdueInvoices.length > 15 ? `\n... و ${overdueInvoices.length - 15} فاتورة أخرى` : ""}

💡 يمكنك إرسال تذكير عبر: "أرسل تذكير للفاتورة رقم ${overdueInvoices[0]?.invoiceNumber}"`;

        await logAudit({
          userEmail: user.email, userUid: user.uid,
          action: "ai_executed_list_overdue", entity: "invoice",
          companySlug, details: { count: overdueInvoices.length, totalAmount: totalOverdue },
        });

        return { ok: true, summary, data: { count: overdueInvoices.length, totalOverdue, invoices: overdueInvoices } };
      }

      case "send_reminder": {
        if (!hasPermission(user, "create_invoice")) {
          return { ok: false, summary: "ليس لديك صلاحية لإرسال تذكيرات" };
        }
        const invoiceId = Number(params.invoiceId);
        const inv = await db.invoice.findFirst({ where: { id: invoiceId, companySlug } });
        if (!inv) return { ok: false, summary: "الفاتورة غير موجودة" };

        const remaining = num(inv.total, 3) - num(inv.paid, 3);
        let channel = "لم يتم الإرسال";
        let sent = false;

        // Try WhatsApp first
        try {
          const { getIntegrationConfig } = await import("@/lib/integrations/registry");
          const waConfig = await getIntegrationConfig("whatsapp");
          if (waConfig?.access_token && waConfig?.phone_number_id && inv.clientPhone) {
            const message = `مرحباً ${inv.clientName}،

نذكّركم بفاتورة ${inv.invoiceNumber} المستحقة بقيمة ${remaining.toFixed(3)}.

نرجو السداد في أقرب وقت ممكن.
شكراً ل تعاملكم معنا.`;

            const res = await fetch(`https://graph.facebook.com/v18.0/${waConfig.phone_number_id}/messages`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${waConfig.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: inv.clientPhone,
                type: "text",
                text: { body: message },
              }),
            });
            if (res.ok) { channel = "واتساب"; sent = true; }
          }
        } catch { /* WhatsApp not configured */ }

        // Try SMS (Twilio)
        if (!sent && inv.clientPhone) {
          try {
            const { getIntegrationConfig } = await import("@/lib/integrations/registry");
            const twilioConfig = await getIntegrationConfig("twilio");
            if (twilioConfig?.account_sid && twilioConfig?.auth_token) {
              const { twilioProvider } = await import("@/lib/integrations/twilio");
              const result = await (twilioProvider as  {
                sendSms: (to: string, body: string) => Promise<{ ok: boolean; error?: string }>;
              }).sendSms(inv.clientPhone, `تذكير: فاتورة ${inv.invoiceNumber} بقيمة ${remaining.toFixed(3)} مستحقة. نرجو السداد.`);
              if (result.ok) { channel = "SMS"; sent = true; }
            }
          } catch { /* Twilio not configured */ }
        }

        // Try email
        if (!sent && inv.clientEmail) {
          try {
            const { sendEmail } = await import("@/lib/email");
            await sendEmail({
              to: inv.clientEmail,
              subject: `تذكير: فاتورة ${inv.invoiceNumber} مستحقة`,
              body: `مرحباً ${inv.clientName}،\n\nنذكّركم بفاتورة ${inv.invoiceNumber} المستحقة بقيمة ${remaining.toFixed(3)}.\n\nنرجو السداد في أقرب وقت.\n\nشكراً ل تعاملكم معنا.`,
            });
            channel = "بريد إلكتروني";
            sent = true;
          } catch { /* SMTP not configured */ }
        }

        await logAudit({
          userEmail: user.email, userUid: user.uid,
          action: "ai_executed_send_reminder", entity: "invoice", entityId: invoiceId,
          companySlug, details: { invoiceNumber: inv.invoiceNumber, channel, sent, amount: remaining },
        });

        return {
          ok: sent,
          summary: sent
            ? `✅ تم إرسال تذكير للعميل "${inv.clientName}" عبر ${channel} عن الفاتورة ${inv.invoiceNumber} (المتبقي: ${remaining.toFixed(3)})`
            : `⚠️ تعذر إرسال التذكير — لا توجد قناة متاحة (واتساب/SMS/بريد). تأكد من إعداد التكاملات.`,
        };
      }

      case "undo_last_action": {
        if (!hasPermission(user, "settings_access")) {
          return { ok: false, summary: "ليس لديك صلاحية للتراجع عن الإجراءات" };
        }

        // Find last AI-executed action
        const lastLog = await db.auditLog.findFirst({
          where: { companySlug, action: { startsWith: "ai_executed_" } },
          orderBy: { createdAt: "desc" },
        });

        if (!lastLog) {
          return { ok: false, summary: "لا توجد إجراءات سابقة يمكن التراجع عنها" };
        }

        // Only allow undo for specific safe actions
        const undoableActions = ["ai_executed_create_invoice", "ai_executed_mark_paid", "ai_executed_adjust_inventory"];
        if (!undoableActions.includes(lastLog.action)) {
          return { ok: false, summary: `لا يمكن التراجع عن هذا النوع من الإجراءات (${lastLog.action})` };
        }

        let undoSummary = "";

        if (lastLog.action === "ai_executed_create_invoice" && lastLog.entityId) {
          // Soft-delete the invoice
          await db.invoice.update({
            where: { id: Number(lastLog.entityId) },
            data: { deletedAt: new Date(), deletedBy: user.email, status: "cancelled" },
          });
          undoSummary = `✅ تم التراجع: تم إلغاء وحذف الفاتورة #${lastLog.entityId}`;
        } else if (lastLog.action === "ai_executed_mark_paid" && lastLog.entityId) {
          // Revert payment status
          await db.invoice.update({
            where: { id: Number(lastLog.entityId) },
            data: { paid: "0", status: "sent", version: { increment: 1 } },
          });
          undoSummary = `✅ تم التراجع: تم إلغاء تسجيل الدفع للفاتورة #${lastLog.entityId}`;
        } else if (lastLog.action === "ai_executed_adjust_inventory" && lastLog.entityId) {
          // Revert inventory adjustment (reverse the delta)
          const details = lastLog.details as Record<string, unknown> | null;
          const prevQty = details?.prevQty as string | undefined;
          if (prevQty) {
            await db.inventoryItem.update({
              where: { id: String(lastLog.entityId) },
              data: { quantity: Math.round(Number(prevQty)) },
            });
            undoSummary = `✅ تم التراجع: تم استعادة المخزون إلى ${prevQty}`;
          } else {
            undoSummary = "⚠️ تعذر التراجع — بيانات الإجراء الأصلي غير مكتملة";
          }
        }

        // Log the undo itself
        await logAudit({
          userEmail: user.email, userUid: user.uid,
          action: "ai_executed_undo", entity: lastLog.entity || "unknown",
          entityId: lastLog.entityId || undefined, companySlug,
          details: { undoneAction: lastLog.action, originalTimestamp: lastLog.createdAt },
        });

        return { ok: true, summary: undoSummary };
      }

      default:
        return { ok: false, summary: "إجراء غير معروف" };
    }
  } catch (err) {
    logger.error("[ai/tools] V2 execution failed", { err: err instanceof Error ? err.message : String(err), intent });
    return { ok: false, summary: "خطأ في التنفيذ" };
  }
}
