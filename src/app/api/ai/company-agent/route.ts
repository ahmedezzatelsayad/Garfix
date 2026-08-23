/**
 * /api/ai/company-agent — إعدادات وكيل الشركة (Commercial v2: $20 add-on).
 *
 * GET   — جلب إعدادات الوكيل للشركة (يُنشئ افتراضية عند أول نداء)
 * PATCH — تحديث التفعيل/واتساب/n8n webhook
 *
 * الإعدادات تُخزن في CompanyAIConfig الموجودة (حقول systemPrompt كـ JSON)
 * بدون جداول جديدة — تفعيل فوري.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { withErrorHandler, apiError, parseJsonBody } from "@/lib/api";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";
import { z } from "zod";

/** مفتاح إعدادات الوكيل داخل CompanyAIConfig.systemPrompt (JSON blob). */
const AGENT_KEY = "__company_agent__";

interface AgentBlob {
  enabled: boolean;
  whatsappEnabled: boolean;
  n8nWebhookUrl?: string | null;
  n8nConnected?: boolean;
  activatedAt?: string;
}

async function readAgentConfig(companySlug: string): Promise<AgentBlob> {
  const cfg = await db.companyAIConfig.findFirst({ where: { company: { slug: companySlug } } });
  if (!cfg?.systemPrompt) return { enabled: false, whatsappEnabled: false, n8nWebhookUrl: null };
  try {
    const parsed = JSON.parse(cfg.systemPrompt) as Record<string, unknown>;
    const blob = parsed[AGENT_KEY] as AgentBlob | undefined;
    return blob || { enabled: false, whatsappEnabled: false, n8nWebhookUrl: null };
  } catch {
    return { enabled: false, whatsappEnabled: false, n8nWebhookUrl: null };
  }
}

async function writeAgentConfig(companySlug: string, blob: AgentBlob): Promise<void> {
  const cfg = await db.companyAIConfig.findFirst({ where: { company: { slug: companySlug } } });
  if (!cfg) throw new Error("AI config not initialized for company");
  let root: Record<string, unknown> = {};
  try { root = cfg.systemPrompt ? JSON.parse(cfg.systemPrompt) as Record<string, unknown> : {}; } catch { root = {}; }
  root[AGENT_KEY] = blob;
  await db.companyAIConfig.update({ where: { id: cfg.id }, data: { systemPrompt: JSON.stringify(root) } });
}

const PatchSchema = z.object({
  companySlug: z.string().min(1),
  enabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  n8nWebhookUrl: z.string().url().nullable().optional(),
  n8nConnected: z.boolean().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companySlug = req.nextUrl.searchParams.get("companySlug") || "";
  if (!companySlug || !assertCompanyAccess(auth.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const config = await readAgentConfig(companySlug);
  return NextResponse.json({ ok: true, config });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "patch:company-agent", LIMITS.API_WRITE);
  if (rl) return rl;

  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PatchSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  const d = parsed.data;

  if (!assertCompanyAccess(auth.user, d.companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const current = await readAgentConfig(d.companySlug);
  const next: AgentBlob = {
    ...current,
    ...d,
    activatedAt: d.enabled && !current.enabled ? new Date().toISOString() : current.activatedAt,
  };

  await writeAgentConfig(d.companySlug, next);
  logger.info("[company-agent] config updated", { companySlug: d.companySlug, enabled: next.enabled });
  return NextResponse.json({ ok: true, config: next });
});
