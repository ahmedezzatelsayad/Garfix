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
import { logger } from "@/lib/logger";

let registered = false;

/** Idempotent — safe to call multiple times (Next.js hot-reloads). */
export function ensureProvidersRegistered(): void {
  if (registered) return;
  registerProvider("whatsapp", whatsappProvider);
  registerProvider("myfatoorah", myfatoorahProvider);
  registerProvider("meta_ads", metaAdsProvider);
  registerProvider("paymob", paymobProvider);
  registered = true;
  logger.info("[integrations] all providers registered", {
    types: ["whatsapp", "myfatoorah", "meta_ads", "paymob"],
  });
}

ensureProvidersRegistered();

export { registerProvider, getProvider, listRegisteredProviders, getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from "./registry";
export { INTEGRATION_INFO, INTEGRATION_TYPES, type IntegrationProvider, type IntegrationType } from "./types";
