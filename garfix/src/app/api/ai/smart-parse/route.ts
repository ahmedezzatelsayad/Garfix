/**
 * POST /api/ai/smart-parse
 *
 * Takes raw text (WhatsApp messages, receipts, notes, mixed Arabic/English)
 * and uses z-ai-web-dev-sdk (GLM) to parse it into structured invoice drafts.
 *
 * The response is an array of draft invoices that the frontend can preview
 * and edit before bulk-saving via /api/ai/bulk-import.
 *
 * This is the v11 sandbox-compatible equivalent of v10's OpenRouter-powered
 * /ai/smart-parse endpoint. The z-ai-web-dev-sdk provides the same chat
 * completion API and is available without an API key in this environment.
 *
 * Body: { rawText: string, companySlug?: string, autoAddProducts?: boolean }
 * Returns: { orders: ParsedOrder[], meta: { processingMs, model, ... } }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermission, requirePermissionForCompany } from "@/lib/middleware";
import { num } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { logAiUsage } from "@/lib/ai/costTracker";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const RequestSchema = z.object({
  rawText: z.string().min(1, "النص المطلوب معالجته مطلوب"),
  companySlug: z.string().optional(),
  autoAddProducts: z.boolean().optional().default(false),
});

interface ParsedItem {
  name: string;
  qty: number;
  unitPrice: number;
}

interface ParsedOrder {
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  items: ParsedItem[];
  taxRate: number;
  shipping: number;
  discount: number;
  notes: string;
}

/**
 * Build the system prompt that instructs the AI to extract structured orders.
 * Includes the company's product catalog as a hint to improve accuracy.
 */
async function buildSystemPrompt(companySlug?: string): Promise<string> {
  let catalogHint = "";
  if (companySlug) {
    try {
      const products = await db.productCatalog.findMany({
        where: { companySlug },
        select: { name: true, sellingPrice: true },
        take: 200,
      });
      if (products.length > 0) {
        catalogHint = `\n\nكتالوج المنتجات الحالي للشركة (استخدمه للمطابقة وإعادة استخدام السعر الصحيح إذا ذُكر نفس المنتج بدون سعر واضح):\n${products
          .map((p) => `- ${p.name}${p.sellingPrice ? ` (${p.sellingPrice})` : ""}`)
          .join("\n")}`;
      }
    } catch (err) {
      logger.warn("[smart-parse] failed to load catalog hint", { err: err instanceof Error ? err.message : String(err) });
    }
  }

  return `أنت محلل فواتير وطلبات خبير. تستقبل نصوصاً بأي لغة (عربية، إنجليزية، مختلطة) وبأي تنسيق عشوائي (رسائل واتساب، إيصالات، ملاحظات، جداول، إلخ).

مهمتك: استخرج بيانات الطلبات المنظمة من هذا النص بسرعة ودقة.

تحليل كامل لكل طلب:
- clientName: اسم العميل
- clientPhone: رقم الهاتف (أرقام فقط، بدون رمز الدولة)
- clientAddress: عنوان التوصيل أو المنطقة أو الشارع
- items: مصفوفة المنتجات، كل منها:
  - name: اسم المنتج منظّف
  - qty: الكمية (فسّر الأرقام العربية ١٢٣ والكلمات واحد=1 اثنين=2 ثلاثة=3 أربعة=4 خمسة=5 ستة=6 سبعة=7 ثمانية=8 تسعة=9 عشرة=10)
  - unitPrice: السعر لكل وحدة (اقسم إذا كان إجمالياً)
- taxRate: نسبة الضريبة (0 إذا لم تُذكر)
- shipping: رسوم التوصيل (0 إذا مجاني)
- discount: قيمة الخصم (0 إذا لم يوجد)
- notes: أي ملاحظات إضافية

قواعد مهمة:
- الأسعار بأي عملة (KD د.ك دينار SAR $ إلخ) — استخرجها كأرقام عشرية
- الأرقام الهندية العربية: ١=1 ٢=2 ٣=3
- الفاصل العشري دائماً "."
- إذا وجد طلبات متعددة مفصولة بسطر فارغ أو علامة واضحة، استخرج كل طلب منفصلاً
- تجاهل أسطر الملخص والمجاميع كمصدر للأسعار
- الرموز التعبيرية 📍📞🏠💰🚚 هي حقول معلومات العميل
- المنتجات تأتي بعد 🛠️ أو "الطلب:" أو ترقيم
- لا تُخرج أي طلب بدون عناصر (items) — إن لم تجد منتجات واضحة تجاهل السطر بالكامل
- qty و unitPrice يجب أن تكون أرقاماً موجبة دائماً (لا نص، لا فراغ)
${catalogHint}

أجب فقط بـ JSON صحيح بدون أي شرح أو markdown:
{"orders":[{"clientName":"","clientPhone":"","clientAddress":"","items":[{"name":"","qty":1,"unitPrice":0.0}],"taxRate":0,"shipping":0,"discount":0,"notes":""}]}`;
}

