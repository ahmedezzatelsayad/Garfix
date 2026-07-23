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
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { withErrorHandler, parseJsonBody, apiError, parseJsonField } from "@/lib/api";
import { z } from "zod";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  const rows = await db.landingContent.findMany({
    orderBy: { key: "asc" },
    select: { key: true, value: true, updatedAt: true, updatedBy: true },
  });

  const items = rows.map((r) => ({
    key: r.key,
    value: parseJsonField(r.value, r.value),
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy,
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
  const existing = await db.landingContent.findUnique({ where: { key } });
  const oldValue = existing?.value ?? null;

  const upserted = await db.landingContent.upsert({
    where: { key },
    update: { value: serialized, updatedAt: new Date(), updatedBy: user.email },
    create: { key, value: serialized, updatedBy: user.email },
  });

  // ── 2. Mirror to PlatformSetting so we can use PlatformSettingHistory ──
  // The history table has a FK on settingKey → PlatformSetting.key. We keep
  // a shadow PlatformSetting row at `landing.{key}` for audit purposes only;
  // the landing page itself reads from LandingContent (above).
  const settingKey = `landing.${key}`;
  const platformExisting = await db.platformSetting.findUnique({ where: { key: settingKey } });
  const oldPlatformValue = platformExisting?.value ?? null;

  if (platformExisting) {
    await db.platformSetting.update({
      where: { key: settingKey },
      data: {
        value: serialized,
        updatedBy: user.email,
        updatedAt: new Date(),
      },
    });
  } else {
    await db.platformSetting.create({
      data: {
        key: settingKey,
        category: "landing_content",
        valueType: "json",
        value: serialized,
        updatedBy: user.email,
      },
    });
  }

  // ── 3. Append to PlatformSettingHistory ─────────────────────────────────
  await db.platformSettingHistory.create({
    data: {
      settingKey,
      oldValue: oldPlatformValue,
      newValue: serialized,
      changedBy: user.uid,
      changedByEmail: user.email,
    },
  });

  return NextResponse.json({
    ok: true,
    key: upserted.key,
    updatedAt: upserted.updatedAt.toISOString(),
    updatedBy: upserted.updatedBy,
    // Surface both old and new for the client to confirm/refresh UI
    oldValue: oldValue ? parseJsonField(oldValue, oldValue) : null,
    newValue: parseJsonField(serialized, serialized),
  });
});
