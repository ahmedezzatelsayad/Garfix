/**
 * /api/e-invoicing/zatca/submit
 * POST — Submit a finalized invoice to ZATCA for clearance (Standard B2B)
 * or reporting (Simplified B2C).
 *
 * Flow:
 *   1. Load the invoice + line items from DB
 *   2. Load the company's active CCD certificate (encrypted → decrypt)
 *   3. Validate the invoice with validateZatcaInvoice
 *   4. Generate UBL 2.1 XML with generateZatcaUblXml
 *   5. Sign the XML with signZatcaInvoice (ECDSA-SHA256)
 *   6. Submit to ZATCA with submitZatcaInvoice
 *   7. Persist the result to EInvoice (submissionStatus, clearedAt, uuid, etc.)
 *   8. Return the submission result
 *
 * Body: { invoiceId: number, companySlug: string }
 *
 * Auth: founder OR company admin.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requireAuth } from "@/lib/middleware";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import {
  validateZatcaInvoice,
  generateZatcaUblXml,
  signZatcaInvoice,
  submitZatcaInvoice,
  autoPopulateZatcaFields,
  determineZatcaInvoiceType,
} from "@/lib/e-invoicing/zatca";
import { getActiveSigningCertificate } from "@/lib/e-invoicing/zatca-certs";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const Schema = z.object({
  invoiceId: z.number().int().positive(),
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "post:zatca-submit", LIMITS.API_WRITE);
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
    // ── 1. Load invoice ──────────────────────────────────────────────────
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, companySlug, deletedAt: null },
    });
    if (!invoice) {
      return apiError("الفاتورة غير موجودة", 404);
    }

    // ── 2. Load active CCD certificate ───────────────────────────────────
    const signingCert = await getActiveSigningCertificate(companySlug);
    if (!signingCert) {
      return apiError(
        "لا توجد شهادة CCD نشطة لهذه الشركة. أكمل إعداد ZATCA أولاً من الإعدادات.",
        400,
      );
    }
    if (!signingCert.privateKeyData) {
      return apiError("تعذّر فك تشفير المفتاح الخاص للشهادة", 500);
    }

    // ── 3. Load company (required by ZATCA validation/XML generation) ────
    const company = await db.company.findUnique({
      where: { slug: companySlug },
      select: { name: true, nameAr: true, vatNumber: true, address: true, country: true, commercialRegistration: true },
    });
    if (!company) return apiError("الشركة غير موجودة", 404);

    // ── 4. Build ZatcaInvoicePayload from the invoice ────────────────────
    // Use autoPopulateZatcaFields to fill in ZATCA-specific fields (UUID, dates, etc.)
    const invoiceData = autoPopulateZatcaFields(invoice as unknown as Record<string, unknown>, company as unknown as Record<string, unknown>);
    const invoiceType = determineZatcaInvoiceType(invoice as unknown as Record<string, unknown>);

    // ── 5. Validate ──────────────────────────────────────────────────────
    const validation = validateZatcaInvoice(invoiceData, company as unknown as Record<string, unknown>);
    if (!validation.valid) {
      return NextResponse.json({
        ok: false,
        stage: "validation",
        errors: validation.errors.map((e) => ({
          field: e.field,
          messageAr: e.messageAr,
          severity: e.severity,
        })),
        warnings: validation.warnings.map((w) => ({
          field: w.field,
          messageAr: w.messageAr,
        })),
      }, { status: 400 });
    }

    // ── 6. Generate UBL XML ──────────────────────────────────────────────
    const xmlResult = generateZatcaUblXml(invoiceData, company as unknown as Record<string, unknown>);
    logger.info("[zatca/submit] XML generated", {
      invoiceId, companySlug,
      xmlLength: xmlResult.xml.length,
      uuid: xmlResult.uuid,
    });

    // ── 7. Sign the XML ──────────────────────────────────────────────────
    const signResult = signZatcaInvoice(
      xmlResult.xml,
      signingCert.certificateData || "",
      signingCert.privateKeyData || "",
    );

    // ── 8. Submit to ZATCA ───────────────────────────────────────────────
    if (signResult.ok === false) {
      return NextResponse.json({ ok: false, error: signResult.error, code: "ZATCA_SIGNING_FAILED" }, { status: 422 });
    }
    const submission = await submitZatcaInvoice(
      signResult.signedXml,
      invoiceType,
      signingCert.certificateData || "",
      companySlug,
      invoiceId,
    );

    // ── 9. Persist result to EInvoice ────────────────────────────────────
    // Upsert the EInvoice row
    const existingEInvoice = await db.eInvoice.findUnique({ where: { invoiceId } });
    const eInvoiceData = {
      invoiceId,
      authorityType: "zatca",
      submissionStatus: submission.submissionStatus,
      uuid: xmlResult.uuid,
      xmlHash: xmlResult.invoiceHash,
      signedXml: signResult.signedXml,
      rawXml: xmlResult.xml,
      digitalSignature: signResult.digitalSignature,
      rejectionReason: submission.rejectionReason || null,
      submittedAt: new Date(),
      clearedAt: submission.submissionStatus === "cleared" || submission.submissionStatus === "reported" ? new Date() : null,
      companySlug,
      // P2-Reconciliation cols
      invoiceNumber: invoice.invoiceNumber,
      authority: "zatca",
      status: submission.submissionStatus,
      clearanceStatus: submission.submissionStatus,
    };

    if (existingEInvoice) {
      await db.eInvoice.update({ where: { invoiceId }, data: eInvoiceData });
    } else {
      await db.eInvoice.create({ data: eInvoiceData }).catch((err) => {
        logger.warn("[zatca/submit] EInvoice create failed", {
          invoiceId, err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // ── 10. Audit log ────────────────────────────────────────────────────
    await logAdminAction({
      adminEmail: user.email,
      action: "zatca_invoice_submitted",
      targetType: "invoice",
      targetId: String(invoiceId),
      changes: {
        submissionStatus: submission.submissionStatus,
        zatcaClearedNumber: submission.zatcaClearedNumber || null,
        zatcaReportingNumber: submission.zatcaReportingNumber || null,
        uuid: xmlResult.uuid,
      },
    });

    logger.info("[zatca/submit] submission complete", {
      invoiceId, companySlug,
      submissionStatus: submission.submissionStatus,
      uuid: xmlResult.uuid,
    });

    return NextResponse.json({
      ok: submission.ok,
      invoiceId,
      companySlug,
      uuid: xmlResult.uuid,
      submissionStatus: submission.submissionStatus,
      zatcaClearedNumber: submission.zatcaClearedNumber || null,
      zatcaReportingNumber: submission.zatcaReportingNumber || null,
      error: submission.error,
      rejectionReason: submission.rejectionReason,
    });
  } catch (err) {
    logger.error("[zatca/submit] failed", {
      invoiceId, companySlug,
      err: err instanceof Error ? err.message : String(err),
    });
    return apiError(
      err instanceof Error ? err.message : "فشل إرسال الفاتورة لـ ZATCA",
      500,
    );
  }
});
