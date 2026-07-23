/**
 * money.ts — Money/Decimal helpers (preserved from v10, updated for P1 Decimal migration).
 *
 * All monetary values are now stored as Decimal (Prisma) on PostgreSQL.
 * Previously they were String (SQLite). These helpers parse/format safely
 * without float drift. Prisma Decimal values (decimal.js instances) are
 * handled transparently — String(v) on a Decimal returns its string repr.
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
