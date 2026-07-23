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
import { db } from "@/lib/db";
import { withErrorHandler, parseJsonField } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const rows = await db.landingContent.findMany({
    select: { key: true, value: true, updatedAt: true },
  });

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = parseJsonField(row.value, row.value);
  }

  return NextResponse.json(result);
});
