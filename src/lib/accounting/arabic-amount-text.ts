/**
 * arabic-amount-text.ts — Phase 13: Convert numbers to Arabic text
 * for invoices, checks, and vouchers.
 *
 * Supports: KWD, SAR, AED, EGP, BHD, OMR, QAR currencies.
 * Arabic grammar: proper gender agreement, plural forms, and "لا غير" suffix.
 *
 * Examples:
 *   500 KWD        → "خمسمائة دينار لا غير"
 *   1250.750 SAR   → "ألف ومائتان وخمسون ريال وسبعمائة وخمسون هللة لا غير"
 *   3.500 AED      → "ثلاثة دراهم وخمسمائة فلس لا غير"
 *   1 KWD          → "دينار واحد لا غير"
 *   2 SAR          → "ريالان لا غير"
 */

export type SupportedCurrency = "KWD" | "SAR" | "AED" | "EGP" | "BHD" | "OMR" | "QAR";

// ─── Arabic number words ────────────────────────────────────────────────

// Singles 0–19 (masculine form — used with دينار/ريال/درهم/جنيه which are all masculine)
const ONES_MASCULINE: string[] = [
  "",         // 0
  "واحد",     // 1
  "اثنان",    // 2
  "ثلاثة",    // 3
  "أربعة",    // 4
  "خمسة",     // 5
  "ستة",      // 6
  "سبعة",     // 7
  "ثمانية",   // 8
  "تسعة",     // 9
  "عشرة",     // 10
  "أحد عشر",  // 11
  "اثنا عشر", // 12
  "ثلاثة عشر",// 13
  "أربعة عشر",// 14
  "خمسة عشر", // 15
  "ستة عشر",  // 16
  "سبعة عشر", // 17
  "ثمانية عشر",// 18
  "تسعة عشر", // 19
];

// Tens 20–90
const TENS: string[] = [
  "",           // 0
  "",           // 10 (handled in ONES)
  "عشرون",      // 20
  "ثلاثون",     // 30
  "أربعون",     // 40
  "خمسون",      // 50
  "ستون",       // 60
  "سبعون",      // 70
  "ثمانون",     // 80
  "تسعون",      // 90
];

// Hundreds 100–900
const HUNDREDS: string[] = [
  "",           // 0
  "مائة",       // 100
  "مائتان",     // 200
  "ثلاثمائة",   // 300
  "أربعمائة",   // 400
  "خمسمائة",    // 500
  "ستمائة",     // 600
  "سبعمائة",    // 700
  "ثمانمائة",   // 800
  "تسعمائة",    // 900
];

// ─── Fraction (sub-unit) number words ───────────────────────────────────
// فلس/هللة/قرش are masculine nouns, so we use masculine forms

const FRACTION_ONES: string[] = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];

const FRACTION_TENS: string[] = TENS; // same tens words for fractions
const FRACTION_HUNDREDS: string[] = HUNDREDS; // same hundreds words for fractions

// ─── Currency names ─────────────────────────────────────────────────────

export interface CurrencyInfo {
  wholeSingular: string;   // دينار
  wholeDual: string;       // ديناران
  wholePlural: string;     // دينارات
  wholeGender: "masculine" | "feminine";
  fractionSingular: string; // فلس
  fractionDual: string;     // فلسان
  fractionPlural: string;   // فلسات (or فلوس for AED)
  fractionGender: "masculine" | "feminine";
  decimalPlaces: number;    // 3 for KWD/BHD, 2 for SAR/AED/EGP/QAR/OMR
}

const CURRENCY_INFO: Record<SupportedCurrency, CurrencyInfo> = {
  KWD: {
    wholeSingular: "دينار", wholeDual: "ديناران", wholePlural: "دينارات",
    wholeGender: "masculine",
    fractionSingular: "فلس", fractionDual: "فلسان", fractionPlural: "فلسات",
    fractionGender: "masculine", decimalPlaces: 3,
  },
  BHD: {
    wholeSingular: "دينار", wholeDual: "ديناران", wholePlural: "دينارات",
    wholeGender: "masculine",
    fractionSingular: "فلس", fractionDual: "فلسان", fractionPlural: "فلسات",
    fractionGender: "masculine", decimalPlaces: 3,
  },
  SAR: {
    wholeSingular: "ريال", wholeDual: "ريالان", wholePlural: "ريالات",
    wholeGender: "masculine",
    fractionSingular: "هللة", fractionDual: "هللتان", fractionPlural: "هللات",
    fractionGender: "feminine", decimalPlaces: 2,
  },
  QAR: {
    wholeSingular: "ريال", wholeDual: "ريالان", wholePlural: "ريالات",
    wholeGender: "masculine",
    fractionSingular: "هللة", fractionDual: "هللتان", fractionPlural: "هللات",
    fractionGender: "feminine", decimalPlaces: 2,
  },
  OMR: {
    wholeSingular: "ريال", wholeDual: "ريالان", wholePlural: "ريالات",
    wholeGender: "masculine",
    fractionSingular: "هللة", fractionDual: "هللتان", fractionPlural: "هللات",
    fractionGender: "feminine", decimalPlaces: 3,
  },
  AED: {
    wholeSingular: "درهم", wholeDual: "درهمان", wholePlural: "دراهم",
    wholeGender: "masculine",
    fractionSingular: "فلس", fractionDual: "فلسان", fractionPlural: "فلسات",
    fractionGender: "masculine", decimalPlaces: 2,
  },
  EGP: {
    wholeSingular: "جنيه", wholeDual: "جنيهان", wholePlural: "جنيهات",
    wholeGender: "masculine",
    fractionSingular: "قرش", fractionDual: "قرشان", fractionPlural: "قروش",
    fractionGender: "masculine", decimalPlaces: 2,
  },
};

