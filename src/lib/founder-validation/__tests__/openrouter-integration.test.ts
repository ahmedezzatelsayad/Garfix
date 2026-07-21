import { describe, it, expect, mock, afterEach } from 'bun:test';
import {
  callOpenRouter,
  selectFastestModel,
  calculateModelCost,
  OPENROUTER_MODELS,
  type OpenRouterResponse,
} from '../index';

// We mock fetch globally for all tests in this file
const originalFetch = globalThis.fetch;

function mockFetchResponse(data: Record<string, unknown>, status = 200, ok = true) {
  return mock(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    } as Response)
  );
}

function makeOpenRouterResponse(overrides: Partial<OpenRouterResponse> = {}): OpenRouterResponse {
  return {
    id: 'resp-test-123',
    model: 'deepseek/deepseek-chat',
    choices: [{
      message: { role: 'assistant', content: 'OK' },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 5,
      total_tokens: 55,
    },
    ...overrides,
  };
}

describe('callOpenRouter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should return correct structure with success=true', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    const result = await callOpenRouter('sk-test-key', 'Hello');
    expect(result.id).toBe('resp-test-123');
    expect(result.model).toBe('deepseek/deepseek-chat');
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].message.content).toBe('OK');
    expect(result.usage.prompt_tokens).toBe(50);
    expect(result.usage.completion_tokens).toBe(5);
    expect(result.usage.total_tokens).toBe(55);
  });

  it('should throw error for bad API key', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
        text: () => Promise.resolve('{"error":{"message":"Invalid API key"}}'),
      } as Response)
    );

    expect(callOpenRouter('bad-key', 'test')).rejects.toThrow('OpenRouter API error 401');
  });

  it('should respect model parameter', async () => {
    const response = makeOpenRouterResponse({ model: 'google/gemini-2.0-flash-001' });
    globalThis.fetch = mockFetchResponse(response);

    const result = await callOpenRouter('sk-test', 'Hello', 'google/gemini-2.0-flash-001');
    expect(result.model).toBe('google/gemini-2.0-flash-001');

    // Verify fetch was called with the correct model
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.model).toBe('google/gemini-2.0-flash-001');
  });

  it('should default to deepseek model when no model specified', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    await callOpenRouter('sk-test', 'Hello');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.model).toBe('deepseek/deepseek-chat');
  });

  it('should send prompt in messages array', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    await callOpenRouter('sk-test', 'Extract invoice data');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('Extract invoice data');
  });

  it('should set Authorization header with Bearer token', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    await callOpenRouter('sk-my-secret-key', 'test');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    expect(calls[0][1].headers['Authorization']).toBe('Bearer sk-my-secret-key');
  });

  it('should set Content-Type to application/json', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    await callOpenRouter('sk-test', 'test');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    expect(calls[0][1].headers['Content-Type']).toBe('application/json');
  });

  it('should include X-Title header', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    await callOpenRouter('sk-test', 'test');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    expect(calls[0][1].headers['X-Title']).toBe('GarfiX Founder Validation Suite');
  });

  it('should include HTTP-Referer header', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    await callOpenRouter('sk-test', 'test');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    expect(calls[0][1].headers['HTTP-Referer']).toBe('https://garfix.app/founder-validation');
  });

  it('should handle timeout gracefully (network error)', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('network error')));

    expect(callOpenRouter('sk-test', 'test', undefined, false)).rejects.toThrow('network error');
  });

  it('should handle response with extracted text content', async () => {
    const response = makeOpenRouterResponse({
      choices: [{
        message: { role: 'assistant', content: '{"total": 1500.00, "currency": "SAR"}' },
        finish_reason: 'stop',
      }],
    });
    globalThis.fetch = mockFetchResponse(response);

    const result = await callOpenRouter('sk-test', 'Extract invoice total');
    expect(result.choices[0].message.content).toContain('1500.00');
  });

  it('should handle empty prompt by still making a request', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    // Empty prompt is still sent — the API will decide if it's an error
    await callOpenRouter('sk-test', '');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.messages[1].content).toBe('');
  });

  it('should handle very long prompt', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    const longPrompt = 'A'.repeat(100_000);
    await callOpenRouter('sk-test', longPrompt);
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.messages[1].content.length).toBe(100_000);
  });

  it('should handle Arabic text in prompt', async () => {
    const response = makeOpenRouterResponse({
      choices: [{
        message: { role: 'assistant', content: 'استلمت الفاتورة بنجاح' },
        finish_reason: 'stop',
      }],
    });
    globalThis.fetch = mockFetchResponse(response);

    const arabicPrompt = 'استخرج البيانات من هذه الفاتورة: فاتورة ضريبية رقم 123';
    const result = await callOpenRouter('sk-test', arabicPrompt);
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.messages[1].content).toContain('فاتورة');
    expect(result.choices[0].message.content).toContain('الفاتورة');
  });

  it('should set max_tokens to 500', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    await callOpenRouter('sk-test', 'test');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.max_tokens).toBe(500);
  });

  it('should set temperature to 0.3', async () => {
    const response = makeOpenRouterResponse();
    globalThis.fetch = mockFetchResponse(response);

    await callOpenRouter('sk-test', 'test');
    const calls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.temperature).toBe(0.3);
  });
});

