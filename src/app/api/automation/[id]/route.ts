/**
 * /api/automation/[id]
 * PATCH  — update a rule (name, condition, actions, isActive)
 * DELETE — remove a rule (cascades to execution logs via FK)
 *
 * Permission: settings_access + company access (must match the rule's companySlug)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  trigger: z.enum(["invoice_created", "stock_low", "payment_overdue"]).optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  actions: z
    .array(
      z.object({
        type: z.enum(["send_whatsapp", "create_task", "send_email"]),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function loadRule(id: number, companySlug?: string) {
  if (companySlug) {
    return db.automationRule.findFirst({ where: { id, companySlug } });
  }
  return db.automationRule.findUnique({ where: { id } });
}

// ─── PATCH ─────────────────────────────────────────────────────────────────
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (Number.isNaN(ruleId)) return apiError("Invalid rule id", 400);

  // SEC FIX: require companySlug to prevent IDOR
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const existing = await loadRule(ruleId, companySlug);
  if (!existing) return apiError("Rule not found", 404);

  // Founder/admin bypasses permission, but still needs company access
  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "مدخلات غير صالحة";
    return apiError(msg, 400);
  }
  const { name, trigger, condition, actions, isActive } = parsed.data;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (trigger !== undefined) data.trigger = trigger;
  if (condition !== undefined) data.condition = JSON.stringify(condition);
  if (actions !== undefined) data.actions = JSON.stringify(actions);
  if (isActive !== undefined) data.isActive = isActive;

  const updated = await db.automationRule.update({ where: { id: ruleId }, data });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "automation_rule",
    entityId: ruleId,
    companySlug: existing.companySlug,
    details: { updatedFields: Object.keys(data) },
  });

  return NextResponse.json({
    ok: true,
    rule: {
      id: updated.id,
      companySlug: updated.companySlug,
      name: updated.name,
      trigger: updated.trigger,
      condition: safeParse(updated.condition, {}),
      actions: safeParse(updated.actions, []),
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
});

// ─── DELETE ────────────────────────────────────────────────────────────────
export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (Number.isNaN(ruleId)) return apiError("Invalid rule id", 400);

  // SEC FIX: require companySlug to prevent IDOR
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const existing = await loadRule(ruleId, companySlug);
  if (!existing) return apiError("Rule not found", 404);

  const access = await requirePermissionForCompany(req, "settings_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  await db.automationRule.delete({ where: { id: ruleId } });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "automation_rule",
    entityId: ruleId,
    companySlug: existing.companySlug,
    details: { name: existing.name, trigger: existing.trigger },
  });

  return NextResponse.json({ ok: true });
});

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
