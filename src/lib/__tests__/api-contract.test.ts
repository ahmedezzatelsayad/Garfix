/**
 * api-contract.test.ts — Contract tests validating API response shapes
 * against the OpenAPI specification (api-types.ts).
 *
 * These tests ensure:
 *   - API responses match documented schemas
 *   - Required fields are present
 *   - Type constraints are respected
 *   - Enum values are valid
 *   - Breaking changes are detected early
 *
 * Architecture:
 *   - Tests use mock data matching the expected response shapes
 *   - ContractValidator checks shape compliance
 *   - If real API responses diverge from contracts, tests fail
 *   - This prevents silent contract drift between frontend and backend
 */

import { describe, it, expect } from "bun:test";
import { validateContract, ContractValidator, assertContract } from "@/lib/openapi/contract-test-helpers";

// ── Auth Contract Tests ──────────────────────────────────────────────────────

describe("Auth Contract", () => {
  it("POST /api/auth/login — successful response matches AuthResult", () => {
    const body = {
      ok: true,
      user: {
        id: "usr_abc123",
        uid: "uid_abc123",
        email: "admin@garfix.app",
        displayName: "Admin User",
        role: "admin",
        companies: ["acme-co"],
        tokenVersion: 1,
      },
    };
    const result = validateContract("/api/auth/login", "POST", body);
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("POST /api/auth/login — failed response has error field", () => {
    const body = {
      ok: false,
      error: "Invalid credentials",
    };
    const result = validateContract("/api/auth/login", "POST", body);
    // Error responses are valid as long as they have the error field
    expect(result.ok).toBe(true);
  });

  it("POST /api/auth/login — missing ok field violates contract", () => {
    const body = {
      user: { id: "1" },
    };
    const result = validateContract("/api/auth/login", "POST", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ok"))).toBe(true);
  });

  it("POST /api/auth/login — user.role must be valid enum", () => {
    const body = {
      ok: true,
      user: {
        id: "1",
        uid: "u1",
        email: "test@test.com",
        displayName: "Test",
        role: "superadmin", // ← invalid enum value
        companies: [],
        tokenVersion: 1,
      },
    };
    const result = validateContract("/api/auth/login", "POST", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("role") && e.message.includes("enum"))).toBe(true);
  });
});

// ── Health Contract Tests ────────────────────────────────────────────────────

describe("Health Contract", () => {
  it("GET /api/health — response matches HealthCheckDTO", () => {
    const body = {
      status: "healthy",
      version: "12.1.0",
      uptime: 3600,
      checks: {
        database: "ok",
        cache: "ok",
        aiFabric: "not_configured",
        queues: "ok",
      },
      timestamp: new Date().toISOString(),
    };
    const result = validateContract("/api/health", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/health — invalid status enum violates contract", () => {
    const body = {
      status: "unknown", // ← invalid
      version: "12.1.0",
      uptime: 3600,
      checks: { database: "ok", cache: "ok" },
      timestamp: new Date().toISOString(),
    };
    const result = validateContract("/api/health", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path.includes("status"))).toBe(true);
  });
});

// ── Accounting Contract Tests ────────────────────────────────────────────────

describe("Accounting Contract", () => {
  it("GET /api/accounting/journal-entries — paginated Voucher response", () => {
    const body = {
      data: [
        {
          id: "v1",
          number: "JV-001",
          date: "2024-01-15",
          description: "Opening balance",
          lines: [
            { id: "l1", accountId: "cash", debit: 1000, credit: 0, description: "Cash" },
          ],
          status: "posted",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    };
    const result = validateContract("/api/accounting/journal-entries", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/journal-entries — missing total field", () => {
    const body = {
      data: [],
      page: 1,
      hasMore: false,
    };
    const result = validateContract("/api/accounting/journal-entries", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("total"))).toBe(true);
  });
});

// ── Invoice Contract Tests ───────────────────────────────────────────────────

describe("Invoice Contract", () => {
  it("GET /api/invoices — paginated Invoice response", () => {
    const body = {
      data: [
        {
          id: "inv1",
          number: "INV-001",
          status: "sent",
          total: 5000,
          currency: "SAR",
          issueDate: "2024-03-01",
          dueDate: "2024-04-01",
          clientId: "c1",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    };
    const result = validateContract("/api/invoices", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/invoices — invalid status enum", () => {
    const body = {
      data: [
        {
          id: "inv1",
          number: "INV-001",
          status: "processing", // ← invalid enum
          total: 5000,
          currency: "SAR",
          issueDate: "2024-03-01",
          dueDate: "2024-04-01",
        },
      ],
      total: 1,
      page: 1,
      hasMore: false,
    };
    const result = validateContract("/api/invoices", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("status"))).toBe(true);
  });
});

// ── AI Fabric Contract Tests ─────────────────────────────────────────────────

describe("AI Fabric Contract", () => {
  it("POST /api/ai/agents — AIResponseDTO shape", () => {
    const body = {
      ok: true,
      resolvedBy: "cache",
      confidence: 0.97,
      costUsd: 0,
      latencyMs: 5,
      result: { answer: "matched" },
    };
    const result = validateContract("/api/ai/agents", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/agents — invalid resolvedBy enum", () => {
    const body = {
      ok: true,
      resolvedBy: "unknown_stage", // ← invalid
      confidence: 0.97,
      costUsd: 0,
      latencyMs: 5,
    };
    const result = validateContract("/api/ai/agents", "POST", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("resolvedBy"))).toBe(true);
  });
});

// ── Company Contract Tests ───────────────────────────────────────────────────

describe("Company Contract", () => {
  it("GET /api/companies — paginated Company response", () => {
    const body = {
      data: [
        {
          id: "co1",
          name: "Acme Trading",
          slug: "acme-co",
          plan: "enterprise",
          currency: "SAR",
          subscriptionStatus: "active",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    };
    const result = validateContract("/api/companies", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/companies — invalid currency enum", () => {
    const body = {
      data: [
        {
          id: "co1",
          name: "Acme",
          slug: "acme",
          plan: "starter",
          currency: "USD", // ← not MENA currency
          subscriptionStatus: "active",
        },
      ],
      total: 1,
    };
    const result = validateContract("/api/companies", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("currency"))).toBe(true);
  });
});

// ── Builder Pattern Tests ────────────────────────────────────────────────────

describe("ContractValidator Builder", () => {
  it("builder pattern validates custom expectations", () => {
    const body = {
      data: [
        {
          id: "1",
          name: "Test",
          slug: "test-co",
          plan: "starter",
          currency: "SAR",
          subscriptionStatus: "active",
        },
      ],
      total: 5,
      page: 1,
      hasMore: true,
    };

    const result = new ContractValidator("/api/companies", "GET")
      .expectRequired("data", "total", "page", "hasMore")
      .expectArray("data")
      .expectNumber("total")
      .expectBoolean("hasMore")
      .validate(body);

    expect(result.ok).toBe(true);
  });

  it("builder catches type mismatches", () => {
    const body = {
      data: "not-an-array", // ← wrong type
      total: "5", // ← string instead of number
      hasMore: 1, // ← number instead of boolean
    };

    const result = new ContractValidator("/api/companies", "GET")
      .expectRequired("data", "total", "hasMore")
      .expectArray("data")
      .expectNumber("total")
      .expectBoolean("hasMore")
      .validate(body);

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── Error Shape Contract Tests ───────────────────────────────────────────────

describe("Error Contract", () => {
  it("error responses match ErrorResult shape", () => {
    const body = { error: "Not found", code: "NOT_FOUND" };
    const result = validateContract("/api/invoices", "GET", body);
    // Error responses should be valid
    expect(result.ok).toBe(true);
  });

  it("error without message field violates contract", () => {
    const body = { code: "ERROR" }; // ← missing error message
    const result = validateContract("/api/unknown-route", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("contract") || e.message.includes("unstructured"))).toBe(true);
  });
});

// ── assertContract throws on violation ────────────────────────────────────────

describe("assertContract", () => {
  it("throws with descriptive message on contract violation", () => {
    const invalidBody = { ok: "maybe" }; // ← wrong type

    expect(() => assertContract("/api/auth/login", "POST", invalidBody)).toThrow(/Contract violation/);
  });

  it("does not throw on valid response", () => {
    const validBody = { ok: true, user: { id: "1", uid: "u1", email: "t@t.com", displayName: "T", role: "admin", companies: [], tokenVersion: 1 } };

    expect(() => assertContract("/api/auth/login", "POST", validBody)).not.toThrow();
  });
});
