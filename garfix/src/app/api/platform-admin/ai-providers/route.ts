/**
 * /api/platform-admin/ai-providers
 * GET  — list all providers with their config + connection status
 * PATCH — update a provider (apiKey, model, isEnabled, priority, baseUrl)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/middleware";
import { getAiProviders, setProviderApiKey, setProviderModel, setProviderEnabled, setProviderPriority, PROVIDER_INFO, type ProviderType } from "@/lib/aiProvider";
import { decryptSecret, isEncrypted } from "@/lib/cryptoVault";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import { withErrorHandler, parseJsonBody, apiError } from "@/lib/api";
import { z } from "zod";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult.user;

  const providers = await getAiProviders();

  // Merge with PROVIDER_INFO to get descriptions
  const result = PROVIDER_INFO.map(info => {
    const config = providers.find(p => p.provider === info.type);
    return {
      type: info.type,
      name: info.name,
      description: info.description,
      defaultModel: info.defaultModel,
      keyPrefix: info.keyPrefix,
      model: config?.model || info.defaultModel,
      isEnabled: config?.isEnabled ?? (info.type === "z-ai"),
      priority: config?.priority ?? 99,
      hasApiKey: !!config?.apiKey,
      // Don't return the actual key — just whether it's set
      apiKeyMasked: config?.apiKey ? `${config.apiKey.slice(0, 6)}...${config.apiKey.slice(-4)}` : null,
      baseUrl: config?.baseUrl || null,
    };
  });

  return NextResponse.json({ providers: result });
});

const UpdateSchema = z.object({
  provider: z.enum(["z-ai", "openrouter", "anthropic", "openai", "gemini", "custom"]),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  baseUrl: z.string().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const { provider, apiKey, model, isEnabled, priority, baseUrl } = parsed.data;

  if (apiKey !== undefined) await setProviderApiKey(provider as ProviderType, apiKey);
  if (model !== undefined) await setProviderModel(provider as ProviderType, model);
  if (isEnabled !== undefined) await setProviderEnabled(provider as ProviderType, isEnabled);
  if (priority !== undefined) await setProviderPriority(provider as ProviderType, priority);
  if (baseUrl !== undefined) {
    const key = `ai.provider.${provider}.baseUrl`;
    const existing = await db.platformSetting.findUnique({ where: { key } });
    if (existing) await db.platformSetting.update({ where: { key }, data: { value: JSON.stringify(baseUrl) } });
    else await db.platformSetting.create({ data: { key, category: "ai", valueType: "string", value: JSON.stringify(baseUrl) } });
  }

  await logAdminAction({
    adminEmail: user.email,
    action: "update_ai_provider",
    targetType: "ai_provider",
    targetId: provider,
    changes: { model, isEnabled, priority, hasApiKey: !!apiKey },
  });

  return NextResponse.json({ ok: true });
});
