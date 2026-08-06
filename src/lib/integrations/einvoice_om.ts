/**
 * einvoice_om.ts — Oman Tax Authority (TA) e-invoicing provider.
 *
 * Oman's Tax Authority announced the e-invoicing framework in 2024
 * and is rolling it out in phases through 2026-2027:
 *   - Phase 1: large taxpayers (voluntary clearance portal)
 *   - Phase 2: B2B clearance mandatory
 *   - Phase 3: B2C e-invoicing via POS integration
 *
 * Reference: https://www.taxoman.gov.om
 *
 * Fields:
 *   api_base_url     — TA API base URL
 *   client_id        — Issued by TA clearance portal
 *   client_secret    — Issued by TA clearance portal
 *   vat_number       — 15-digit Oman VAT (OM + 13 digits)
 *
 * Test: POST /oauth/token — exchange client credentials for a bearer token.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

class EinvoiceOmProvider implements IntegrationProvider {
  type = 'einvoice_om';
  name = 'Oman Tax Authority e-Invoicing';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    const required = ['api_base_url', 'client_id', 'client_secret'];
    for (const k of required) {
      if (!credentials[k]) {
        logger.warn(`[integrations:einvoice_om] missing required field: ${k}`);
        return false;
      }
    }

    await setIntegrationConfig(this.type, {
      api_base_url: credentials.api_base_url.replace(/\/$/, ''),
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      vat_number: credentials.vat_number || '',
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
      const url = `${cfg.api_base_url}/oauth/token`;
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
      });

      const res = await fetch(url, {
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
        return { ok: false, error: 'استجابة غير متوقعة من الهيئة — لا يوجد access_token' };
      }

      return {
        ok: true,
        details: `متصل بهيئة الضرائب العمانية — العميل صالح`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في الاتصال بهيئة الضرائب العمانية',
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error || r.details };
  }
}

export const einvoiceOmProvider = new EinvoiceOmProvider();
