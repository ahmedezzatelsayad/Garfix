/**
 * /api/platform-admin/landing-content
 *
 * GET   — List every LandingContent row (key, value as parsed JSON, updatedAt, updatedBy).
 *          Founder-only.
 *
 * PATCH — Upsert a single LandingContent entry. Body: { key, value }.
 *          Founder-only. Also writes a PlatformSettingHistory record (mirrored
 *          to a PlatformSetting row keyed `landing.{key}`) so the change shows
 *          up in the existing settings-history audit trail.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler, parseJsonBody, apiError, parseJsonField } from "@/lib/api";
import { z } from "zod";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  // LandingContent schema has: id, section (unique), title, subtitle, body,
  // ctaText, ctaLink, imageUrl, sortOrder, locale, createdAt, updatedAt.
  // There is no `key` / `value` / `updatedBy` column — the previous `db: any`
  // masked selects on non-existent fields, returning `undefined` for each.
  // We map `section` → key, `body` → value, and surface `updatedBy: null` to
  // preserve the API contract consumed by the founder panel.
  const rows = await db.landingContent.findMany({
    orderBy: { section: "asc" },
    select: { section: true, body: true, updatedAt: true },
  });

  const items = rows.map((r) => ({
    key: r.section,
    value: parseJsonField(r.body, r.body),
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: null,
  }));

  return NextResponse.json({ items });
});

const PatchSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.unknown(),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult.user;

  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    // Zod v4: use `issues` (v3 used `errors`). Fall back gracefully.
    const issues = (parsed.error as { issues?: Array<{ message?: string }> }).issues;
    const msg = issues?.[0]?.message || "مدخلات غير صالحة";
    return apiError(msg, 400);
  }

  const { key, value } = parsed.data;
  // Serialize value — JSON-stringify scalars and objects alike. This is how
  // we preserve type info (string vs number vs object) on the way back out.
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  // ── 1. Upsert LandingContent (source of truth) ─────────────────────────
  // Map key → section, value → body. The schema has no `updatedBy` column.
  const existing = await db.landingContent.findUnique({ where: { section: key } });
  const oldValue = existing?.body ?? null;

  const upserted = await db.landingContent.upsert({
    where: { section: key },
    update: { body: serialized, updatedAt: new Date() },
    create: { section: key, body: serialized },
  });

  // ── 2. Mirror to PlatformSetting so we can use PlatformSettingHistory ──
  // The history table has a FK on settingKey → PlatformSetting.key. We keep
  // a shadow PlatformSetting row at `landing.{key}` for audit purposes only;
  // the landing page itself reads from LandingContent (above).
  // PlatformSettings schema has: id, key, value, category, description,
  // valueType, createdAt, updatedAt. There is no `companySlug` or `updatedBy`
  // column — the previous code wrote them via `db: any` (silently ignored).
  const settingKey = `landing.${key}`;
  const platformExisting = await db.platformSettings.findUnique({ where: { key: settingKey } });
  const oldPlatformValue = platformExisting?.value ?? null;

  let platformSettingId: number;
  if (platformExisting) {
    const updated = await db.platformSettings.update({
      where: { key: settingKey },
      data: {
        value: serialized,
        updatedAt: new Date(),
      },
    });
    platformSettingId = updated.id;
  } else {
    const created = await db.platformSettings.create({
      data: {
        key: settingKey,
        category: "landing_content",
        valueType: "json",
        value: serialized,
      },
    });
    platformSettingId = created.id;
  }

  // ── 3. Append to PlatformSettingHistory ─────────────────────────────────
  // PlatformSettingsHistory requires `settingId` (Int FK) and `settingKey`
  // (String). There is no `changedByEmail` column — removed.
  await db.platformSettingsHistory.create({
    data: {
      settingId: platformSettingId,
      settingKey,
      oldValue: oldPlatformValue,
      newValue: serialized,
      changedBy: user.uid,
    },
  });

  return NextResponse.json({
    ok: true,
    key: upserted.section,
    updatedAt: upserted.updatedAt.toISOString(),
    updatedBy: null,
    // Surface both old and new for the client to confirm/refresh UI
    oldValue: oldValue ? parseJsonField(oldValue, oldValue) : null,
    newValue: parseJsonField(serialized, serialized),
  });
});
