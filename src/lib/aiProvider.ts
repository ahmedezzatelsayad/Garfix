/**
 * aiProvider.ts — Unified AI Provider Abstraction Layer.
 *
 * Replaces the hardcoded z-ai-web-dev-sdk calls with a provider-agnostic
 * interface that supports: OpenRouter, Anthropic, OpenAI, Google Gemini,
 * z-ai/GLM, and any OpenAI-compatible endpoint.
 *
 * Features:
 *   - Fallback chain: if primary provider fails, try the next
 *   - Encrypted API key storage via cryptoVault
 *   - Test connection per provider
 *   - Config stored in PlatformSetting table (editable by founder)
 *
 * Usage:
 *   import { getAiClient, callAI } from "@/lib/aiProvider";
 *   const result = await callAI({ messages, companySlug });
 */

import { db } from "./db";
import { decryptSecret, encryptSecret } from "./cryptoVault";
import { logger } from "./logger";
import { z } from "zod";

// P0 FIX (audit finding: missing timeout on AI external API calls):
// All AI provider HTTP calls now go through `fetchWithTimeout`. A hung
// upstream (slow model, network stall, deepseek-r1 thinking for minutes)
// used to keep a server connection open indefinitely, exhausting the
// connection pool under load. 60s is the upper bound — most calls finish
// in <10s, so 60s gives plenty of slack for slow reasoning models while
// still bounding the worst case.
const DEFAULT_AI_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_AI_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`AI request timed out after ${timeoutMs}ms — ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// SEC-006 FIX: SSRF protection for custom AI endpoints
function validateBaseUrl(url: string): void {
  const parsed = new URL(url);
  if (!["https:"].includes(parsed.protocol)) {
    throw new Error("Custom AI endpoint must use HTTPS");
  }
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "::1", "[::1]"];
  if (blockedHosts.includes(parsed.hostname)) {
    throw new Error("Internal addresses are not allowed for custom AI endpoint");
  }
  // Block private IP ranges (RFC 1918) — proper CIDR checks
  // FIX: Previously blocked ALL 172.x.x.x and 192.x.x.x, which incorrectly
  // blocked public IPs like 172.5.1.2 (only 172.16-31 is private per RFC 1918)
  const ipMatch = parsed.hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const [, a, b] = ipMatch;
    const first = parseInt(a), second = parseInt(b);
    // 10.0.0.0/8 — all 10.x.x.x is private
    if (first === 10) throw new Error("Private/internal IP addresses are not allowed for custom AI endpoint");
    // 172.16.0.0/12 — only 172.16-31.x.x is private (172.0-15 and 172.32-255 are PUBLIC)
    if (first === 172 && second >= 16 && second <= 31) throw new Error("Private/internal IP addresses are not allowed for custom AI endpoint");
    // 192.168.0.0/16 — only 192.168.x.x is private (192.0-167 and 192.169-255 are PUBLIC)
    if (first === 192 && second === 168) throw new Error("Private/internal IP addresses are not allowed for custom AI endpoint");
    // 127.0.0.0/8 — loopback
    if (first === 127) throw new Error("Loopback addresses are not allowed for custom AI endpoint");
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProviderType = "z-ai" | "openrouter" | "anthropic" | "openai" | "gemini" | "deepseek" | "custom";

export interface AiProviderConfig {
  provider: ProviderType;
  apiKey: string | null; // decrypted
  model: string;
  baseUrl?: string; // for custom OpenAI-compatible
  isEnabled: boolean;
  priority: number; // 1 = primary, 2 = first fallback, etc.
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  companySlug?: string;
}

export interface ChatResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  provider: ProviderType;
  model: string;
}

export interface AiProvider {
  type: ProviderType;
  name: string;
  chat(options: ChatOptions): Promise<ChatResult>;
  testConnection(): Promise<boolean>;
}

// ─── Provider implementations ───────────────────────────────────────────────

/** z-ai / GLM provider — uses z-ai-web-dev-sdk (no API key needed in sandbox) */
class ZaiProvider implements AiProvider {
  type: ProviderType = "z-ai";
  name = "z-ai / GLM";
  private config: AiProviderConfig;

  constructor(config: AiProviderConfig) { this.config = config; }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const ai = await ZAI.create();
    const completion = await ai.chat.completions.create({
      messages: options.messages.map(m => ({
        role: m.role,
        content: m.content as string,
      })),
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 800,
    });
    return {
      content: completion.choices?.[0]?.message?.content || "",
      usage: completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      provider: this.type,
      model: this.config.model || "z-ai-glm",
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.chat({ messages: [{ role: "user", content: "ping" }] });
      return !!result.content;
    } catch { return false; }
  }
}

/** OpenAI-compatible provider — works for OpenAI, OpenRouter, DeepSeek, and custom endpoints */
class OpenAICompatibleProvider implements AiProvider {
  type: ProviderType;
  name: string;
  private config: AiProviderConfig;

  constructor(config: AiProviderConfig, type: ProviderType, name: string) {
    this.config = config;
    this.type = type;
    this.name = name;
  }

  private getBaseUrl(): string {
    switch (this.type) {
      case "openrouter": return "https://openrouter.ai/api/v1";
      case "openai": return "https://api.openai.com/v1";
      case "deepseek": return "https://api.deepseek.com/v1";
      case "gemini": return "https://generativelanguage.googleapis.com/v1beta/openai";
      case "custom": {
        // SEC-006 FIX: SSRF protection — validate custom baseUrl
        const url = this.config.baseUrl || "";
        if (url) validateBaseUrl(url);
        return url;
      }
      default: return "";
    }
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.config.apiKey) throw new Error(`No API key for ${this.name}`);

    const baseUrl = this.getBaseUrl();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.config.apiKey}`,
    };

    // OpenRouter-specific headers
    if (this.type === "openrouter") {
      headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
      headers["X-Title"] = "GarfiX ERP";
    }

    // DeepSeek-specific: supports frequency_penalty and other params
    // (no extra headers needed — uses standard Bearer auth like OpenAI)

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: options.messages.map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : m.content,
      })),
      temperature: options.temperature ?? 0.4,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;

    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      60_000, // P0 FIX (audit finding: missing timeout on AI external calls)
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${this.name} API error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      provider: this.type,
      model: this.config.model,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.chat({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5,
      });
      return !!result.content;
    } catch { return false; }
  }
}

