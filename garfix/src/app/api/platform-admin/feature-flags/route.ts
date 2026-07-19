/**
 * /api/platform-admin/feature-flags
 *
 * GET  — list all flags (founder only)
 * POST — create a new flag (founder only)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";

const CreateSchema = z.object({
  key: z
    .string()
    .min(2, "key must be at least 2 chars")
    .max(80, "key too long")
    .regex(/^[a-z0-9_\-\.]+$/i, "key must be alphanumeric, dot, dash or underscore"),
  label: z.string().min(1, "label is required").max(120),
  description: z.string().max(500).optional().nullable(),
  plans: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;

  const flags = await db.featureFlag.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    flags: flags.map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      description: f.description,
      plans: parseJsonField<string[]>(f.plans, []),
      isActive: f.isActive,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues?.[0]?.message || "Invalid input", 400);
  }
  const data = parsed.data;

  // key must be unique
  const existing = await db.featureFlag.findUnique({ where: { key: data.key } });
  if (existing) {
    return apiError(`Flag with key "${data.key}" already exists`, 409);
  }

  const flag = await db.featureFlag.create({
    data: {
      key: data.key,
      label: data.label,
      description: data.description || null,
      plans: JSON.stringify(data.plans || []),
      isActive: data.isActive,
    },
  });

  await logAdminAction({
    adminEmail: founder.email,
    action: "create_feature_flag",
    targetType: "feature_flag",
    targetId: String(flag.id),
    changes: { key: flag.key, label: flag.label, plans: data.plans, isActive: data.isActive },
  });

  return NextResponse.json(
    {
      ok: true,
      flag: {
        id: flag.id,
        key: flag.key,
        label: flag.label,
        description: flag.description,
        plans: data.plans,
        isActive: flag.isActive,
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
      },
    },
    { status: 201 },
  );
});
