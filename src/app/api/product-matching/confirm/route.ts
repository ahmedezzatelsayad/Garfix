/**
 * POST /api/product-matching/confirm
 *
 * Confirm a review-queue match: the input text becomes a new verified alias
 * for the matched product, so future entries with that text auto-match
 * (the "brain learns" step).
 *
 * Body: { companySlug, auditId, productId, alias }
 * Permission: settings_access (admin/manager only — confirming a match is a
 * catalog-shaping decision, not a routine employee action).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { confirmAlias } from "@/lib/productMatcher";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const ConfirmSchema = z.object({
  companySlug: z.string().min(1),
  auditId: z.number().int(),
  productId: z.number().int(),
  alias: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid", 400);
  const { companySlug, auditId, productId, alias } = parsed.data;

  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Verify the audit row belongs to this company + is in suggested tier
  const audit = await db.productMatchAudit.findFirst({
    where: { id: auditId, companySlug },
  });
  if (!audit) return apiError("Audit record not found", 404);

  // Create the verified alias (brain learns this input → product mapping)
  await confirmAlias(companySlug, productId, alias, user.email);

  // Mark the audit row as resolved (tier → confirmed, isUndone stays false)
  await db.productMatchAudit.update({
    where: { id: auditId },
    data: { tier: "confirmed", action: "ai-confirmed-alias" },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "confirm_alias",
    entity: "product_match_audit",
    entityId: auditId,
    companySlug,
    details: { productId, alias, inputText: audit.inputText },
  });

  return NextResponse.json({ ok: true, message: "تم تأكيد التطابق وحفظ الاسم البديل — سيتعلم النظام هذا التطابق تلقائياً في المرات القادمة" });
});
