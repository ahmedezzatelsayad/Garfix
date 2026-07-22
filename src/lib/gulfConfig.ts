/**
 * gulfConfig.ts — Gulf/MENA country configuration.
 *
 * Replaces the free-text country field with a structured dropdown that
 * automatically sets: currency, tax rate, e-invoice authority, weekend days,
 * and VAT applicability.
 *
 * This is the fix for audit finding B.4/B.5 — the platform was using
 * Saudi-specific defaults (ZATCA) for all countries, and the country field
 * was free text with no programmatic logic.
 */

export interface CountryConfig {
  code: string; // ISO 3166-1 alpha-2
  nameAr: string;
  nameEn: string;
  currency: string;
  currencyAr: string;
  vatRate: number; // percentage, 0 if not applicable
  vatApplicable: boolean;
  eInvoiceAuthority: EInvoiceAuthority;
  weekendDays: number[]; // 0=Sun, 5=Fri, 6=Sat
  defaultTaxRate: string;
}

export type EInvoiceAuthority =
  | "none"
  | "zatca" // Saudi Arabia
  | "uae_fta" // UAE Federal Tax Authority
  | "bahrain_nbr" // Bahrain National Bureau for Revenue
  | "oman_tax" // Oman Tax Authority
  | "kuwait_future" // Kuwait (not yet mandatory, placeholder)
  | "eta_egypt"; // Egyptian Tax Authority

export const GULF_COUNTRIES: CountryConfig[] = [
  {
    code: "KW",
    nameAr: "الكويت",
    nameEn: "Kuwait",
    currency: "KWD",
    currencyAr: "دينار كويتي",
    vatRate: 0,
    vatApplicable: false,
    eInvoiceAuthority: "kuwait_future",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "0",
  },
  {
    code: "SA",
    nameAr: "المملكة العربية السعودية",
    nameEn: "Saudi Arabia",
    currency: "SAR",
    currencyAr: "ريال سعودي",
    vatRate: 15,
    vatApplicable: true,
    eInvoiceAuthority: "zatca",
    weekendDays: [5, 6],
    defaultTaxRate: "15",
  },
  {
    code: "AE",
    nameAr: "الإمارات العربية المتحدة",
    nameEn: "United Arab Emirates",
    currency: "AED",
    currencyAr: "درهم إماراتي",
    vatRate: 5,
    vatApplicable: true,
    eInvoiceAuthority: "uae_fta",
    weekendDays: [5, 6],
    defaultTaxRate: "5",
  },
  {
    code: "BH",
    nameAr: "مملكة البحرين",
    nameEn: "Bahrain",
    currency: "BHD",
    currencyAr: "دينار بحريني",
    vatRate: 10,
    vatApplicable: true,
    eInvoiceAuthority: "bahrain_nbr",
    weekendDays: [5, 6],
    defaultTaxRate: "10",
  },
  {
    code: "OM",
    nameAr: "سلطنة عُمان",
    nameEn: "Oman",
    currency: "OMR",
    currencyAr: "ريال عُماني",
    vatRate: 5,
    vatApplicable: true,
    eInvoiceAuthority: "oman_tax",
    weekendDays: [5, 6],
    defaultTaxRate: "5",
  },
  {
    code: "QA",
    nameAr: "دولة قطر",
    nameEn: "Qatar",
    currency: "QAR",
    currencyAr: "ريال قطري",
    vatRate: 0,
    vatApplicable: false,
    eInvoiceAuthority: "none",
    weekendDays: [5, 6],
    defaultTaxRate: "0",
  },
  // ────────────────────────────────────────────────────────────────────────────
  // Expanded MENA (Levant + North Africa + Iraq) — L1
  // ────────────────────────────────────────────────────────────────────────────
  {
    code: "JO",
    nameAr: "المملكة الأردنية الهاشمية",
    nameEn: "Jordan",
    currency: "JOD",
    currencyAr: "دينار أردني",
    vatRate: 16,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "16",
  },
  {
    code: "MA",
    nameAr: "المملكة المغربية",
    nameEn: "Morocco",
    currency: "MAD",
    currencyAr: "درهم مغربي",
    vatRate: 20,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [6, 0], // Saturday + Sunday
    defaultTaxRate: "20",
  },
  {
    code: "DZ",
    nameAr: "الجمهورية الجزائرية الديمقراطية الشعبية",
    nameEn: "Algeria",
    currency: "DZD",
    currencyAr: "دينار جزائري",
    vatRate: 19,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "19",
  },
  {
    code: "TN",
    nameAr: "الجمهورية التونسية",
    nameEn: "Tunisia",
    currency: "TND",
    currencyAr: "دينار تونسي",
    vatRate: 19,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [6, 0], // Saturday + Sunday
    defaultTaxRate: "19",
  },
  {
    code: "IQ",
    nameAr: "جمهورية العراق",
    nameEn: "Iraq",
    currency: "IQD",
    currencyAr: "دينار عراقي",
    vatRate: 15,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "15",
  },
  {
    code: "LB",
    nameAr: "الجمهورية اللبنانية",
    nameEn: "Lebanon",
    currency: "LBP",
    currencyAr: "ليرة لبنية",
    vatRate: 11,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [6, 0], // Saturday + Sunday
    // Note: economic crisis — rate may vary; 11% is the statutory standard VAT rate.
    defaultTaxRate: "11",
  },
  // ────────────────────────────────────────────────────────────────────────────
  // Expanded MENA (Egypt + Levant + North Africa + Yemen + Sudan) — L2
  // ────────────────────────────────────────────────────────────────────────────
  {
    code: "EG",
    nameAr: "جمهورية مصر العربية",
    nameEn: "Egypt",
    currency: "EGP",
    currencyAr: "جنيه مصري",
    vatRate: 14,
    vatApplicable: true,
    eInvoiceAuthority: "eta_egypt", // Egyptian Tax Authority (e-invoicing mandatory since 2022)
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "14",
  },
  {
    code: "PS",
    nameAr: "دولة فلسطين",
    nameEn: "Palestine",
    currency: "ILS",
    currencyAr: "شيكل إسرائيلي",
    vatRate: 16,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "16",
  },
  {
    code: "SY",
    nameAr: "الجمهورية العربية السورية",
    nameEn: "Syria",
    currency: "SYP",
    currencyAr: "ليرة سورية",
    vatRate: 0,
    vatApplicable: false, // Syria does not currently implement VAT
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "0",
  },
  {
    code: "YE",
    nameAr: "الجمهورية اليمنية",
    nameEn: "Yemen",
    currency: "YER",
    currencyAr: "ريال يمني",
    vatRate: 5,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "5",
  },
  {
    code: "SD",
    nameAr: "جمهورية السودان",
    nameEn: "Sudan",
    currency: "SDG",
    currencyAr: "جنيه سوداني",
    vatRate: 17,
    vatApplicable: true,
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "17",
  },
  {
    code: "LY",
    nameAr: "دولة ليبيا",
    nameEn: "Libya",
    currency: "LYD",
    currencyAr: "دينار ليبي",
    vatRate: 0,
    vatApplicable: false, // Libya has not yet implemented VAT
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "0",
  },
  // ────────────────────────────────────────────────────────────────────────────
  // Expanded MENA (Horn of Africa + Sahel + Island nations) — L3
  // ────────────────────────────────────────────────────────────────────────────
  {
    code: "SO",
    nameAr: "جمهورية الصومال",
    nameEn: "Somalia",
    currency: "SOS",
    currencyAr: "شلن صومالي",
    vatRate: 0,
    vatApplicable: false, // Somalia does not currently implement VAT
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "0",
  },
  {
    code: "DJ",
    nameAr: "جمهورية جيبوتي",
    nameEn: "Djibouti",
    currency: "DJF",
    currencyAr: "فرنك جيبوتي",
    vatRate: 0,
    vatApplicable: false, // Djibouti does not currently implement VAT (uses indirect consumption tax)
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "0",
  },
  {
    code: "KM",
    nameAr: "اتحاد جزر القمر",
    nameEn: "Comoros",
    currency: "KMF",
    currencyAr: "فرنك قمري",
    vatRate: 0,
    vatApplicable: false, // Comoros uses indirect taxes, no formal VAT system
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "0",
  },
  {
    code: "MR",
    nameAr: "جمهورية موريتانيا",
    nameEn: "Mauritania",
    currency: "MRU",
    currencyAr: "أوقية موريتانية",
    vatRate: 16,
    vatApplicable: true, // Mauritania introduced VAT at 16% in 2021
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "16",
  },
  {
    code: "ER",
    nameAr: "دولة إريتريا",
    nameEn: "Eritrea",
    currency: "ERN",
    currencyAr: "ناكفا إريتري",
    vatRate: 0,
    vatApplicable: false, // Eritrea does not currently implement VAT
    eInvoiceAuthority: "none",
    weekendDays: [5, 6], // Friday + Saturday
    defaultTaxRate: "0",
  },
];

