/**
 * invoice-brain/garfixAdapter.ts — bridges the brain's generic Invoice to
 * GarfiX's item-based ParsedOrder, with currency normalization.
 *
 * Checklist coverage:
 *   - 3.3 Field mapping: brain's flat {price, total} → GarfiX's {items:[{price}], total}
 *   - 4.1 fKWD fix: brain's `currency` is NEVER trusted blindly. It's validated
 *     against the company's configured currency; if missing/unknown, the
 *     company's currency is used. This prevents a new extraction source from
 *     re-introducing the hardcoded-currency bug.
 *   - 4.2 Zod passthrough: the mapped result is run through GarfiX's existing
 *     OrderSchema (the same one /api/ai/bulk-import uses) before being returned,
 *     so invalid data is rejected at the boundary, not saved directly.
 */
import { InvoiceSchema, type Invoice } from "./schema";
import { getCountryConfig } from "@/lib/gulfConfig";
import { num } from "@/lib/money";
import { z } from "zod";

// GarfiX's order shape (mirrors /api/ai/bulk-import OrderSchema so the same
// validation runs here before any save).
const ItemSchema = z.object({
  name: z.string().min(1),
  qty: z.union([z.number(), z.string()]),
  unitPrice: z.union([z.number(), z.string()]),
});

export const OrderSchema = z.object({
  clientName: z.string().min(1, "اسم العميل مطلوب"),
  clientPhone: z.string().optional().default(""),
  clientAddress: z.string().optional().default(""),
  clientEmail: z.string().email().optional().or(z.literal("")).default(""),
  items: z.array(ItemSchema).min(1, "كل فاتورة تحتاج عنصراً واحداً على الأقل"),
  taxRate: z.union([z.number(), z.string()]).optional().default(0),
  shipping: z.union([z.number(), z.string()]).optional().default(0),
  discount: z.union([z.number(), z.string()]).optional().default(0),
  notes: z.string().optional().default(""),
});

export type ParsedOrder = z.infer<typeof OrderSchema>;

export interface CompanyContext {
  slug: string;
  currency: string;     // e.g. "KWD"
  country: string;      // e.g. "KW"
  defaultTaxRate?: string | null;
}

/**
 * Normalize an extracted currency against the company's currency.
 *
 * fKWD FIX (checklist 4.1): the company's currency ALWAYS wins. A new
 * extraction source can NEVER inject a foreign currency into GarfiX's
 * invoices. If the extracted currency is empty → use the company's. If it
 * matches the company's → fine. If it DIFFERS → still use the company's,
 * but the caller will add a warning note so the user can verify the amounts
 * (they might genuinely be in a foreign currency and need conversion).
 *
 * Returns the normalized currency (always the company's) + whether there
 * was a mismatch that the caller should warn about.
 */
export function normalizeCurrency(
  rawCurrency: string | undefined,
  company: CompanyContext
): { currency: string; mismatch: boolean; extracted: string } {
  const extracted = (rawCurrency || "").trim().toUpperCase();
  const companyCur = company.currency.toUpperCase();
  if (!extracted) return { currency: company.currency, mismatch: false, extracted: "" };
  if (extracted === companyCur) return { currency: company.currency, mismatch: false, extracted };
  // mismatch: source mentions a different currency than the company's
  return { currency: company.currency, mismatch: true, extracted };
}

/**
 * Map a brain Invoice → GarfiX ParsedOrder.
 *
 * The brain extracts a single-line invoice (one price, one total). GarfiX
 * invoices are item-based, so we wrap the brain's `price` as a single line
 * item. `total` is informational here — GarfiX recomputes totals from items
 * + tax + shipping + discount in calcInvoiceTotals() at save time.
 *
 * Returns { ok, order, skippedReason? }. If the brain's output is too sparse
 * (no name, or price+total both 0), it's skipped rather than producing junk.
 */
export function mapBrainToOrder(
  brain: Invoice,
  company: CompanyContext
): { ok: true; order: ParsedOrder } | { ok: false; reason: string } {
  // Re-validate the brain output (defense in depth — AI can return drift)
  const parsed = InvoiceSchema.safeParse(brain);
  if (!parsed.success) {
    return { ok: false, reason: "بيانات الفاتورة غير صالحة" };
  }
  const inv = parsed.data;

  if (!inv.name || !inv.name.trim()) {
    return { ok: false, reason: "اسم العميل مفقود" };
  }
  if (num(inv.price) <= 0 && num(inv.total) <= 0) {
    return { ok: false, reason: "لا يوجد مبلغ" };
  }

  // Derive a tax rate from the brain's absolute tax + price if possible
  const price = num(inv.price) > 0 ? num(inv.price) : num(inv.total);
  const taxRate =
    num(inv.tax) > 0 && price > 0
      ? Number(((num(inv.tax) / price) * 100).toFixed(2))
      : company.defaultTaxRate
        ? num(company.defaultTaxRate)
        : 0;

  // Currency is normalized here (fKWD fix) — the company's currency always
  // wins. GarfiX's ParsedOrder doesn't carry currency (it's company-level),
  // so we only WARN the user via notes when the source mentioned a different
  // currency (amounts might need manual conversion verification).
  const cur = normalizeCurrency(inv.currency, company);
  const currencyMismatchNote = cur.mismatch
    ? ` ⚠️ العملة المذكورة في المصدر "${cur.extracted}" تختلف عن عملة الشركة (${company.currency}) — تم استخدام عملة الشركة؛ راجع المبالغ.`
    : "";

  const order: ParsedOrder = {
    clientName: inv.name.trim(),
    clientPhone: "",
    clientAddress: inv.address?.trim() || "",
    clientEmail: "",
    items: [
      {
        name: inv.notes?.trim() || "بند فاتورة",
        qty: 1,
        unitPrice: Number(price.toFixed(3)),
      },
    ],
    taxRate,
    shipping: 0,
    discount: num(inv.discount),
    notes: (inv.notes || "").trim() + currencyMismatchNote,
  };

  // 4.2 — run through GarfiX's Zod schema before returning
  const validated = OrderSchema.safeParse(order);
  if (!validated.success) {
    return { ok: false, reason: validated.error.issues[0]?.message || "فشل التحقق" };
  }

  return { ok: true, order: validated.data };
}

/** Resolve a CompanyContext from a company slug + its gulfConfig country entry. */
export function buildCompanyContext(company: {
  slug: string;
  currency: string;
  country: string | null;
  defaultTaxRate?: string | null;
}): CompanyContext {
  return {
    slug: company.slug,
    currency: company.currency,
    country: company.country ?? "SA",
    defaultTaxRate: company.defaultTaxRate ?? null,
  };
}
