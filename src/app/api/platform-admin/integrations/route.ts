/**
 * /api/platform-admin/integrations
 * GET   — list all integrations with their config schema + connection status
 * PATCH — update credentials for one integration (founder-only)
 *
 * Credentials are encrypted at rest via cryptoVault; the response only
 * exposes which fields are set (boolean) — never the raw values.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/middleware";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import "@/lib/integrations"; // side-effect: registers providers
import { INTEGRATION_INFO, getProvider } from "@/lib/integrations";
import { setIntegrationConfig, disconnectIntegration } from "@/lib/integrations/registry";
import { z } from "zod";

// ─── GET: list integrations + status ──────────────────────────────────────
export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  // Read all integration credential rows in one query
  const rows = await db.platformSetting.findMany({
    where: { category: "integration" },
    select: { key: true, updatedAt: true },
  });
  const updatedAtByType = new Map<string, Date>();
  for (const r of rows) {
    // key format: integration.<type>.credentials
    const parts = r.key.split(".");
    if (parts.length === 3) updatedAtByType.set(parts[1], r.updatedAt);
  }

  const result = INTEGRATION_INFO.map(info => {
    const provider = getProvider(info.type);
    const hasCredentials = updatedAtByType.has(info.type);
    return {
      type: info.type,
      name: info.name,
      description: info.description,
      requiredFields: info.requiredFields,
      hasCredentials,
      credentialsLastUpdatedAt: updatedAtByType.get(info.type) || null,
      isRegistered: !!provider,
    };
  });

  return NextResponse.json({ integrations: result });
});

// ─── PATCH: save / clear credentials ──────────────────────────────────────
const PatchSchema = z.object({
  type: z.string().min(1),
  credentials: z.record(z.string(), z.string()).optional(),
  disconnect: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult.user;

  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "مدخلات غير صالحة";
    return apiError(msg, 400);
  }
  const { type, credentials, disconnect } = parsed.data;

  const info = INTEGRATION_INFO.find(i => i.type === type);
  if (!info) return apiError(`Unknown integration type: ${type}`, 400);

  const provider = getProvider(type);
  if (!provider) return apiError(`Provider not registered: ${type}`, 500);

  // ─── Disconnect path ───────────────────────────────────────────────────
  if (disconnect) {
    await provider.disconnect();
    await logAdminAction({
      adminEmail: user.email,
      action: "disconnect_integration",
      targetType: "integration",
      targetId: type,
      changes: { type },
    });
    return NextResponse.json({ ok: true, type, disconnected: true });
  }

  // ─── Save path ─────────────────────────────────────────────────────────
  if (!credentials) return apiError("credentials are required (or set disconnect:true)", 400);

  // Validate required fields
  const missing = info.requiredFields
    .filter(f => !credentials[f.key] || credentials[f.key].trim() === "")
    .map(f => f.key);
  if (missing.length > 0) {
    return apiError(`Missing required fields: ${missing.join(", ")}`, 400);
  }

  // Encrypt + persist via provider
  const ok = await provider.connect(credentials);
  if (!ok) return apiError("Failed to store credentials (provider rejected input)", 500);

  await logAdminAction({
    adminEmail: user.email,
    action: "update_integration",
    targetType: "integration",
    targetId: type,
    changes: { type, fields: Object.keys(credentials) },
  });

  return NextResponse.json({ ok: true, type });
});

// Re-export helpers for convenience
export { setIntegrationConfig, disconnectIntegration };
