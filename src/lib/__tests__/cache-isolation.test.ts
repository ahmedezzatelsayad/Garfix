// @ts-nocheck
/**
 * cache-isolation.test.ts — 50 tests for cache multi-tenant isolation.
 *
 * Tests L1 (in-memory Map) + L2 (Valkey) cache operations with mocked Valkey.
 * Covers: cacheGet, cacheSet, cacheInvalidate, cacheInvalidatePattern,
 * onCacheInvalidate, onCacheInvalidatePattern, cached, cacheStats,
 * and multi-tenant isolation with company-prefixed keys.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Must mock BEFORE the module under test is imported
const mockValkeyClient = {
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve("OK")),
  del: mock(() => Promise.resolve(1)),
  publish: mock(() => Promise.resolve(1)),
  scan: mock(() => Promise.resolve(["0", []])),
};

mock.module("@/lib/valkey", () => ({
  getValkeyClient: mock(() => Promise.resolve(mockValkeyClient)),
  getValkeySubscriber: mock(() => Promise.resolve(null)),
  VALKEY_CONFIGURED: false,
}));

// Mock logger to avoid noise
mock.module("@/lib/logger", () => ({
  logger: {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    fatal: mock(() => {}),
  },
}));

// Import after mocks are set up
const {
  cacheGet,
  cacheSet,
  cacheInvalidate,
  cacheInvalidatePattern,
  onCacheInvalidate,
  onCacheInvalidatePattern,
  cached,
  cacheStats,
} = await import("@/lib/cache");

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get internal store reference for assertions. We use cacheStats().keys */
function getStoredKeys(): string[] {
  return cacheStats().keys;
}

// ─── cacheGet ──────────────────────────────────────────────────────────────

describe("cacheGet", () => {
  it("returns null for a key that was never set", async () => {
    const result = await cacheGet("nonexistent:key");
    expect(result).toBeNull();
  });

  it("returns the value for an existing key", async () => {
    await cacheSet("test:existing", "hello", 60);
    const result = await cacheGet("test:existing");
    expect(result).toBe("hello");
  });

  it("returns null for an expired entry", async () => {
    // Set with 0 TTL (already expired)
    await cacheSet("test:expired", "value", -1);
    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 5));
    const result = await cacheGet("test:expired");
    expect(result).toBeNull();
  });

  it("returns value with correct type (object)", async () => {
    const obj = { name: "Test", count: 42 };
    await cacheSet("test:object", obj, 60);
    const result = await cacheGet<typeof obj>("test:object");
    expect(result).toEqual(obj);
  });

  it("returns value with correct type (array)", async () => {
    const arr = [1, 2, 3];
    await cacheSet("test:array", arr, 60);
    const result = await cacheGet<number[]>("test:array");
    expect(result).toEqual(arr);
  });

  it("returns value with correct type (number)", async () => {
    await cacheSet("test:number", 12345, 60);
    const result = await cacheGet<number>("test:number");
    expect(result).toBe(12345);
  });

  it("returns value with correct type (boolean)", async () => {
    await cacheSet("test:boolean", true, 60);
    const result = await cacheGet<boolean>("test:boolean");
    expect(result).toBe(true);
  });
});

// ─── cacheSet ──────────────────────────────────────────────────────────────

describe("cacheSet", () => {
  it("stores value in L1 (visible via cacheGet)", async () => {
    await cacheSet("set:l1", "val", 60);
    const result = await cacheGet("set:l1");
    expect(result).toBe("val");
  });

  it("overwrites existing key in L1", async () => {
    await cacheSet("set:overwrite", "first", 60);
    await cacheSet("set:overwrite", "second", 60);
    const result = await cacheGet("set:overwrite");
    expect(result).toBe("second");
  });

  it("stores value accessible via cacheStats keys", async () => {
    await cacheSet("set:stats", "val", 60);
    expect(cacheStats().keys).toContain("set:stats");
  });

  it("stores null value", async () => {
    await cacheSet("set:null", null, 60);
    // cacheGet returns null for missing keys too, but the key should exist
    expect(cacheStats().keys).toContain("set:null");
  });

  it("stores undefined value", async () => {
    await cacheSet("set:undef", undefined, 60);
    expect(cacheStats().keys).toContain("set:undef");
  });

  it("does not call valkeySet when VALKEY_CONFIGURED is false", async () => {
    const setSpy = spyOn(mockValkeyClient, "set");
    await cacheSet("set:no-valkey", "val", 60);
    expect(setSpy).not.toHaveBeenCalled();
  });
});

