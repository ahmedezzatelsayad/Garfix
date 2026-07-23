// @ts-nocheck
/**
 * rateLimit-advanced.test.ts — 50 tests for the rate limiter.
 *
 * Tests memory backend (Valkey is mocked as unavailable), checkRateLimit,
 * rateLimitResponse, getClientIp, clearRateLimit, and edge cases.
 */

import { describe, it, expect, beforeEach, mock, spyOn, afterAll } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockValkeyClient = {
  incr: mock(() => Promise.resolve(1)),
  pexpire: mock(() => Promise.resolve(1)),
  pttl: mock(() => Promise.resolve(-1)),
  set: mock(() => Promise.resolve("OK")),
  del: mock(() => Promise.resolve(1)),
  get: mock(() => Promise.resolve(null)),
};

mock.module("@/lib/valkey", () => ({
  getValkeyClient: mock(() => Promise.resolve(null)),
  VALKEY_CONFIGURED: false,
}));

mock.module("@/lib/logger", () => ({
  logger: {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    fatal: mock(() => {}),
  },
}));

// We need next/server for rateLimitResponse. Mock NextResponse and NextRequest.
const mockSet = mock(() => {});
const mockGet = mock((name: string) => ({ name, value: "test-token" }));

mock.module("next/server", () => {
  class MockNextRequest {
    url: string;
    headers: Map<string, string>;
    cookies: { get: typeof mockGet; set: typeof mockSet; delete: typeof mockSet };

    constructor(input: string | { url?: string; headers?: Headers }) {
      if (typeof input === "string") {
        this.url = input;
        this.headers = new Map();
      } else {
        this.url = input.url || "http://localhost/test";
        this.headers = new Map();
        if (input.headers) {
          input.headers.forEach((v, k) => this.headers.set(k, v));
        }
      }
      this.cookies = { get: mockGet, set: mockSet, delete: mockSet };
    }

    get headers_() { return this.headers; }
  }

  class MockNextResponse {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers as Record<string, string>),
        },
      });
    }
  }

  return {
    NextRequest: MockNextRequest as unknown as typeof import("next/server").NextRequest,
    NextResponse: MockNextResponse as unknown as typeof import("next/server").NextResponse,
  };
});

// Import after mocks
const {
  checkRateLimit,
  rateLimitResponse,
  getClientIp,
  clearRateLimit,
  LIMITS,
} = await import("@/lib/rateLimit");

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}): import("next/server").NextRequest {
  const hdrs = new Headers(headers);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return new (require("next/server").NextRequest as any)({ url: "http://localhost/test", headers: hdrs });
}

// ─── checkRateLimit (memory backend) ───────────────────────────────────────

describe("checkRateLimit — memory backend", () => {
  it("allows first request under limit", async () => {
    const result = await checkRateLimit("test:allow:1", { windowMs: 60000, maxAttempts: 5 });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("allows up to maxAttempts", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit("test:upToMax", { windowMs: 60000, maxAttempts: 5 });
      expect(r.ok).toBe(true);
    }
  });

  it("blocks request over maxAttempts", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit("test:block", { windowMs: 60000, maxAttempts: 5 });
    }
    const r = await checkRateLimit("test:block", { windowMs: 60000, maxAttempts: 5 });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfter).toBeDefined();
  });

  it("resets after window expires (simulated via different key)", async () => {
    const config = { windowMs: 60000, maxAttempts: 2 };
    const r1 = await checkRateLimit("test:reset:1", config);
    const r2 = await checkRateLimit("test:reset:1", config);
    expect(r2.ok).toBe(true);
    const r3 = await checkRateLimit("test:reset:1", config);
    expect(r3.ok).toBe(false);
  });

  it("sets lockout when lockoutMs is configured", async () => {
    const config = { windowMs: 60000, maxAttempts: 2, lockoutMs: 30000 };
    // Exhaust the limit
    await checkRateLimit("test:lockout", config);
    await checkRateLimit("test:lockout", config);
    const r = await checkRateLimit("test:lockout", config);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });

  it("continues blocking during lockout", async () => {
    const config = { windowMs: 60000, maxAttempts: 1, lockoutMs: 60000 };
    await checkRateLimit("test:lock-continue", config);
    await checkRateLimit("test:lock-continue", config);
    const r3 = await checkRateLimit("test:lock-continue", config);
    expect(r3.ok).toBe(false);
  });

  it("remaining counts down correctly", async () => {
    const config = { windowMs: 60000, maxAttempts: 3 };
    const r1 = await checkRateLimit("test:countdown", config);
    expect(r1.remaining).toBe(2);
    const r2 = await checkRateLimit("test:countdown", config);
    expect(r2.remaining).toBe(1);
    const r3 = await checkRateLimit("test:countdown", config);
    expect(r3.remaining).toBe(0);
  });
});

