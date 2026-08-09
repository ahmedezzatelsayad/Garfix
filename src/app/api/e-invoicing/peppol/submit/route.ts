/**
 * /api/e-invoicing/peppol/submit
 * POST — Peppol Access Point outbound submission for UAE (AE) and Qatar (QA).
 *
 * Peppol flow (different from direct-authority submission like ZATCA/ETA):
 *   1. Load invoice + company + Peppol AP credentials (from integration config)
 *   2. Validate invoice (UaeFta validation — same rules for AE/QA since both
 *      use Peppol BIS 3.0)
 *   3. Auto-populate UAE FTA fields (UUID, dates, Peppol profile ID)
 *   4. Generate UBL 2.1 XML (Peppol BIS Billing 3.0 format)
 *   5. Sign XML with ECDSA-SHA256 (using AP certificate)
 *   6. Submit to Peppol AP via submitUaeFtaInvoice (which calls the AP REST API)
 *   7. Persist result to EInvoice
 *   8. Audit log
 *
 * Body: { invoiceId: number, companySlug: string }
 *
 * Auth: requireAuth + verify user has access to companySlug.
 *
 * NOTE: The existing submitUaeFtaInvoice function currently simulates the AP
 * submission (placeholder). When a real Peppol AP is configured (MyFatoorah,
 * Kloud Portal, Comarch, Tradeshift), the function will make real HTTP calls.
 * The integration test can verify the full pipeline up to the HTTP call.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { isFounderEmail } from "@/lib/founder";
import { dbTyped as db } from "@/lib/db";
import { requireAuth } from "@/lib/middleware";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import {
  validateUaeFtaInvoice,
  autoPopulateUaeFtaFields,
  generateUaeFtaUblXml,
  signUaeFtaInvoice,
  submitUaeFtaInvoice,
} from "@/lib/e-invoicing/uae-fta";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const Schema = z.object({
  invoiceId: z.number().int().positive(),
  companySlug: z.string().min(1),
});

// Country → integration type + authority label
const COUNTRY_CONFIG: Record<string, { integrationType: string; authority: string }> = {
  AE: { integrationType: "einvoice_ae", authority: "uae_fta" },
  QA: { integrationType: "einvoice_qa", authority: "qatar_gta" },
};

export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "post:peppol-submit", LIMITS.API_WRITE);
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
  const isFounder = isFounderEmail(user.email);
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
    const cfg = COUNTRY_CONFIG[country];
    if (!cfg) {
      return apiError(
        `هذا المسار يدعم الإمارات (AE) وقطر (QA) فقط. دولتك: ${country || "غير محدد"}`,
        400,
      );
    }

    // ── 2. Load Peppol AP credentials ──────────────────────────────────────
    const apCreds = await getIntegrationConfig(cfg.integrationType);
    if (!apCreds) {
      return apiError(
        `بيانات اعتماد Peppol AP غير مُهيّأة لـ ${country}. اذهب إلى الإعدادات ← الفوترة الإلكترونية وأدخل بيانات الـ Access Point.`,
        400,
      );
    }
    if (!apCreds.access_point_url || !apCreds.ap_client_id || !apCreds.ap_client_secret) {
      return apiError("بيانات اعتماد Peppol AP ناقصة (access_point_url + ap_client_id + ap_client_secret مطلوبة)", 400);
    }
    if (!apCreds.peppol_id) {
      return apiError("معرّف المشارك في Peppol (peppol_id) مطلوب", 400);
    }

    // ── 3. Validate ────────────────────────────────────────────────────────
    const invoiceRec = invoice as unknown as Record<string, unknown>;
    const companyRec = company as unknown as Record<string, unknown>;

    const validation = validateUaeFtaInvoice(invoiceRec, companyRec);
    if (!validation.valid) {
      return NextResponse.json({
        ok: false,
        stage: "validation",
        country,
        authority: cfg.authority,
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

    // ── 4. Auto-populate + generate UBL XML ────────────────────────────────
    const populated = autoPopulateUaeFtaFields(invoiceRec, companyRec);
    const xmlResult = generateUaeFtaUblXml(populated, companyRec);
    logger.info("[peppol/submit] UBL XML generated", {
      invoiceId, companySlug, country,
      xmlLength: xmlResult.xml.length,
      uuid: xmlResult.uuid,
    });

    // ── 5. Sign the XML ────────────────────────────────────────────────────
    // Peppol AP uses the AP's certificate (not a per-company cert like ZATCA).
    // The AP credentials include the certificate data.
    // For now, we use the ap_client_secret as a placeholder for the signing key
    // — in production, the AP provider issues an X.509 certificate.
    const signResult = signUaeFtaInvoice(
      xmlResult.xml,
      apCreds.ap_client_id, // placeholder for certificate PEM
      apCreds.ap_client_secret, // placeholder for private key PEM
    );

    // ── 6. Submit to Peppol AP ─────────────────────────────────────────────
    const submission = await submitUaeFtaInvoice(
      signResult.signedXml,
      // determineInvoiceType from the populated data
      (populated.invoiceType as "standard" | "simplified") || "standard",
      companySlug,
    );

    // ── 7. Persist result to EInvoice ──────────────────────────────────────
    const existingEInvoice = await db.eInvoice.findUnique({ where: { invoiceId } });
    const eInvoiceData = {
      invoiceId,
      authorityType: cfg.authority,
      submissionStatus: submission.submissionStatus,
      uuid: xmlResult.uuid,
      xmlHash: xmlResult.invoiceHash,
      signedXml: signResult.signedXml,
      rawXml: xmlResult.xml,
      digitalSignature: signResult.digitalSignature,
      rejectionReason: submission.rejectionReason || null,
      submittedAt: new Date(),
      clearedAt: submission.submissionStatus === "cleared" || submission.submissionStatus === "accepted"
        ? new Date()
        : null,
      companySlug,
      // P2-Reconciliation cols
      invoiceNumber: invoice.invoiceNumber,
      authority: cfg.authority,
      status: submission.submissionStatus,
      clearanceStatus: submission.submissionStatus,
    };

    if (existingEInvoice) {
      await db.eInvoice.update({ where: { invoiceId }, data: eInvoiceData });
    } else {
      await db.eInvoice.create({ data: eInvoiceData }).catch((err) => {
        logger.warn("[peppol/submit] EInvoice create failed", {
          invoiceId, err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // ── 8. Audit log ───────────────────────────────────────────────────────
    await logAdminAction({
      adminEmail: user.email,
      action: "peppol_invoice_submitted",
      targetType: "invoice",
      targetId: String(invoiceId),
      changes: {
        country,
        authority: cfg.authority,
        submissionStatus: submission.submissionStatus,
        uuid: xmlResult.uuid,
        peppolDocumentId: submission.peppolDocumentId || null,
        apUrl: apCreds.access_point_url,
      },
    });

    logger.info("[peppol/submit] submission complete", {
      invoiceId, companySlug, country,
      submissionStatus: submission.submissionStatus,
      uuid: xmlResult.uuid,
    });

    return NextResponse.json({
      ok: submission.ok,
      invoiceId,
      companySlug,
      country,
      authority: cfg.authority,
      uuid: xmlResult.uuid,
      submissionStatus: submission.submissionStatus,
      peppolDocumentId: submission.peppolDocumentId || null,
      error: submission.error,
      rejectionReason: submission.rejectionReason,
    });
  } catch (err) {
    logger.error("[peppol/submit] failed", {
      invoiceId, companySlug,
      err: err instanceof Error ? err.message : String(err),
    });
    return apiError(
      err instanceof Error ? err.message : "فشل إرسال الفاتورة عبر Peppol AP",
      500,
    );
  }
});
