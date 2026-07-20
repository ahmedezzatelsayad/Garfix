/**
 * hijri.ts — Hijri (Islamic) calendar utilities.
 *
 * Uses the built-in `Intl.DateTimeFormat` with the `islamic` calendar so we
 * don't need any external dependency. Falls back gracefully if the runtime
 * does not support the `ar-SA-u-ca-islamic` locale.
 *
 * L2-A: Dual-date display for invoices, reports, and audit logs.
 */

export interface HijriDate {
  day: number;
  month: string;
  year: number;
  formatted: string;
}

/**
 * Parse Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) and Eastern Arabic-Indic numerals
 * (۰۱۲۳۴۵۶۷۸۹) into a regular JavaScript number. Falls back to parseInt for
 * already-Latin digits. Returns 0 if the input is empty/invalid.
 */
function parseAnyDigits(s: string | undefined): number {
  if (!s) return 0;
  const latin = s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[^\d-]/g, "");
  const n = parseInt(latin, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Convert a Gregorian date (Date or ISO string) to a Hijri date object.
 * Returns day/month/year as parsed parts plus a pre-formatted string.
 */
export function toHijri(date: Date | string): HijriDate {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    return { day: 0, month: "", year: 0, formatted: "" };
  }
  try {
    const formatter = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const parts = formatter.formatToParts(d);
    const day = parseAnyDigits(parts.find((p) => p.type === "day")?.value);
    const month = parts.find((p) => p.type === "month")?.value || "";
    const year = parseAnyDigits(parts.find((p) => p.type === "year")?.value);
    return { day, month, year, formatted: formatter.format(d) };
  } catch {
    // Runtime doesn't support islamic calendar — return empty parts
    return { day: 0, month: "", year: 0, formatted: "" };
  }
}

/**
 * Format a date as a dual Gregorian (Arabic-Indic digits) + Hijri string.
 * Example: "12 يناير 2026 (12 رجب 1447)".
 *
 * Useful for invoice footers, reports, and audit logs that need to satisfy
 * Gulf regulatory preferences for dual-calendar display.
 */
export function formatDualDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const gregorian = new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
  const hijri = toHijri(d).formatted;
  return hijri ? `${gregorian} (${hijri})` : gregorian;
}

/** Format Hijri date only (no Gregorian). */
export function formatHijri(date: Date | string): string {
  return toHijri(date).formatted;
}
