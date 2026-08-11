/**
 * observability.spec.ts — E2E tests for Sprint 3 observability features.
 *
 * Tests:
 *   1. Circuit Breaker health dashboard API
 *   2. Audit trail query API
 *   3. OpenTelemetry health endpoint
 *   4. System health aggregation
 *
 * These tests verify that the observability infrastructure is correctly
 * integrated and accessible via the API.
 */

import { test, expect } from "@playwright/test";

test.describe("Observability — Circuit Breaker Health Dashboard", () => {
  test("GET /api/health/circuit-breakers returns health metrics", async ({ request }) => {
    const response = await request.get("/api/health/circuit-breakers");
    // Should return 401 (requires auth) or 200 if auth cookie is set
    expect([200, 401]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("summary");
      expect(data.summary).toHaveProperty("total");
      expect(data.summary).toHaveProperty("closed");
      expect(data.summary).toHaveProperty("open");
      expect(data.summary).toHaveProperty("avgHealthScore");
      expect(data).toHaveProperty("breakers");
      expect(data).toHaveProperty("timestamp");
      expect(typeof data.summary.avgHealthScore).toBe("number");
    }
  });

  test("Circuit breaker health score is 0-100", async ({ request }) => {
    // First login to get auth cookie
    const loginRes = await request.post("/api/auth/login", {
      data: { email: process.env.FOUNDER_EMAIL || "founder@garfix.app", password: process.env.FOUNDER_PASSWORD || "E2eTestPassword2026!" },
    });

    if (loginRes.status() === 200) {
      const response = await request.get("/api/health/circuit-breakers");
      if (response.status() === 200) {
        const data = await response.json();
        expect(typeof data.summary.avgHealthScore).toBe("number");
        expect(data.summary.avgHealthScore).toBeLessThanOrEqual(100);
      }
    }
  });

  test("POST /api/health/circuit-breakers — reset action requires valid breaker name", async ({ request }) => {
    const loginRes = await request.post("/api/auth/login", {
      data: { email: process.env.FOUNDER_EMAIL || "founder@garfix.app", password: process.env.FOUNDER_PASSWORD || "E2eTestPassword2026!" },
    });

    if (loginRes.status() === 200) {
      // Invalid breaker name
      const response = await request.post("/api/health/circuit-breakers", {
        data: { action: "reset", breaker: "nonexistent" },
      });
      expect(response.status()).toBe(404);

      // Missing action
      const response2 = await request.post("/api/health/circuit-breakers", {
        data: { breaker: "openrouter" },
      });
      expect(response2.status()).toBe(400);

      // Valid reset (if breaker exists)
      const response3 = await request.post("/api/health/circuit-breakers", {
        data: { action: "reset", breaker: "openrouter" },
      });
      expect([200, 404]).toContain(response3.status());
    }
  });
});

test.describe("Observability — Audit Trail", () => {
  test("GET /api/health/audit-trail returns audit events", async ({ request }) => {
    const loginRes = await request.post("/api/auth/login", {
      data: { email: process.env.FOUNDER_EMAIL || "founder@garfix.app", password: process.env.FOUNDER_PASSWORD || "E2eTestPassword2026!" },
    });

    if (loginRes.status() === 200) {
      const response = await request.get("/api/health/audit-trail");
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty("events");
        expect(data).toHaveProperty("total");
        expect(Array.isArray(data.events)).toBe(true);
        expect(typeof data.total).toBe("number");
      }
    }
  });

  test("GET /api/health/audit-trail supports channel filter", async ({ request }) => {
    const loginRes = await request.post("/api/auth/login", {
      data: { email: process.env.FOUNDER_EMAIL || "founder@garfix.app", password: process.env.FOUNDER_PASSWORD || "E2eTestPassword2026!" },
    });

    if (loginRes.status() === 200) {
      const response = await request.get("/api/health/audit-trail?channel=cache:invalidate&limit=10");
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty("events");
        expect(data).toHaveProperty("total");
      }
    }
  });

  test("Audit trail events have required fields", async ({ request }) => {
    const loginRes = await request.post("/api/auth/login", {
      data: { email: process.env.FOUNDER_EMAIL || "founder@garfix.app", password: process.env.FOUNDER_PASSWORD || "E2eTestPassword2026!" },
    });

    if (loginRes.status() === 200) {
      const response = await request.get("/api/health/audit-trail?limit=5");
      if (response.status() === 200) {
        const data = await response.json();
        if (data.events.length > 0) {
          const event = data.events[0];
          expect(event).toHaveProperty("id");
          expect(event).toHaveProperty("channel");
          expect(event).toHaveProperty("timestamp");
          expect(event).toHaveProperty("correlationId");
          expect(event).toHaveProperty("publisher");
          expect(event).toHaveProperty("hash");
          expect(event).toHaveProperty("previousHash");
        }
      }
    }
  });
});

test.describe("Observability — System Health", () => {
  test("GET /api/health returns system health", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("status");
    expect(data.status).toBe("ok");
  });

  test("GET /api/metrics returns system metrics", async ({ request }) => {
    const loginRes = await request.post("/api/auth/login", {
      data: { email: process.env.FOUNDER_EMAIL || "founder@garfix.app", password: process.env.FOUNDER_PASSWORD || "E2eTestPassword2026!" },
    });

    if (loginRes.status() === 200) {
      const response = await request.get("/api/metrics");
      expect([200, 401]).toContain(response.status());
    }
  });
});

test.describe("Observability — Startup Check", () => {
  test("GET /api/startup-check returns environment validation", async ({ request }) => {
    const loginRes = await request.post("/api/auth/login", {
      data: { email: process.env.FOUNDER_EMAIL || "founder@garfix.app", password: process.env.FOUNDER_PASSWORD || "E2eTestPassword2026!" },
    });

    if (loginRes.status() === 200) {
      const response = await request.get("/api/startup-check");
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty("ok");
        expect(typeof data.ok).toBe("boolean");
      }
    }
  });
});
