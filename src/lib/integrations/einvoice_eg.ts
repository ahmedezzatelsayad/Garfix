/**
 * einvoice_eg.ts — Egypt ETA (Egyptian Tax Authority) e-invoicing provider.
 *
 * ETA operates a JWT-based API:
 *   - Production portal: https://invoicing.eta.gov.eg
 *   - Production API:    https://api.invoicing.eta.gov.eg
 *   - Preprod portal:    https://preprod.invoicing.eta.gov.eg
 *   - Preprod API:       https://api.preprod.invoicing.eta.gov.eg
 *
 * Taxpayers issue a long-lived API bearer token from the ETA portal
 * (Settings → API Tokens → Generate). This token is sent as
 * `Authorization: Bearer <token>` on every submission.
 *
 * Test: GET /api/v1/documents/recent/1 — returns the latest submitted
 * document for the authenticated taxpayer. A 200 confirms the token
 * is valid and the company is registered for e-invoicing.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { fetchSafe } from "@/lib/ssrf";
import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

const ETA_API_BASE = {
  production: 'https://api.invoicing.eta.gov.eg',
  preprod: 'https://api.preprod.invoicing.eta.gov.eg',
} as const;

/**
 * Validate ETA JWT token format (basic).
 * ETA tokens are JWTs (header.payload.signature) — three base64url
 * segments separated by dots.
 */
function validateEtaToken(token: string): boolean {
  if (typeof token !== 'string' || token.length < 40) return false;
  const parts = token.split('.');
  return parts.length === 3;
}

class EtaEgyptProvider implements IntegrationProvider {
  type = 'einvoice_eg';
  name = 'Egypt ETA e-Invoicing';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.api_token) {
      logger.warn('[integrations:einvoice_eg] missing required field: api_token');
      return false;
    }

    if (!validateEtaToken(credentials.api_token)) {
      logger.warn('[integrations:einvoice_eg] token does not look like a JWT — saving anyway');
    }

    await setIntegrationConfig(this.type, {
      api_token: credentials.api_token,
      environment: credentials.environment === 'production' ? 'production' : 'preprod',
      vat_number: credentials.vat_number || '',
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; details?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.api_token) {
      return { ok: false, error: 'بيانات الاعتماد غير مُهيّأة (API Token مطلوب لـ ETA)' };
    }

    const base = ETA_API_BASE[cfg.environment === 'production' ? 'production' : 'preprod'];

    try {
      // ETA's lightweight endpoint — returns the most recent document
      const res = await fetchSafe(`${base}/api/v1/documents/recent/1`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cfg.api_token}`,
          Accept: 'application/json',
        },
      });

      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'رمز API غير صالح أو منتهي الصلاحية' };
      }
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status} — ${res.statusText}` };
      }

      return {
        ok: true,
        details: `متصل بـ ETA (${cfg.environment === 'production' ? 'إنتاج' : 'تجريبي'}) — الرمز صالح`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ ETA',
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error || r.details };
  }
}

export const einvoiceEgProvider = new EtaEgyptProvider();