/** Strip markdown code fences from AI response. */
function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

/** Validate and normalize a parsed order — fail-safe (skip bad orders). */
function normalizeOrder(raw: unknown): ParsedOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items.map(normalizeItem).filter(Boolean) as ParsedItem[] : [];
  if (items.length === 0) return null;
  return {
    clientName: typeof r.clientName === "string" ? r.clientName.trim() : "",
    clientPhone: typeof r.clientPhone === "string" ? r.clientPhone.replace(/[^\d+]/g, "") : "",
    clientAddress: typeof r.clientAddress === "string" ? r.clientAddress.trim() : "",
    items,
    taxRate: num(r.taxRate, 2),
    shipping: num(r.shipping, 3),
    discount: num(r.discount, 3),
    notes: typeof r.notes === "string" ? r.notes.trim() : "",
  };
}

function normalizeItem(raw: unknown): ParsedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return null;
  const qty = Math.max(1, Math.floor(num(r.qty)));
  const unitPrice = Math.max(0, num(r.unitPrice, 3));
  return { name, qty, unitPrice };
}

/** Call z-ai-web-dev-sdk chat completion with retry on JSON parse failure. */
async function callAI(systemPrompt: string, userText: string): Promise<{
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  provider: string;
  model: string;
  processingMs: number;
}> {
  const t0 = Date.now();
  const { callAI: callAIProvider } = await import("@/lib/aiProvider");
  const result = await callAIProvider({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    temperature: 0.1,
    maxTokens: 4000,
  });
  return {
    content: typeof result.content === "string" ? result.content : JSON.stringify(result.content),
    usage: result.usage,
    provider: result.provider,
    model: result.model,
    processingMs: Date.now() - t0,
  };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { rawText, companySlug, autoAddProducts } = parsed.data;

  // Enforce permission (bulk_input) + optional company access
  const access = companySlug
    ? await requirePermissionForCompany(req, "bulk_input", companySlug)
    : await requirePermission(req, "bulk_input");
  if ("error" in access) return access.error;
  const user = access.user;

  // SEC-FIX: Rate limit AI endpoints to prevent cost abuse
  const limited = await rateLimitResponse(req, "ai-smart-parse", LIMITS.AI_BULK, user.uid);
  if (limited) return limited;

  const t0 = Date.now();
  logger.info("[smart-parse] starting", { user: user.uid, companySlug, textLength: rawText.length });

  try {
    const systemPrompt = await buildSystemPrompt(companySlug);
    let { content, usage, provider, model, processingMs: aiMs } = await callAI(systemPrompt, rawText.trim());

    // Parse + validate
    let orders: ParsedOrder[] = [];
    let retried = false;
    try {
      const obj = JSON.parse(stripFences(content));
      const raw = Array.isArray(obj) ? obj : (obj.orders ?? obj.items ?? []);
      orders = (raw as unknown[]).map(normalizeOrder).filter(Boolean) as ParsedOrder[];
    } catch (firstErr) {
      // Self-repair: ask the AI to fix its own JSON
      logger.warn("[smart-parse] first parse failed — retrying", { err: firstErr instanceof Error ? firstErr.message : String(firstErr) });
      retried = true;
      const repairPrompt = `الرد السابق لم يكن JSON صالح. أعد الإخراج كـ JSON صحيح فقط، بدون أي شرح أو markdown. الرد السابق كان:\n\n${content}`;
      const retry = await callAI(systemPrompt, `${rawText.trim()}\n\n---\n${repairPrompt}`);
      content = retry.content;
      usage = retry.usage;
      provider = retry.provider;
      model = retry.model;
      // Aggregate latency across the original + repair call (honest total).
      aiMs = aiMs + retry.processingMs;
      try {
        const obj = JSON.parse(stripFences(content));
        const raw = Array.isArray(obj) ? obj : (obj.orders ?? obj.items ?? []);
        orders = (raw as unknown[]).map(normalizeOrder).filter(Boolean) as ParsedOrder[];
      } catch (secondErr) {
        logger.error("[smart-parse] retry also failed", { err: secondErr instanceof Error ? secondErr.message : String(secondErr) });
        // P0 FIX: log the failed smart-parse call (both attempts consumed tokens).
        void logAiUsage({
          companySlug: companySlug || null,
          userUid: user.uid,
          provider,
          model,
          endpoint: "smart-parse",
          tokensIn: usage.prompt_tokens || 0,
          tokensOut: usage.completion_tokens || 0,
          processingMs: aiMs,
          success: false,
          errorMessage: `JSON parse failed after retry: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`,
        });
        return NextResponse.json(
          { error: "رد الذكاء الاصطناعي غير صالح (JSON)", raw: content },
          { status: 502 },
        );
      }
    }

    const processingMs = Date.now() - t0;
    const itemsCount = orders.reduce((s, o) => s + o.items.length, 0);

    // P0 FIX (AI Effectiveness prompt): log every smart-parse AI call to
    // ai_usage_logs. If a retry happened, aiMs is the sum of both calls and
    // tokens reflect the FINAL (retry) response — this is an honest
    // limitation noted in the prompt (don't fabricate the first call's tokens
    // if the provider doesn't break them out per attempt).
    void logAiUsage({
      companySlug: companySlug || null,
      userUid: user.uid,
      provider,
      model,
      endpoint: "smart-parse",
      tokensIn: usage.prompt_tokens || 0,
      tokensOut: usage.completion_tokens || 0,
      processingMs: aiMs,
      success: true,
    });

    // Auto-add discovered products to the catalog
    if (autoAddProducts && companySlug && orders.length > 0) {
      const existing = await db.productCatalog.findMany({
        where: { companySlug },
        select: { name: true },
      });
      const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));
      const newProducts: Array<{ name: string; sellingPrice: string | null }> = [];
      for (const order of orders) {
        for (const item of order.items) {
          if (!existingNames.has(item.name.toLowerCase())) {
            newProducts.push({ name: item.name, sellingPrice: item.unitPrice > 0 ? item.unitPrice.toFixed(3) : null });
            existingNames.add(item.name.toLowerCase());
          }
        }
      }
      if (newProducts.length > 0) {
        await db.productCatalog.createMany({
          data: newProducts.map((p) => ({
            companySlug,
            name: p.name,
            sellingPrice: p.sellingPrice,
            aliases: "[]",
          })),
        });
        logger.info("[smart-parse] auto-added products to catalog", { count: newProducts.length, companySlug });
      }
    }

    await db.aiProcessingLog.create({
      data: {
        companySlug: companySlug || null,
        endpoint: "smart-parse",
        model,
        provider,
        ordersCount: orders.length,
        itemsCount,
        processingMs,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        retried,
        success: true,
      },
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "ai_smart_parse",
      entity: "ai",
      companySlug: companySlug || null,
      details: { ordersCount: orders.length, itemsCount, processingMs, aiMs, retried },
    });

    return NextResponse.json({
      orders,
      meta: {
        processingMs,
        aiMs,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        model,
        retried,
        ordersCount: orders.length,
        itemsCount,
      },
    });
  } catch (err) {
    const processingMs = Date.now() - t0;
    logger.error("[smart-parse] failed", { err: err instanceof Error ? err.message : String(err), processingMs });

    // P0 FIX: log the failed smart-parse call when the handler itself errored
    // (e.g. upstream provider threw before returning a completion).
    void logAiUsage({
      companySlug: companySlug || null,
      userUid: user.uid,
      provider: "z-ai",
      model: "z-ai-glm",
      endpoint: "smart-parse",
      tokensIn: 0,
      tokensOut: 0,
      processingMs,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    await db.aiProcessingLog.create({
      data: {
        companySlug: companySlug || null,
        endpoint: "smart-parse",
        model: "z-ai-glm",
        provider: "z-ai",
        ordersCount: 0,
        itemsCount: 0,
        processingMs,
        success: false,
      },
    }).catch(() => {});

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "خطأ في معالجة الذكاء الاصطناعي" },
      { status: 500 },
    );
  }
});
