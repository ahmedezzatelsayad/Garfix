/**
 * /api/founder-panel/e-invoicing/[slug]
 * GET — Per-company e-invoicing timeline.
 *
 * Returns:
 *   - company info (name, country, vatNumber, plan, emoji)
 *   - integration status (configured / lastUpdatedAt)
 *   - paginated receipts (most recent first), 50 per page
 *   - per-invoice grouping summary (invoiceId → status, count, last event)
 *   - aggregate stats (total receipts, accepted, rejected, pending)
 *
 * Founder-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import "@/lib/integrations"; // side-effect: registers providers
import { logger } from "@/lib/logger";

const COUNTRY_TO_INTEGRATION: Record<string, string> = {
  SA: "zatca",
  EG: "einvoice_eg",
  AE: "einvoice_ae",
  KW: "einvoice_kw",
  BH: "einvoice_bh",
  OM: "einvoice_om",
  QA: "einvoice_qa",
};

const COUNTRY_AUTHORITY: Record<string, { name: string; authority: string }> = {
  SA: { name: "ZATCA Phase 2", authority: "zatca" },
  EG: { name: "Egypt ETA", authority: "eta_egypt" },
  AE: { name: "UAE FTA (Peppol)", authority: "uae_fta" },
  KW: { name: "Kuwait Decree 10/2026", authority: "kuwait_decree_10_2026" },
  BH: { name: "Bahrain NBR", authority: "bahrain_nbr" },
  OM: { name: "Oman Tax Authority", authority: "oman_tax" },
  QA: { name: "Qatar GTA (Peppol)", authority: "qatar_gta" },
};

export const GET = withErrorHandler(async (req: NextRequest, { params }: { params: Promise<{ slug: string }> }) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  const { slug } = await params;
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

  try {
    // ── 1. Fetch company ──────────────────────────────────────────────────
    const company = await db.company.findUnique({
      where: { slug },
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
    });

    if (!company) {
      return apiError("الشركة غير موجودة", 404);
    }

    const country = company.country || "";
    const authorityInfo = COUNTRY_AUTHORITY[country] || null;
    const integrationType = COUNTRY_TO_INTEGRATION[country] || null;

    // ── 2. Determine integration status ──────────────────────────────────
    let isConfigured = false;
    let lastUpdatedAt: string | null = null;

    if (country === "SA") {
      const ccd = await db.zatcaCertificate.findFirst({
        where: { companySlug: slug, certificateType: "ccd", status: "active" },
        select: { expiryDate: true, updatedAt: true },
      });
      isConfigured = !!ccd;
      lastUpdatedAt = (ccd?.expiryDate || ccd?.updatedAt || null)?.toISOString() || null;
    } else if (integrationType) {
      const row = await db.platformSettings.findUnique({
        where: { key: `integration.${integrationType}.credentials` },
        select: { updatedAt: true },
      });
      isConfigured = !!row;
      lastUpdatedAt = row?.updatedAt.toISOString() || null;
    }

    // ── 3. Fetch receipts (cursor-paginated, newest first) ────────────────
    const receipts = await db.eInvoiceReceipt.findMany({
      where: {
        companySlug: slug,
        ...(cursor ? { receivedAt: { lt: new Date(cursor) } } : {}),
      },
      take: limit + 1,
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        invoiceId: true,
        authority: true,
        eventType: true,
        externalUuid: true,
        status: true,
        rawPayload: true,
        signatureValid: true,
        rejectionReason: true,
        receivedAt: true,
      },
    });

    const hasMore = receipts.length > limit;
    const items = hasMore ? receipts.slice(0, limit) : receipts;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].receivedAt.toISOString()
      : null;

    // ── 4. Aggregate stats ────────────────────────────────────────────────
    const totalCount = await db.eInvoiceReceipt.count({ where: { companySlug: slug } });
    const acceptedCount = await db.eInvoiceReceipt.count({
      where: { companySlug: slug, status: "accepted" },
    });
    const rejectedCount = await db.eInvoiceReceipt.count({
      where: { companySlug: slug, status: "rejected" },
    });
    const pendingCount = await db.eInvoiceReceipt.count({
      where: { companySlug: slug, status: "pending" },
    });
    const last7dCount = await db.eInvoiceReceipt.count({
      where: {
        companySlug: slug,
        receivedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    // ── 5. Per-invoice grouping (top 20 invoices by event count) ──────────
    const invoiceGroups = await db.eInvoiceReceipt.groupBy({
      by: ["invoiceId"],
      where: { companySlug: slug, invoiceId: { not: null } },
      _count: true,
      orderBy: { _count: { invoiceId: "desc" } },
      take: 20,
    });

    // Resolve invoice numbers for the groups
    const invoiceIds = invoiceGroups.map((g) => g.invoiceId!).filter(Boolean);
    const invoices = invoiceIds.length > 0
      ? await db.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, invoiceNumber: true, status: true, total: true, issueDate: true },
        })
      : [];
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));

    // ── 6. Build response ─────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      company: {
        id: company.id,
        slug: company.slug,
        name: company.name,
        nameAr: company.nameAr,
        country,
        countryName: authorityInfo?.name || "غير مدعوم",
        authority: authorityInfo?.authority || "none",
        integrationType,
        isConfigured,
        lastUpdatedAt,
        vatNumber: company.vatNumber,
        emoji: company.emoji,
        plan: company.plan,
        subscriptionStatus: company.subscriptionStatus,
      },
      stats: {
        total: totalCount,
        accepted: acceptedCount,
        rejected: rejectedCount,
        pending: pendingCount,
        last7d: last7dCount,
      },
      receipts: items.map((r) => ({
        ...r,
        receivedAt: r.receivedAt.toISOString(),
      })),
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
      invoiceGroups: invoiceGroups.map((g) => {
        const inv = g.invoiceId ? invoiceById.get(g.invoiceId) : null;
        return {
          invoiceId: g.invoiceId,
          invoiceNumber: inv?.invoiceNumber || null,
          invoiceStatus: inv?.status || null,
          invoiceTotal: inv ? Number(inv.total) : null,
          issueDate: inv?.issueDate.toISOString() || null,
          eventCount: g._count,
        };
      }),
    });
  } catch (err) {
    logger.error("[founder-panel/e-invoicing/[slug]] failed", {
      slug,
      err: err instanceof Error ? err.message : String(err),
    });
    return apiError("فشل تحميل سجل الفوترة الإلكترونية للشركة", 500);
  }
});
