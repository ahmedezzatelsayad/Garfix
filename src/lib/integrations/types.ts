/**
 * types.ts — Integration Provider interface + integration type constants.
 *
 * Each external service (WhatsApp Cloud API, MyFatoorah, Meta Ads, SendGrid,
 * Twilio, AWS S3, Stripe, Paymob) implements this interface and registers
 * itself via `registerProvider` (see registry.ts).
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
  testConnection(): Promise<{ ok: boolean; error?: string; details?: string }>;
  /** Lighter probe used by health-check polls. */
  healthCheck(): Promise<{ healthy: boolean; details?: string }>;
}

/** Supported field types for integration configuration forms. */
export type FieldType = "text" | "password" | "email" | "select" | "boolean" | "number";

/** Definition of a single configuration field for an integration. */
export interface IntegrationFieldDef {
  /** Field key (used as credential key). */
  key: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Input type. */
  type: FieldType;
  /** Placeholder text. */
  placeholder?: string;
  /** Default value. */
  default?: string | boolean;
  /** Options for select type. */
  options?: string[];
}

/** Category of integration for grouping in the UI. */
export type IntegrationCategory = "payments" | "communications" | "storage" | "ai" | "analytics";

/** Extended metadata for an integration (used by admin UI and API responses). */
export interface IntegrationMeta {
  /** Unique type key. */
  type: string;
  /** Human-readable name. */
  name: string;
  /** Description (supports Arabic/RTL). */
  description: string;
  /** Icon emoji or identifier. */
  icon: string;
  /** Category for grouping. */
  category: IntegrationCategory;
  /** Required fields that must be filled. */
  requiredFields: IntegrationFieldDef[];
  /** Optional fields with defaults. */
  optionalFields?: IntegrationFieldDef[];
  /** Webhook URL if this integration uses webhooks. */
  webhookUrl?: string;
}

export const INTEGRATION_TYPES = {
  WHATSAPP: "whatsapp",
  MYFATOORAH: "myfatoorah",
  META_ADS: "meta_ads",
  PAYMOB: "paymob",
  SENDGRID: "sendgrid",
  TWILIO: "twilio",
  AWS_S3: "aws_s3",
  STRIPE: "stripe",
} as const;

export type IntegrationType = (typeof INTEGRATION_TYPES)[keyof typeof INTEGRATION_TYPES];

/**
 * Full integration metadata registry.
 * Used by GET /api/platform-admin/integrations to return schema + status.
 * Supports both old format (backward compat) and new extended format.
 */
