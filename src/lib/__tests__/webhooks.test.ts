/**
 * webhooks.test.ts — 50 tests for the webhook delivery system.
 *
 * Covers: registerWebhook, dispatchWebhook, processPendingDeliveries,
 * verifyWebhookSignature, getWebhookStats, and edge cases.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock definitions ──────────────────────────────────────────────────────────

const mockWHEndpointCreate = mock(() => Promise.resolve({ id: "ep-1" }));
const mockWHEndpointFindMany = mock(() => Promise.resolve([]));
const mockWHEndpointFindUnique = mock(() => Promise.resolve(null));
const mockWHEndpointCount = mock(() => Promise.resolve(0));
const mockWHDeliveryFindMany = mock(() => Promise.resolve([]));
const mockWHDeliveryCreate = mock(() => Promise.resolve({ id: "del-1" }));
const mockWHDeliveryUpdate = mock(() => Promise.resolve({}));

// We need to mock fetch for processPendingDeliveries
const mockFetch = mock(() =>
  Promise.resolve({ ok: true, status: 200 } as Response)
);

mock.module("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      update: mock(() => Promise.resolve({})),
      create: mock(() => Promise.resolve({})),
      delete: mock(() => Promise.resolve({})),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
      upsert: mock(() => Promise.resolve({})),
      count: mock(() => Promise.resolve(0)),
    },
    auditLog: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), aggregate: mock(() => Promise.resolve({})) },
    adminAuditLog: { create: mock(() => Promise.resolve({})) },
    mFASecret: { findUnique: mock(() => Promise.resolve(null)), upsert: mock(() => Promise.resolve({})), update: mock(() => Promise.resolve({})), delete: mock(() => Promise.resolve({})) },
    sessionRegistry: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), findUnique: mock(() => Promise.resolve(null)), delete: mock(() => Promise.resolve({})), deleteMany: mock(() => Promise.resolve({ count: 0 })), count: mock(() => Promise.resolve(0)) },
    tamperEvidenceChain: { findFirst: mock(() => Promise.resolve(null)), create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), updateMany: mock(() => Promise.resolve({})), update: mock(() => Promise.resolve({})), count: mock(() => Promise.resolve(0)) },
    webhookEndpoint: {
      findMany: mockWHEndpointFindMany,
      findUnique: mockWHEndpointFindUnique,
      create: mockWHEndpointCreate,
      count: mockWHEndpointCount,
    },
    webhookDelivery: {
      findMany: mockWHDeliveryFindMany,
      create: mockWHDeliveryCreate,
      update: mockWHDeliveryUpdate,
    },
    budgetConfig: { findUnique: mock(() => Promise.resolve(null)) },
    aIRequestLog: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), aggregate: mock(() => Promise.resolve({})) },
    aIMemoryEntry: { create: mock(() => Promise.resolve({})), findMany: mock(() => Promise.resolve([])), findUnique: mock(() => Promise.resolve(null)), update: mock(() => Promise.resolve({})) },
    cacheEntry: { findUnique: mock(() => Promise.resolve(null)), upsert: mock(() => Promise.resolve({})), update: mock(() => Promise.resolve({})), delete: mock(() => Promise.resolve({})) },
    ruleCandidate: { findMany: mock(() => Promise.resolve([])) },
    company: { findMany: mock(() => Promise.resolve([])) },
    notification: { create: mock(() => Promise.resolve({})) },
  },
}));

mock.module("@/lib/logger", () => ({
  logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
}));

// Mock global fetch
(globalThis as any).fetch = mockFetch;

// ── Import after mocks ────────────────────────────────────────────────────────

const {
  registerWebhook,
  dispatchWebhook,
  processPendingDeliveries,
  verifyWebhookSignature,
  getWebhookStats,
} = await import("@/lib/webhooks");
const { encryptSecret, decryptSecret } = await import("@/lib/cryptoVault");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "ep-1",
    companySlug: "acme",
    url: "https://example.com/webhook",
    events: JSON.stringify(["invoice.created"]),
    secret: encryptSecret("wh-secret-123"),
    isActive: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Webhooks Module", () => {
  beforeEach(() => {
    mockWHEndpointCreate.mockClear();
    mockWHEndpointFindMany.mockClear();
    mockWHEndpointFindUnique.mockClear();
    mockWHEndpointCount.mockClear();
    mockWHDeliveryFindMany.mockClear();
    mockWHDeliveryCreate.mockClear();
    mockWHDeliveryUpdate.mockClear();
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // registerWebhook — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("registerWebhook", () => {
    it("creates an endpoint and returns its id", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-new" });
      const id = await registerWebhook({
        companySlug: "acme",
        url: "https://example.com/hook",
        events: ["invoice.created"],
      });
      expect(id).toBe("ep-new");
    });

    it("calls db.webhookEndpoint.create", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-1" });
      await registerWebhook({
        companySlug: "acme",
        url: "https://example.com/hook",
        events: ["invoice.created"],
      });
      expect(mockWHEndpointCreate).toHaveBeenCalledTimes(1);
    });

    it("passes companySlug correctly", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-1" });
      await registerWebhook({ companySlug: "myco", url: "https://x.com", events: [] });
      expect(mockWHEndpointCreate.mock.calls[0][0].data.companySlug).toBe("myco");
    });

    it("passes URL correctly", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-1" });
      await registerWebhook({ companySlug: "acme", url: "https://x.com/hook", events: [] });
      expect(mockWHEndpointCreate.mock.calls[0][0].data.url).toBe("https://x.com/hook");
    });

    it("stores events as JSON string", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-1" });
      await registerWebhook({
        companySlug: "acme",
        url: "https://x.com",
        events: ["invoice.created", "invoice.paid"],
      });
      expect(mockWHEndpointCreate.mock.calls[0][0].data.events).toBe(
        JSON.stringify(["invoice.created", "invoice.paid"])
      );
    });

    it("encrypts the signing secret", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-1" });
      await registerWebhook({ companySlug: "acme", url: "https://x.com", events: [] });
      const storedSecret = mockWHEndpointCreate.mock.calls[0][0].data.secret;
      // Should be encrypted (base64.base64.base64 format)
      expect(storedSecret).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    });

    it("secret can be decrypted back", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-1" });
      await registerWebhook({ companySlug: "acme", url: "https://x.com", events: [] });
      const storedSecret = mockWHEndpointCreate.mock.calls[0][0].data.secret;
      const decrypted = decryptSecret(storedSecret);
      // Should be a 64-char hex string (32 bytes random → hex)
      expect(decrypted).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles multiple events", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-1" });
      await registerWebhook({
        companySlug: "acme",
        url: "https://x.com",
        events: ["a", "b", "c", "d"],
      });
      const events = JSON.parse(mockWHEndpointCreate.mock.calls[0][0].data.events);
      expect(events).toHaveLength(4);
    });

    it("handles empty events array", async () => {
      mockWHEndpointCreate.mockResolvedValueOnce({ id: "ep-1" });
      await registerWebhook({ companySlug: "acme", url: "https://x.com", events: [] });
      expect(JSON.parse(mockWHEndpointCreate.mock.calls[0][0].data.events)).toEqual([]);
    });

    it("generates different secrets on each registration", async () => {
      mockWHEndpointCreate.mockResolvedValue({ id: "ep-1" });
      await registerWebhook({ companySlug: "acme", url: "https://x.com", events: [] });
      await registerWebhook({ companySlug: "acme", url: "https://x.com", events: [] });
      const s1 = decryptSecret(mockWHEndpointCreate.mock.calls[0][0].data.secret);
      const s2 = decryptSecret(mockWHEndpointCreate.mock.calls[1][0].data.secret);
      expect(s1).not.toBe(s2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // dispatchWebhook — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("dispatchWebhook", () => {
    const payload = {
      event: "invoice.created",
      companySlug: "acme",
      timestamp: "2025-01-01T00:00:00Z",
      data: { id: "inv-1" },
    };

    it("returns 0 when no endpoints exist", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([]);
      const count = await dispatchWebhook(payload);
      expect(count).toBe(0);
    });

    it("dispatches to matching endpoint", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([makeEndpoint()]);
      const count = await dispatchWebhook(payload);
      expect(count).toBe(1);
    });

    it("creates a delivery record for matched event", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([makeEndpoint()]);
      await dispatchWebhook(payload);
      expect(mockWHDeliveryCreate).toHaveBeenCalledTimes(1);
      expect(mockWHDeliveryCreate.mock.calls[0][0].data.eventType).toBe("invoice.created");
    });

    it("sets delivery status to pending", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([makeEndpoint()]);
      await dispatchWebhook(payload);
      expect(mockWHDeliveryCreate.mock.calls[0][0].data.status).toBe("pending");
    });

    it("stores payload as JSON string", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([makeEndpoint()]);
      await dispatchWebhook(payload);
      const storedPayload = mockWHDeliveryCreate.mock.calls[0][0].data.payload;
      expect(JSON.parse(storedPayload)).toEqual(payload);
    });

    it("skips endpoint when event does not match", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([
        makeEndpoint({ events: JSON.stringify(["invoice.paid"]) }),
      ]);
      const count = await dispatchWebhook(payload);
      expect(count).toBe(0);
      expect(mockWHDeliveryCreate).not.toHaveBeenCalled();
    });

    it("wildcard '*' matches any event", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([
        makeEndpoint({ events: JSON.stringify(["*"]) }),
      ]);
      const count = await dispatchWebhook(payload);
      expect(count).toBe(1);
    });

    it("dispatches to multiple matching endpoints", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([
        makeEndpoint({ id: "ep-1" }),
        makeEndpoint({ id: "ep-2", events: JSON.stringify(["*"]) }),
      ]);
      const count = await dispatchWebhook(payload);
      expect(count).toBe(2);
      expect(mockWHDeliveryCreate).toHaveBeenCalledTimes(2);
    });

    it("queries endpoints by companySlug and isActive", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([]);
      await dispatchWebhook(payload);
      expect(mockWHEndpointFindMany).toHaveBeenCalledWith({
        where: { companySlug: "acme", isActive: true },
      });
    });

    it("query filters by isActive=true (inactive endpoints excluded)", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([]);
      await dispatchWebhook({
        event: "invoice.created",
        companySlug: "acme",
        timestamp: "2025-01-01",
        data: {},
      });
      // The DB query itself filters out inactive endpoints
      expect(mockWHEndpointFindMany).toHaveBeenCalledWith({
        where: { companySlug: "acme", isActive: true },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // processPendingDeliveries — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("processPendingDeliveries", () => {
    const baseDelivery = {
      id: "del-1",
      endpointId: "ep-1",
      eventType: "invoice.created",
      payload: JSON.stringify({
        event: "invoice.created",
        companySlug: "acme",
        timestamp: "2025-01-01",
        data: { id: "inv-1" },
      }),
      attempts: 0,
      maxAttempts: 3,
      status: "pending",
      nextRetryAt: new Date(),
    };

    it("returns 0 processed when no pending deliveries", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([]);
      const result = await processPendingDeliveries();
      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("successfully delivers and marks as success", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([baseDelivery]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(makeEndpoint());
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 } as Response);
      const result = await processPendingDeliveries();
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockWHDeliveryUpdate).toHaveBeenCalledWith({
        where: { id: "del-1" },
        data: expect.objectContaining({ status: "success" }),
      });
    });

    it("marks as failed when endpoint not found", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([baseDelivery]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(null);
      const result = await processPendingDeliveries();
      expect(result.failed).toBe(1);
      expect(mockWHDeliveryUpdate).toHaveBeenCalledWith({
        where: { id: "del-1" },
        data: { status: "failed" },
      });
    });

    it("retries on failure with backoff", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([
        { ...baseDelivery, attempts: 0 },
      ]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(makeEndpoint());
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await processPendingDeliveries();
      expect(result.failed).toBe(0); // Not permanently failed yet
      expect(result.succeeded).toBe(0);
      expect(mockWHDeliveryUpdate).toHaveBeenCalledWith({
        where: { id: "del-1" },
        data: expect.objectContaining({
          status: "retried",
          attempts: 1,
        }),
      });
    });

    it("marks as permanently failed after max attempts", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([
        { ...baseDelivery, attempts: 2 }, // Will become 3 = maxAttempts
      ]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(makeEndpoint());
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await processPendingDeliveries();
      expect(result.failed).toBe(1);
      expect(mockWHDeliveryUpdate).toHaveBeenCalledWith({
        where: { id: "del-1" },
        data: expect.objectContaining({ status: "failed", attempts: 3 }),
      });
    });

    it("sets backoff delay: 5^1 * 1000 = 5s for first retry", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([
        { ...baseDelivery, attempts: 0 },
      ]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(makeEndpoint());
      mockFetch.mockRejectedValueOnce(new Error("fail"));
      await processPendingDeliveries();
      const updateData = mockWHDeliveryUpdate.mock.calls[0][0].data;
      const delay = (updateData.nextRetryAt as Date).getTime() - Date.now();
      // Should be approximately 5000ms (5^1 * 1000)
      expect(delay).toBeGreaterThan(4000);
      expect(delay).toBeLessThan(10000);
    });

    it("sends correct headers including signature", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([baseDelivery]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(makeEndpoint());
      await processPendingDeliveries();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Garfix-Signature": expect.stringMatching(/^sha256=[a-f0-9]+$/),
            "X-Garfix-Event": "invoice.created",
            "X-Garfix-Delivery": "del-1",
          }),
        })
      );
    });

    it("handles HTTP error response (non-2xx)", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([baseDelivery]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(makeEndpoint());
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
      const result = await processPendingDeliveries();
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0); // First failure → retry
    });

    it("processes multiple pending deliveries", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([
        { ...baseDelivery, id: "del-1" },
        { ...baseDelivery, id: "del-2" },
      ]);
      mockWHEndpointFindUnique.mockResolvedValue(makeEndpoint());
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
      const result = await processPendingDeliveries();
      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
    });

    it("queries pending deliveries with nextRetryAt <= now", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([]);
      await processPendingDeliveries();
      expect(mockWHDeliveryFindMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: "pending",
          nextRetryAt: { lte: expect.any(Date) },
        }),
        take: 50,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // verifyWebhookSignature — 10 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("verifyWebhookSignature", () => {
    const secret = "my-webhook-secret";
    const payload = '{"event":"test"}';

    it("returns true for correct signature", () => {
      const sig = verifyWebhookSignature(payload, "sha256=abc", secret);
      // We need the actual correct signature
      const crypto = require("node:crypto");
      const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      expect(verifyWebhookSignature(payload, `sha256=${expected}`, secret)).toBe(true);
    });

    it("returns false for incorrect signature", () => {
      expect(verifyWebhookSignature(payload, "sha256=wrongvalue", secret)).toBe(false);
    });

    it("returns false when signature prefix is wrong", () => {
      const crypto = require("node:crypto");
      const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      expect(verifyWebhookSignature(payload, `wrongprefix=${expected}`, secret)).toBe(false);
    });

    it("returns false for empty signature", () => {
      expect(verifyWebhookSignature(payload, "", secret)).toBe(false);
    });

    it("returns false for different payload with same signature", () => {
      const crypto = require("node:crypto");
      const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      expect(verifyWebhookSignature('{"event":"different"}', `sha256=${sig}`, secret)).toBe(false);
    });

    it("returns false for different secret", () => {
      const crypto = require("node:crypto");
      const sig = crypto.createHmac("sha256", "wrong-secret").update(payload).digest("hex");
      expect(verifyWebhookSignature(payload, `sha256=${sig}`, secret)).toBe(false);
    });

    it("works with complex JSON payloads", () => {
      const complexPayload = JSON.stringify({
        event: "invoice.created",
        data: { id: "inv-1", amount: 100.50, items: ["a", "b"] },
        nested: { deeply: { value: true } },
      });
      const crypto = require("node:crypto");
      const expected = crypto.createHmac("sha256", secret).update(complexPayload).digest("hex");
      expect(verifyWebhookSignature(complexPayload, `sha256=${expected}`, secret)).toBe(true);
    });

    it("works with empty payload", () => {
      const crypto = require("node:crypto");
      const expected = crypto.createHmac("sha256", secret).update("").digest("hex");
      expect(verifyWebhookSignature("", `sha256=${expected}`, secret)).toBe(true);
    });

    it("signature is deterministic for same input", () => {
      const crypto = require("node:crypto");
      const sig1 = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      const sig2 = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      expect(sig1).toBe(sig2);
      expect(verifyWebhookSignature(payload, `sha256=${sig1}`, secret)).toBe(true);
      expect(verifyWebhookSignature(payload, `sha256=${sig2}`, secret)).toBe(true);
    });

    it("returns false for signature without sha256= prefix", () => {
      const crypto = require("node:crypto");
      const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      expect(verifyWebhookSignature(payload, expected, secret)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getWebhookStats — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("getWebhookStats", () => {
    it("returns activeEndpoints count", async () => {
      mockWHEndpointCount.mockResolvedValueOnce(3);
      mockWHDeliveryFindMany.mockResolvedValueOnce([]);
      const stats = await getWebhookStats("acme");
      expect(stats.activeEndpoints).toBe(3);
    });

    it("returns recent deliveries", async () => {
      const deliveries = [
        { id: "del-1", eventType: "invoice.created", status: "success" },
        { id: "del-2", eventType: "invoice.paid", status: "failed" },
      ];
      mockWHEndpointCount.mockResolvedValueOnce(1);
      mockWHDeliveryFindMany.mockResolvedValueOnce(deliveries);
      const stats = await getWebhookStats("acme");
      expect(stats.recentDeliveries).toHaveLength(2);
    });

    it("counts only active endpoints for company", async () => {
      mockWHEndpointCount.mockResolvedValueOnce(5);
      mockWHDeliveryFindMany.mockResolvedValueOnce([]);
      await getWebhookStats("myco");
      expect(mockWHEndpointCount).toHaveBeenCalledWith({
        where: { companySlug: "myco", isActive: true },
      });
    });

    it("fetches at most 10 recent deliveries", async () => {
      mockWHEndpointCount.mockResolvedValueOnce(0);
      mockWHDeliveryFindMany.mockResolvedValueOnce([]);
      await getWebhookStats("acme");
      expect(mockWHDeliveryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it("orders recent deliveries by createdAt desc", async () => {
      mockWHEndpointCount.mockResolvedValueOnce(0);
      mockWHDeliveryFindMany.mockResolvedValueOnce([]);
      await getWebhookStats("acme");
      expect(mockWHDeliveryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases — 5 tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Edge cases", () => {
    it("dispatchWebhook handles endpoint with malformed events JSON gracefully", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([
        makeEndpoint({ events: "not-json" }),
      ]);
      // Should not throw, just skip
      const count = await dispatchWebhook({
        event: "invoice.created",
        companySlug: "acme",
        timestamp: "2025-01-01",
        data: {},
      });
      expect(count).toBe(0);
    });

    it("processPendingDeliveries handles missing endpoint gracefully", async () => {
      mockWHDeliveryFindMany.mockResolvedValueOnce([
        {
          id: "del-1",
          endpointId: "ep-ghost",
          eventType: "invoice.created",
          payload: "{}",
          attempts: 0,
          maxAttempts: 3,
          status: "pending",
          nextRetryAt: new Date(),
        },
      ]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(null);
      const result = await processPendingDeliveries();
      expect(result.failed).toBe(1);
    });

    it("timeout during fetch triggers retry", async () => {
      const timeoutError = new DOMException("The operation was aborted", "AbortError");
      mockWHDeliveryFindMany.mockResolvedValueOnce([
        {
          id: "del-1",
          endpointId: "ep-1",
          eventType: "invoice.created",
          payload: "{}",
          attempts: 0,
          maxAttempts: 3,
          status: "pending",
          nextRetryAt: new Date(),
        },
      ]);
      mockWHEndpointFindUnique.mockResolvedValueOnce(makeEndpoint());
      mockFetch.mockRejectedValueOnce(timeoutError);
      const result = await processPendingDeliveries();
      expect(result.failed).toBe(0);
      expect(result.succeeded).toBe(0);
      // Should be retried
      expect(mockWHDeliveryUpdate).toHaveBeenCalledWith({
        where: { id: "del-1" },
        data: expect.objectContaining({ status: "retried", attempts: 1 }),
      });
    });

    it("dispatchWebhook with no matching events across multiple endpoints", async () => {
      mockWHEndpointFindMany.mockResolvedValueOnce([
        makeEndpoint({ id: "ep-1", events: JSON.stringify(["order.created"]) }),
        makeEndpoint({ id: "ep-2", events: JSON.stringify(["order.updated"]) }),
      ]);
      const count = await dispatchWebhook({
        event: "invoice.created",
        companySlug: "acme",
        timestamp: "2025-01-01",
        data: {},
      });
      expect(count).toBe(0);
    });

    it("getWebhookStats for company with no endpoints", async () => {
      mockWHEndpointCount.mockResolvedValueOnce(0);
      mockWHDeliveryFindMany.mockResolvedValueOnce([]);
      const stats = await getWebhookStats("empty-co");
      expect(stats.activeEndpoints).toBe(0);
      expect(stats.recentDeliveries).toHaveLength(0);
    });
  });
});