/**
 * GET /api/geo — resolve the visitor's country + display currency.
 *
 * PRICING FIX (2026-08-25): the pricing page used to default to SAR for
 * everyone. The user asked for currency by visitor IP. On Vercel, every
 * request carries `x-vercel-ip-country` (ISO 3166-1 alpha-2) for free —
 * no external geo-IP service or API key needed. We also accept the
 * common CDN headers as fallbacks, and finally fall back to the Accept-
 * Language locale when no header is present (local dev).
 *
 * Response: { country: string, currency: string, source: string }
 *   - currency comes from COUNTRY_CURRENCY (e.g. EG → EGP, SA → SAR)
 *   - unknown countries fall back to USD
 */

import { NextRequest, NextResponse } from "next/server";
import { COUNTRY_CURRENCY } from "@/lib/billing/pricing";

export const dynamic = "force-dynamic";

function localeCountry(locale: string | null): string | null {
  if (!locale) return null;
  // e.g. "ar-EG,en;q=0.9" → first segment's region
  const first = locale.split(",")[0].trim();          // "ar-EG"
  const region = first.split("-")[1] || first.split("_")[1];
  return region ? region.toUpperCase() : null;
}

export async function GET(req: NextRequest) {
  const h = req.headers;
  const country =
    h.get("x-vercel-ip-country") ||          // Vercel edge (primary)
    h.get("cf-ipcountry") ||                 // Cloudflare
    h.get("x-country-code") ||               // generic CDN
    localeCountry(h.get("accept-language")); // last resort (local dev)

  const iso = (country || "").toUpperCase();
  const currency = COUNTRY_CURRENCY[iso] || COUNTRY_CURRENCY.DEFAULT;

  return NextResponse.json(
    {
      country: iso || null,
      currency,
      source: h.get("x-vercel-ip-country")
        ? "vercel-ip"
        : h.get("cf-ipcountry")
          ? "cf-ip"
          : country
            ? "header"
            : "fallback",
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