export const INTEGRATION_INFO: Array<{
  type: string;
  name: string;
  description: string;
  requiredFields: Array<{ key: string; label: string; type: "text" | "password" }>;
}> = [
  // ─── Existing Integrations ──────────────────────────────────────────────
  {
    type: INTEGRATION_TYPES.WHATSAPP,
    name: "WhatsApp Cloud API",
    description:
      "إرسال رسائل واتساب تلقائياً للعملاء (تأكيد الطلبات، إشعارات الدفع، تنبيهات التسليم).",
    requiredFields: [
      { key: "phone_number_id", label: "Phone Number ID", type: "text" },
      { key: "access_token", label: "Access Token", type: "password" },
      { key: "verify_token", label: "Webhook Verify Token", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.MYFATOORAH,
    name: "MyFatoorah",
    description:
      "بوابة الدفع الخليجية — قبول مدى، فيزا، Mastercard، Apple Pay لجميع دول الخليج.",
    requiredFields: [
      { key: "api_key", label: "API Key", type: "password" },
      { key: "base_url", label: "Base URL", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.META_ADS,
    name: "Meta Ads",
    description:
      "سحب أداء الحملات الإعلانية على فيسبوك وإنستغرام (إنفاق، ROAS، نقرات).",
    requiredFields: [
      { key: "access_token", label: "Access Token", type: "password" },
      { key: "ad_account_id", label: "Ad Account ID", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.PAYMOB,
    name: "Paymob",
    description:
      "بوابة الدفع المصرية الرائدة — قبول محافظ رقمية (فودافون كاش، أورنج كاش)، بطاقات ميزة، فيزا/Mastercard، وأقساط بنكية لجميع السوق المصري.",
    requiredFields: [
      { key: "api_key", label: "API Key", type: "password" },
      { key: "base_url", label: "Base URL", type: "text" },
    ],
  },
  // ─── New Integrations ───────────────────────────────────────────────────
  {
    type: INTEGRATION_TYPES.SENDGRID,
    name: "SendGrid",
    description:
      "خدمة إرسال البريد الإلكتروني للفواتير والإشعارات — توصيل سريع وموثوق.",
    requiredFields: [
      { key: "api_key", label: "API Key", type: "password", placeholder: "SG.xxx..." },
    ],
  },
  {
    type: INTEGRATION_TYPES.TWILIO,
    name: "Twilio",
    description:
      "خدمة الرسائل النصية القصيرة للتحقق من الهاتف والإشعارات الفورية.",
    requiredFields: [
      { key: "account_sid", label: "Account SID", type: "text" },
      { key: "auth_token", label: "Auth Token", type: "password" },
      { key: "phone_number", label: "Phone Number", type: "text", placeholder: "+1234567890" },
    ],
  },
  {
    type: INTEGRATION_TYPES.AWS_S3,
    name: "AWS S3",
    description:
      "تخزين سحابي للفواتير والمستندات مع دعم CDN مخصص.",
    requiredFields: [
      { key: "access_key", label: "Access Key ID", type: "text" },
      { key: "secret_key", label: "Secret Access Key", type: "password" },
      { key: "bucket_name", label: "Bucket Name", type: "text" },
      { key: "region", label: "Region", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.STRIPE,
    name: "Stripe",
    description:
      "معالجة دفع عالمية — بطاقات ائتمان، Apple Pay، Google Pay لجميع العملات.",
    requiredFields: [
      { key: "secret_key", label: "Secret Key", type: "password", placeholder: "sk_live_..." },
      { key: "publishable_key", label: "Publishable Key", type: "text", placeholder: "pk_live_..." },
      { key: "webhook_secret", label: "Webhook Secret", type: "password" },
    ],
  },
];

/**
 * Extended integration metadata with full field definitions.
 * Used by the founder panel integrations page for rich UI rendering.
 */
export const INTEGRATION_META_FULL: IntegrationMeta[] = [
  // ─── Existing Integrations ──────────────────────────────────────────────
  {
    type: INTEGRATION_TYPES.WHATSAPP,
    name: "WhatsApp Cloud API",
    description:
      "إرسال رسائل واتساب تلقائياً للعملاء (تأكيد الطلبات، إشعارات الدفع، تنبيهات التسليم).",
    icon: "💬",
    category: "communications",
    requiredFields: [
      { key: "phone_number_id", label: "Phone Number ID", type: "text" },
      { key: "access_token", label: "Access Token", type: "password" },
      { key: "verify_token", label: "Webhook Verify Token", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.MYFATOORAH,
    name: "MyFatoorah",
    description:
      "بوابة الدفع الخليجية — قبول مدى، فيزا، Mastercard، Apple Pay لجميع دول الخليج.",
    icon: "🌍",
    category: "payments",
    requiredFields: [
      { key: "api_key", label: "API Key", type: "password" },
      { key: "base_url", label: "Base URL", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.META_ADS,
    name: "Meta Ads",
    description:
      "سحب أداء الحملات الإعلانية على فيسبوك وإنستغرام (إنفاق، ROAS، نقرات).",
    icon: "📊",
    category: "analytics",
    requiredFields: [
      { key: "access_token", label: "Access Token", type: "password" },
      { key: "ad_account_id", label: "Ad Account ID", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.PAYMOB,
    name: "Paymob",
    description:
      "بوابة الدفع المصرية الرائدة — قبول محافظ رقمية وبطاقات وأقساط بنكية.",
    icon: "🇪🇬",
    category: "payments",
    requiredFields: [
      { key: "api_key", label: "API Key", type: "password" },
      { key: "base_url", label: "Base URL", type: "text" },
    ],
  },
  // ─── New Integrations ───────────────────────────────────────────────────
  {
    type: INTEGRATION_TYPES.SENDGRID,
    name: "SendGrid",
    description:
      "Email delivery for invoices & notifications — fast & reliable transactional email.",
    icon: "📧",
    category: "communications",
    requiredFields: [
      { key: "api_key", label: "API Key", type: "password", placeholder: "SG.xxx..." },
    ],
    optionalFields: [
      { key: "from_email", label: "From Email", type: "email", default: "noreply@garfix.app" },
      { key: "from_name", label: "From Name", type: "text", default: "GarfiX ERP" },
      { key: "template_invoice_id", label: "Invoice Template ID", type: "text" },
      { key: "template_receipt_id", label: "Receipt Template ID", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.TWILIO,
    name: "Twilio",
    description:
      "SMS verification & notifications — global SMS delivery with WhatsApp support.",
    icon: "📱",
    category: "communications",
    requiredFields: [
      { key: "account_sid", label: "Account SID", type: "text" },
      { key: "auth_token", label: "Auth Token", type: "password" },
      { key: "phone_number", label: "Phone Number", type: "text", placeholder: "+1234567890" },
    ],
    optionalFields: [
      { key: "use_whatsapp", label: "Enable WhatsApp", type: "boolean", default: false },
    ],
  },
  {
    type: INTEGRATION_TYPES.AWS_S3,
    name: "AWS S3",
    description:
      "Cloud storage for invoices & documents — secure, scalable object storage.",
    icon: "☁️",
    category: "storage",
    requiredFields: [
      { key: "access_key", label: "Access Key ID", type: "text" },
      { key: "secret_key", label: "Secret Access Key", type: "password" },
      { key: "bucket_name", label: "Bucket Name", type: "text" },
      { key: "region", label: "Region", type: "select", options: ["us-east-1", "eu-west-1", "me-south-1"] },
    ],
    optionalFields: [
      { key: "custom_domain", label: "Custom Domain (CDN)", type: "text" },
    ],
  },
  {
    type: INTEGRATION_TYPES.STRIPE,
    name: "Stripe",
    description:
      "Global payment processing — credit cards, Apple Pay, Google Pay for all currencies.",
    icon: "💳",
    category: "payments",
    requiredFields: [
      { key: "secret_key", label: "Secret Key", type: "password", placeholder: "sk_live_..." },
      { key: "publishable_key", label: "Publishable Key", type: "text", placeholder: "pk_live_..." },
      { key: "webhook_secret", label: "Webhook Secret", type: "password" },
    ],
    optionalFields: [
      { key: "mode", label: "Mode", type: "select", options: ["test", "live"], default: "test" },
      { key: "currency", label: "Default Currency", type: "select", options: ["USD", "EUR", "SAR", "AED", "EGP"] },
    ],
  },
];

/** Category labels (Arabic + English) for UI display. */
export const CATEGORY_LABELS: Record<IntegrationCategory, { ar: string; en: string; icon: string }> = {
  payments: { ar: "المدفوعات", en: "Payments", icon: "💰" },
  communications: { ar: "الاتصالات", en: "Communications", icon: "📡" },
  storage: { ar: "التخزين", en: "Storage", icon: "🗄️" },
  ai: { ar: "الذكاء الاصطناعي", en: "AI / ML", icon: "🤖" },
  analytics: { ar: "التحليلات", en: "Analytics", icon: "📈" },
};
