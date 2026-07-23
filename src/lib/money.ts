/**
 * money.ts — Money/Decimal helpers for the GarfiX accounting module.
 *
 * Two sets of utilities:
 * 1. Legacy `num`, `fmtMoney`, `fmtNum`, `toNum`, `addNums`, `subNums`, `mulNums`,
 *    `calcInvoiceTotals` — use plain JavaScript numbers (safe but still subject to floating-point limits)
 * 2. Decimal-safe `addMoney`, `subtractMoney`, `multiplyMoney`, `divideMoney`, `roundMoney`,
 *    `formatMoney`, `isZero`, `calculatePercentage`
 *    — use Prisma.Decimal for exact precision (no floating-point errors like 0.1 + 0.2 ≠ 0.3)
 */

import { Prisma } from '@prisma/client';

// ─── Legacy Number Utilities (still valid for non-critical paths) ───

/**
 * Convert a value to a safe number for financial calculations.
 * Handles null, undefined, NaN, and string inputs.
 * Returns 0 for any invalid input.
 */
export function num(v: unknown, scale = 3): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!isFinite(n) || isNaN(n)) return 0;
  const f = Math.pow(10, scale);
  return Math.round(n * f) / f;
}

export function fmtMoney(v: unknown, currency = "KWD", locale = "ar-EG"): string {
  const n = num(v, 3);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 3,
    }).format(n);
  } catch {
    return `${n.toFixed(3)} ${currency}`;
  }
}

export function fmtNum(v: unknown, decimals = 2): string {
  const n = num(v, decimals);
  return n.toLocaleString("ar-EG", { maximumFractionDigits: decimals });
}

export function toNum(v: unknown): string {
  return num(v, 3).toFixed(3);
}

export function addNums(...vals: unknown[]): string {
  const sum = vals.reduce<number>((acc, v) => acc + num(v, 3), 0);
  return sum.toFixed(3);
}

export function subNums(a: unknown, b: unknown): string {
  return (num(a, 3) - num(b, 3)).toFixed(3);
}

export function mulNums(a: unknown, b: unknown): string {
  return (num(a, 3) * num(b, 3)).toFixed(3);
}

/** Calculate invoice totals from line items + tax/shipping/discount. */
export interface LineItem {
  description: string;
  qty: number;
  price: number;
  total?: number;
}

export function calcInvoiceTotals(
  items: LineItem[],
  taxRate: number,
  shipping: number,
  discount: number,
) {
  const subtotal = items.reduce<number>(
    (sum, it) => sum + num(it.total ?? num(it.qty) * num(it.price), 3),
    0,
  );
  const discounted = Math.max(0, subtotal - num(discount));
  const taxAmount = (discounted * num(taxRate)) / 100;
  const total = discounted + taxAmount + num(shipping);
  return {
    subtotal: subtotal.toFixed(3),
    taxRate: num(taxRate).toFixed(2),
    taxAmount: taxAmount.toFixed(3),
    total: total.toFixed(3),
    shipping: num(shipping).toFixed(3),
    discount: num(discount).toFixed(3),
  };
}

export function add(a: number, b: number): number { return num(a + b, 3); }
export function subtract(a: number, b: number): number { return num(a - b, 3); }
export function multiply(a: number, b: number): number { return num(a * b, 3); }
export function divide(a: number, b: number): number { return b === 0 ? 0 : num(a / b, 3); }
export function round(v: number, d = 2): number { return num(v, d); }
export function formatCurrency(v: number, currency = "USD"): string { return fmtMoney(v, currency); }
export function sum(...vals: number[]): number { return num(vals.reduce((a, b) => a + b, 0), 3); }

// ─── Decimal-Safe Utilities (for production accuracy) ───

// Decimal type alias for money operations
export type MoneyDecimal = Prisma.Decimal;

// Safe money arithmetic — avoids floating-point errors
export function addMoney(a: number | string | MoneyDecimal, b: number | string | MoneyDecimal): MoneyDecimal {
  return new Prisma.Decimal(a).plus(new Prisma.Decimal(b));
}

export function subtractMoney(a: number | string | MoneyDecimal, b: number | string | MoneyDecimal): MoneyDecimal {
  return new Prisma.Decimal(a).minus(new Prisma.Decimal(b));
}

export function multiplyMoney(a: number | string | MoneyDecimal, rate: number | string | MoneyDecimal): MoneyDecimal {
  return new Prisma.Decimal(a).times(new Prisma.Decimal(rate));
}

export function divideMoney(a: number | string | MoneyDecimal, divisor: number | string | MoneyDecimal): MoneyDecimal {
  return new Prisma.Decimal(a).dividedBy(new Prisma.Decimal(divisor));
}

// Round to 2 decimal places (standard for financial amounts)
export function roundMoney(value: number | string | MoneyDecimal): MoneyDecimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

// Convert Decimal to display string
export function formatMoney(value: number | string | MoneyDecimal, currency: string = 'USD'): string {
  const decimal = new Prisma.Decimal(value).toDecimalPlaces(2);
  return `${decimal.toFixed(2)} ${currency}`;
}

// Zero-safe comparison
export function isZero(value: number | string | MoneyDecimal): boolean {
  return new Prisma.Decimal(value).isZero();
}

// Safe percentage calculation
export function calculatePercentage(part: number | string | MoneyDecimal, total: number | string | MoneyDecimal): MoneyDecimal {
  if (isZero(total)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(part).dividedBy(new Prisma.Decimal(total)).times(100).toDecimalPlaces(2);
}