/** Anthropic (Claude) provider — uses Anthropic Messages API directly */
class AnthropicProvider implements AiProvider {
  type: ProviderType = "anthropic";
  name = "Anthropic (Claude)";
  private config: AiProviderConfig;

  constructor(config: AiProviderConfig) { this.config = config; }

  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.config.apiKey) throw new Error("No Anthropic API key");

    // Extract system message
    const systemMsg = options.messages.find(m => m.role === "system");
    const chatMessages = options.messages.filter(m => m.role !== "system");

    const res = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: options.maxTokens ?? 800,
          system: typeof systemMsg?.content === "string" ? systemMsg.content : "",
          messages: chatMessages.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          })),
        }),
      },
      60_000, // P0 FIX: timeout on AI external calls
    );

    if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);

    const data = await res.json();
    const content = data.content?.[0]?.text || "";
    return {
      content,
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      provider: this.type,
      model: this.config.model,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.chat({ messages: [{ role: "user", content: "ping" }], maxTokens: 5 });
      return !!result.content;
    } catch { return false; }
  }
}

// ─── Config resolution ──────────────────────────────────────────────────────

let cachedConfig: AiProviderConfig[] | null = null;
let cacheExpiry = 0;

/**
 * Get the ordered list of AI providers from PlatformSetting.
 * Falls back to z-ai/GLM if no providers configured.
 */
export async function getAiProviders(): Promise<AiProviderConfig[]> {
  if (cachedConfig && Date.now() < cacheExpiry) return cachedConfig;

  try {
    const settings = await db.platformSettings.findMany({
      where: { key: { startsWith: "ai.provider." } },
    });

    if (settings.length === 0) {
      // Default: z-ai only
      return [{
        provider: "z-ai",
        apiKey: null,
        model: "z-ai-glm",
        isEnabled: true,
        priority: 1,
      }];
    }

    // Parse provider configs from settings
    const providers: AiProviderConfig[] = [];
    const providerMap = new Map<string, Record<string, unknown>>();

    for (const s of settings) {
      // Keys: ai.provider.{type}.{field} = ai.provider.openrouter.apiKey, etc.
      const parts = s.key.split(".");
      if (parts.length < 4) continue;
      const pType = parts[2] as ProviderType;
      const field = parts[3];

      if (!providerMap.has(pType)) providerMap.set(pType, { provider: pType, isEnabled: false, priority: 99 });
      const entry = providerMap.get(pType)!;
      try {
        const val = JSON.parse(s.value);
        if (field === "apiKey" && typeof val === "string") {
          entry.apiKey = decryptSecret(val);
        } else if (field === "model") {
          entry.model = val;
        } else if (field === "baseUrl") {
          entry.baseUrl = val;
        } else if (field === "isEnabled") {
          entry.isEnabled = val === true;
        } else if (field === "priority") {
          entry.priority = typeof val === "number" ? val : 99;
        }
      } catch { /* skip malformed */ }
    }

    for (const [, entry] of providerMap) {
      providers.push(entry as unknown as AiProviderConfig);
    }

    // Sort by priority
    providers.sort((a, b) => a.priority - b.priority);

    // If no enabled providers, fall back to z-ai
    if (providers.filter(p => p.isEnabled).length === 0) {
      providers.unshift({
        provider: "z-ai", apiKey: null, model: "z-ai-glm",
        isEnabled: true, priority: 0,
      });
    }

    cachedConfig = providers;
    cacheExpiry = Date.now() + 300_000; // 5 min cache (PERF-005 FIX: was 1 min)
    return providers;
  } catch (err) {
    logger.error("[aiProvider] failed to load config", { err: err instanceof Error ? err.message : String(err) });
    return [{
      provider: "z-ai", apiKey: null, model: "z-ai-glm",
      isEnabled: true, priority: 1,
    }];
  }
}

