export interface LineItem {
  description: string;
  qty: number;
  price: number;
  total?: number;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  companySlug: string;
  clientId: number | null;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  issueDate: string;
  dueDate: string;
  status: string;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  shipping: number;
  discount: number;
  paid: number;
  notes?: string;
  version: number;
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
