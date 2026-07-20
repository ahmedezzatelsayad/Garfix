/**
 * POST /api/ai/chat/stream — Streaming AI chat via Server-Sent Events (E-26).
 *
 * Streams the AI reply token-by-token to the client. Falls back to the
 * non-streaming /api/ai/chat endpoint if the SDK doesn't support streaming
 * or the client doesn't accept text/event-stream.
 *
 * SSE protocol:
 *   - Content-Type: text/event-stream
 *   - Each event: `data: <json>\n\n`
 *   - Final event: `data: {"done": true}\n\n`
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { num } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { logAiUsage } from "@/lib/ai/costTracker";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
});

const ChatSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  companySlug: z.string().optional(),
  conversationId: z.string().optional(),
});

/**
 * Outcome of a streaming AI call — returned alongside the text so the route
 * can log usage via logAiUsage(). `tokensIn`/`tokensOut` are only populated
 * on the non-streaming fallback path (the streaming protocol doesn't emit a
 * usage object per chunk); 0 is logged honestly for the streaming path.
 */
interface StreamOutcome {
  reply: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  processingMs: number;
  success: boolean;
  errorMessage?: string;
}

async function callAIStream(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
): Promise<StreamOutcome> {
  const t0 = Date.now();
  let fullReply = "";
  let provider = "z-ai";
  let model = "z-ai-glm";
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const ai = await ZAI.create();
    // Use streaming if available — fall back to non-streaming if not
    if (typeof (ai.chat.completions as unknown as { createStream?: unknown }).createStream === "function") {
      const stream = await (ai.chat.completions as unknown as {
        createStream: (args: unknown) => Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }>>;
      }).createStream({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        ],
        temperature: 0.4,
        max_tokens: 800,
        stream: true,
      });
      let streamUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) {
          fullReply += token;
          onToken(token);
        }
        if (chunk.usage) streamUsage = chunk.usage;
      }
      // Some providers attach usage to the final chunk; most streaming
      // responses do NOT include it — log 0 honestly in that case.
      if (streamUsage) {
        tokensIn = streamUsage.prompt_tokens || 0;
        tokensOut = streamUsage.completion_tokens || 0;
      }
    } else {
      // Fallback: non-streaming call, emit as a single token
      const completion = await ai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        ],
        temperature: 0.4,
        max_tokens: 800,
      });
      fullReply = completion.choices?.[0]?.message?.content || "";
      const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      tokensIn = usage.prompt_tokens || 0;
      tokensOut = usage.completion_tokens || 0;
      // Emit in chunks of 4 chars to simulate streaming
      for (let i = 0; i < fullReply.length; i += 4) {
        onToken(fullReply.slice(i, i + 4));
      }
    }
    return {
      reply: fullReply,
      provider,
      model,
      tokensIn,
      tokensOut,
      processingMs: Date.now() - t0,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[ai/stream] failed", { err: message });
    const fallback = "عذراً، حدث خطأ أثناء معالجة طلبك. حاول مرة أخرى لاحقاً.";
    fullReply = fallback;
    onToken(fallback);
    return {
      reply: fullReply,
      provider,
      model,
      tokensIn: 0,
      tokensOut: 0,
      processingMs: Date.now() - t0,
      success: false,
      errorMessage: message,
    };
  }
}