// ─── Helper: get currency fraction name ─────────────────────────────────

export function getCurrencyFractionName(currency: SupportedCurrency): string {
  return CURRENCY_INFO[currency].fractionSingular;
}

// ─── Helper: get currency whole name (with proper singular/dual/plural) ──

export function getCurrencyWholeName(currency: SupportedCurrency, amount: number): string {
  const info = CURRENCY_INFO[currency];
  if (amount === 1) return info.wholeSingular;
  if (amount === 2) return info.wholeDual;
  if (amount >= 3 && amount <= 10) return info.wholePlural;
  if (amount >= 11 && amount <= 99) return info.wholeSingular; // Arabic grammar: 11-99 use singular
  return info.wholePlural; // 100+ uses plural
}

// ─── Helper: get fraction name with proper singular/dual/plural ────────

function getFractionName(currency: SupportedCurrency, amount: number): string {
  const info = CURRENCY_INFO[currency];
  if (amount === 1) return info.fractionSingular;
  if (amount === 2) return info.fractionDual;
  if (amount >= 3 && amount <= 10) return info.fractionPlural;
  if (amount >= 11 && amount <= 99) return info.fractionSingular;
  return info.fractionPlural;
}

// ─── Core conversion: number to Arabic text (whole portion) ─────────────

function convertWholeToArabic(n: number): string {
  if (n === 0) return "صفر";
  if (n < 0) return "سالب " + convertWholeToArabic(Math.abs(n));

  // For Arabic number grammar, we need to handle ranges differently:
  // 1: واحد (or just the currency name with واحد appended)
  // 2: اثنان
  // 3-10: plural number + plural currency
  // 11-99: singular number pattern
  // 100-999: hundreds
  // 1000-999999: thousands
  // 1000000+: millions

  const parts: string[] = [];

  // Millions (مليون)
  if (n >= 1000000) {
    const millions = Math.floor(n / 1000000);
    n %= 1000000;
    if (millions === 1) parts.push("مليون");
    else if (millions === 2) parts.push("مليونان");
    else if (millions <= 10) parts.push(convertSmallNumber(millions) + " ملايين");
    else parts.push(convertSmallNumber(millions) + " مليون");
  }

  // Hundred-thousands (part of thousands range in Arabic)
  // Arabic treats 100000 as "مائة ألف", 200000 as "مائتان ألف", etc.

  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    n %= 1000;
    if (thousands === 1) parts.push("ألف");
    else if (thousands === 2) parts.push("ألفان");
    else if (thousands <= 10) parts.push(convertSmallNumber(thousands) + " آلاف");
    else if (thousands <= 99) parts.push(convertSmallNumber(thousands) + " ألف");
    else if (thousands === 100) parts.push("مائة ألف");
    else if (thousands === 200) parts.push("مائتان ألف");
    else if (thousands <= 999) parts.push(convertHundreds(thousands) + " ألف");
  }

  // Hundreds 100-999
  if (n >= 100) {
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    n %= 100;
    if (remainder === 0) {
      parts.push(HUNDREDS[hundreds]);
    } else {
      parts.push(HUNDREDS[hundreds]);
      // The remainder will be handled below
    }
  }

  // 1-99
  if (n > 0) {
    parts.push(convertSmallNumber(n));
  }

  return parts.filter(Boolean).join(" و");
}

// Convert numbers 1-99
function convertSmallNumber(n: number): string {
  if (n === 0) return "";
  if (n <= 19) return ONES_MASCULINE[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) return TENS[tens];
  // For 21, 31, etc.: "واحد وعشرون", "ثلاثة وثلاثون"
  return ONES_MASCULINE[ones] + " و" + TENS[tens];
}