export function getCountryConfig(code?: string | null): CountryConfig | null {
  if (!code) return null;
  return GULF_COUNTRIES.find((c) => c.code === code.toUpperCase()) || null;
}

export function isVatApplicable(countryCode?: string | null): boolean {
  const config = getCountryConfig(countryCode);
  return config?.vatApplicable ?? false;
}

export function getDefaultCurrency(countryCode?: string | null): string {
  return getCountryConfig(countryCode)?.currency || "KWD";
}

export function getEInvoiceAuthority(countryCode?: string | null): EInvoiceAuthority {
  return getCountryConfig(countryCode)?.eInvoiceAuthority || "none";
}

/** Get the weekend days for a country (Gulf = Fri+Sat by default). */
export function getWeekendDays(countryCode?: string | null): number[] {
  return getCountryConfig(countryCode)?.weekendDays || [5, 6];
}

/** Check if a date is a weekend day in the given country. */
export function isWeekend(date: Date, countryCode?: string | null): boolean {
  const weekendDays = getWeekendDays(countryCode);
  return weekendDays.includes(date.getDay());
}

/** Format currency according to country locale. */
export function formatCurrency(amount: number, countryCode?: string | null): string {
  const config = getCountryConfig(countryCode);
  const currency = config?.currency || "KWD";
  const locale = countryCode === "KW" ? "ar-KW" : "ar-EG";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 3,
    }).format(amount);
  } catch {
    return `${amount.toFixed(3)} ${currency}`;
  }
}
