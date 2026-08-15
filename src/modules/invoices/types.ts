/**
 * Line item on an invoice. The API parses this from the JSON-encoded
 * `lineItems` column on the Invoice table (parseJsonField returns []).
 */
export interface LineItem {
  /** Optional stable id (DB-sourced items may carry one in the future). */
  id?: string | number;
  description: string;
  qty: number;
  price: number;
  total?: number;
}

/**
 * Canonical Invoice type — single source of truth for the frontend.
 *
 * P0-15 (Engineering Audit): Reconciled with the duplicate interface in
 * src/hooks/queries/invoices.ts. Both files now re-export THIS interface
 * so there is exactly one Invoice shape across the codebase.
 *
 * Field shapes match the actual API response (src/app/api/invoices/route.ts
 * GET handler) — Prisma Decimal fields are converted to `number` via
 * `num()` before serialization, and `lineItems` is parsed from the JSON
 * string column into an array. `clientId` is `string | null` to match
 * the Prisma schema (`String?`); the previous `number` was wrong.
 */
export interface Invoice {
  id: number;
  invoiceNumber: string;
  companySlug: string;
  /** Prisma `String?` — nullable FK to clients.id (cuid). */
  clientId: string | null;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  /** ISO date string (Prisma DateTime serialized to JSON). */
  issueDate: string;
  /** ISO date string (Prisma DateTime? serialized to JSON). */
  dueDate: string;
  status: string;
  /** Parsed from the JSON-encoded `lineItems` column. */
  lineItems: LineItem[];
  /** Prisma Decimal → number (via num() in the API). */
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  shipping: number;
  discount: number;
  paid: number;
  /** Computed by the frontend (total - paid). */
  outstanding: number;
  notes?: string;
  /** Prisma Int — optimistic lock version. */
  version: number;
  /** Escape hatch for fields not yet typed. */
  [key: string]: unknown;
}

export type StatusFilter = "all" | "paid" | "pending" | "overdue";

export const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "مسودة", color: "#6b7280", bg: "#f3f4f6" },
  sent: { label: "مرسلة", color: "#7C3AED", bg: "#EDE9FE" },
  paid: { label: "مدفوعة", color: "#059669", bg: "#d1fae5" },
  partial: { label: "جزئية", color: "#d97706", bg: "#fef3c7" },
  overdue: { label: "متأخرة", color: "#dc2626", bg: "#fee2e2" },
  cancelled: { label: "ملغاة", color: "#9ca3af", bg: "#f3f4f6" },
};
