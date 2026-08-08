/**
 * /api/e-invoicing/submit
 * POST — Generic e-invoice outbound submission route.
 *
 * Dispatches to the right country-specific submitter based on the company's
 * country code. Handles 7 countries: SA / EG / AE / KW / BH / OM / QA.
 *
 * For SA (ZATCA): delegates to the existing /api/e-invoicing/zatca/submit flow
 *   (CSID/CCD certificate signing — different pipeline from the others).
 *
 * For EG / KW / BH / OM: JSON-payload submission flow:
 *   1. Load invoice + company
 *   2. Validate (country-specific)
 *   3. Auto-populate country-specific fields
 *   4. Generate country-specific payload
 *   5. Submit to authority API
 *   6. Persist result to EInvoice
 *   7. Audit log
 *
 * For AE / QA (Peppol): UBL XML + Access Point submission flow (TODO — not yet
 *   implemented; returns a clear message).
 *
 * Body: { invoiceId: number, companySlug: string }
 *
 * Auth: requireAuth + verify user has access to companySlug.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requireAuth } from "@/lib/middleware";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ─── Country modules ───────────────────────────────────────────────────────
import {
  validateEgyptEtaInvoice,
  generateEgyptEtaInvoicePayload,
  autoPopulateEgyptEtaFields,
  submitEgyptEtaInvoice,
} from "@/lib/e-invoicing/egypt-eta";
import {
  validateKuwaitInvoice,
  generateKuwaitInvoicePayload,
  autoPopulateKuwaitFields,
  submitKuwaitInvoice,
} from "@/lib/e-invoicing/kuwait";
import {
  validateBahrainNbrInvoice,
  generateBahrainNbrInvoicePayload,
  autoPopulateBahrainNbrFields,
  submitBahrainNbrInvoice,
} from "@/lib/e-invoicing/bahrain-nbr";
import {
  validateOmanTaxInvoice,
  generateOmanTaxInvoicePayload,
  autoPopulateOmanTaxFields,
  submitOmanTaxInvoice,
} from "@/lib/e-invoicing/oman-tax";

const Schema = z.object({
  invoiceId: z.number().int().positive(),
  companySlug: z.string().min(1),
});

// ─── Authority label per country ───────────────────────────────────────────

const COUNTRY_AUTHORITY: Record<string, string> = {
  EG: "eta_egypt",
  AE: "uae_fta",
  KW: "kuwait_decree_10_2026",
  BH: "bahrain_nbr",
  OM: "oman_tax",
  QA: "qatar_gta",
};

// ─── POST Handler ──────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "post:einvoice-submit", LIMITS.API_WRITE);
  if (rl) return rl;

  const authResponse = await requireAuth(req);
  if (authResponse instanceof NextResponse) return authResponse;
  const user = authResponse.user;

  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { invoiceId, companySlug } = parsed.data;

  // Verify access
  const userCompanies = user.companies || [];
  const isFounder = user.role === "founder";
  if (!isFounder && !userCompanies.includes(companySlug)) {
    return apiError("ليس لديك صلاحية على هذه الشركة", 403);
  }

  try {
    // ── 1. Load invoice + company ──────────────────────────────────────────
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, companySlug, deletedAt: null },
    });
    if (!invoice) return apiError("الفاتورة غير موجودة", 404);

    const company = await db.company.findUnique({
      where: { slug: companySlug },
      select: {
        name: true, nameAr: true, vatNumber: true, address: true,
        country: true, commercialRegistration: true, currency: true,
      },
    });
    if (!company) return apiError("الشركة غير موجودة", 404);

    const country = company.country || "";
    const authority = COUNTRY_AUTHORITY[country];

    if (!authority) {
      return apiError(
        country === "SA"
          ? "استخدم /api/e-invoicing/zatca/submit لإرسال الفواتير السعودية"
          : `دعم الفوترة الإلكترونية غير متاح لهذه الدولة (${country || "غير محدد"})`,
        400,
      );
    }

    // ── 2. Dispatch by country ─────────────────────────────────────────────
    const invoiceRec = invoice as unknown as Record<string, unknown>;
    const companyRec = company as unknown as Record<string, unknown>;

    let submissionResult: {
      ok: boolean;
      submissionStatus: string;
      uuid?: string;
      error?: string;
      rejectionReason?: string;
      clearedNumber?: string;
    } | null = null;
    let validationErrors: Array<{ field: string; messageAr: string; severity: string }> | null = null;

    switch (country) {
      case "EG": {
        const validation = validateEgyptEtaInvoice(invoiceRec, companyRec);
        if (!validation.valid) {
          validationErrors = validation.errors.map((e) => ({
            field: e.field, messageAr: e.messageAr, severity: e.severity,
          }));
          break;
        }
        const populated = autoPopulateEgyptEtaFields(invoiceRec, companyRec);
        const payload = generateEgyptEtaInvoicePayload(populated, companyRec);
        const result = await submitEgyptEtaInvoice(payload);
        submissionResult = {
          ok: result.ok,
          submissionStatus: result.submissionStatus,
          uuid: payload.uuid,
          error: result.error,
          rejectionReason: result.rejectionReason,
        };
        break;
      }

      case "KW": {
        const validation = validateKuwaitInvoice(invoiceRec, companyRec);
        if (!validation.valid) {
          validationErrors = validation.errors.map((e) => ({
            field: e.field, messageAr: e.messageAr, severity: e.severity,
          }));
          break;
        }
        const populated = autoPopulateKuwaitFields(invoiceRec, companyRec);
        const payload = generateKuwaitInvoicePayload(populated, companyRec);
        const result = await submitKuwaitInvoice(payload);
        submissionResult = {
          ok: result.ok,
          submissionStatus: result.submissionStatus,
          uuid: (populated.uuid as string) || undefined,
          error: result.error,
          rejectionReason: result.rejectionReason,
        };
        break;
      }

      case "BH": {
        const validation = validateBahrainNbrInvoice(invoiceRec, companyRec);
        if (!validation.valid) {
          validationErrors = validation.errors.map((e) => ({
            field: e.field, messageAr: e.messageAr, severity: e.severity,
          }));
          break;
        }
        const populated = autoPopulateBahrainNbrFields(invoiceRec, companyRec);
        const payload = generateBahrainNbrInvoicePayload(populated, companyRec);
        const result = await submitBahrainNbrInvoice(payload);
        submissionResult = {
          ok: result.ok,
          submissionStatus: result.submissionStatus,
          uuid: (populated.uuid as string) || undefined,
          error: result.error,
          rejectionReason: result.rejectionReason,
        };
        break;
      }

      case "OM": {
        const validation = validateOmanTaxInvoice(invoiceRec, companyRec);
        if (!validation.valid) {
          validationErrors = validation.errors.map((e) => ({
            field: e.field, messageAr: e.messageAr, severity: e.severity,
          }));
          break;
        }
        const populated = autoPopulateOmanTaxFields(invoiceRec, companyRec);
        const payload = generateOmanTaxInvoicePayload(populated, companyRec);
        const result = await submitOmanTaxInvoice(payload);
        submissionResult = {
          ok: result.ok,
          submissionStatus: result.submissionStatus,
          uuid: (populated.uuid as string) || undefined,
          error: result.error,
          rejectionReason: result.rejectionReason,
        };
        break;
      }

      case "AE":
      case "QA": {
        // Peppol AP submission is handled by /api/e-invoicing/peppol/submit
        // (separate route because it needs AP credentials + UBL XML signing,
        // which is a different pipeline from the JSON-payload countries).
        return NextResponse.json({
          ok: false,
          redirect: "/api/e-invoicing/peppol/submit",
          message: "استخدم /api/e-invoicing/peppol/submit لإرسال فواتير Peppol (الإمارات/قطر)",
        }, { status: 308 });
      }

      default:
        return apiError(`دعم الفوترة الإلكترونية غير متاح للدولة: ${country}`, 400);
    }

    // ── 3. Handle validation errors ────────────────────────────────────────
    if (validationErrors) {
      return NextResponse.json({
        ok: false,
        stage: "validation",
        country,
        authority,
        errors: validationErrors,
      }, { status: 400 });
    }

    // ── 4. Persist result to EInvoice ──────────────────────────────────────
    if (submissionResult) {
      const existingEInvoice = await db.eInvoice.findUnique({ where: { invoiceId } });
      const eInvoiceData = {
        invoiceId,
        authorityType: authority,
        submissionStatus: submissionResult.submissionStatus as string,
        uuid: submissionResult.uuid || null,
        rejectionReason: submissionResult.rejectionReason || null,
        submittedAt: new Date(),
        clearedAt: submissionResult.submissionStatus === "cleared" || submissionResult.submissionStatus === "reported" || submissionResult.submissionStatus === "accepted"
          ? new Date()
          : null,
        companySlug,
        invoiceNumber: invoice.invoiceNumber,
        authority,
        status: submissionResult.submissionStatus,
        clearanceStatus: submissionResult.submissionStatus,
      };

      if (existingEInvoice) {
        await db.eInvoice.update({ where: { invoiceId }, data: eInvoiceData });
      } else {
        await db.eInvoice.create({ data: eInvoiceData }).catch((err) => {
          logger.warn("[e-invoicing/submit] EInvoice create failed", {
            invoiceId, err: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    // ── 5. Audit log ───────────────────────────────────────────────────────
    await logAdminAction({
      adminEmail: user.email,
      action: "einvoice_submitted",
      targetType: "invoice",
      targetId: String(invoiceId),
      changes: {
        country,
        authority,
        submissionStatus: submissionResult?.submissionStatus,
        uuid: submissionResult?.uuid,
      },
    });

    logger.info("[e-invoicing/submit] submission complete", {
      invoiceId, companySlug, country,
      submissionStatus: submissionResult?.submissionStatus,
    });

    return NextResponse.json({
      ok: submissionResult?.ok ?? false,
      invoiceId,
      companySlug,
      country,
      authority,
      uuid: submissionResult?.uuid || null,
      submissionStatus: submissionResult?.submissionStatus || "pending",
      error: submissionResult?.error,
      rejectionReason: submissionResult?.rejectionReason,
    });
  } catch (err) {
    logger.error("[e-invoicing/submit] failed", {
      invoiceId, companySlug,
      err: err instanceof Error ? err.message : String(err),
    });
    return apiError(
      err instanceof Error ? err.message : "فشل إرسال الفاتورة",
      500,
    );
  }
});