// Convert hundreds portion (100-999) for thousands compound
function convertHundreds(n: number): string {
  if (n <= 999) {
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    if (remainder === 0) return HUNDREDS[hundreds];
    return HUNDREDS[hundreds] + " و" + convertSmallNumber(remainder);
  }
  return "";
}

// ─── Core conversion: fraction portion ──────────────────────────────────

function convertFractionToArabic(n: number, fractionGender: "masculine" | "feminine"): string {
  if (n === 0) return "";
  // Fractions use the same number system as whole amounts
  // For feminine fraction names (هللة), the ones 1-9 use feminine forms
  // But since the spec says هللة is feminine, we need feminine ones for 1-9 with هللة

  if (fractionGender === "feminine") {
    return convertSmallNumberFeminine(n);
  }
  return convertSmallNumber(n);
}

// Feminine forms for 1-19 (used with هللة which is feminine)
const ONES_FEMININE: string[] = [
  "",           // 0
  "واحدة",      // 1
  "اثنتان",     // 2
  "ثلاث",       // 3
  "أربع",       // 4
  "خمس",        // 5
  "ست",         // 6
  "سبع",        // 7
  "ثمان",       // 8
  "تسع",        // 9
  "عشر",        // 10 ( feminine: عشرة but for compound عشر )
  "إحدى عشر",   // 11
  "اثنتا عشر",  // 12
  "ثلاث عشر",   // 13
  "أربع عشر",   // 14
  "خمس عشر",    // 15
  "ست عشر",     // 16
  "سبع عشر",    // 17
  "ثمان عشر",   // 18
  "تسع عشر",    // 19
];

// Feminine tens are the same as masculine tens (عشرون, ثلاثون, etc.)
// Because Arabic tens have the same form regardless of gender

function convertSmallNumberFeminine(n: number): string {
  if (n === 0) return "";
  if (n <= 19) return ONES_FEMININE[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) return TENS[tens];
  return ONES_FEMININE[ones] + " و" + TENS[tens];
}

// ─── Main function: numberToArabicText ──────────────────────────────────

export function numberToArabicText(amount: number, currency: SupportedCurrency): string {
  const info = CURRENCY_INFO[currency];
  const decimalMultiplier = Math.pow(10, info.decimalPlaces);

  // Split into whole and fraction
  const wholePart = Math.floor(Math.abs(amount));
  const fractionPart = Math.round((Math.abs(amount) - wholePart) * decimalMultiplier);

  // Handle negative
  const isNegative = amount < 0;

  const parts: string[] = [];

  // ── Whole portion ────────────────────────────────────────────────
  if (wholePart === 0) {
    parts.push("صفر");
    parts.push(info.wholePlural); // zero uses plural form
  } else if (wholePart === 1) {
    // "دينار واحد" — the number واحد comes after the currency name for 1
    parts.push(info.wholeSingular + " واحد");
  } else if (wholePart === 2) {
    // "ديناران" — dual form already includes the number meaning
    parts.push(info.wholeDual);
  } else if (wholePart <= 10) {
    // "ثلاثة دينارات" — number before plural currency
    parts.push(convertWholeToArabic(wholePart));
    parts.push(info.wholePlural);
  } else if (wholePart <= 99) {
    // "خمسون دينار" — number before singular currency (Arabic grammar: 11-99 use singular)
    parts.push(convertWholeToArabic(wholePart));
    parts.push(info.wholeSingular);
  } else {
    // 100+: "خمسمائة دينار" — the number expression includes its own form
    // For hundreds+ the number text comes first, then the currency name
    parts.push(convertWholeToArabic(wholePart));
    parts.push(getCurrencyWholeName(currency, wholePart));
  }

  // ── Fraction portion ─────────────────────────────────────────────
  if (fractionPart > 0) {
    const fractionName = getFractionName(currency, fractionPart);

    if (fractionPart === 1) {
      parts.push(fractionName + " واحد");
    } else if (fractionPart === 2) {
      // Dual form already built into getFractionName
      parts.push(getFractionName(currency, 2));
    } else if (fractionPart <= 10) {
      parts.push(convertFractionToArabic(fractionPart, info.fractionGender));
      parts.push(info.fractionPlural);
    } else if (fractionPart <= 99) {
      parts.push(convertFractionToArabic(fractionPart, info.fractionGender));
      parts.push(info.fractionSingular); // 11-99 use singular for fraction name
    } else {
      parts.push(convertFractionToArabic(fractionPart, info.fractionGender));
      parts.push(fractionName);
    }
  }

  let result = parts.join(" و");

  if (isNegative) {
    result = "سالب " + result;
  }

  // Always end with "لا غير" (only) — standard for checks/vouchers
  result += " لا غير";

  return result;
}
