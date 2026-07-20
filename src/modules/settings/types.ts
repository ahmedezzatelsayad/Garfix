"use client";

/**
 * types.ts — Shared types and constants for the Settings module.
 *
 * Extracted from the original SettingsView God Component so that
 * CompanySettingsForm, TemplateSettingsForm, and TemplateListManager
 * can import from a single source of truth.
 */

// ─── Individual Invoice Template type (matches DB row from /api/invoice-templates GET) ───

export interface InvoiceTemplateRow {
  id: number;
  companySlug: string;
  name: string;
  isDefault: boolean;
  layoutType: string;
  primaryColor: string;
  fontFamily: string;
  logoPosition: string;
  showTaxNumber: boolean;
  showQrCode: boolean;
  showBankDetails: boolean;
  footerText?: string | null;
  termsAndConditions?: string | null;
  paperSize: string;
  createdAt: string;
}

// ─── Template settings form state ───────────────────────────────────────────

export interface TemplateSettingsForm {
  templateId: string;
  primaryColor: string;
  fontFamily: string;
  fontSize: number;
  showLogo: boolean;
  logoPosition: string;
  showPaymentInfo: boolean;
  showStamp: boolean;
  invoiceTypes: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const LAYOUT_TYPES = [
  { id: "classic", label: "كلاسيكي" },
  { id: "modern", label: "عصري" },
  { id: "minimal", label: "بسيط" },
  { id: "thermal", label: "حراري" },
] as const;

export const PAPER_SIZES = [
  { id: "A4", label: "A4" },
  { id: "Thermal80mm", label: "حراري 80mm" },
] as const;

export const LOGO_POSITIONS = [
  { id: "right", label: "يمين" },
  { id: "left", label: "يسار" },
  { id: "center", label: "وسط" },
] as const;

export const TEMPLATES = [
  { id: "classic", label: "كلاسيكي", desc: "تصميم تقليدي بإطار أنيق", icon: "📄" },
  { id: "modern", label: "عصري", desc: "تصميم حديث ونظيف", icon: "✨" },
  { id: "minimal", label: "بسيط", desc: "تصميم بسيط بدون زخارف", icon: "◻️" },
  { id: "arabic-rtl", label: "عربي RTL", desc: "تصميم مُحسّن للعربية", icon: "🔤" },
] as const;

export const FONTS = [
  { id: "Noto Sans SC", label: "Noto Sans SC" },
  { id: "Cairo", label: "Cairo" },
  { id: "Tajawal", label: "Tajawal" },
  { id: "IBM Plex Sans Arabic", label: "IBM Plex Sans Arabic" },
  { id: "Almarai", label: "Almarai" },
] as const;

export const INVOICE_TYPE_OPTIONS = [
  { id: "sales", label: "فاتورة مبيعات" },
  { id: "purchase", label: "فاتورة مشتريات" },
  { id: "quote", label: "عرض سعر" },
] as const;

// ─── Default values ─────────────────────────────────────────────────────────

export const defaultTemplateSettings: TemplateSettingsForm = {
  templateId: "modern",
  primaryColor: "#7C3AED",
  fontFamily: "Noto Sans SC",
  fontSize: 12,
  showLogo: true,
  logoPosition: "right",
  showPaymentInfo: true,
  showStamp: false,
  invoiceTypes: ["sales", "purchase", "quote"],
};