/** Invalidate the cached provider config — call after founder edits settings */
export function invalidateAiProviderCache(): void {
  cachedConfig = null;
  cacheExpiry = 0;
}

/** Create the appropriate provider instance from config */
function createProvider(config: AiProviderConfig): AiProvider | null {
  if (!config.isEnabled) return null;
  switch (config.provider) {
    case "z-ai": return new ZaiProvider(config);
    case "openrouter": return new OpenAICompatibleProvider(config, "openrouter", "OpenRouter");
    case "openai": return new OpenAICompatibleProvider(config, "openai", "OpenAI");
    case "anthropic": return new AnthropicProvider(config);
    case "gemini": return new OpenAICompatibleProvider(config, "gemini", "Google Gemini");
    case "deepseek": return new OpenAICompatibleProvider(config, "deepseek", "DeepSeek");
    case "custom": return new OpenAICompatibleProvider(config, "custom", "Custom");
    default: return null;
  }
}

/**
 * Call AI with automatic fallback chain.
 * Tries providers in priority order until one succeeds.
 */
export async function callAI(options: ChatOptions): Promise<ChatResult> {
  const providers = await getAiProviders();

  for (const config of providers) {
    const provider = createProvider(config);
    if (!provider) continue;

    try {
      logger.debug("[aiProvider] calling provider", { provider: config.provider, model: config.model });
      const result = await provider.chat(options);
      logger.info("[aiProvider] success", { provider: result.provider, tokens: result.usage.total_tokens });
      return result;
    } catch (err) {
      logger.warn("[aiProvider] provider failed — trying fallback", { provider: config.provider, err: err instanceof Error ? err.message : String(err) });
      continue;
    }
  }

  // All providers failed
  throw new Error("جميع مزودي الذكاء الاصطناعي فشلوا. تحقق من الإعدادات.");
}

/**
 * Call ONE specific provider — no fallback chain.
 *
 * Used by the AI Orchestration Layer's Smart Router, which manages its own
 * fallback chain across registry models. Throws on failure so the caller can
 * catch and escalate to the next model.
 *
 * The config is fully resolved by the caller (provider + decrypted apiKey +
 * model + baseUrl). This function just instantiates the provider and calls it.
 */
export async function callSingleProvider(
  config: AiProviderConfig,
  options: ChatOptions,
): Promise<ChatResult> {
  const provider = createProvider({ ...config, isEnabled: true });
  if (!provider) {
    throw new Error(`Provider ${config.provider} could not be instantiated`);
  }
  logger.debug("[aiProvider] calling single provider", {
    provider: config.provider,
    model: config.model,
  });
  const result = await provider.chat(options);
  logger.info("[aiProvider] single-provider success", {
    provider: result.provider,
    model: result.model,
    tokens: result.usage.total_tokens,
  });
  return result;
}

/**
 * Test a specific provider's connection.
 * Used by the admin UI "test connection" button.
 *
 * Tests regardless of `isEnabled` state so the founder can validate
 * credentials before activating a provider.
 */
export async function testProviderConnection(providerType: ProviderType): Promise<{ ok: boolean; error?: string }> {
  const providers = await getAiProviders();
  const config = providers.find(p => p.provider === providerType);

  // If the provider is configured (even disabled), use that config.
  // Otherwise fall back to PROVIDER_INFO defaults so a key can be tested
  // even before any setting has been written.
  let resolved: AiProviderConfig;
  if (config) {
    resolved = { ...config, isEnabled: true };
  } else {
    const info = PROVIDER_INFO.find(p => p.type === providerType);
    if (!info) return { ok: false, error: "Unknown provider" };
    resolved = {
      provider: providerType,
      apiKey: null,
      model: info.defaultModel,
      isEnabled: true,
      priority: 99,
    };
  }

  const provider = createProvider(resolved);
  if (!provider) return { ok: false, error: "Provider not configured" };

  try {
    const ok = await provider.testConnection();
    return { ok, error: ok ? undefined : "Connection failed" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "Connection failed",
    };
  }
}

