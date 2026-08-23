/**
 * /api/ai/company-agent/n8n-test — اختبار اتصال بيئة n8n الذاتية.
 *
 * يرسل ping موقّعًا إلى الـ Webhook URL الخاص ببيئة العميل ويتوقع أي استجابة
 * 2xx. النتيجة تُسجَّل في إعدادات الوكيل (n8nConnected).
 *
 * حماية SSRF: يُستخدم fetchSafe من lib/ssrf (مانع الشبكات الداخلية).
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { withErrorHandler, apiError, parseJsonBody } from "@/lib/api";
import { fetchSafe } from "@/lib/ssrf";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";

const TestSchema = z.object({
  companySlug: z.string().min(1),
  webhookUrl: z.string().url().refine((u) => u.startsWith("https://"), {
    message: "يجب أن يكون الرابط HTTPS",
  }),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "post:n8n-test", { ...LIMITS.API_WRITE, maxAttempts: 10 });
  if (rl) return rl;

  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = TestSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  const { companySlug, webhookUrl } = parsed.data;

  if (!assertCompanyAccess(auth.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const res = await fetchSafe(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "garfix",
        type: "ping",
        companySlug,
        sentAt: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      return apiError(`استجابة n8n: ${res.status} — تأكد من تفعيل الـ Workflow`, 502);
    }

    // تسجيل الاتصال الناجح
    const cfg = await db.companyAIConfig.findFirst({ where: { company: { slug: companySlug } } });
    if (cfg) {
      let root: Record<string, unknown> = {};
      try { root = cfg.systemPrompt ? JSON.parse(cfg.systemPrompt) as Record<string, unknown> : {}; } catch { root = {}; }
      const agent = (root.__company_agent__ as Record<string, unknown>) || {};
      agent.n8nConnected = true;
      agent.n8nWebhookUrl = webhookUrl;
      root.__company_agent__ = agent;
      await db.companyAIConfig.update({ where: { id: cfg.id }, data: { systemPrompt: JSON.stringify(root) } });
    }

    logger.info("[n8n-test] connected", { companySlug });
    return NextResponse.json({ ok: true, status: res.status });
  } catch (err) {
    logger.error("[n8n-test] failed", { companySlug, err: err instanceof Error ? err.message : String(err) });
    return apiError(`تعذّر الوصول لـ n8n: ${err instanceof Error ? err.message : "خطأ شبكة"}`, 502);
  }
});
