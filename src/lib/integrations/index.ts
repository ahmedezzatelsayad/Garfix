/**
 * index.ts — Integration SDK entry point.
 *
 * Importing this module registers every provider under its type key.
 * API routes that need to enumerate / test / configure integrations import
 * from here so the providers are guaranteed to be loaded.
 *
 *   import "@/lib/integrations"; // side-effect: registers providers
 *   import { getProvider } from "@/lib/integrations/registry";
 */
import { registerProvider } from "./registry";
import { whatsappProvider } from "./whatsapp";
import { myfatoorahProvider } from "./myfatoorah";
import { metaAdsProvider } from "./meta_ads";
import { paymobProvider } from "./paymob";
import { sendgridProvider } from "./sendgrid";
import { twilioProvider } from "./twilio";
import { awsS3Provider } from "./aws_s3";
import { stripeProvider } from "./stripe";
import { einvoiceEgProvider } from "./einvoice_eg";
import { einvoiceUaeProvider } from "./einvoice_ae";
import { einvoiceKwProvider } from "./einvoice_kw";
import { einvoiceBhProvider } from "./einvoice_bh";
import { einvoiceOmProvider } from "./einvoice_om";
import { einvoiceQaProvider } from "./einvoice_qa";
import { logger } from "@/lib/logger";

let registered = false;

/** Idempotent — safe to call multiple times (Next.js hot-reloads). */
export function ensureProvidersRegistered(): void {
  if (registered) return;
  
  // ─── Existing Providers ────────────────────────────────────────────────
  registerProvider("whatsapp", whatsappProvider);
  registerProvider("myfatoorah", myfatoorahProvider);
  registerProvider("meta_ads", metaAdsProvider);
  registerProvider("paymob", paymobProvider);
  
  // ─── New Providers ─────────────────────────────────────────────────────
  registerProvider("sendgrid", sendgridProvider);
  registerProvider("twilio", twilioProvider);
  registerProvider("aws_s3", awsS3Provider);
  registerProvider("stripe", stripeProvider);

  // ─── E-Invoicing Providers (per-country) ───────────────────────────────
  registerProvider("einvoice_eg", einvoiceEgProvider);
  registerProvider("einvoice_ae", einvoiceUaeProvider);
  registerProvider("einvoice_kw", einvoiceKwProvider);
  registerProvider("einvoice_bh", einvoiceBhProvider);
  registerProvider("einvoice_om", einvoiceOmProvider);
  registerProvider("einvoice_qa", einvoiceQaProvider);

  registered = true;
  logger.info("[integrations] all providers registered", {
    types: [
      "whatsapp",
      "myfatoorah",
      "meta_ads",
      "paymob",
      // New integrations
      "sendgrid",
      "twilio",
      "aws_s3",
      "stripe",
      // E-Invoicing
      "einvoice_eg",
      "einvoice_ae",
      "einvoice_kw",
      "einvoice_bh",
      "einvoice_om",
      "einvoice_qa",
    ],
  });
}

ensureProvidersRegistered();

export { 
  registerProvider, 
  getProvider, 
  listRegisteredProviders, 
  getIntegrationConfig, 
  setIntegrationConfig, 
  disconnectIntegration 
} from "./registry";
export { 
  INTEGRATION_INFO, 
  INTEGRATION_META_FULL, 
  INTEGRATION_TYPES, 
  CATEGORY_LABELS,
  type IntegrationProvider, 
  type IntegrationType,
  type IntegrationMeta,
  type IntegrationCategory,
  type IntegrationFieldDef,
  type FieldType,
} from "./types";
