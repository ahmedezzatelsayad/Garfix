/**
 * POST /api/ai/parse-image
 *
 * Takes a base64-encoded image (receipt photo, invoice scan, handwritten order)
 * and uses z-ai-web-dev-sdk's VLM (Vision Language Model) to extract structured
 * invoice drafts — same shape as /api/ai/smart-parse.
 *
 * Body: { imageBase64: string, mimeType?: string, companySlug?: string, autoAddProducts?: boolean }
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
  imageBase64: z.string().min(100, "صورة غير صالحة").max(2_000_000, "حجم الصورة كبير جداً (الحد الأقصى ~1.5 ميجابايت)"),
  mimeType: z.enum(
    ["image/jpeg", "image/png", "image/webp", "image/gif"],
    { message: "نوع الصورة غير مدعوم — يُسمح فقط بـ JPEG / PNG / WebP / GIF" },
  ).default("image/jpeg"),
  companySlug: z.string().optional(),
  autoAddProducts: z.boolean().optional().default(false),
});

/**
 * SEC-M3C4 (Cycle 4): magic-byte (file signature) verification for the VLM
 * image parse endpoint. The Zod enum above already constrains the declared
 * MIME, but a malicious client could send a polyglot or non-image payload
 * labelled `image/jpeg`. This function sniffs the first 8 bytes against known
 * image signatures and rejects mismatches before the bytes are forwarded to
 * the VLM provider (saving tokens + provider quota).
 */
