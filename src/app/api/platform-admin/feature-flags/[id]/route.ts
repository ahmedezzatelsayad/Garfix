/**
 * /api/platform-admin/feature-flags/[id]
 *
 * PATCH  — update a flag (founder only)
 * DELETE — delete a flag (founder only)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_\-\.]+$/i, "key must be alphanumeric, dot, dash or underscore")
    .optional(),
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  plans: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) {
    return apiError("Invalid id", 400);
  }

  const existing = await db.featureFlag.findUnique({ where: { id } });
  if (!existing) return apiError("Feature flag not found", 404);

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues?.[0]?.message || "Invalid input", 400);
  }
  const data = parsed.data;

  // If key is changing, ensure uniqueness
  if (data.key && data.key !== existing.key) {
    const clash = await db.featureFlag.findUnique({ where: { key: data.key } });
    if (clash) return apiError(`Flag with key "${data.key}" already exists`, 409);
  }

  const updateData: Record<string, unknown> = {};
  if (data.key !== undefined) updateData.key = data.key;
  if (data.label !== undefined) updateData.label = data.label;
  if (data.description !== undefined) updateData.description = data.description || null;
  if (data.plans !== undefined) updateData.plans = JSON.stringify(data.plans);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const flag = await db.featureFlag.update({ where: { id: existing.id }, data: updateData });

  await logAdminAction({
    adminEmail: founder.email,
    action: "update_feature_flag",
    targetType: "feature_flag",
    targetId: String(existing.id),
    changes: {
      before: {
        key: existing.key,
        label: existing.label,
        plans: parseJsonField<string[]>(existing.plans, []),
        isActive: existing.isActive,
      },
      after: updateData,
    },
  });

  return NextResponse.json({
    ok: true,
    flag: {
      id: flag.id,
      key: flag.key,
      label: flag.label,
      description: flag.description,
      plans: parseJsonField<string[]>(flag.plans, []),
      isActive: flag.isActive,
      createdAt: flag.createdAt,
      updatedAt: flag.updatedAt,
    },
  });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) {
    return apiError("Invalid id", 400);
  }

  const existing = await db.featureFlag.findUnique({ where: { id } });
  if (!existing) return apiError("Feature flag not found", 404);

  await db.featureFlag.delete({ where: { id: existing.id } });

  await logAdminAction({
    adminEmail: founder.email,
    action: "delete_feature_flag",
    targetType: "feature_flag",
    targetId: String(existing.id),
    changes: { key: existing.key, label: existing.label },
  });

  return NextResponse.json({ ok: true });
});

