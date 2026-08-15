/**
 * einvoice_qa.ts — Qatar General Tax Authority (GTA) e-invoicing provider.
 *
 * As of 2026, Qatar has NOT mandated e-invoicing. The GTA has published
 * a voluntary e-invoicing guideline aligned with Peppol BIS 3.0, but
 * there is no clearance API. This provider stores credentials for the
 * voluntary Peppol submission path so clients who opt in early can
 * use it.
 *
 * Reference: https://www.gta.gov.qa
 *
 * Fields:
 *   access_point_url  — Base URL of the company's Peppol AP (Qatar does not run its own AP yet)
 *   ap_client_id      — Client ID issued by the AP
 *   ap_client_secret  — Client secret issued by the AP
 *   peppol_id         — Peppol Participant ID (e.g. 0195:QA300000000000003)
 *   tax_number        — Qatar Tax Identification Number (TIN)
 *
 * Test: POST /auth/token — exchange client credentials for an AP access token.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { fetchSafe } from "@/lib/ssrf";
import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

class EinvoiceQaProvider implements IntegrationProvider {
  type = 'einvoice_qa';
  name = 'Qatar GTA e-Invoicing (voluntary)';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    const required = ['access_point_url', 'ap_client_id', 'ap_client_secret', 'peppol_id'];
    for (const k of required) {
      if (!credentials[k]) {
        logger.warn(`[integrations:einvoice_qa] missing required field: ${k}`);
        return false;
      }
    }

    await setIntegrationConfig(this.type, {
      access_point_url: credentials.access_point_url.replace(/\/$/, ''),
      ap_client_id: credentials.ap_client_id,
      ap_client_secret: credentials.ap_client_secret,
      peppol_id: credentials.peppol_id,
      tax_number: credentials.tax_number || '',
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

      const data = (await res.json()) as { access_token?: string };
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

export const einvoiceQaProvider = new EinvoiceQaProvider();