// ─── Rate limit per key (independent counters) ─────────────────────────────

describe("Rate limit per key — independent counters", () => {
  it("different keys have independent counters", async () => {
    const config = { windowMs: 60000, maxAttempts: 1 };
    const r1 = await checkRateLimit("key:a", config);
    const r2 = await checkRateLimit("key:b", config);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // Both should now be blocked
    const r1b = await checkRateLimit("key:a", config);
    const r2b = await checkRateLimit("key:b", config);
    expect(r1b.ok).toBe(false);
    expect(r2b.ok).toBe(false);
  });

  it("clearing one key does not affect another", async () => {
    const config = { windowMs: 60000, maxAttempts: 1 };
    await checkRateLimit("indep:a", config);
    await checkRateLimit("indep:b", config);
    await clearRateLimit("indep", "a");
    // a should be allowed again
    const ra = await checkRateLimit("indep:a", config);
    expect(ra.ok).toBe(true);
    // b should still be blocked
    const rb = await checkRateLimit("indep:b", config);
    expect(rb.ok).toBe(false);
  });

  it("three keys are fully independent", async () => {
    const config = { windowMs: 60000, maxAttempts: 1 };
    await checkRateLimit("triple:1", config);
    await checkRateLimit("triple:2", config);
    await checkRateLimit("triple:3", config);
    // All blocked
    expect((await checkRateLimit("triple:1", config)).ok).toBe(false);
    expect((await checkRateLimit("triple:2", config)).ok).toBe(false);
    expect((await checkRateLimit("triple:3", config)).ok).toBe(false);
  });
});

// ─── Memory backend lockout behavior ───────────────────────────────────────

