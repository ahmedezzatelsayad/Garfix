/**
 * POST /api/product-matching/match-override
 * GET  /api/product-matching/match-override?companySlug=...
 *
 * Learning Engine — record + list human overrides of the matcher's decision.
 *
 * When an employee reviews a match and decides the matcher's winner is wrong
 * (e.g. candidates[0] should actually be candidates[1], or a "new product"
 * should map to an existing product), they POST an override. The matcher then
 * LEARNS: the next time the same (normalized) input is seen, it short-circuits
 * to the employee-confirmed product (see lookupOverride in productMatcher.ts).
 *
 * POST Body: {
 *   companySlug: string,
 *   inputText: string,         // the raw invoice line description
 *   fromProductId?: number,    // matcher's original winner (null if "new product")
 *   toProductId: number,       // the product the employee chose instead
 *   chosenAlias?: string,      // the alias text the employee confirmed
 *   auditId?: number,          // link to the original ProductMatchAudit row
 *   reason?: string,           // optional employee note
 * }
 *
 * Permission: settings_access (admin/manager — catalog-shaping decision).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { recordMatchOverride } from "@/lib/productMatcher";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const OverrideSchema = z.object({
  companySlug: z.string().min(1),
  inputText: z.string().min(1),
  fromProductId: z.number().int().nullable().optional(),
  toProductId: z.number().int(),
  chosenAlias: z.string().optional(),
  auditId: z.number().int().optional(),
  reason: z.string().max(500).optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = OverrideSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid", 400);
  const { companySlug, inputText, fromProductId, toProductId, chosenAlias, auditId, reason } = parsed.data;

  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Verify the target product exists + belongs to this company
  const product = await db.productCatalog.findFirst({
    where: { id: toProductId, companySlug },
  });
  if (!product) return apiError("المنتج المختار غير موجود", 404);

  // Record the override (the learning engine stores it for future auto-matches)
  const { overrideId } = await recordMatchOverride({
    companySlug,
    inputText,
    fromProductId: fromProductId ?? null,
    toProductId,
    chosenAlias,
    auditId,
    reason,
    overriddenBy: user.email,
  });

  // If an auditId was provided, link it + mark the audit row as human-resolved
  if (auditId) {
    await db.productMatchAudit.update({
      where: { id: auditId },
      data: {
        resolvedBy: "human",
        tier: "confirmed",
        action: "human-overridden",
        matchedProductId: toProductId,
        matchedAlias: chosenAlias ?? null,
      },
    }).catch(() => {});
  }

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "match_override",
    entity: "match_override",
    entityId: overrideId,
    companySlug,
    details: { inputText, fromProductId, toProductId, chosenAlias, reason },
  });

  return NextResponse.json({
    ok: true,
    overrideId,
    message: "تم تسجيل التصحيح — سيتعلم النظام تطبيق هذا التطابق تلقائياً في المرات القادمة",
  });
});

/**
 * GET — list overrides for a company (paginated, newest first).
 * Used by the review queue / analytics dashboard to see what humans corrected.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);
  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);
  const offset = Math.max(Number(req.nextUrl.searchParams.get("offset") || 0), 0);

  const [overrides, total] = await Promise.all([
    db.matchOverride.findMany({
      where: { companySlug },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.matchOverride.count({ where: { companySlug } }),
  ]);

  return NextResponse.json({ overrides, total, limit, offset });
});
