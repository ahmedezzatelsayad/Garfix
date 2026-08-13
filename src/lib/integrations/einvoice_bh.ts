/**
 * einvoice_bh.ts — Bahrain National Bureau for Revenue (NBR) e-invoicing provider.
 *
 * Bahrain's NBR operates the "NBR invoicing portal" for VAT-registered
 * businesses. As of 2026, NBR requires VAT-registered taxpayers to issue
 * compliant electronic invoices and submit them via the portal API.
 *
 * Reference: https://www.nbr.gov.bh
 *
 * Fields:
 *   api_base_url    — NBR API base URL
 *   vat_number      — 15-digit Bahrain VAT number (BH + 13 digits)
 *   api_key         — API key issued by NBR portal
 *
 * Test: GET /taxpayer/profile with X-API-Key header — returns the
 * taxpayer's profile. A 200 confirms the API key is valid.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { fetchSafe } from "@/lib/ssrf";
import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

class EinvoiceBhProvider implements IntegrationProvider {
  type = 'einvoice_bh';
  name = 'Bahrain NBR e-Invoicing';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    const required = ['api_base_url', 'vat_number', 'api_key'];
    for (const k of required) {
      if (!credentials[k]) {
        logger.warn(`[integrations:einvoice_bh] missing required field: ${k}`);
        return false;
      }
    }

    await setIntegrationConfig(this.type, {
      api_base_url: credentials.api_base_url.replace(/\/$/, ''),
      vat_number: credentials.vat_number,
      api_key: credentials.api_key,
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; details?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.api_base_url) {
      return { ok: false, error: 'بيانات الاعتماد غير مُهيّأة (API Base URL مطلوب)' };
    }

    try {
      const res = await fetchSafe(`${cfg.api_base_url}/taxpayer/profile`, {
        method: 'GET',
        headers: {
          'X-API-Key': cfg.api_key,
          Accept: 'application/json',
        },
      });

      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'مفتاح API غير صالح' };
      }
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status} — ${res.statusText}` };
      }

      const data = (await res.json()) as { vatNumber?: string; legalName?: string };
      return {
        ok: true,
        details: `متصل بهيئة الإيرادات البحرينية — الرقم الضريبي: ${data.vatNumber || cfg.vat_number}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في الاتصال بهيئة الإيرادات البحرينية',
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error || r.details };
  }
}

export const einvoiceBhProvider = new EinvoiceBhProvider();