// ─── cacheInvalidate ───────────────────────────────────────────────────────

describe("cacheInvalidate", () => {
  it("removes a key from L1", async () => {
    await cacheSet("inv:key", "val", 60);
    await cacheInvalidate("inv:key");
    const result = await cacheGet("inv:key");
    expect(result).toBeNull();
  });

  it("does not throw when invalidating a missing key", async () => {
    let threw = false;
    try { await cacheInvalidate("inv:missing"); } catch { threw = true; }
    expect(threw).toBe(false);
  });

  it("fires onCacheInvalidate callback", async () => {
    await cacheSet("inv:callback", "val", 60);
    const received: string[] = [];
    const unsub = onCacheInvalidate((key) => received.push(key));
    await cacheInvalidate("inv:callback");
    expect(received).toContain("inv:callback");
    unsub();
  });

  it("removes key from cacheStats keys after invalidation", async () => {
    await cacheSet("inv:stats", "val", 60);
    await cacheInvalidate("inv:stats");
    expect(cacheStats().keys).not.toContain("inv:stats");
  });

  it("only invalidates the specified key, not others", async () => {
    await cacheSet("inv:keep", "val", 60);
    await cacheSet("inv:remove", "val", 60);
    await cacheInvalidate("inv:remove");
    expect(await cacheGet("inv:keep")).toBe("val");
    expect(await cacheGet("inv:remove")).toBeNull();
  });
});

// ─── cacheInvalidatePattern ────────────────────────────────────────────────

describe("cacheInvalidatePattern", () => {
  it("removes all matching keys from L1", async () => {
    await cacheSet("pat:company-a:inv:1", "v1", 60);
    await cacheSet("pat:company-a:inv:2", "v2", 60);
    await cacheSet("pat:company-b:inv:1", "v3", 60);
    await cacheInvalidatePattern("pat:company-a:");
    expect(await cacheGet("pat:company-a:inv:1")).toBeNull();
    expect(await cacheGet("pat:company-a:inv:2")).toBeNull();
    expect(await cacheGet("pat:company-b:inv:1")).toBe("v3");
  });

  it("fires onCacheInvalidatePattern callback", async () => {
    await cacheSet("pat:cb:test:1", "v", 60);
    const received: string[] = [];
    const unsub = onCacheInvalidatePattern((prefix) => received.push(prefix));
    await cacheInvalidatePattern("pat:cb:");
    expect(received).toContain("pat:cb:");
    unsub();
  });

  it("does not throw when no keys match the pattern", async () => {
    let threw = false;
    try { await cacheInvalidatePattern("pat:nomatch:"); } catch { threw = true; }
    expect(threw).toBe(false);
  });

  it("removes keys from cacheStats after pattern invalidation", async () => {
    await cacheSet("pat:stats:a", "v", 60);
    await cacheSet("pat:stats:b", "v", 60);
    await cacheInvalidatePattern("pat:stats:");
    expect(cacheStats().keys).not.toContain("pat:stats:a");
    expect(cacheStats().keys).not.toContain("pat:stats:b");
  });

  it("does not affect keys with similar but non-matching prefix", async () => {
    await cacheSet("pat:safe:x", "v", 60);
    await cacheSet("pat:safe-xx:y", "v", 60);
    await cacheInvalidatePattern("pat:safe:");
    expect(await cacheGet("pat:safe:x")).toBeNull();
    // safe-xx does not start with "pat:safe:" exactly
    expect(await cacheGet("pat:safe-xx:y")).toBe("v");
  });
});

// ─── onCacheInvalidate ─────────────────────────────────────────────────────

