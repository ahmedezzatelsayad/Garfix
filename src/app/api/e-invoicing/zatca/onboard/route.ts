/**
 * /api/e-invoicing/zatca/onboard
 * POST — ZATCA Phase 2 onboarding (CSID + CCD flow).
 *
 * Two-step flow:
 *   Step 1 (no `step` in body): Request CSID using OTP + VAT number
 *   Step 2 (`step: "ccd"` in body): Request CCD using CSID serial number
 *
 * Or single-call mode (no `step`): completeZatcaOnboarding runs both steps
 * sequentially and returns both certificates in one response.
 *
 * Body:
 *   {
 *     companySlug: string,
 *     vatTrn: string,        // 15-digit VAT
 *     otp: string,           // from ZATCA portal
 *     productionMode?: boolean,  // default false (simulation)
 *     nameAr?: string,
 *     nameEn?: string,
 *     step?: "csid" | "ccd" | "complete",  // default "complete"
 *     csidSerialNumber?: string  // required when step="ccd"
 *   }
 *
 * Auth: founder OR company admin.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requireAuth } from "@/lib/middleware";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import {
  completeZatcaOnboarding,
  requestZatcaCsid,
  requestZatcaCcd,
} from "@/lib/e-invoicing/zatca-certs";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const Schema = z.object({
  companySlug: z.string().min(1),
  // FIX #28 (MEDIUM): Saudi VAT numbers are exactly 15 digits
  vatTrn: z.string().regex(/^\d{15}$/, "VAT must be exactly 15 digits"),
  otp: z.string().min(4).optional(),
  productionMode: z.boolean().optional().default(false),
  nameAr: z.string().optional(),
  nameEn: z.string().optional(),
  step: z.enum(["csid", "ccd", "complete"]).optional().default("complete"),
  csidSerialNumber: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "post:zatca-onboard", LIMITS.API_WRITE);
  if (rl) return rl;

  const authResponse = await requireAuth(req);
  if (authResponse instanceof NextResponse) return authResponse;
  const user = authResponse.user;

  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { companySlug, vatTrn, otp, productionMode, step, csidSerialNumber } = parsed.data;

  // Verify the user has access to this company
  const userCompanies = user.companies || [];
  const isFounder = user.role === "founder";
  if (!isFounder && !userCompanies.includes(companySlug)) {
    return apiError("ليس لديك صلاحية على هذه الشركة", 403);
  }

  try {
    if (step === "csid") {
      if (!otp) return apiError("OTP مطلوب لخطوة CSID", 400);
      const result = await requestZatcaCsid({
        companySlug, vatTrn, otp, productionMode,
        nameAr: parsed.data.nameAr, nameEn: parsed.data.nameEn,
      });

      await logAdminAction({
        adminEmail: user.email,
        action: "zatca_csid_requested",
        targetType: "company",
        targetId: companySlug,
        changes: { success: result.success, step: "csid" },
      });

      return NextResponse.json({
        success: result.success,
        csid: result.csid,
        error: result.error,
      });
    }

    if (step === "ccd") {
      if (!csidSerialNumber) return apiError("csidSerialNumber مطلوب لخطوة CCD", 400);
      const result = await requestZatcaCcd({
        companySlug, csidSerialNumber, vatTrn, productionMode,
      });

      await logAdminAction({
        adminEmail: user.email,
        action: "zatca_ccd_requested",
        targetType: "company",
        targetId: companySlug,
        changes: { success: result.success, step: "ccd" },
      });

      return NextResponse.json({
        success: result.success,
        ccd: result.ccd,
        error: result.error,
      });
    }

    // step === "complete" — run both
    if (!otp) return apiError("OTP مطلوب لإكمال الإعداد", 400);
    const result = await completeZatcaOnboarding(companySlug, vatTrn, otp, productionMode);

    await logAdminAction({
      adminEmail: user.email,
      action: "zatca_onboarding_complete",
      targetType: "company",
      targetId: companySlug,
      changes: { success: result.success, step: result.step },
    });

    return NextResponse.json({
      success: result.success,
      csid: result.csid,
      ccd: result.ccd,
      error: result.error,
    });
  } catch (err) {
    logger.error("[zatca/onboard] failed", {
      companySlug, step,
      err: err instanceof Error ? err.message : String(err),
    });
    return apiError(
      err instanceof Error ? err.message : "فشل الإعداد",
      500,
    );
  }
});
