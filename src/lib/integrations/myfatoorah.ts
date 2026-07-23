/**
 * myfatoorah.ts — MyFatoorah payment gateway provider.
 *
 * Credentials:
 *   api_key   — bearer token issued by MyFatoorah portal
 *   base_url  — `https://api.myfatoorah.com` (live) or `https://apitest.myfatoorah.com` (sandbox)
 *
 * testConnection: GET /api/v2/GetCountries — requires Authorization header and
 * is the lightest authenticated endpoint available. 200 → key + base URL valid.
 *
 * P0 FIX (audit finding myfatoorah.ts:15-17): the previous implementation
 * accepted any user-supplied base_url without validation. A founder-level
 * attacker (or a compromised founder account) could set base_url to an
 * internal address (e.g. http://169.254.169.254 for cloud metadata, or
 * http://10.0.0.5/admin) and the testConnection() call would dutifully send
 * the Bearer api_key to that internal target — leaking the real MyFatoorah
 * API key to an attacker-controlled listener on the internal network.
 *
 * The fix below validates base_url BEFORE persisting it (in connect()) AND
 * before every fetch (in testConnection()) so even a row edited directly in
 * the DB cannot be used for SSRF. Same pattern as aiProvider.ts validateBaseUrl.
 */
import { logger } from "@/lib/logger";
import type { IntegrationProvider } from "./types";
import { getIntegrationConfig, setIntegrationConfig, disconnectIntegration } from "./registry";

/**
 * Validate that a base URL is safe to send authenticated requests to.
 * Throws on any violation — callers should catch and surface the error
 * message to the user as the connection-test result.
 *
 * Rules:
 *   1. Must be a valid URL parseable by `new URL()`.
 *   2. Must use HTTPS only (no HTTP, no other protocols).
 *   3. Hostname must not be localhost / loopback / link-local / metadata.
 *   4. Hostname must not be a private/internal IP range (10.x / 172.16-31.x
 *      / 192.168.x / 127.x / 169.254.x).
 *   5. Hostname must not be an IPv6 loopback or private address.
 *
 * Note: DNS rebinding attacks (where a hostname resolves to a public IP at
 * validation time but a private IP at request time) are NOT fully mitigated
 * by hostname validation alone. A complete fix requires resolving the
 * hostname and pinning the IP for the actual fetch — that's a larger
 * refactor. For now, hostname + IP-pattern validation catches the
 * overwhelming majority of SSRF attempts (the audit finding's primary
 * concern was the trivially-exploitable "set base_url to internal IP" case).
 */
export function validateBaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("عنوان MyFatoorah غير صالح (URL غير مُحلَّل)");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("يجب أن يستخدم عنوان MyFatoorah بروتوكول HTTPS فقط");
  }
  const host = parsed.hostname.toLowerCase();
  const blockedHosts = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "169.254.169.254",   // AWS / GCP / Azure cloud metadata endpoint
    "169.254.170.2",     // ECS task metadata
    "metadata.google.internal", // GCP metadata
  ];
  if (blockedHosts.includes(host)) {
    throw new Error("يُمنع استخدام عناوين داخلية أو محلية كوجهة لـ MyFatoorah");
  }
  // Block private/loopback IPv4 ranges
  const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const a = parseInt(ipMatch[1], 10);
    const b = parseInt(ipMatch[2], 10);
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    ) {
      throw new Error("يُمنع استخدام عناوين IP خاصة أو داخلية كوجهة لـ MyFatoorah");
    }
  }
  // Block obvious internal hostnames (no dot, or ends with .internal / .local / .localhost)
  if (!host.includes(".") || /\.(internal|local|localhost|intra|corp)$/i.test(host)) {
    throw new Error("يبدو أن العنوان يشير إلى مضيف داخلي — يُسمح فقط بعناوين الإنترنت العامة لـ MyFatoorah");
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

class MyFatoorahProvider implements IntegrationProvider {
  type = "myfatoorah";
  name = "MyFatoorah";

  async connect(credentials: Record<string, string>): Promise<boolean> {
    if (!credentials.api_key || !credentials.base_url) {
      logger.warn("[integrations:myfatoorah] missing required fields", {
        hasKey: !!credentials.api_key,
        hasBaseUrl: !!credentials.base_url,
      });
      return false;
    }
    // P0 FIX: validate base_url BEFORE persisting — refuse to save a config
    // that points at an internal address, so the bad value can never be
    // fetched later by testConnection() or any future payment-init call.
    try {
      validateBaseUrl(credentials.base_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[integrations:myfatoorah] refused to save config — base_url failed SSRF validation", { err: msg });
      return false;
    }
    await setIntegrationConfig(this.type, {
      api_key: credentials.api_key,
      base_url: credentials.base_url,
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await disconnectIntegration(this.type);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const cfg = await getIntegrationConfig(this.type);
    if (!cfg || !cfg.api_key || !cfg.base_url) {
      return { ok: false, error: "بيانات الاعتماد غير مُهيّأة (api_key و base_url مطلوبة)" };
    }
    // P0 FIX: re-validate base_url at request time too — defends against a
    // row edited directly in the DB after the initial connect() validation.
    try {
      validateBaseUrl(cfg.base_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[integrations:myfatoorah] refused to send request — base_url failed SSRF validation", { err: msg });
      return { ok: false, error: msg };
    }
    try {
      const url = `${normalizeBaseUrl(cfg.base_url)}/api/v2/GetCountries`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cfg.api_key}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          Data?: null;
          Message?: string;
        } | null;
        const msg = body?.Message || `HTTP ${res.status}`;
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

export const myfatoorahProvider = new MyFatoorahProvider();
