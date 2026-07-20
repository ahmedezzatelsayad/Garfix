/**
 * meta_ads.ts — Meta (Facebook) Ads API provider.
 *
 * Credentials:
 *   access_token  — long-lived user or system user access token
 *   ad_account_id — act_<id> format (e.g. act_1234567890)
 *
 * testConnection: GET the ad account's basic fields. 200 + name returned → the
 * token has `ads_read` (or `ads_management`) scope and can access the account.
 */
import { logger } from "@/lib/logger";
import type { IntegrationProvider } from "./types";
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from "./registry";

const GRAPH_API_VERSION = "v18.0";

function normalizeAdAccountId(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

class MetaAdsProvider implements IntegrationProvider {
  type = "meta_ads";
  name = "Meta Ads";

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.access_token || !credentials.ad_account_id) {
      logger.warn("[integrations:meta_ads] missing required fields", {
        hasToken: !!credentials.access_token,
        hasAccountId: !!credentials.ad_account_id,
      });
      return false;
    }
    await setIntegrationConfig(this.type, {
      access_token: credentials.access_token,
      ad_account_id: credentials.ad_account_id,
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.access_token || !cfg.ad_account_id) {
      return { ok: false, error: "بيانات الاعتماد غير مُهيّأة (access_token و ad_account_id مطلوبة)" };
    }
    try {
      const accountId = normalizeAdAccountId(cfg.ad_account_id);
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}?fields=name,account_status,currency,timezone_name&access_token=${encodeURIComponent(cfg.access_token)}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        const msg = body?.error?.message || `HTTP ${res.status}`;
        return { ok: false, error: msg };
      }
      return { ok: true };
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
}

export const metaAdsProvider = new MetaAdsProvider();
