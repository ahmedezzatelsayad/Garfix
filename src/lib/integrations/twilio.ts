/**
 * twilio.ts — Twilio SMS/WhatsApp service provider.
 *
 * Twilio is a cloud communications platform for SMS, voice, and WhatsApp.
 * This provider supports:
 *   - Account SID + Auth Token authentication
 *   - SMS sending for verification and notifications
 *   - Optional WhatsApp Business API via Twilio
 *
 * Credentials:
 *   account_sid   — Twilio Account SID (starts with AC)
 *   auth_token    — Twilio Auth Token
 *   phone_number  — Twilio phone number in E.164 format (+1234567890)
 *   use_whatsapp  — Enable WhatsApp messaging (boolean)
 *
 * Test: GET /Accounts/{AccountSid}.json — validates credentials by fetching account info.
 *
 * Security: Phone number validated as E.164 format before saving.
 *
 * RUNTIME: Node.js only — uses fetch, logger, cryptoVault
 */
'use node';

import { logger } from '@/lib/logger';
import type { IntegrationProvider } from './types';
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from './registry';

// ─── Twilio API client ────────────────────────────────────────────────────

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * Validate E.164 phone number format (basic check).
 */
function validatePhoneNumber(phone: string): boolean {
  // E.164 format: starts with +, followed by 10-15 digits
  return typeof phone === 'string' && /^\+[1-9]\d{6,14}$/.test(phone);
}

/**
 * Validate Twilio Account SID format.
 */
function validateAccountSid(sid: string): boolean {
  // Twilio SIDs start with 'AC' followed by 32 hex characters
  return typeof sid === 'string' && /^AC[a-fA-F0-9]{32}$/.test(sid);
}

// ─── Twilio Integration Provider ──────────────────────────────────────────

class TwilioProvider implements IntegrationProvider {
  type = 'twilio';
  name = 'Twilio';

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.account_sid || !credentials.auth_token) {
      logger.warn('[integrations:twilio] missing required fields', {
        hasSid: !!credentials.account_sid,
        hasToken: !!credentials.auth_token,
      });
      return false;
    }

    // Validate formats
    if (!validateAccountSid(credentials.account_sid)) {
      logger.warn('[integrations:twilio] invalid Account SID format');
    }

    if (credentials.phone_number && !validatePhoneNumber(credentials.phone_number)) {
      logger.warn('[integrations:twilio] invalid phone number format (should be E.164)');
      return false;
    }

    await setIntegrationConfig(this.type, {
      account_sid: credentials.account_sid,
      auth_token: credentials.auth_token,
      phone_number: credentials.phone_number || '',
      use_whatsapp: credentials.use_whatsapp === 'true' ? 'true' : 'false',
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; details?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.account_sid || !cfg.auth_token) {
      return { ok: false, error: 'بيانات الاعتماد غير مُهيّأة (Account SID و Auth Token مطلوبة لـ Twilio)' };
    }

    try {
      // Use Basic auth with Account SID:Auth Token
      const basicAuth = Buffer.from(`${cfg.account_sid}:${cfg.auth_token}`).toString('base64');
      
      const res = await fetch(`${TWILIO_API_BASE}/Accounts/${cfg.account_sid}.json`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
          code?: number;
        } | null;
        const msg = body?.message || `HTTP ${res.status} — ${res.statusText}`;
        return { ok: false, error: msg };
      }

      const data = (await res.json()) as {
        friendly_name?: string;
        type?: string;
        status?: string;
        subresource_uris?: Record<string, string>;
      };

      return {
        ok: true,
        details: `Connected to "${data.friendly_name || cfg.account_sid}" (${data.type || 'account'})`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في الاتصال بـ Twilio',
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error || r.details };
  }

  /**
   * Send an SMS message.
   * Used by automation engine's send_sms action.
   */
  async sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string; sid?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.account_sid || !cfg.auth_token || !cfg.phone_number) {
      return { ok: false, error: 'Twilio credentials not configured or no phone number set' };
    }

    try {
      const params = new URLSearchParams({
        To: to,
        From: cfg.phone_number,
        Body: body,
      });

      const res = await fetch(
        `${TWILIO_API_BASE}/Accounts/${cfg.account_sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${cfg.account_sid}:${cfg.auth_token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const data = (await res.json()) as {
        sid?: string;
        status?: string;
        message?: string;
        code?: number;
      };

      if (!res.ok || data.code) {
        return { ok: false, error: data.message || `Twilio error: HTTP ${res.status}` };
      }

      return { ok: true, sid: data.sid };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في إرسال الرسالة النصية',
      };
    }
  }

  /**
   * Send a WhatsApp message (if enabled).
   */
  async sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; error?: string; sid?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || cfg.use_whatsapp !== 'true') {
      return { ok: false, error: 'WhatsApp not enabled for this integration' };
    }
    if (!cfg.phone_number) {
      return { ok: false, error: 'No WhatsApp-enabled phone number configured' };
    }

    try {
      // For WhatsApp, we prefix the "From" with "whatsapp:"
      const params = new URLSearchParams({
        To: `whatsapp:${to.replace('+', '')}`, // Remove + for WhatsApp format
        From: `whatsapp:${cfg.phone_number.replace('+', '')}`,
        Body: body,
      });

      const res = await fetch(
        `${TWILIO_API_BASE}/Accounts/${cfg.account_sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${cfg.account_sid}:${cfg.auth_token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const data = (await res.json()) as {
        sid?: string;
        status?: string;
        message?: string;
        code?: number;
      };

      if (!res.ok || data.code) {
        return { ok: false, error: data.message || `WhatsApp error: HTTP ${res.status}` };
      }

      return { ok: true, sid: data.sid };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'خطأ في إرسال رسالة واتساب',
      };
    }
  }
}

export const twilioProvider = new TwilioProvider();
