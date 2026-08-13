/**
 * founder-validation cache — shared between seed + report routes.
 * Extracted from seed/route.ts to avoid invalid route exports
 * (Next.js 16 webpack build rejects non-standard exports like getCache).
 */

import type { SyntheticCompany, TelemetryEntry } from "@/lib/founder-validation";

let cachedCompanies: SyntheticCompany[] | null = null;
let cachedTelemetry: TelemetryEntry[] | null = null;
let cachedSeed: number | null = null;

export function getCache() {
  return { cachedCompanies, cachedTelemetry, cachedSeed };
}

export function setCache(
  companies: SyntheticCompany[],
  telemetry: TelemetryEntry[],
  seed: number,
) {
  cachedCompanies = companies;
  cachedTelemetry = telemetry;
  cachedSeed = seed;
}
