/**
 * types.ts — Integration Provider interface + integration type constants.
 *
 * Each external service (WhatsApp Cloud API, MyFatoorah, Meta Ads) implements
 * this interface and registers itself via `registerProvider` (see registry.ts).
 * Credentials live encrypted in the `platform_settings` table — never in code.
 */
export interface IntegrationProvider {
  /** Unique type key (matches one of INTEGRATION_TYPES). */
  type: string;
  /** Human-readable name shown in the admin UI. */
  name: string;
  /** Persist the credentials (encrypted at rest via cryptoVault). */
  connect(credentials: Record<string, string>): Promise<boolean>;
  /** Clear stored credentials for this provider. */
  disconnect(): Promise<void>;
  /** Verify the configured credentials actually work end-to-end. */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
  /** Lighter probe used by health-check polls. */
  healthCheck(): Promise<{ healthy: boolean; details?: string }>;
}

export const INTEGRATION_TYPES = {
  WHATSAPP: "whatsapp",
  MYFATOORAH: "myfatoorah",
  META_ADS: "meta_ads",
  PAYMOB: "paymob",
} as const;

export type IntegrationType = (typeof INTEGRATION_TYPES)[keyof typeof INTEGRATION_TYPES];

/** Metadata used by the GET /api/platform-admin/integrations response. */
export const INTEGRATION_INFO: Array<{
  type: string;
  name: string;
  description: string;
  requiredFields: Array<{ key: string; label: string; type: "text" | "password" }>;
}> = [
  {
    type: INTEGRATION_TYPES.WHATSAPP,
    name: "WhatsApp Cloud API",
    description: "إرسال رسائل واتساب تلقائياً للعملاء (تأكيد الطلبات، إشعارات الدفع، تنبيهات التسليم).",
    requiredFields: [
      { key: "phone_number_id", label: "Phone Number ID", type: "text" },
      { key: "access_token", label: "Access Token", type: "password" },
      { key: "verify_token", label: "Webhook Verify Token", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.MYFATOORAH,
    name: "MyFatoorah",
    description: "بوابة الدفع الخليجية — قبول مدى، فيزا، Mastercard، Apple Pay لجميع دول الخليج.",
    requiredFields: [
      { key: "api_key", label: "API Key", type: "password" },
      { key: "base_url", label: "Base URL", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.META_ADS,
    name: "Meta Ads",
    description: "سحب أداء الحملات الإعلانية على فيسبوك وإنستغرام (إنفاق، ROAS، نقرات).",
    requiredFields: [
      { key: "access_token", label: "Access Token", type: "password" },
      { key: "ad_account_id", label: "Ad Account ID", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.PAYMOB,
    name: "Paymob",
    description: "بوابة الدفع المصرية الرائدة — قبول محافظ رقمية (فودافون كاش، أورنج كاش)، بطاقات ميزة، فيزا/Mastercard، وأقساط بنكية لجميع السوق المصري.",
    requiredFields: [
      { key: "api_key", label: "API Key", type: "password" },
      { key: "base_url", label: "Base URL", type: "text" },
    ],
  },
];
