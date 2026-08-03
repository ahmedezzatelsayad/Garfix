/**
 * sendgrid.ts — SendGrid email service provider.
 *
 * SendGrid is a cloud-based email delivery service for transactional and
 * marketing email. This provider supports:
 *   - API key authentication
 *   - Connection testing via SendGrid API
 *   - Template-based emails (invoices, receipts)
 *
 * Credentials:
 *   api_key              — SendGrid API key (starts with SG.)
 *   from_email           — Default sender email address
 *   from_name            — Default sender display name
 *   template_invoice_id  — SendGrid template ID for invoices
 *   template_receipt_id  — SendGrid template ID for receipts
 *
 * Test: GET /user/profile — validates API key by fetching account info.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

// ─── SendGrid API client ──────────────────────────────────────────────────

const SENDGRID_API_BASE = 'https://api.sendgrid.com/v3';

/**
 * Validate SendGrid API key format (basic check).
 */
function validateApiKey(key: string): boolean {
  // SendGrid keys start with 'SG.' and are typically 69+ characters
  return typeof key === 'string' && key.startsWith('SG.') && key.length >= 20;
}

// ─── SendGrid Integration Provider ────────────────────────────────────────

class SendGridProvider implements IntegrationProvider {
  type = 'sendgrid';
  name = 'SendGrid';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.api_key) {
      logger.warn('[integrations:sendgrid] missing required field: api_key');
      return false;
    }

    // Basic format validation before saving
    if (!validateApiKey(credentials.api_key)) {
      logger.warn('[integrations:sendgrid] invalid API key format (should start with SG.)');
      // Don't block save — user might have a valid key in different format
      // but log a warning for debugging
    }

    await setIntegrationConfig(this.type, {
      api_key: credentials.api_key,
      from_email: credentials.from_email || 'noreply@garfix.app',
      from_name: credentials.from_name || 'GarfiX ERP',
      template_invoice_id: credentials.template_invoice_id || '',
      template_receipt_id: credentials.template_receipt_id || '',
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; details?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.api_key) {
      return { ok: false, error: 'بيانات الاعتماد غير مُهيّأة (API Key مطلوب لـ SendGrid)' };
    }

    try {
      const res = await fetch(`${SENDGRID_API_BASE}/user/profile`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cfg.api_key}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        // Parse error response for more details
        const body = (await res.json().catch(() => null)) as {
          errors?: Array<{ message?: string }>;
        } | null;
        const msg = body?.errors?.[0]?.message || `HTTP ${res.status} — ${res.statusText}`;
        return { ok: false, error: msg };
      }

      const data = (await res.json()) as {
        email?: string;
        account_type?: string;
        username?: string;
      };

      return {
        ok: true,
        details: `Connected as ${data.email || data.username || 'SendGrid user'}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ SendGrid',
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error || r.details };
  }

  /**
   * Send a transactional email using SendGrid.
   * Used by automation engine's send_email action.
   */
  async sendEmail(params: {
    to: string;
    subject: string;
    body: textOrHtml;
    templateId?: string;
    dynamicData?: Record<string, unknown>;
  }): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.api_key) {
      return { ok: false, error: 'SendGrid credentials not configured' };
    }

    try {
      let payload: Record<string, unknown>;

      if (params.templateId && params.dynamicData) {
        // Template-based email
        payload = {
          personalizations: [
            {
              to: [{ email: params.to }],
              dynamic_template_data: params.dynamicData,
            },
          ],
          from: {
            email: cfg.from_email || 'noreply@garfix.app',
            name: cfg.from_name || 'GarfiX ERP',
          },
          template_id: params.templateId,
        };
      } else {
        // Plain/HTML email
        payload = {
          personalizations: [
            {
              to: [{ email: params.to }],
              subject: params.subject,
            },
          ],
          from: {
            email: cfg.from_email || 'noreply@garfix.app',
            name: cfg.from_name || 'GarfiX ERP',
          },
          content: [
            {
              type: 'text/plain',
              value: typeof params.body === 'object' ? params.body.text : params.body,
            },
            ...(typeof params.body === 'object' && params.body.html
              ? [{ type: 'text/html', value: params.body.html }]
              : []),
          ],
        };
      }

      const res = await fetch(`${SENDGRID_API_BASE}/mail/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          errors?: Array<{ message?: string }>;
        } | null;
        const errMsg = errBody?.errors?.[0]?.message || `HTTP ${res.status}`;
        return { ok: false, error: errMsg };
      }

      // Extract message ID from headers
      const messageId = res.headers.get('X-Message-Id') || undefined;

      return { ok: true, messageId };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في إرسال البريد الإلكتروني',
      };
    }
  }
}

export interface textOrHtml {
  text: string;
  html?: string;
}

export const sendgridProvider = new SendGridProvider();
