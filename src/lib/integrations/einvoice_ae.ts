/**
 * einvoice_ae.ts — UAE FTA Peppol Access Point e-invoicing provider.
 *
 * The UAE Federal Tax Authority (FTA) has adopted the Peppol network for
 * B2B e-invoicing. Taxpayers do NOT connect directly to the FTA; they
 * contract with a certified Peppol Access Point (AP) — e.g. Kloud portal,
 * Comarch, Tradeshift — and supply that AP's credentials in their ERP.
 *
 * Reference: https://mof.gov.ae/en/media/news/uae-issues-federal-decree-no-28-of-2024
 *
 * Fields:
 *   access_point_url   — Base URL of the AP REST API (e.g. https://ap.kloudportal.com/api/v1)
 *   ap_client_id       — Client ID issued by the AP
 *   ap_client_secret   — Client secret issued by the AP
 *   peppol_id          — The company's Peppol Participant ID (e.g. 0195:300000000000003)
 *   vat_number         — TRN (15 digits)
 *
 * Test: POST /auth/token with client_credentials grant — returns an access
 * token from the AP. A 200 confirms the credentials are valid.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { fetchSafe } from "@/lib/ssrf";
import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

class EinvoiceUaeProvider implements IntegrationProvider {
  type = 'einvoice_ae';
  name = 'UAE FTA Peppol e-Invoicing';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    const required = ['access_point_url', 'ap_client_id', 'ap_client_secret', 'peppol_id'];
    for (const k of required) {
      if (!credentials[k]) {
        logger.warn(`[integrations:einvoice_ae] missing required field: ${k}`);
        return false;
      }
    }

    await setIntegrationConfig(this.type, {
      access_point_url: credentials.access_point_url.replace(/\/$/, ''),
      ap_client_id: credentials.ap_client_id,
      ap_client_secret: credentials.ap_client_secret,
      peppol_id: credentials.peppol_id,
      vat_number: credentials.vat_number || '',
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; details?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.access_point_url) {
      return { ok: false, error: 'بيانات الاعتماد غير مُهيّأة (Access Point URL مطلوب)' };
    }

    try {
      const url = `${cfg.access_point_url}/auth/token`;
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cfg.ap_client_id,
        client_secret: cfg.ap_client_secret,
      });

      const res = await fetchSafe(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'Client ID / Secret غير صالح' };
      }
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status} — ${res.statusText}` };
      }

      const data = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!data.access_token) {
        return { ok: false, error: 'استجابة غير متوقعة من Access Point — لا يوجد access_token' };
      }

      return {
        ok: true,
        details: `متصل بـ Peppol AP — معرّف المشارك: ${cfg.peppol_id}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ Peppol AP',
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error || r.details };
  }
}

export const einvoiceUaeProvider = new EinvoiceUaeProvider();