function verifyImageMagicBytes(buf: Buffer, declaredMime: string): boolean {
  if (buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (declaredMime === "image/jpeg") {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (declaredMime === "image/png") {
    return (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    );
  }
  // GIF: 47 49 46 38 (87a or 89a)
  if (declaredMime === "image/gif") {
    return (
      buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61
    );
  }
  // WebP: RIFF....WEBP
  if (declaredMime === "image/webp") {
    return (
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    );
  }
  return false;
}

interface ParsedItem { name: string; qty: number; unitPrice: number; }
interface ParsedOrder {
  clientName: string; clientPhone: string; clientAddress: string;
  items: ParsedItem[]; taxRate: number; shipping: number; discount: number; notes: string;
}

function buildVisionPrompt(): string {
  return `أنت محلل فواتير وإيصالات خبير بالبصر. تستقبل صورة لفاتورة أو إيصال أو طلب مكتوب بخط اليد أو مطبوع.

مهمتك: استخرج بيانات الطلبات المنظمة من الصورة بدقة عالية.

تحليل كامل لكل طلب:
- clientName: اسم العميل أو اسم المتجر/الشركة الموجود في الفاتورة
- clientPhone: رقم الهاتف (أرقام فقط، بدون رمز الدولة)
- clientAddress: عنوان التوصيل أو المنطقة (إن وجد)
- items: مصفوفة المنتجات/الخدمات المرئية في الصورة، كل منها:
  - name: اسم المنتج منظّف
  - qty: الكمية (فسّر الأرقام العربية ١٢٣ والكلمات واحد=1 اثنين=2 ثلاثة=3 ...)
  - unitPrice: السعر لكل وحدة (اقسم الإجمالي على الكمية إذا لزم)
- taxRate: نسبة الضريبة (VAT) إن كانت ظاهرة (0 إذا لم تُذكر)
- shipping: رسوم التوصيل/الشحن (0 إذا لم توجد)
- discount: قيمة الخصم (0 إذا لم يوجد)
- notes: أي ملاحظات إضافية مرئية (رقم الفاتورة، التاريخ، طريقة الدفع)

قواعد مهمة:
- الأسعار بأي عملة (KD د.ك دينار SAR $ ر.س إلخ) — استخرجها كأرقام عشرية
- الأرقام الهندية العربية: ١=1 ٢=2 ٣=3 ٤=4 ٥=5 ٦=6 ٧=7 ٨=8 ٩=9 ٠=0
- الفاصل العشري دائماً "."
- إذا وجد عدة فواتير في صورة واحدة، استخرج كل فاتورة منفصلة
- تجاهل المجاميع والإجماليات كمصدر للأسعار — استخدم الأسعار الفردية للبنود
- لا تُخرج أي طلب بدون عناصر (items)
- qty و unitPrice يجب أن تكون أرقاماً موجبة دائماً
- إذا تعذّر قراءة منتج بوضوح، تجاهله
- انتبه للأخطاء الشائعة في الـ OCR (مثل 0 vs O، 1 vs l، 5 vs S)

أجب فقط بـ JSON صحيح بدون أي شرح أو markdown:
{"orders":[{"clientName":"","clientPhone":"","clientAddress":"","items":[{"name":"","qty":1,"unitPrice":0.0}],"taxRate":0,"shipping":0,"discount":0,"notes":""}]}`;
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

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
  return {
    name,
    qty: Math.max(1, Math.floor(num(r.qty))),
    unitPrice: Math.max(0, num(r.unitPrice, 3)),
  };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { imageBase64, mimeType, companySlug, autoAddProducts } = parsed.data;

  // Enforce permission (bulk_input) + optional company access
  const access = companySlug
    ? await requirePermissionForCompany(req, "bulk_input", companySlug)
    : await requirePermission(req, "bulk_input");
  if ("error" in access) return access.error;
  const user = access.user;

  // SEC-FIX: Rate limit AI endpoints to prevent cost abuse
  const limited = await rateLimitResponse(req, "ai-parse-image", LIMITS.AI_BULK, user.uid);
  if (limited) return limited;

  const t0 = Date.now();
  logger.info("[parse-image] starting", { user: user.uid, companySlug, imageSize: imageBase64.length });

  try {
    // Use the VLM (Vision Language Model) from z-ai-web-dev-sdk
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const ai = await ZAI.create();

    // Strip data URL prefix if present
    const cleaned = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const imageBuf = Buffer.from(cleaned, "base64");

    // SEC-M3C4 (Cycle 4): verify magic bytes match the declared MIME type.
    if (!verifyImageMagicBytes(imageBuf, mimeType)) {
      logger.warn("[parse-image] magic-byte mismatch — rejecting", {
        user: user.uid,
        declaredMime: mimeType,
        firstBytes: imageBuf.subarray(0, 8).toString("hex"),
      });
      return apiError("الصورة غير صالحة — البايتات الأولى لا تطابق النوع المُصرَّح به", 415);
    }

    // P0.2 FIX (AI Effectiveness prompt): measure the AI provider call
    // latency specifically (not the whole handler, which includes base64
    // decoding + auto-product-add + DB writes).
    const aiT0 = Date.now();
    const completion = await ai.chat.completions.createVision({
      model: "glm-4.5v",
      messages: [
        { role: "system", content: buildVisionPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: "حلّل هذه الفاتورة/الإيصال واستخرج البيانات المنظمة." },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${cleaned}` },
            },
          ],
        },
      ],
    } as any);
    const aiMs = Date.now() - aiT0;

    const content = completion.choices?.[0]?.message?.content || "{}";
    const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    let orders: ParsedOrder[] = [];
    try {
      const obj = JSON.parse(stripFences(typeof content === "string" ? content : JSON.stringify(content)));
      const raw = Array.isArray(obj) ? obj : (obj.orders ?? obj.items ?? []);
      orders = (raw as unknown[]).map(normalizeOrder).filter(Boolean) as ParsedOrder[];
    } catch (err) {
      logger.error("[parse-image] JSON parse failed", { err: err instanceof Error ? err.message : String(err), content: typeof content === "string" ? content.slice(0, 200) : "non-string" });
      // P0 FIX: log the VLM call even though JSON parsing failed — the
      // provider call itself succeeded; tokens were consumed.
      void logAiUsage({
        companySlug: companySlug || null,
        userUid: user.uid,
        provider: "z-ai",
        model: "z-ai-vlm",
        endpoint: "parse-image",
        tokensIn: usage.prompt_tokens || 0,
        tokensOut: usage.completion_tokens || 0,
        processingMs: aiMs,
        success: false,
        errorMessage: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return NextResponse.json(
        { error: "رد الذكاء الاصطناعي غير صالح (JSON)", raw: content },
        { status: 502 },
      );
    }

    const processingMs = Date.now() - t0;
    const itemsCount = orders.reduce((s, o) => s + o.items.length, 0);

    // P0 FIX (AI Effectiveness prompt): log every parse-image VLM call to
    // ai_usage_logs with real token counts + the VLM call latency (aiMs),
    // distinct from the whole-handler processingMs.
    void logAiUsage({
      companySlug: companySlug || null,
      userUid: user.uid,
      provider: "z-ai",
      model: "z-ai-vlm",
      endpoint: "parse-image",
      tokensIn: usage.prompt_tokens || 0,
      tokensOut: usage.completion_tokens || 0,
      processingMs: aiMs,
      success: true,
    });

    // Auto-add discovered products
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
            companySlug, name: p.name, sellingPrice: p.sellingPrice, aliases: "[]",
          })),
        });
        logger.info("[parse-image] auto-added products", { count: newProducts.length, companySlug });
      }
    }

    await db.aIProcessingLog.create({
      data: {
        companySlug: companySlug || null,
        endpoint: "parse-image",
        model: "z-ai-vlm",
        provider: "z-ai",
        ordersCount: orders.length,
        itemsCount,
        processingMs,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        success: true,
      },
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "ai_parse_image",
      entity: "ai",
      companySlug: companySlug || null,
      details: { ordersCount: orders.length, itemsCount, processingMs, imageSize: imageBase64.length },
    });

    return NextResponse.json({
      orders,
      meta: {
        processingMs,
        aiMs,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        model: "z-ai-vlm",
        ordersCount: orders.length,
        itemsCount,
      },
    });
  } catch (err) {
    const processingMs = Date.now() - t0;
    logger.error("[parse-image] failed", { err: err instanceof Error ? err.message : String(err), processingMs });

    // P0 FIX: log the failed VLM call when the handler itself errored
    // (e.g. upstream provider threw before returning a completion).
    void logAiUsage({
      companySlug: companySlug || null,
      userUid: user.uid,
      provider: "z-ai",
      model: "z-ai-vlm",
      endpoint: "parse-image",
      tokensIn: 0,
      tokensOut: 0,
      processingMs,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    await db.aIProcessingLog.create({
      data: {
        companySlug: companySlug || null,
        endpoint: "parse-image",
        model: "z-ai-vlm",
        provider: "z-ai",
        ordersCount: 0,
        itemsCount: 0,
        processingMs,
        success: false,
      },
    }).catch(() => {});

    return NextResponse.json(
      { error: "خطأ في معالجة الصورة" },
      { status: 500 },
    );
  }
});
