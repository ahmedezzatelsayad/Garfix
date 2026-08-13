/**
 * /api/founder-panel/e-invoicing
 * GET — Unified e-invoicing status across all companies.
 *
 * Returns:
 *   - aggregate stats: total companies, configured by country, pending by country
 *   - per-company list: country, integration type, configured (bool), last receipt
 *   - recent receipts: last 20 inbound webhook receipts across all tenants
 *
 * Founder-only.
 *
 * Response shape (typed via EInvoicingDashboardData in founder-panel.ts hook).
 */
import { NextResponse, NextRequest } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import "@/lib/integrations"; // side-effect: registers providers
import { INTEGRATION_INFO } from "@/lib/integrations";
import { logger } from "@/lib/logger";

// Country code → integration type key
const COUNTRY_TO_INTEGRATION: Record<string, string> = {
  SA: "zatca", // SA uses a separate flow, no integration row in platform_settings
  EG: "einvoice_eg",
  AE: "einvoice_ae",
  KW: "einvoice_kw",
  BH: "einvoice_bh",
  OM: "einvoice_om",
  QA: "einvoice_qa",
};

// Authority label per country (for display)
const COUNTRY_AUTHORITY: Record<string, { name: string; authority: string }> = {
  SA: { name: "ZATCA Phase 2", authority: "zatca" },
  EG: { name: "Egypt ETA", authority: "eta_egypt" },
  AE: { name: "UAE FTA (Peppol)", authority: "uae_fta" },
  KW: { name: "Kuwait Decree 10/2026", authority: "kuwait_decree_10_2026" },
  BH: { name: "Bahrain NBR", authority: "bahrain_nbr" },
  OM: { name: "Oman Tax Authority", authority: "oman_tax" },
  QA: { name: "Qatar GTA (Peppol)", authority: "qatar_gta" },
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // ── 1. Fetch all active companies with country + slug ────────────────
    const companies = await db.company.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        nameAr: true,
        country: true,
        vatNumber: true,
        emoji: true,
        plan: true,
        subscriptionStatus: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // ── 2. Fetch all integration credential rows (just keys + timestamps) ──
    const integrationRows = await db.platformSettings.findMany({
      where: { category: "integration", key: { startsWith: "integration.einvoice_" } },
      select: { key: true, updatedAt: true },
    });
    // Map: `${slug}::${integrationType}` → updatedAt
    // Note: integration credentials are stored globally (not per-company) in the
    // current PlatformSettings schema. The credential row applies platform-wide.
    // We treat "configured" as: an integration.einvoice_* row exists for the
    // integration type matching the company's country.
    const integrationByType = new Map<string, Date>();
    for (const r of integrationRows) {
      const parts = r.key.split(".");
      if (parts.length === 3) {
        integrationByType.set(parts[1], r.updatedAt);
      }
    }

    // ── 3. Fetch ZATCA certificates (per-company) ────────────────────────
    const zatcaCerts = await db.zatcaCertificate.findMany({
      where: { status: "active" },
      select: { companySlug: true, certificateType: true, expiryDate: true, updatedAt: true },
    });
    // Map: slug → { csid?: Date, ccd?: Date }
    const zatcaBySlug = new Map<string, { csid?: Date; ccd?: Date }>();
    for (const c of zatcaCerts) {
      const entry = zatcaBySlug.get(c.companySlug) || {};
      if (c.certificateType === "csid") entry.csid = c.expiryDate || c.updatedAt;
      if (c.certificateType === "ccd") entry.ccd = c.expiryDate || c.updatedAt;
      zatcaBySlug.set(c.companySlug, entry);
    }

    // ── 4. Build per-company status list ─────────────────────────────────
    const perCompany = companies.map((c) => {
      const country = c.country || "";
      const integrationType = COUNTRY_TO_INTEGRATION[country] || null;
      const authorityInfo = COUNTRY_AUTHORITY[country] || null;

      let isConfigured = false;
      let lastUpdatedAt: string | null = null;

      if (country === "SA") {
        // ZATCA configured if there's a CCD certificate
        const certs = zatcaBySlug.get(c.slug);
        isConfigured = !!certs?.ccd;
        lastUpdatedAt = certs?.ccd?.toISOString() || certs?.csid?.toISOString() || null;
      } else if (integrationType) {
        const updatedAt = integrationByType.get(integrationType);
        isConfigured = !!updatedAt;
        lastUpdatedAt = updatedAt?.toISOString() || null;
      }

      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        nameAr: c.nameAr,
        country,
        countryName: authorityInfo?.name || "غير مدعوم",
        authority: authorityInfo?.authority || "none",
        integrationType,
        isConfigured,
        lastUpdatedAt,
        vatNumber: c.vatNumber || null,
        emoji: c.emoji,
        plan: c.plan,
        subscriptionStatus: c.subscriptionStatus,
      };
    });

    // ── 5. Aggregate stats by country ────────────────────────────────────
    const byCountry: Record<string, { total: number; configured: number; pending: number }> = {};
    for (const c of perCompany) {
      if (!c.country) continue;
      if (!byCountry[c.country]) byCountry[c.country] = { total: 0, configured: 0, pending: 0 };
      byCountry[c.country].total++;
      if (c.isConfigured) byCountry[c.country].configured++;
      else byCountry[c.country].pending++;
    }

    // ── 6. Recent inbound receipts (last 20 across all tenants) ──────────
    const recentReceipts = await db.eInvoiceReceipt.findMany({
      take: 20,
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        companySlug: true,
        invoiceId: true,
        authority: true,
        eventType: true,
        externalUuid: true,
        status: true,
        rejectionReason: true,
        signatureValid: true,
        receivedAt: true,
      },
    });

    // ── 7. Receipts last 7 days count (for trend) ────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const receiptsLast7d = await db.eInvoiceReceipt.count({
      where: { receivedAt: { gte: sevenDaysAgo } },
    });

    // ── 8. Available integration types (for the admin to know what's registered) ──
    const einvoiceIntegrationTypes = INTEGRATION_INFO.filter((i) =>
      i.type.startsWith("einvoice_"),
    ).map((i) => ({ type: i.type, name: i.name }));

    // ── 9. Build response ────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      stats: {
        totalCompanies: perCompany.length,
        configured: perCompany.filter((c) => c.isConfigured).length,
        pending: perCompany.filter((c) => !c.isConfigured && c.integrationType).length,
        unsupported: perCompany.filter((c) => !c.integrationType).length,
        receiptsLast7d,
      },
      byCountry,
      perCompany,
      recentReceipts: recentReceipts.map((r) => ({
        ...r,
        receivedAt: r.receivedAt.toISOString(),
      })),
      availableIntegrations: einvoiceIntegrationTypes,
    });
  } catch (err) {
    logger.error("[founder-panel/e-invoicing] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return apiError("فشل تحميل لوحة الفوترة الإلكترونية", 500);
  }
});
