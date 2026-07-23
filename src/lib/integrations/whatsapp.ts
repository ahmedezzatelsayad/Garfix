/**
 * whatsapp.ts — WhatsApp Cloud API provider.
 *
 * Credentials:
 *   phone_number_id — the WhatsApp Business phone number's numeric ID
 *   access_token    — Meta System User token with whatsapp_business_messaging
 *   verify_token    — arbitrary string configured on the webhook for verification
 *
 * testConnection: GET the phone_number_id — if 200, the token can read the
 * number, which is sufficient to attempt sending messages.
 */
import { logger } from "@/lib/logger";
import type { IntegrationProvider } from "./types";
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from "./registry";

const GRAPH_API_VERSION = "v18.0";

class WhatsAppProvider implements IntegrationProvider {
  type = "whatsapp";
  name = "WhatsApp Cloud API";

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.phone_number_id || !credentials.access_token) {
      logger.warn("[integrations:whatsapp] missing required fields", {
        hasPhone: !!credentials.phone_number_id,
        hasToken: !!credentials.access_token,
      });
      return false;
    }
    await setIntegrationConfig(this.type, credentials);
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.phone_number_id || !cfg.access_token) {
      return { ok: false, error: "بيانات الاعتماد غير مُهيّأة (phone_number_id و access_token مطلوبة)" };
    }
    try {
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${cfg.phone_number_id}?access_token=${encodeURIComponent(cfg.access_token)}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        const msg = body?.error?.message || `HTTP ${res.status}`;
        return { ok: false, error: msg };
      }
      const data = (await res.json()) as {
        display_phone_number?: string;
        verified_name?: string;
      };
      return {
        ok: true,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    const r = await this.testConnection();
    return { healthy: r.ok, details: r.error };
  }

  /**
   * Send a text message. Used by the automation engine's send_whatsapp action.
   * Returns true on success.
   */
  async sendTextMessage(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.phone_number_id || !cfg.access_token) {
      return { ok: false, error: "WhatsApp credentials not configured" };
    }
    try {
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${cfg.phone_number_id}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body },
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return { ok: false, error: errBody?.error?.message || `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const whatsappProvider = new WhatsAppProvider();
