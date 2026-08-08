/**
 * einvoice_kw.ts — Kuwait Decree 10/2026 e-invoicing provider.
 *
 * Kuwait's Ministry of Finance published Decree 10/2026 mandating
 * e-invoicing in three phases:
 *   - Phase 1 (from 2026-Q1): voluntary registration on the e-invoicing portal
 *   - Phase 2 (from 2026-Q3): B2B large taxpayers must clear invoices
 *   - Phase 3 (from 2027-Q1): all taxpayers must clear invoices
 *
 * The portal exposes a REST API for invoice clearance. Taxpayers register
 * on the portal and receive a Client ID + Secret for API access.
 *
 * Reference: https://e-invoice.mof.kw (Arabic + English)
 *
 * Fields:
 *   api_base_url    — https://api.e-invoice.mof.kw (production) or sandbox
 *   client_id       — Issued by the MoF portal
 *   client_secret   — Issued by the MoF portal
 *   vat_number      — 12-digit Kuwait VAT (currently 0%; field ready for future)
 *   phase           — "phase_1" | "phase_2" | "phase_3" — informational
 *
 * Test: POST /oauth/token with client_credentials — returns a bearer token.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

class EinvoiceKwProvider implements IntegrationProvider {
  type = 'einvoice_kw';
  name = 'Kuwait Decree 10/2026 e-Invoicing';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    const required = ['api_base_url', 'client_id', 'client_secret'];
    for (const k of required) {
      if (!credentials[k]) {
        logger.warn(`[integrations:einvoice_kw] missing required field: ${k}`);
        return false;
      }
    }

    await setIntegrationConfig(this.type, {
      api_base_url: credentials.api_base_url.replace(/\/$/, ''),
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      vat_number: credentials.vat_number || '',
      phase: ['phase_1', 'phase_2', 'phase_3'].includes(credentials.phase)
        ? credentials.phase
        : 'phase_1',
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
        return { ok: false, error: 'استجابة غير متوقعة من البوابة — لا يوجد access_token' };
      }

      return {
        ok: true,
        details: `متصل ببوابة الكويت (${cfg.phase}) — العميل صالح`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في الاتصال ببوابة الكويت',
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error || r.details };
  }
}

export const einvoiceKwProvider = new EinvoiceKwProvider();
