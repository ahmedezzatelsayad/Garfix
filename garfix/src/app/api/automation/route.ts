/**
 * /api/automation
 * GET  — list automation rules for a company (requires settings_access)
 * POST — create a new rule
 *
 * Query: ?companySlug=acme
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  name: z.string().min(1).max(120),
  trigger: z.enum(["invoice_created", "stock_low", "payment_overdue"]),
  condition: z.record(z.string(), z.unknown()).optional(),
  actions: z
    .array(
      z.object({
        type: z.enum(["send_whatsapp", "create_task", "send_email"]),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1, "يجب إضافة إجراء واحد على الأقل"),
  isActive: z.boolean().optional(),
});

// ─── GET: list rules ──────────────────────────────────────────────────────
export const GET = withErrorHandler(async (req: NextRequest) => {
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug is required", 400);

  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;

  const rules = await db.automationRule.findMany({
    where: { companySlug },
    orderBy: { createdAt: "desc" },
  });

  // Parse JSON fields so the client gets proper objects
  const items = rules.map(r => ({
    id: r.id,
    companySlug: r.companySlug,
    name: r.name,
    trigger: r.trigger,
    condition: safeParse(r.condition, {}),
    actions: safeParse(r.actions, []),
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return NextResponse.json({ rules: items });
});

// ─── POST: create rule ────────────────────────────────────────────────────
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "مدخلات غير صالحة";
    return apiError(msg, 400);
  }
  const { companySlug, name, trigger, condition, actions, isActive } = parsed.data;

  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const rule = await db.automationRule.create({
    data: {
      companySlug,
      name,
      trigger,
      condition: JSON.stringify(condition || {}),
      actions: JSON.stringify(actions),
      isActive: isActive ?? true,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "automation_rule",
    entityId: rule.id,
    companySlug,
    details: { name, trigger, actionCount: actions.length },
  });

  return NextResponse.json(
    {
      ok: true,
      rule: {
        id: rule.id,
        companySlug: rule.companySlug,
        name: rule.name,
        trigger: rule.trigger,
        condition: safeParse(rule.condition, {}),
        actions: safeParse(rule.actions, []),
        isActive: rule.isActive,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      },
    },
    { status: 201 },
  );
});

// ─── helpers ──────────────────────────────────────────────────────────────
function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
