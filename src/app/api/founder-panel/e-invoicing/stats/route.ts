/**
 * /api/founder-panel/e-invoicing/stats
 * GET — Webhook throughput stats for the founder dashboard.
 *
 * Returns:
 *   - last 24h: total receipts, accepted, rejected, pending, invalid signatures
 *   - by country (last 24h): count + accepted/rejected breakdown
 *   - by hour (last 24h): array of 24 hourly buckets { hour, count, accepted, rejected }
 *   - top 5 companies by receipt count (last 7d)
 *   - all-time totals: total receipts, total companies with receipts
 *
 * Founder-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { logger } from "@/lib/logger";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ── 1. Last 24h aggregates ────────────────────────────────────────────
    const total24h = await db.eInvoiceReceipt.count({ where: { receivedAt: { gte: last24h } } });
    const accepted24h = await db.eInvoiceReceipt.count({
      where: { receivedAt: { gte: last24h }, status: "accepted" },
    });
    const rejected24h = await db.eInvoiceReceipt.count({
      where: { receivedAt: { gte: last24h }, status: "rejected" },
    });
    const pending24h = await db.eInvoiceReceipt.count({
      where: { receivedAt: { gte: last24h }, status: "pending" },
    });
    const invalidSig24h = await db.eInvoiceReceipt.count({
      where: { receivedAt: { gte: last24h }, signatureValid: false },
    });
    const acceptedRate = total24h > 0 ? Math.round((accepted24h / total24h) * 100) : 0;

    // ── 2. By country (last 24h) ──────────────────────────────────────────
    const byCountryRaw = await db.eInvoiceReceipt.groupBy({
      by: ["authority"],
      where: { receivedAt: { gte: last24h } },
      _count: true,
    });
    // For accepted/rejected per country we need separate groupBy queries
    const byCountryAccepted = await db.eInvoiceReceipt.groupBy({
      by: ["authority"],
      where: { receivedAt: { gte: last24h }, status: "accepted" },
      _count: true,
    });
    const byCountryRejected = await db.eInvoiceReceipt.groupBy({
      by: ["authority"],
      where: { receivedAt: { gte: last24h }, status: "rejected" },
      _count: true,
    });
    const acceptedMap = new Map(byCountryAccepted.map((r) => [r.authority, r._count]));
    const rejectedMap = new Map(byCountryRejected.map((r) => [r.authority, r._count]));

    const authorityLabels: Record<string, string> = {
      zatca: "🇸🇦 ZATCA",
      eta_egypt: "🇪🇬 ETA",
      uae_fta: "🇦🇪 UAE FTA",
      kuwait_decree_10_2026: "🇰🇼 Kuwait",
      bahrain_nbr: "🇧🇭 Bahrain",
      oman_tax: "🇴🇲 Oman",
      qatar_gta: "🇶🇦 Qatar",
    };
    const byCountry = byCountryRaw
      .map((r) => ({
        authority: r.authority,
        label: authorityLabels[r.authority] || r.authority,
        count: r._count,
        accepted: acceptedMap.get(r.authority) || 0,
        rejected: rejectedMap.get(r.authority) || 0,
      }))
      .sort((a, b) => b.count - a.count);

    // ── 3. Hourly buckets (last 24h) ──────────────────────────────────────
    // We fetch all receipts from last 24h and bucket in JS (simpler than 24 SQL queries)
    const recentReceipts = await db.eInvoiceReceipt.findMany({
      where: { receivedAt: { gte: last24h } },
      select: { receivedAt: true, status: true },
    });
    const byHour: Array<{ hour: string; count: number; accepted: number; rejected: number }> = [];
    for (let i = 23; i >= 0; i--) {
      const bucketStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      const bucketHour = bucketStart.getHours().toString().padStart(2, "0") + ":00";
      const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
      const inBucket = recentReceipts.filter(
        (r) => r.receivedAt >= bucketStart && r.receivedAt < bucketEnd,
      );
      byHour.push({
        hour: bucketHour,
        count: inBucket.length,
        accepted: inBucket.filter((r) => r.status === "accepted").length,
        rejected: inBucket.filter((r) => r.status === "rejected").length,
      });
    }

    // ── 4. Top 5 companies by receipt count (last 7d) ─────────────────────
    const topCompaniesRaw = await db.eInvoiceReceipt.groupBy({
      by: ["companySlug"],
      where: { receivedAt: { gte: last7d } },
      _count: true,
      orderBy: { _count: { companySlug: "desc" } },
      take: 5,
    });
    // Resolve company names
    const slugs = topCompaniesRaw.map((r) => r.companySlug).filter((s) => s && s !== "_unknown");
    const companies = slugs.length > 0
      ? await db.company.findMany({
          where: { slug: { in: slugs } },
          select: { slug: true, name: true, nameAr: true, emoji: true, country: true },
        })
      : [];
    const companyMap = new Map(companies.map((c) => [c.slug, c]));
    const topCompanies = topCompaniesRaw.map((r) => {
      const c = companyMap.get(r.companySlug);
      return {
        companySlug: r.companySlug,
        companyName: c?.nameAr || c?.name || r.companySlug,
        emoji: c?.emoji || "🏢",
        country: c?.country || "",
        receiptCount: r._count,
      };
    });

    // ── 5. All-time totals ────────────────────────────────────────────────
    const totalAllTime = await db.eInvoiceReceipt.count();
    const companiesWithReceipts = await db.eInvoiceReceipt.groupBy({
      by: ["companySlug"],
      _count: true,
    });
    const totalCompaniesWithReceipts = companiesWithReceipts.filter(
      (r) => r.companySlug && r.companySlug !== "_unknown",
    ).length;

    // ── 6. Build response ────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      last24h: {
        total: total24h,
        accepted: accepted24h,
        rejected: rejected24h,
        pending: pending24h,
        invalidSignatures: invalidSig24h,
        acceptedRate,
      },
      byCountry,
      byHour,
      topCompanies,
      allTime: {
        totalReceipts: totalAllTime,
        companiesWithReceipts: totalCompaniesWithReceipts,
      },
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    logger.error("[founder-panel/e-invoicing/stats] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return apiError("فشل تحميل إحصائيات الفوترة الإلكترونية", 500);
  }
});