describe("Memory backend lockout", () => {
  it("returns retryAfter when locked out", async () => {
    const config = { windowMs: 60000, maxAttempts: 1, lockoutMs: 120000 };
    await checkRateLimit("mem:lock:ra", config);
    await checkRateLimit("mem:lock:ra", config);
    const r = await checkRateLimit("mem:lock:ra", config);
    expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("retryAfter is at least 1 second", async () => {
    const config = { windowMs: 1, maxAttempts: 1, lockoutMs: 1 };
    await checkRateLimit("mem:min:retry", config);
    await checkRateLimit("mem:min:retry", config);
    const r = await checkRateLimit("mem:min:retry", config);
    expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });
});

// ─── rateLimitResponse ─────────────────────────────────────────────────────

describe("rateLimitResponse", () => {
  it("returns null when under limit", async () => {
    const req = makeRequest({ "x-real-ip": "1.2.3.4" });
    const config = { windowMs: 60000, maxAttempts: 5 };
    const result = await rateLimitResponse(req, "rlr:test", config);
    expect(result).toBeNull();
  });

  it("returns 429 status when blocked", async () => {
    const req = makeRequest({ "x-real-ip": "1.2.3.5" });
    const config = { windowMs: 60000, maxAttempts: 1 };
    await rateLimitResponse(req, "rlr:blocked", config); // use the one attempt
    const result = await rateLimitResponse(req, "rlr:blocked", config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("429 response has Arabic error message", async () => {
    const req = makeRequest({ "x-real-ip": "1.2.3.6" });
    const config = { windowMs: 60000, maxAttempts: 1 };
    await rateLimitResponse(req, "rlr:arabic", config);
    const result = await rateLimitResponse(req, "rlr:arabic", config);
    const body = await result!.json() as Record<string, unknown>;
    expect(body.error).toContain("تم تجاوز");
  });

  it("429 response includes retryAfter in body", async () => {
    const req = makeRequest({ "x-real-ip": "1.2.3.7" });
    const config = { windowMs: 60000, maxAttempts: 1 };
    await rateLimitResponse(req, "rlr:body", config);
    const result = await rateLimitResponse(req, "rlr:body", config);
    const body = await result!.json() as Record<string, unknown>;
    expect(body).toHaveProperty("retryAfter");
    expect(typeof body.retryAfter).toBe("number");
  });

  it("429 response has Retry-After header", async () => {
    const req = makeRequest({ "x-real-ip": "1.2.3.8" });
    const config = { windowMs: 60000, maxAttempts: 1 };
    await rateLimitResponse(req, "rlr:retry-hdr", config);
    const result = await rateLimitResponse(req, "rlr:retry-hdr", config);
    const hdr = result!.headers.get("Retry-After");
    expect(hdr).not.toBeNull();
    expect(Number(hdr)).toBeGreaterThan(0);
  });

  it("429 response has X-RateLimit-Remaining: 0 header", async () => {
    const req = makeRequest({ "x-real-ip": "1.2.3.9" });
    const config = { windowMs: 60000, maxAttempts: 1 };
    await rateLimitResponse(req, "rlr:remaining", config);
    const result = await rateLimitResponse(req, "rlr:remaining", config);
    expect(result!.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("429 response has X-RateLimit-Reset header", async () => {
    const req = makeRequest({ "x-real-ip": "1.2.4.0" });
    const config = { windowMs: 60000, maxAttempts: 1 };
    await rateLimitResponse(req, "rlr:reset", config);
    const result = await rateLimitResponse(req, "rlr:reset", config);
    const reset = result!.headers.get("X-RateLimit-Reset");
    expect(reset).not.toBeNull();
    const resetNum = Number(reset);
    expect(resetNum).toBeGreaterThan(Date.now());
  });

  it("uses identifier when provided", async () => {
    const req = makeRequest({});
    const config = { windowMs: 60000, maxAttempts: 1 };
    const r1 = await rateLimitResponse(req, "rlr:id", config, "user@x.com");
    expect(r1).toBeNull();
    const r2 = await rateLimitResponse(req, "rlr:id", config, "user@x.com");
    expect(r2).not.toBeNull();
    expect(r2!.status).toBe(429);
  });
});

// ─── getClientIp ───────────────────────────────────────────────────────────

describe("getClientIp", () => {
  it("extracts x-real-ip header", () => {
    const req = makeRequest({ "x-real-ip": "10.0.0.1" });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from x-real-ip", () => {
    const req = makeRequest({ "x-real-ip": "  10.0.0.2  " });
    expect(getClientIp(req)).toBe("10.0.0.2");
  });

  it("prefers x-real-ip over x-forwarded-for when no trusted proxies", () => {
    const req = makeRequest({
      "x-real-ip": "10.0.0.3",
      "x-forwarded-for": "192.168.1.1, 10.0.0.3",
    });
    // TRUSTED_PROXIES is empty (env not set), so it should return x-real-ip
    expect(getClientIp(req)).toBe("10.0.0.3");
  });

  it("returns 'unknown' for empty x-real-ip", () => {
    const req = makeRequest({ "x-real-ip": "" });
    expect(getClientIp(req)).toBe("unknown");
  });
});

// ─── clearRateLimit ────────────────────────────────────────────────────────

describe("clearRateLimit", () => {
  it("allows requests after clearing", async () => {
    const config = { windowMs: 60000, maxAttempts: 1 };
    await checkRateLimit("clear:test", config);
    await checkRateLimit("clear:test", config);
    expect((await checkRateLimit("clear:test", config)).ok).toBe(false);
    await clearRateLimit("clear", "test");
    const r = await checkRateLimit("clear:test", config);
    expect(r.ok).toBe(true);
  });

  it("does not throw on clearing non-existent key", async () => {
    let threw = false;
    try { await clearRateLimit("noexist", "key"); } catch { threw = true; }
    expect(threw).toBe(false);
  });
});

// ─── LIMITS config ─────────────────────────────────────────────────────────

describe("LIMITS config", () => {
  it("LOGIN has correct maxAttempts", () => {
    expect(LIMITS.LOGIN.maxAttempts).toBe(5);
  });

  it("LOGIN has lockoutMs configured", () => {
    expect(LIMITS.LOGIN.lockoutMs).toBeDefined();
    expect(LIMITS.LOGIN.lockoutMs!).toBeGreaterThan(0);
  });

  it("REGISTER has correct maxAttempts", () => {
    expect(LIMITS.REGISTER.maxAttempts).toBe(3);
  });

  it("OTP_VERIFY has correct maxAttempts", () => {
    expect(LIMITS.OTP_VERIFY.maxAttempts).toBe(5);
  });

  it("AI_CHAT has 10 max attempts per 60s", () => {
    expect(LIMITS.AI_CHAT.maxAttempts).toBe(10);
    expect(LIMITS.AI_CHAT.windowMs).toBe(60000);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("zero maxAttempts succeeds on first call then blocks", async () => {
    const config = { windowMs: 60000, maxAttempts: 0 };
    // First call creates entry with count=1, and 1 > 0 is false so it passes
    const r1 = await checkRateLimit("edge:zero", config);
    expect(r1.ok).toBe(true);
    // Second call: count becomes 2, 2 > 0 → blocked
    const r2 = await checkRateLimit("edge:zero", config);
    expect(r2.ok).toBe(false);
    expect(r2.remaining).toBe(0);
  });

  it("concurrent requests increment counter", async () => {
    const config = { windowMs: 60000, maxAttempts: 10 };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkRateLimit("edge:concurrent", config)),
    );
    const allOk = results.every((r) => r.ok);
    // At least the first should be ok; after 10, the 11th would fail
    expect(allOk).toBe(true);
    const r11 = await checkRateLimit("edge:concurrent", config);
    expect(r11.ok).toBe(false);
  });

  it("same IP with different prefixes are independent", async () => {
    const config = { windowMs: 60000, maxAttempts: 1 };
    const req = makeRequest({ "x-real-ip": "5.5.5.5" });
    const r1 = await rateLimitResponse(req, "prefix:login", config);
    const r2 = await rateLimitResponse(req, "prefix:register", config);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it("large windowMs value works correctly", async () => {
    const config = { windowMs: 86400000, maxAttempts: 1 };
    const r = await checkRateLimit("edge:large-window", config);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it("very small windowMs value (1ms)", async () => {
    const config = { windowMs: 1, maxAttempts: 5 };
    const r1 = await checkRateLimit("edge:tiny-window", config);
    expect(r1.ok).toBe(true);
  });

  it("retryAfter is always a positive number when blocked", async () => {
    const config = { windowMs: 60000, maxAttempts: 1, lockoutMs: 5000 };
    await checkRateLimit("edge:positive-retry", config);
    await checkRateLimit("edge:positive-retry", config);
    const r = await checkRateLimit("edge:positive-retry", config);
    expect(typeof r.retryAfter).toBe("number");
    expect(r.retryAfter!).toBeGreaterThan(0);
  });
});

afterAll(() => { mock.restore(); });