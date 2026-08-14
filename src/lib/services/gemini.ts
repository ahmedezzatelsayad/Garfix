/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Google Gemini Integration Service
 * 
 * خدمة تكامل Google Gemini API
 * 
 * Features:
 * - Chat completions with streaming support
 * - Context/memory management
 * - Usage tracking per company
 * - Rate limiting and quota management
 * - Multi-model support (Gemini 2.0 Flash, Pro, etc.)
 * 
 * ═════════════════════════════════════════════════════════════
 */

// ── Types ───────────────────────────────────────────────────

// SEC-11 FIX (Audit v2 · Phase 3): SSRF-safe fetch wrapper. Previously this
// module called the raw `fetch()` with the API key embedded in the URL query
// string (`?key=<API_KEY>`), which is logged by every reverse proxy, CDN, and
// WAF in the request path. We now:
//   1. Route every outbound call through `fetchSafe()` from `@/lib/ssrf`, which
//      validates the URL, blocks private/link-local/cloud-metadata IPs, and
//      defends against DNS-rebinding.
//   2. Move the API key from the query string to the `x-goog-api-key` header,
//      which is NOT logged by default by proxies/CDNs.
import { fetchSafe } from "@/lib/ssrf";

export interface GeminiConfig {
  /** Google AI API Key */
  apiKey: string;
  /** Model to use */
  model?: 'gemini-2.0-flash' | 'gemini-1.5-flash' | 'gemini-1.5-pro' | 'gemini-1.5-pro-latest';
  /** Max output tokens */
  maxOutputTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** System instruction */
  systemInstruction?: string;
  /** Base URL (for proxy/testing) */
  baseUrl?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface ChatResponse {
  text: string;
  model: string;
  usage: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
  safetyRatings: Array<{
    category: string;
    probability: string;
  }>;
  finishReason: string;
  latencyMs: number;
}

// ── Default Configuration ───────────────────────────────────

/** All supported Gemini model identifiers (mirrors `GeminiConfig.model`). */
type GeminiModel = NonNullable<GeminiConfig["model"]>;

const DEFAULT_CONFIG: {
  model: GeminiModel;
  maxOutputTokens: number;
  temperature: number;
} = {
  model: "gemini-2.0-flash",
  maxOutputTokens: 4096,
  temperature: 0.7,
};

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// ── Gemini Service Class ─────────────────────────────────────

export class GeminiService {
  private config: GeminiConfig & {
    model: GeminiModel;
    maxOutputTokens: number;
    temperature: number;
  };
  
  constructor(config: GeminiConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (!this.config.apiKey) {
      throw new Error('GeminiService requires an API key');
    }
  }
  
