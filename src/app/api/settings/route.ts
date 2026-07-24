/**
 * /api/settings
 * GET — return the platform settings (public ones)
 * PATCH — founder-only update
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAdminAction } from "@/lib/audit";
import { withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";
import { DEFAULT_PLANS } from "@/lib/plans";

const PUBLIC_SETTINGS = new Set([
  "plans.catalog",
  "feature.public_signup",
  "branding.name",
  "branding.tagline",
  "branding.primary_color",
]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;
  const settings = await db.platformSettings.findMany();
  const map: Record<string, unknown> = {};
  // P2 fix (Phase 2 audit): the PUBLIC_SETTINGS allowlist was declared but
  // never enforced — any authenticated user (including non-founder tenants)
  // could read ALL platform settings (plans catalog, feature flags, branding,
  // and any future sensitive keys) by hitting GET /api/settings directly.
  // Now non-founder/non-admin users only see the public allowlist. Founder
  // and admin still see everything (the PATCH below is founder-only).
  const isFounderOrAdmin = isFounderEmail(user.email) || user.role === "admin";
  for (const s of settings) {
    if (isFounderOrAdmin || PUBLIC_SETTINGS.has(s.key)) {
      map[s.key] = parseJsonField(s.value, null);
    }
  }
  // Defaults
  return NextResponse.json({
    settings: map,
    defaults: {
      "plans.catalog": DEFAULT_PLANS,
      "feature.public_signup": true,
      "branding.name": "GARFIX",
      "branding.tagline": "منصة إدارة الأعمال المتكاملة",
      "branding.primary_color": "#7c3aed",
    },
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }
  const body = await parseJsonBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const updates = body as Record<string, unknown>;

  for (const [key, value] of Object.entries(updates)) {
    const existing = await db.platformSettings.findUnique({ where: { key } });
    const oldValue = existing?.value || null;
    const newValue = JSON.stringify(value);
    const valueType = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : typeof value === "object" ? "json" : "string";

    if (existing) {
      await db.platformSettings.update({
        where: { key },
        data: { value: newValue, valueType, updatedBy: result.user.email, updatedAt: new Date() },
      });
    } else {
      await db.platformSettings.create({
        data: {
          key, category: key.split(".")[0] || "general",
          valueType, value: newValue, updatedBy: result.user.email,
        },
      });
    }

    await db.platformSettingsHistory.create({
      data: {
        settingKey: key,
        oldValue,
        newValue,
        changedBy: result.user.uid,
        changedByEmail: result.user.email,
      },
    });
  }

  await logAdminAction({
    adminEmail: result.user.email,
    action: "update_settings",
    targetType: "platform_settings",
    changes: updates,
  });

  return NextResponse.json({ ok: true });
});
