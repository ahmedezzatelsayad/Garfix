/**
 * GET  /api/product-matching/config?companySlug=...
 * PUT  /api/product-matching/config
 *
 * Read + update the per-tenant product matching configuration:
 *   - autoMatchThreshold / suggestedThreshold (tier boundaries)
 *   - autoMatchingEnabled (global kill-switch via feature flag)
 *   - evidenceWeights (Enterprise v4: weighted multi-signal scoring)
 *   - signalFlags     (Enterprise v4: per-signal feature flags)
 *
 * Permission: settings_access (admin/manager).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import {
  DEFAULT_AUTO_MATCH_THRESHOLD,
  DEFAULT_SUGGESTED_THRESHOLD,
  DEFAULT_EVIDENCE_WEIGHTS,
  DEFAULT_SIGNAL_FLAGS,
  invalidateKillSwitchCache,
  type EvidenceWeights,
  type SignalFlags,
} from "@/lib/productMatcher";
import { z } from "zod";

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);
  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;

  const flag = await db.featureFlag.findUnique({ where: { key: "product-auto-matching" } });
  const settings = await db.platformSetting.findMany({ where: { key: { startsWith: `product.matching.${companySlug}.` } } });

  let autoMatchThreshold = DEFAULT_AUTO_MATCH_THRESHOLD;
  let suggestedThreshold = DEFAULT_SUGGESTED_THRESHOLD;
  let evidenceWeights = { ...DEFAULT_EVIDENCE_WEIGHTS };
  let signalFlags = { ...DEFAULT_SIGNAL_FLAGS };

  for (const s of settings) {
    try {
      const val = JSON.parse(s.value);
      if (s.key.endsWith(".autoThreshold") && typeof val === "number") autoMatchThreshold = val;
      else if (s.key.endsWith(".suggestedThreshold") && typeof val === "number") suggestedThreshold = val;
      else if (s.key.endsWith(".weights") && typeof val === "object" && val !== null) {
        for (const k of Object.keys(DEFAULT_EVIDENCE_WEIGHTS) as (keyof EvidenceWeights)[]) {
          if (typeof val[k] === "number") evidenceWeights[k] = val[k];
        }
      } else if (s.key.endsWith(".flags") && typeof val === "object" && val !== null) {
        for (const k of Object.keys(DEFAULT_SIGNAL_FLAGS) as (keyof SignalFlags)[]) {
          if (typeof val[k] === "boolean") signalFlags[k] = val[k];
        }
      }
    } catch { /* skip malformed */ }
  }

  return NextResponse.json({
    autoMatchThreshold,
    suggestedThreshold,
    autoMatchingEnabled: flag ? flag.isActive : true,
    evidenceWeights,
    signalFlags,
    defaults: { evidenceWeights: DEFAULT_EVIDENCE_WEIGHTS, signalFlags: DEFAULT_SIGNAL_FLAGS },
  });
});

// ─── PUT ─────────────────────────────────────────────────────────────────────

const WeightsSchema = z.object({
  text: z.number().min(0).max(1).optional(),
  brand: z.number().min(0).max(1).optional(),
  category: z.number().min(0).max(1).optional(),
  historical: z.number().min(0).max(1).optional(),
  semantic: z.number().min(0).max(1).optional(),
});

const FlagsSchema = z.object({
  text: z.boolean().optional(),
  brand: z.boolean().optional(),
  category: z.boolean().optional(),
  historical: z.boolean().optional(),
  semantic: z.boolean().optional(),
});

const ConfigUpdateSchema = z.object({
  companySlug: z.string().min(1),
  autoMatchThreshold: z.number().min(0).max(1).optional(),
  suggestedThreshold: z.number().min(0).max(1).optional(),
  evidenceWeights: WeightsSchema.optional(),
  signalFlags: FlagsSchema.optional(),
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = ConfigUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid", 400);
  const { companySlug, autoMatchThreshold, suggestedThreshold, evidenceWeights, signalFlags } = parsed.data;

  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const prefix = `product.matching.${companySlug}.`;
  const updates: { key: string; value: string; category: string; valueType: string; description: string }[] = [];

  if (typeof autoMatchThreshold === "number") {
    updates.push({ key: `${prefix}autoThreshold`, value: JSON.stringify(autoMatchThreshold), category: "product-matching", valueType: "number", description: "Auto-match confidence threshold" });
  }
  if (typeof suggestedThreshold === "number") {
    updates.push({ key: `${prefix}suggestedThreshold`, value: JSON.stringify(suggestedThreshold), category: "product-matching", valueType: "number", description: "Suggested (review queue) threshold" });
  }
  if (evidenceWeights) {
    updates.push({ key: `${prefix}weights`, value: JSON.stringify({ ...DEFAULT_EVIDENCE_WEIGHTS, ...evidenceWeights }), category: "product-matching", valueType: "json", description: "Evidence signal weights (text/brand/category/historical/semantic)" });
  }
  if (signalFlags) {
    updates.push({ key: `${prefix}flags`, value: JSON.stringify({ ...DEFAULT_SIGNAL_FLAGS, ...signalFlags }), category: "product-matching", valueType: "json", description: "Per-signal feature flags (enable/disable each evidence signal)" });
  }

  for (const u of updates) {
    await db.platformSetting.upsert({
      where: { key: u.key },
      update: { value: u.value, updatedBy: user.email },
      create: u,
    });
  }

  // Invalidate the in-memory config cache so the next match picks up new settings
  invalidateKillSwitchCache(companySlug);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update_matching_config",
    entity: "platform_setting",
    entityId: 0,
    companySlug,
    details: { autoMatchThreshold, suggestedThreshold, evidenceWeights, signalFlags },
  });

  return NextResponse.json({ ok: true, updated: updates.length, message: "تم تحديث إعدادات المطابقة" });
});
