/**
 * pricing.ts — Country-specific pricing for Garfix SaaS plans.
 *
 * Each Gulf/MENA country has localized pricing in the local currency.
 * The default fallback is USD (current DEFAULT_PLANS prices).
 *
 * Country → Currency → Plan prices:
 *   KW: KWD (starter: 3.000, pro: 6.000, unlimited: 9.000)
 *   SA: SAR (starter: 37.50, pro: 75.00, unlimited: 112.50)
 *   AE: AED (starter: 37.00, pro: 74.00, unlimited: 111.00)
 *   EG: EGP (starter: 300, pro: 600, unlimited: 900)
 *   Default: USD (starter: 9.99, pro: 19.99, unlimited: 29.99)
 */

export interface CountryPricingEntry {
  country: string;
  currency: string;
  plan: string;
  priceMonthly: number;
}

/** Country → Currency mapping */
export const COUNTRY_CURRENCY: Record<string, string> = {
  KW: 'KWD',
  SA: 'SAR',
  AE: 'AED',
  BH: 'BHD',
  OM: 'OMR',
  QA: 'QAR',
  EG: 'EGP',
  DEFAULT: 'USD',
};

/** Country → Plan → Monthly price */
export const COUNTRY_PRICES: Record<string, Record<string, number>> = {
  KW: {
    starter: 3.000,
    professional: 6.000,
    unlimited: 9.000,
  },
  SA: {
    starter: 37.50,
    professional: 75.00,
    unlimited: 112.50,
  },
  AE: {
    starter: 37.00,
    professional: 74.00,
    unlimited: 111.00,
  },
  BH: {
    starter: 3.500,
    professional: 7.000,
    unlimited: 10.500,
  },
  OM: {
    starter: 3.800,
    professional: 7.600,
    unlimited: 11.400,
  },
  QA: {
    starter: 36.00,
    professional: 72.00,
    unlimited: 108.00,
  },
  EG: {
    starter: 300,
    professional: 600,
    unlimited: 900,
  },
  DEFAULT: {
    starter: 9.99,
    professional: 19.99,
    unlimited: 29.99,
  },
};

/**
 * Get the pricing entry for a given country and plan.
 * Falls back to DEFAULT (USD) if the country or plan is not found.
 */
export function getCountryPricing(country: string, plan: string): CountryPricingEntry | null {
  const normalizedCountry = country.toUpperCase();
  const prices = COUNTRY_PRICES[normalizedCountry] || COUNTRY_PRICES.DEFAULT;
  const currency = COUNTRY_CURRENCY[normalizedCountry] || COUNTRY_CURRENCY.DEFAULT;
  const priceMonthly = prices[plan];

  if (priceMonthly === undefined) {
    return null;
  }

  return {
    country: normalizedCountry,
    currency,
    plan,
    priceMonthly,
  };
}

/**
 * Get all available prices for a given country.
 * Returns the full plan price map for the country (or DEFAULT fallback).
 */
export function getCountryPlanPrices(country: string): Record<string, number> {
  const normalizedCountry = country.toUpperCase();
  return COUNTRY_PRICES[normalizedCountry] || COUNTRY_PRICES.DEFAULT;
}

/**
 * Get the currency for a given country.
 * Falls back to USD if the country is not in the map.
 */
export function getCountryCurrency(country: string): string {
  const normalizedCountry = country.toUpperCase();
  return COUNTRY_CURRENCY[normalizedCountry] || COUNTRY_CURRENCY.DEFAULT;
}

/**
 * Get all supported countries with their currencies and plan prices.
 * Useful for the billing UI to show available pricing options.
 */
export function getAllCountryPricing(): Array<{
  country: string;
  currency: string;
  plans: Record<string, number>;
}> {
  return Object.entries(COUNTRY_PRICES).map(([country, plans]) => ({
    country,
    currency: COUNTRY_CURRENCY[country] || 'USD',
    plans,
  }));
}
