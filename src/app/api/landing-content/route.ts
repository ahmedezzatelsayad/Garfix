/**
 * /api/landing-content
 *
 * GET — Public (no auth). Returns all landing page content as a single
 * JSON object keyed by `LandingContent.key`. Each value is JSON-parsed
 * before being returned so the marketing page can render directly.
 *
 * Example response:
 *   {
 *     "hero.title": "GarfiX — نظام ERP ذكي",
 *     "hero.subtitle": "...",
 *     "cta.demoUrl": "/demo"
 *   }
 */
import { NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  // Note (P2): LandingContent schema exposes `section` (not `key`) and has no `value`
  // column — compose the response from section + title/subtitle/body/cta fields.
  const rows = await db.landingContent.findMany({
    select: { section: true, title: true, subtitle: true, body: true, ctaText: true, ctaLink: true, updatedAt: true },
  });

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.section] = {
      title: row.title,
      subtitle: row.subtitle,
      body: row.body,
      ctaText: row.ctaText,
      ctaLink: row.ctaLink,
      updatedAt: row.updatedAt,
    };
  }

  return NextResponse.json(result);
});