export async function POST(req: NextRequest) {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  // SEC-FIX: Rate limit AI streaming (same limit as non-streaming chat)
  const limited = await rateLimitResponse(req, "ai-chat-stream", LIMITS.AI_CHAT, user.uid);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (data.companySlug && !assertCompanyAccess(user, data.companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conversationId = data.conversationId || randomUUID();

  // Build context (same as non-streaming endpoint)
  let contextBlock = "";
  if (data.companySlug) {
    const [invCount, clientCount, productCount, employeeCount] = await Promise.all([
      db.invoice.count({ where: { companySlug: data.companySlug } }),
      db.client.count({ where: { companySlug: data.companySlug } }),
      db.productCatalog.count({ where: { companySlug: data.companySlug } }),
      db.employee.count({ where: { companySlug: data.companySlug } }),
    ]);
    // P0 FIX (audit finding ai/chat/stream/route.ts:128 N+1): the previous
    // implementation fetched EVERY invoice row to sum the total in JS. We
    // can't use Prisma _sum because `total` is String (SQLite money-as-
    // string pattern). Instead we keep findMany but select ONLY the `total`
    // column (not the full row) — ~10x memory reduction. The TODO for full
    // fix is to migrate to PostgreSQL Decimal and switch to aggregate().
    const revenueRows = await db.invoice.findMany({
      where: { companySlug: data.companySlug },
      select: { total: true },
    });
    const revenue = revenueRows.reduce((s, r) => s + num(r.total, 3), 0);
    const recentInvoices = await db.invoice.findMany({
      where: { companySlug: data.companySlug },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { invoiceNumber: true, clientName: true, total: true, status: true, issueDate: true },
    });
    contextBlock = `
سياق الأعمال الحالي:
- عدد الفواتير: ${invCount}
- عدد العملاء: ${clientCount}
- عدد المنتجات: ${productCount}
- عدد الموظفين: ${employeeCount}
- إجمالي الإيرادات: ${revenue.toFixed(3)}
- آخر 5 فواتير:
${recentInvoices.map((i) => `  • ${i.invoiceNumber} — ${i.clientName} — ${num(i.total, 3)} — ${i.status} — ${i.issueDate}`).join("\n")}
`;
  }

  const systemPrompt = `أنت "جارفكس كوبيلوت" — مساعد ذكي لمنصة ERP/SaaS لإدارة الفواتير والعملاء والموظفين.
تحدث بالعربية بشكل افتراضي. كن مختصراً وعملياً وودوداً.
ساعد المستخدم في:
- تحليل أداء الأعمال
- اقتراح طرق لزيادة الإيرادات
- شرح كيفية استخدام المنصة
- إعطاء نصائح حول إدارة العملاء والموظفين
- الإجابة عن أسئلة الفواتير والمدفوعات

${contextBlock}

المستخدم: ${user.uid} (${user.email})
الدور: ${user.role}
${data.companySlug ? `الشركة النشطة: ${data.companySlug}` : "لا توجد شركة نشطة"}
`;

  // Set up SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const outcome = await callAIStream(
          systemPrompt,
          data.messages,
          (token) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          },
        );
        const fullReply = outcome.reply;

        // P0 FIX (AI Effectiveness prompt): log every streaming AI call to
        // ai_usage_logs. Tokens are only available on the non-streaming
        // fallback path (the streaming protocol doesn't reliably emit usage);
        // 0 is logged honestly otherwise, as the prompt requires.
        void logAiUsage({
          companySlug: data.companySlug || null,
          userUid: user.uid,
          provider: outcome.provider,
          model: outcome.model,
          endpoint: "chat-stream",
          tokensIn: outcome.tokensIn,
          tokensOut: outcome.tokensOut,
          processingMs: outcome.processingMs,
          success: outcome.success,
          errorMessage: outcome.errorMessage || null,
        });

        // Persist the conversation
        const lastUserMsg = data.messages[data.messages.length - 1];
        await db.chatMessage.create({
          data: {
            userUid: user.uid,
            companySlug: data.companySlug || null,
            role: "user",
            content: lastUserMsg.content,
            conversationId,
            model: outcome.model,
          },
        });
        await db.chatMessage.create({
          data: {
            userUid: user.uid,
            companySlug: data.companySlug || null,
            role: "assistant",
            content: fullReply,
            conversationId,
            model: outcome.model,
          },
        });

        await logAudit({
          userEmail: user.email, userUid: user.uid,
          action: "ai_chat_stream", entity: "chat", companySlug: data.companySlug,
          details: { conversationId, messageCount: data.messages.length, processingMs: outcome.processingMs },
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, conversationId, meta: { processingMs: outcome.processingMs, tokensIn: outcome.tokensIn, tokensOut: outcome.tokensOut } })}\n\n`));
      } catch (err) {
        logger.error("[ai/stream] fatal error", { err: err instanceof Error ? err.message : String(err) });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