describe('selectFastestModel', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should try multiple models and return the first successful', async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      // First model succeeds
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: `resp-${callCount}`,
          model: 'test-model',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        text: () => Promise.resolve('{}'),
      } as Response);
    });

    const model = await selectFastestModel('sk-test');
    expect(model).toBe('meta-llama/llama-3.1-8b-instruct:free'); // First in MODELS_BY_SPEED
    expect(callCount).toBe(1);
  });

  it('should fall back if first model fails', async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      return Promise.resolve({
        ok: callCount === 1 ? false : true, // First fails, second succeeds
        status: callCount === 1 ? 500 : 200,
        json: () => Promise.resolve({
          id: `resp-${callCount}`,
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        text: () => Promise.resolve('{}'),
      } as Response);
    });

    const model = await selectFastestModel('sk-test');
    // First model failed, second should succeed
    expect(model).toBe('google/gemini-2.0-flash-001');
    expect(callCount).toBe(2);
  });

  it('should return fallback model if all fail', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'server error' }),
        text: () => Promise.resolve('server error'),
      } as Response)
    );

    const model = await selectFastestModel('sk-test');
    expect(model).toBe('deepseek/deepseek-chat');
  });

  it('should handle network errors and continue to next model', async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'resp-3',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        text: () => Promise.resolve('{}'),
      } as Response);
    });

    const model = await selectFastestModel('sk-test');
    expect(model).toBe('mistralai/mistral-small-24b-instruct-2501'); // Third in speed order
    expect(callCount).toBe(3);
  });

  it('should use short test prompt "Reply with exactly: OK"', async () => {
    let capturedPrompt = '';
    globalThis.fetch = mock((_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string);
      capturedPrompt = body.messages[0].content;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'resp-1',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        text: () => Promise.resolve('{}'),
      } as Response);
    });

    await selectFastestModel('sk-test');
    expect(capturedPrompt).toBe('Reply with exactly: OK');
  });

  it('should set max_tokens to 5 for speed test', async () => {
    let capturedMaxTokens = 0;
    globalThis.fetch = mock((_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string);
      capturedMaxTokens = body.max_tokens;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'resp-1',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        text: () => Promise.resolve('{}'),
      } as Response);
    });

    await selectFastestModel('sk-test');
    expect(capturedMaxTokens).toBe(5);
  });

  it('should set temperature to 0 for speed test', async () => {
    let capturedTemp = -1;
    globalThis.fetch = mock((_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string);
      capturedTemp = body.temperature;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'resp-1',
          model: 'test',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        text: () => Promise.resolve('{}'),
      } as Response);
    });

    await selectFastestModel('sk-test');
    expect(capturedTemp).toBe(0);
  });
});

describe('calculateModelCost', () => {
  it('should calculate cost for deepseek model correctly', () => {
    const cost = calculateModelCost('deepseek/deepseek-chat', 1000, 1000);
    const model = OPENROUTER_MODELS.find(m => m.id === 'deepseek/deepseek-chat')!;
    const expected = (1000 / 1000) * model.promptCostPer1k + (1000 / 1000) * model.completionCostPer1k;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('should return 0 for free model', () => {
    const cost = calculateModelCost('meta-llama/llama-3.1-8b-instruct:free', 1000, 1000);
    expect(cost).toBe(0);
  });

  it('should return 0 for unknown model', () => {
    const cost = calculateModelCost('unknown/model', 1000, 1000);
    expect(cost).toBe(0);
  });

  it('should return 0 for zero tokens', () => {
    const cost = calculateModelCost('deepseek/deepseek-chat', 0, 0);
    expect(cost).toBe(0);
  });

  it('should scale linearly with token count', () => {
    const cost1 = calculateModelCost('deepseek/deepseek-chat', 100, 100);
    const cost2 = calculateModelCost('deepseek/deepseek-chat', 1000, 1000);
    expect(cost2).toBeCloseTo(cost1 * 10, 10);
  });
});