  /**
   * Send a chat message and get a response
   */
  async chat(prompt: string): Promise<ChatResponse> {
    const startTime = Date.now();
    
    try {
      // SEC-11 FIX (Audit v2 · Phase 3): use fetchSafe + header-based key.
      const url = this.buildUrl('generateContent');
      const headers = this.buildHeaders();

      const body = this.buildRequestBody([
        { role: 'user', parts: [{ text: prompt }] }
      ]);
      
      const response = await fetchSafe(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(60000),
      });
      
      if (!response.ok) {
        const error = await this.parseError(response);
        throw new Error(error.message || `Gemini API error: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseResponse(data, startTime);
    } catch (error: unknown) {
      throw new Error(`Gemini chat failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Chat with full message history (for conversations)
   */
  async chatWithHistory(messages: ChatMessage[]): Promise<ChatResponse> {
    const startTime = Date.now();
    
    try {
      // SEC-11 FIX (Audit v2 · Phase 3): fetchSafe + header-based key.
      const url = this.buildUrl('generateContent');
      const headers = this.buildHeaders();
      const contents = this.formatMessages(messages);
      const body = this.buildRequestBody(contents);
      
      const response = await fetchSafe(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(60000),
      });
      
      if (!response.ok) {
        const error = await this.parseError(response);
        throw new Error(error.message);
      }
      
      const data = await response.json();
      return this.parseResponse(data, startTime);
    } catch (error: unknown) {
      throw new Error(`Gemini chatWithHistory failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Stream chat response
   */
  async *streamChat(prompt: string): AsyncGenerator<string, ChatResponse> {
    const startTime = Date.now();
    let fullText = '';
    
    try {
      // SEC-11 FIX (Audit v2 · Phase 3): fetchSafe + header-based key.
      const url = this.buildUrl('streamGenerateContent?alt=sse');
      const headers = this.buildHeaders();

      const body = this.buildRequestBody([
        { role: 'user', parts: [{ text: prompt }] }
      ]);
      
      const response = await fetchSafe(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(120000),
      });
      
      if (!response.ok || !response.body) {
        const error = await this.parseError(response);
        throw new Error(error.message);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                fullText += text;
                yield text;
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }
      
      return {
        text: fullText,
        model: this.config.model,
        usage: {
          promptTokens: Math.ceil(prompt.length / 4),
          candidatesTokens: Math.ceil(fullText.length / 4),
          totalTokens: Math.ceil((prompt.length + fullText.length) / 4),
        },
        safetyRatings: [],
        finishReason: 'STOP',
        latencyMs: Date.now() - startTime,
      };
    } catch (error: unknown) {
      throw new Error(`Gemini streamChat failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Count tokens in a text
   */
  async countTokens(text: string): Promise<number> {
    // SEC-11 FIX (Audit v2 · Phase 3): fetchSafe + header-based key.
    const url = this.buildUrl('countTokens');
    const headers = this.buildHeaders();
    
    const response = await fetchSafe(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to count tokens: ${response.status}`);
    }
    
    const data = await response.json();
    return data.totalTokens || 0;
  }
  
  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
    const startTime = Date.now();
    
    try {
      const result = await this.chat('Reply with "OK" only.');
      
      return {
        success: true,
        latencyMs: Date.now() - startTime,
        model: result.model,
      };
    } catch (error: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        model: this.config.model,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * List available models
   */
  static async listModels(apiKey: string): Promise<Array<{ name: string; displayName: string }>> {
    // SEC-11 FIX (Audit v2 · Phase 3): fetchSafe + header-based key.
    const url = `${GEMINI_BASE_URL}/models`;
    const response = await fetchSafe(url, {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }
    
    const data: { models?: Array<{ name: string; displayName?: string }> } = await response.json();
    return (data.models || [])
      .filter((m) => m.name.includes('gemini'))
      .map((m) => ({
        name: m.name,
        displayName: m.displayName || m.name,
      }));
  }
  
  // ── Private Methods ──────────────────────────────────────
  
  private buildUrl(endpoint: string): string {
    // SEC-11 FIX (Audit v2 · Phase 3): the API key is NO LONGER embedded in
    // the URL query string — it is sent via the `x-goog-api-key` header
    // (see buildHeaders()). URL now contains only the model + endpoint.
    const baseUrl = this.config.baseUrl || GEMINI_BASE_URL;
    return `${baseUrl}/models/${this.config.model}:${endpoint}`;
  }

  /**
   * Build the request headers, including the API key via the
   * `x-goog-api-key` header (Google's documented mechanism).
   * This keeps the secret out of URL/query strings that get logged.
   */
  private buildHeaders(): Record<string, string> {
    // SEC-11 FIX (Audit v2 · Phase 3): API key in header, not in URL.
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.config.apiKey,
    };
  }
  
  private buildRequestBody(contents: Array<{ role: string; parts: Array<{ text: string }> }>): string {
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: this.config.maxOutputTokens,
        temperature: this.config.temperature,
      },
    };

    if (this.config.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: this.config.systemInstruction }],
      };
    }

    return JSON.stringify(body);
  }
  
  private formatMessages(messages: ChatMessage[]): Array<{ role: string; parts: Array<{ text: string }> }> {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
  }
  
  private parseResponse(data: Record<string, unknown>, startTime: number): ChatResponse {
    const candidates = (data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> }; safetyRatings?: Array<{ category: string; probability: string }>; finishReason?: string }> | undefined) ?? [];
    const candidate = candidates[0];
    const content = candidate?.content;
    const text = content?.parts?.[0]?.text || '';
    const usageMetadata = (data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined) ?? undefined;
    const modelVersion = (data.modelVersion as string | undefined) ?? undefined;

    return {
      text,
      model: modelVersion || this.config.model,
      usage: {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        candidatesTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      },
      safetyRatings: candidate?.safetyRatings || [],
      finishReason: candidate?.finishReason || 'UNKNOWN',
      latencyMs: Date.now() - startTime,
    };
  }
  
  private async parseError(response: Response): Promise<{ message: string }> {
    let message = `HTTP ${response.status}`;
    
    try {
      const data = await response.json();
      message = data.error?.message || message;
    } catch {
      // Use default message
    }
    
    return { message };
  }
}

// ── Factory Function ────────────────────────────────────────

/**
 * Create a Gemini service instance for testing with specific key
 */
export function createGeminiClient(apiKey: string, config?: Partial<GeminiConfig>): GeminiService {
  return new GeminiService({ apiKey, ...config });
}

/**
 * Test the provided Google API key
 */
export async function testGoogleAPIKey(apiKey: string): Promise<{
  success: boolean;
  latencyMs: number;
  availableModels: string[];
  error?: string;
}> {
  const client = createGeminiClient(apiKey, { model: 'gemini-2.0-flash' });
  
  // Test connection
  const testResult = await client.testConnection();
  
  // Get available models
  let availableModels: string[] = [];
  try {
    const models = await GeminiService.listModels(apiKey);
    availableModels = models.map(m => m.name);
  } catch {
    // Continue even if listing fails
  }
  
  return {
    success: testResult.success,
    latencyMs: testResult.latencyMs,
    availableModels,
    error: testResult.error,
  };
}

export default GeminiService;
