/**
 * POST /api/ai/parse-file
 *
 * Parse an uploaded Excel/CSV file into structured invoice drafts.
 * Uses the xlsx library to read the file, then passes the extracted
 * rows to the AI (z-ai-web-dev-sdk) to structure them into the same
 * ParsedOrder format as /api/ai/smart-parse.
 *
 * Body: { fileBase64: string, fileName: string, companySlug?: string }
 * Returns: { orders: ParsedOrder[], meta: { ... } }
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermission } from "@/lib/middleware";
import { num } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { logAiUsage } from "@/lib/ai/costTracker";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const RequestSchema = z.object({
  fileBase64: z.string().min(100, "ملف غير صالح"),
  fileName: z.string().min(1),
  companySlug: z.string().optional(),
});

interface ParsedItem { name: string; qty: number; unitPrice: number; }
interface ParsedOrder {
  clientName: string; clientPhone: string; clientAddress: string;
  items: ParsedItem[]; taxRate: number; shipping: number; discount: number; notes: string;
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

async function callAI(systemPrompt: string, userText: string): Promise<{
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  processingMs: number;
}> {
  const t0 = Date.now();
  try {
    const { callAIWithFallback } = await import("@/lib/ai/smartRouter");
    const aiConfig = await import("@/lib/aiConfig").then((m) => m.getGlobalAiConfig());
    const result = await callAIWithFallback({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.1,
      maxTokens: Math.min(aiConfig.maxTokens, 4000),
      capability: "invoice-extraction",
    });
    const usage = result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    return { content: result.content || "{}", usage: { prompt_tokens: usage.prompt_tokens || 0, completion_tokens: usage.completion_tokens || 0, total_tokens: usage.total_tokens || 0 }, processingMs: Date.now() - t0 };
  } catch (fallbackErr) {
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      const ai = await ZAI.create();
      const completion = await ai.chat.completions.create({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userText }],
        temperature: 0.1,
        max_tokens: 4000,
      });
      return { content: completion.choices?.[0]?.message?.content || "{}", usage: completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, processingMs: Date.now() - t0 };
    } catch { throw fallbackErr; }
  }
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return t.trim();
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Require bulk_input permission
  const permCheck = await requirePermission(req, "bulk_input");
  if ("error" in permCheck) return permCheck.error;
  const user = permCheck.user;

  // SEC-FIX: Rate limit AI endpoints to prevent cost abuse
  const limited = await rateLimitResponse(req, "ai-parse-file", LIMITS.AI_BULK, user.uid ?? "");
  if (limited) return limited;

  const body = await parseJsonBody(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const { fileBase64, fileName, companySlug } = parsed.data;

  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const t0 = Date.now();
  logger.info("[parse-file] starting", { user: user.uid ?? "", companySlug, fileName, size: fileBase64.length });

  try {
    // Parse the Excel file using exceljs
    const ExcelJS = (await import("exceljs")).default;
    const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const firstSheet = workbook.worksheets[0];
    if (!firstSheet) {
      return apiError("الملف لا يحتوي على أوراق عمل", 400);
    }
    const rows: Record<string, unknown>[] = [];
    const headers: string[] = [];
    firstSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // First row = headers
        row.eachCell((cell, colNumber) => {
          headers[colNumber] = String(cell.value ?? "");
        });
        return;
      }
      const obj: Record<string, unknown> = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber] || `col${colNumber}`;
        obj[header] = cell.value ?? "";
      });
      rows.push(obj);
    });

    if (rows.length === 0) {
      return apiError("الملف لا يحتوي على بيانات", 400);
    }

    // Convert rows to a text representation for the AI
    const headerKeys = Object.keys(rows[0]);
    const textRows = rows.slice(0, 200).map((r) =>
      headerKeys.map((h) => `${h}: ${r[h]}`).join(" | "),
    ).join("\n");

    const systemPrompt = `أنت محلل فواتير خبير. تستقبل بيانات من ملف Excel/CSV (كل سطر يمثل صف).
استخرج الطلبات المنظمة من هذه البيانات.

لكل طلب:
- clientName: اسم العميل (من عمود "العميل" أو "اسم" أو ما يشبه)
- clientPhone: رقم الهاتف
- clientAddress: العنوان
- items: مصفوفة المنتجات [{name, qty, unitPrice}]
- taxRate, shipping, discount, notes

قواعد:
- الأرقام العربية الهندية: ١=1 ٢=2 ٣=3
- إذا كان كل صف يمثل فاتورة كاملة، استخرج كل صف كطلب منفصل
- إذا كان الملف يحتوي على بنود متعددة لنفس العميل، اجمعها في طلب واحد
- qty و unitPrice أرقام موجبة دائماً

أجب فقط بـ JSON:
{"orders":[{"clientName":"","clientPhone":"","clientAddress":"","items":[{"name":"","qty":1,"unitPrice":0.0}],"taxRate":0,"shipping":0,"discount":0,"notes":""}]}`;

    // AI-02 FIX (Audit v2 · Phase 1 Final Closure): Wrap callAI in executeCascade
    // so parse-file benefits from cache → pattern → rule → memory → budget → AI.
    const { executeCascade } = await import("@/lib/ai-fabric/gateway");
    // Keep aiResult accessible outside the cascade for logging
    let aiResult: { content: string; provider?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; processingMs: number } | null = null;
    const cascadeResult = await executeCascade<string>(
      {
        companySlug: companySlug || "__global",
        requestType: "extraction",
        normalizedInput: textRows.slice(0, 500),
        rawInput: textRows,
        context: { systemPrompt, headerKeys },
      },
      {
        aiFn: async (): Promise<{ data: string; provider: string; tokensUsed: number; costUsd: number }> => {
          const result = await callAI(systemPrompt, `أعمدة الملف: ${headerKeys.join(", ")}\n\nالبيانات:\n${textRows}`);
          aiResult = result;
          return {
            data: result.content,
            provider: "z-ai",
            tokensUsed: (result.usage?.prompt_tokens || 0) + (result.usage?.completion_tokens || 0),
            costUsd: 0,
          };
        },
      },
    );
    const content = String(cascadeResult.data || "");
    // If cascade resolved via cache, aiResult may be undefined — use safe defaults
    const _aiResult = aiResult ?? { content, provider: cascadeResult.resolvedBy as string, usage: {} as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }, processingMs: cascadeResult.latencyMs };

    let orders: ParsedOrder[] = [];
    try {
      const obj = JSON.parse(stripFences(content));
      const raw = Array.isArray(obj) ? obj : (obj.orders ?? obj.items ?? []);
      orders = (raw as unknown[]).map(normalizeOrder).filter(Boolean) as ParsedOrder[];
    } catch (err) {
      logger.error("[parse-file] JSON parse failed", { err: err instanceof Error ? err.message : String(err) });
      // P0 FIX: log the AI call even though JSON parsing failed — the
      // provider call itself succeeded; the failure is downstream.
      void logAiUsage({
        companySlug: companySlug ?? "",
        userUid: user.uid ?? "",
        provider: "z-ai",
        model: 'z-ai-glm',
        endpoint: "parse-file",
        tokensIn: _aiResult.usage?.prompt_tokens || 0 || 0,
        tokensOut: _aiResult.usage?.completion_tokens || 0 || 0,
        processingMs: _aiResult.processingMs || 0,
        success: false,
        errorMessage: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return NextResponse.json(
        { error: "رد الذكاء الاصطناعي غير صالح", raw: content.slice(0, 500) },
        { status: 502 },
      );
    }

    const processingMs = Date.now() - t0;
    const itemsCount = orders.reduce((s, o) => s + o.items.length, 0);

    // P0 FIX (AI Effectiveness prompt): log every parse-file AI call to
    // ai_usage_logs with real token counts + the AI provider call latency
    // (_aiResult.processingMs || 0), distinct from the whole-handler processingMs.
    void logAiUsage({
      companySlug: companySlug ?? "",
      userUid: user.uid ?? "",
      provider: "z-ai",
      model: 'z-ai-glm',
      endpoint: "parse-file",
      tokensIn: _aiResult.usage?.prompt_tokens || 0 || 0,
      tokensOut: _aiResult.usage?.completion_tokens || 0 || 0,
      processingMs: _aiResult.processingMs || 0,
      success: true,
    });

    await db.aIProcessingLog.create({
      data: {
        companySlug: companySlug ?? "",
        requestType: "parse-file",
        provider: "z-ai",
        latencyMs: processingMs,
        tokensUsed: _aiResult.usage?.total_tokens || 0 || 0,
        success: true,
      },
    });

    await logAudit({
      userEmail: user.email, userUid: user.uid ?? "",
      action: "ai_parse_file", entity: "ai", companySlug: companySlug ?? "",
      details: { fileName, rowsParsed: rows.length, ordersExtracted: orders.length, processingMs, aiMs: _aiResult.processingMs || 0 },
    });

    return NextResponse.json({
      orders,
      meta: {
        processingMs,
        aiMs: _aiResult.processingMs || 0,
        inputTokens: _aiResult.usage?.prompt_tokens || 0 || 0,
        outputTokens: _aiResult.usage?.completion_tokens || 0 || 0,
        totalTokens: _aiResult.usage?.total_tokens || 0 || 0,
        rowsParsed: rows.length,
        ordersCount: orders.length,
        itemsCount,
      },
    });
  } catch (err) {
    const processingMs = Date.now() - t0;
    logger.error("[parse-file] failed", { err: err instanceof Error ? err.message : String(err), processingMs });
    // P0 FIX: log the failed AI call when the handler itself errored
    // (e.g. upstream provider threw before returning a completion).
    void logAiUsage({
      companySlug: companySlug ?? "",
      userUid: user.uid ?? "",
      provider: "z-ai",
      model: 'z-ai-glm',
      endpoint: "parse-file",
      tokensIn: 0,
      tokensOut: 0,
      processingMs,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "خطأ في معالجة الملف" },
      { status: 500 },
    );
  }
});