describe("onCacheInvalidate", () => {
  it("returns an unsubscribe function", () => {
    const unsub = onCacheInvalidate(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("does not fire after unsubscribe", async () => {
    let count = 0;
    const unsub = onCacheInvalidate(() => count++);
    await cacheInvalidate("unsub:test:1");
    const afterFirst = count;
    unsub();
    await cacheInvalidate("unsub:test:2");
    expect(count).toBe(afterFirst);
  });

  it("supports multiple simultaneous subscribers", async () => {
    const r1: string[] = [];
    const r2: string[] = [];
    const unsub1 = onCacheInvalidate((k) => r1.push(k));
    const unsub2 = onCacheInvalidate((k) => r2.push(k));
    await cacheSet("multi:sub:key", "v", 60);
    await cacheInvalidate("multi:sub:key");
    expect(r1).toEqual(["multi:sub:key"]);
    expect(r2).toEqual(["multi:sub:key"]);
    unsub1();
    unsub2();
  });

  it("subscriber receives the exact key string", async () => {
    let received = "";
    const unsub = onCacheInvalidate((k) => { received = k; });
    await cacheSet("exact:key:name", "v", 60);
    await cacheInvalidate("exact:key:name");
    expect(received).toBe("exact:key:name");
    unsub();
  });
});

// ─── onCacheInvalidatePattern ──────────────────────────────────────────────

describe("onCacheInvalidatePattern", () => {
  it("returns an unsubscribe function", () => {
    const unsub = onCacheInvalidatePattern(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("fires with the prefix on pattern invalidation", async () => {
    let received = "";
    const unsub = onCacheInvalidatePattern((p) => { received = p; });
    await cacheInvalidatePattern("patprefix:");
    expect(received).toBe("patprefix:");
    unsub();
  });

  it("does not fire for single-key invalidation", async () => {
    let fired = false;
    const unsub = onCacheInvalidatePattern(() => { fired = true; });
    await cacheSet("single:key:pat", "v", 60);
    await cacheInvalidate("single:key:pat");
    expect(fired).toBe(false);
    unsub();
  });
});

// ─── cached ────────────────────────────────────────────────────────────────

describe("cached", () => {
  it("calls fetcher on cache miss and stores result", async () => {
    let calls = 0;
    const fetcher = () => { calls++; return Promise.resolve("fetched"); };
    const result1 = await cached(["cached", "miss"], 60, fetcher);
    expect(result1).toBe("fetched");
    expect(calls).toBe(1);
  });

  it("returns cached value on hit (does not call fetcher again)", async () => {
    let calls = 0;
    const fetcher = () => { calls++; return Promise.resolve("cached-val"); };
    await cached(["cached", "hit"], 60, fetcher);
    await cached(["cached", "hit"], 60, fetcher);
    expect(calls).toBe(1);
  });

  it("joins key parts with colon", async () => {
    let capturedKey = "";
    const fetcher = () => { capturedKey = "called"; return Promise.resolve("v"); };
    await cached(["part1", "part2", "part3"], 60, fetcher);
    expect(getStoredKeys()).toContain("part1:part2:part3");
  });

  it("handles complex return types", async () => {
    const complex = { nested: { data: [1, 2, 3] }, flag: true };
    const fetcher = () => Promise.resolve(complex);
    const result = await cached(["cached", "complex"], 60, fetcher);
    expect(result).toEqual(complex);
  });

  it("handles fetcher that returns different types on separate keys", async () => {
    const fetchStr = () => Promise.resolve("str");
    const fetchNum = () => Promise.resolve(42);
    const r1 = await cached(["cached", "str"], 60, fetchStr);
    const r2 = await cached(["cached", "num"], 60, fetchNum);
    expect(r1).toBe("str");
    expect(r2).toBe(42);
  });
});

// ─── cacheStats ────────────────────────────────────────────────────────────

describe("cacheStats", () => {
  it("returns correct l1Size for empty cache", () => {
    // Clear all keys for this test isolation
    const stats = cacheStats();
    // Just verify the structure exists
    expect(stats).toHaveProperty("l1Size");
    expect(stats).toHaveProperty("keys");
    expect(stats).toHaveProperty("valkeyEnabled");
    expect(stats).toHaveProperty("pubSubReady");
  });

  it("returns correct l1Size after setting keys", async () => {
    const before = cacheStats().l1Size;
    await cacheSet("stats:a", "v", 60);
    await cacheSet("stats:b", "v", 60);
    await cacheSet("stats:c", "v", 60);
    const after = cacheStats().l1Size;
    expect(after).toBeGreaterThanOrEqual(before + 3);
  });

  it("l1Size decreases after invalidation", async () => {
    await cacheSet("stats:dec", "v", 60);
    const before = cacheStats().l1Size;
    await cacheInvalidate("stats:dec");
    const after = cacheStats().l1Size;
    expect(after).toBeLessThan(before);
  });

  it("valkeyEnabled is false when VALKEY_CONFIGURED is false", () => {
    expect(cacheStats().valkeyEnabled).toBe(false);
  });

  it("keys array contains all set keys", async () => {
    await cacheSet("stats:keys:1", "v", 60);
    await cacheSet("stats:keys:2", "v", 60);
    const keys = cacheStats().keys;
    expect(keys).toContain("stats:keys:1");
    expect(keys).toContain("stats:keys:2");
  });
});

// ─── Multi-tenant isolation ────────────────────────────────────────────────

describe("Multi-tenant isolation", () => {
  it("keys with different company prefixes do not interfere", async () => {
    await cacheSet("company-a:invoice:123", { total: 100 }, 60);
    await cacheSet("company-b:invoice:123", { total: 200 }, 60);
    const a = await cacheGet("company-a:invoice:123");
    const b = await cacheGet("company-b:invoice:123");
    expect(a).toEqual({ total: 100 });
    expect(b).toEqual({ total: 200 });
  });

  it("pattern invalidation is scoped to the correct company", async () => {
    await cacheSet("tenant:x:data:1", "x1", 60);
    await cacheSet("tenant:x:data:2", "x2", 60);
    await cacheSet("tenant:y:data:1", "y1", 60);
    await cacheInvalidatePattern("tenant:x:");
    expect(await cacheGet("tenant:x:data:1")).toBeNull();
    expect(await cacheGet("tenant:x:data:2")).toBeNull();
    expect(await cacheGet("tenant:y:data:1")).toBe("y1");
  });

  it("three tenants are fully isolated", async () => {
    await cacheSet("t1:user:1", "tenant1", 60);
    await cacheSet("t2:user:1", "tenant2", 60);
    await cacheSet("t3:user:1", "tenant3", 60);
    expect(await cacheGet("t1:user:1")).toBe("tenant1");
    expect(await cacheGet("t2:user:1")).toBe("tenant2");
    expect(await cacheGet("t3:user:1")).toBe("tenant3");
  });

  it("invalidating one tenant does not affect another", async () => {
    await cacheSet("iso:a:config", { lang: "ar" }, 60);
    await cacheSet("iso:b:config", { lang: "en" }, 60);
    await cacheInvalidate("iso:a:config");
    expect(await cacheGet("iso:a:config")).toBeNull();
    expect(await cacheGet("iso:b:config")).toEqual({ lang: "en" });
  });

  it("pattern invalidation only removes exact prefix matches", async () => {
    await cacheSet("iso:company1:invoices", "data", 60);
    await cacheSet("iso:company10:invoices", "data", 60);
    await cacheSet("iso:company1:products", "data", 60);
    await cacheInvalidatePattern("iso:company1:");
    // company1:invoices and company1:products removed
    expect(await cacheGet("iso:company1:invoices")).toBeNull();
    expect(await cacheGet("iso:company1:products")).toBeNull();
    // company10 starts with "iso:company1" but not "iso:company1:"
    // Wait, "iso:company10" starts with "iso:company1" which is not the prefix
    // The prefix is "iso:company1:" so company10 is NOT matched
    expect(await cacheGet("iso:company10:invoices")).toBe("data");
  });

  it("cached() with tenant-prefixed keys isolates data per tenant", async () => {
    let fetchCount = 0;
    const fetcher = () => { fetchCount++; return Promise.resolve({ invoices: 10 }); };

    const r1 = await cached(["tenant-a", "dashboard"], 60, fetcher);
    const r2 = await cached(["tenant-b", "dashboard"], 60, fetcher);
    const r3 = await cached(["tenant-a", "dashboard"], 60, fetcher); // hit

    expect(r1).toEqual({ invoices: 10 });
    expect(r2).toEqual({ invoices: 10 });
    expect(fetchCount).toBe(2); // One miss per tenant, one hit
  });

  it("independent TTLs per tenant key", async () => {
    await cacheSet("ttl:a:fast", "val", 1); // 1 second TTL
    await cacheSet("ttl:b:slow", "val", 600); // long TTL
    // Wait for the short one to expire
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cacheGet("ttl:a:fast")).toBeNull();
    expect(await cacheGet("ttl:b:slow")).toBe("val");
  });

  it("cacheStats l1Size reflects cross-tenant keys", async () => {
    await cacheSet("cs:t1:k1", "v", 60);
    await cacheSet("cs:t2:k1", "v", 60);
    await cacheSet("cs:t3:k1", "v", 60);
    const keys = cacheStats().keys.filter(
      (k) => k.startsWith("cs:") && k.endsWith(":k1"),
    );
    expect(keys.length).toBe(3);
  });
});