/**
 * Save a provider's API key (encrypted) to PlatformSetting.
 */
export async function setProviderApiKey(providerType: ProviderType, apiKey: string): Promise<void> {
  const encrypted = encryptSecret(apiKey);
  const key = `ai.provider.${providerType}.apiKey`;

  const existing = await db.platformSettings.findUnique({ where: { key } });
  if (existing) {
    await db.platformSettings.update({ where: { key }, data: { value: JSON.stringify(encrypted), updatedAt: new Date() } });
  } else {
    await db.platformSettings.create({ data: { key, category: "ai", valueType: "string", value: JSON.stringify(encrypted) } });
  }

  // Log to history
  await db.platformSettingsHistory.create({
    data: { settingKey: key, newValue: "[encrypted]", changedBy: "system" },
  });

  invalidateAiProviderCache();
  logger.info("[aiProvider] API key updated", { provider: providerType });
}

/**
 * Set the provider's model.
 */
export async function setProviderModel(providerType: ProviderType, model: string): Promise<void> {
  const key = `ai.provider.${providerType}.model`;
  const existing = await db.platformSettings.findUnique({ where: { key } });
  if (existing) {
    await db.platformSettings.update({ where: { key }, data: { value: JSON.stringify(model), updatedAt: new Date() } });
  } else {
    await db.platformSettings.create({ data: { key, category: "ai", valueType: "string", value: JSON.stringify(model) } });
  }
  invalidateAiProviderCache();
}

/**
 * Enable/disable a provider.
 */
export async function setProviderEnabled(providerType: ProviderType, isEnabled: boolean): Promise<void> {
  const key = `ai.provider.${providerType}.isEnabled`;
  const existing = await db.platformSettings.findUnique({ where: { key } });
  if (existing) {
    await db.platformSettings.update({ where: { key }, data: { value: JSON.stringify(isEnabled), updatedAt: new Date() } });
  } else {
    await db.platformSettings.create({ data: { key, category: "ai", valueType: "boolean", value: JSON.stringify(isEnabled) } });
  }
  invalidateAiProviderCache();
}

/**
 * Set provider priority (for fallback ordering).
 */
export async function setProviderPriority(providerType: ProviderType, priority: number): Promise<void> {
  const key = `ai.provider.${providerType}.priority`;
  const existing = await db.platformSettings.findUnique({ where: { key } });
  if (existing) {
    await db.platformSettings.update({ where: { key }, data: { value: JSON.stringify(priority), updatedAt: new Date() } });
  } else {
    await db.platformSettings.create({ data: { key, category: "ai", valueType: "number", value: JSON.stringify(priority) } });
  }
  invalidateAiProviderCache();
}

export const PROVIDER_INFO: Array<{ type: ProviderType; name: string; description: string; defaultModel: string; keyPrefix: string }> = [
  { type: "z-ai", name: "z-ai / GLM", description: "المزود الافتراضي — لا يحتاج مفتاح API في بيئة التطوير", defaultModel: "z-ai-glm", keyPrefix: "" },
  { type: "openrouter", name: "OpenRouter", description: "بوابة لعشرات الموديلات بمفتاح واحد (Claude, GPT, Gemini, Llama...)", defaultModel: "anthropic/claude-3.5-haiku", keyPrefix: "sk-or-" },
  { type: "anthropic", name: "Anthropic (Claude)", description: "مباشر من Anthropic — أفضل جودة للعربية", defaultModel: "claude-3-5-haiku-20241022", keyPrefix: "sk-ant-" },
  { type: "openai", name: "OpenAI (GPT)", description: "مباشر من OpenAI", defaultModel: "gpt-4o-mini", keyPrefix: "sk-" },
  { type: "deepseek", name: "DeepSeek", description: "مباشر من DeepSeek — موديلات V3 و R1 بسعر منخفض جداً وجودة عالية", defaultModel: "deepseek-chat", keyPrefix: "sk-" },
  { type: "gemini", name: "Google Gemini", description: "مباشر من Google (عبر OpenAI-compatible API)", defaultModel: "gemini-1.5-flash", keyPrefix: "AIza" },
  { type: "custom", name: "مزود مخصص", description: "أي endpoint متوافق مع OpenAI API (self-hosted, Azure, etc.)", defaultModel: "", keyPrefix: "" },
];
