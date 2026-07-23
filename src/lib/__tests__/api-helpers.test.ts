// @ts-nocheck
/**
 * api-helpers.test.ts — tests for the shared Route Handler helpers in
 * `src/lib/api.ts`.
 *
 * Coverage:
 *  - `validateBody()` returns `{ ok: true, data }` on success.
 *  - `validateBody()` returns `{ ok: false, response }` with status 400 on
 *    zod failure.
 *  - `parseJsonField()` parses a valid JSON string.
 *  - `parseJsonField()` returns the fallback on null / undefined / invalid JSON.
 *  - `withErrorHandler()` catches a thrown error and returns a 500 NextResponse
 *    with the error message in the body.
 *  - `withErrorHandler()` passes through a successful NextResponse unchanged.
 *  - `apiError()` / `apiOk()` produce the expected status codes + bodies.
 *
 * Note: importing `@/lib/api` transitively imports `@/lib/auth` which calls
 * `resolveSecret("JWT_SECRET", ...)` at module load. In dev/test mode this
 * returns a deterministic dev secret and emits a console warning — that's
 * expected and harmless for these tests. The JWT_SECRET / JWT_REFRESH_SECRET
 * warnings visible in the test output come from that one-time module
 * initialization.
 */
import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";

// ─── Mocks to isolate from cross-test contamination ──────────────────────
// Other test files mock @/lib/db globally via bun:test's mock.module().
// Without our own mock here, the leaked mock breaks our import chain.
mock.module("@/lib/db", () => ({
  db: {
    user: { findUnique: mock(() => Promise.resolve(null)) },
    auditLog: { create: mock(() => Promise.resolve({ id: "mock-audit" })) },
    adminAuditLog: { create: mock(() => Promise.resolve({ id: "mock-admin-audit" })) },
    tamperEvidenceChain: {
      findFirst: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: "mock-chain" })),
      findMany: mock(() => Promise.resolve([])),
      update: mock(() => Promise.resolve({})),
      updateMany: mock(() => Promise.resolve({ count: 0 })),
      count: mock(() => Promise.resolve(0)),
    },
    $transaction: mock((cb: any) => cb({
      auditLog: { create: mock(() => Promise.resolve({ id: "mock-audit" })) },
      tamperEvidenceChain: {
        findFirst: mock(() => Promise.resolve(null)),
        create: mock(() => Promise.resolve({ id: "mock-chain" })),
      },
    })),
  },
}));

mock.module("@/lib/logger", () => ({
  logger: { debug: mock(() => {}), info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), fatal: mock(() => {}) },
}));

mock.module("@/lib/valkey", () => ({
  getValkeyClient: mock(() => Promise.resolve(null)),
  getValkeySubscriber: mock(() => Promise.resolve(null)),
  VALKEY_CONFIGURED: false,
}));

// NOTE: We do NOT mock @/lib/secretsManager or @/lib/cryptoVault.
// api.ts's import chain (auth → db/founder/permissions/valkey) does NOT
// touch secretsManager or cryptoVault. Mocking cryptoVault globally breaks
// mfa.test.ts (whose setupMFA calls the real encryptSecret/decryptSecret
// and asserts the encrypted output matches the real format).

// NOTE: We do NOT mock @/lib/permissions or @/lib/founder.
// permissions.ts is a pure data module with no database imports — it can be
// imported safely without a generated Prisma client. Mocking it globally
// breaks rbac.test.ts (which imports the real computeEffectivePermissions
// and asserts the full admin permission set, not just { create_invoice: 1 }).
// founder.ts is also pure (reads from process.env, no imports) — safe to
// import the real version.

mock.module("next/headers", () => ({
  cookies: mock(() => Promise.resolve(new Map())),
}));

// ─── Mock next/server to protect against cross-test contamination ──────
// auth-advanced.test.ts mocks next/server with a minimal MockNextRequest/
// MockNextResponse that lacks .json(), .nextUrl.searchParams, etc. When
// that test runs in the same Bun process, its mock leaks into our module
// space, breaking parseJsonBody / getQuery tests. Our own mock here
// provides a fully-functional NextRequest/NextResponse built on top of
// Bun's native Request/Response, which correctly supports .json(),
// .nextUrl, .headers, etc.
mock.module("next/server", () => {
  // NextRequest: extends Bun's Request with .nextUrl (a URL object whose
  // searchParams are live and pathname is correct).
  class NextRequest extends Request {
    _nextUrl: URL;
    constructor(input: string | Request, init?: RequestInit) {
      // Bun's Request handles body/headers/method automatically
      super(input as any, init as any);
      this._nextUrl = new URL(typeof input === "string" ? input : input.url);
    }
    get nextUrl() {
      return this._nextUrl;
    }
  }

  // NextResponse: extends Bun's Response with a static .json() factory.
  class NextResponse extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      super(body, init);
    }
    static json(body: unknown, init?: ResponseInit): NextResponse {
      const headers = new Headers(init?.headers);
      headers.set("content-type", "application/json");
      return new NextResponse(JSON.stringify(body), {
        ...init,
        status: init?.status ?? 200,
        headers,
      });
    }
  }

  return { NextRequest, NextResponse };
});

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Dynamic import AFTER mocks are set up so they take effect
const {
  validateBody,
  parseJsonField,
  withErrorHandler,
  apiError,
  apiOk,
  parseJsonBody,
  getQuery,
} = await import("@/lib/api");

// ─── validateBody ─────────────────────────────────────────────────────────────

describe("validateBody", () => {
  const Schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it("returns parsed data on success", () => {
    const r = validateBody(Schema, { name: "Alice", age: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Alice");
      expect(r.data.age).toBe(30);
    }
  });

  it("returns 400 NextResponse on zod failure", () => {
    const r = validateBody(Schema, { name: "", age: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
    }
  });

  it("returns 400 NextResponse on non-object input", () => {
    const r = validateBody(Schema, "not an object");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
    }
  });

  it("preserves zod issue details in the 400 body", async () => {
    const r = validateBody(Schema, { name: "", age: -5 });
    if (!r.ok) {
      const body = await r.response.json();
      expect(body).toHaveProperty("error");
      expect(body).toHaveProperty("details");
      expect(Array.isArray(body.details)).toBe(true);
    }
  });
});

// ─── parseJsonField ───────────────────────────────────────────────────────────

describe("parseJsonField", () => {
  it("parses a valid JSON string", () => {
    expect(parseJsonField<Record<string, number>>('{"a":1,"b":2}', {} as Record<string, number>)).toEqual({ a: 1, b: 2 });
  });

  it("parses a valid JSON array string", () => {
    expect(parseJsonField<number[]>("[1,2,3]", [])).toEqual([1, 2, 3]);
  });

  it("returns the fallback on null input", () => {
    expect(parseJsonField(null, "fallback")).toBe("fallback");
  });

  it("returns the fallback on undefined input", () => {
    expect(parseJsonField(undefined, { default: true })).toEqual({ default: true });
  });

  it("returns the fallback on empty string input", () => {
    expect(parseJsonField("", [])).toEqual([]);
  });

  it("returns the fallback on invalid JSON", () => {
    expect(parseJsonField("{not json}", "fb")).toBe("fb");
    expect(parseJsonField("undefined", "fb")).toBe("fb");
  });

  it("preserves the fallback type (generic)", () => {
    const obj = { x: 1, y: [2, 3] };
    expect(parseJsonField("garbage", obj)).toBe(obj);
  });
});

// ─── withErrorHandler ─────────────────────────────────────────────────────────

describe("withErrorHandler", () => {
  it("passes through a successful NextResponse unchanged", async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ ok: true }, { status: 200 });
    });
    const res = await handler();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("catches a thrown Error and returns a 500 with a generic message (never leaks internals)", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("boom");
    });
    const res = await handler();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("catches a thrown non-Error value and returns 500 with generic message", async () => {
    const handler = withErrorHandler(async () => {
      throw "string error";
    });
    const res = await handler();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("forwards multiple arguments to the wrapped handler", async () => {
    const handler = withErrorHandler(async (a: number, b: number) => {
      return NextResponse.json({ sum: a + b });
    });
    const res = await handler(3, 4);
    const body = await res.json();
    expect(body.sum).toBe(7);
  });
});

// ─── apiError / apiOk ─────────────────────────────────────────────────────────

describe("apiError / apiOk", () => {
  it("apiError returns a NextResponse with the given status + message", async () => {
    const res = apiError("not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not found");
  });

  it("apiError defaults to status 400", () => {
    expect(apiError("bad").status).toBe(400);
  });

  it("apiOk returns 200 with the given data by default", async () => {
    const res = apiOk({ ok: true, count: 3 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, count: 3 });
  });

  it("apiOk accepts a custom status code", () => {
    expect(apiOk({}, 201).status).toBe(201);
  });
});

// ─── parseJsonBody / getQuery (smoke) ─────────────────────────────────────────
//
// These two helpers operate on a NextRequest, which is awkward to construct
// without invoking the Next.js runtime. The next/next-server Request can be
// used instead — `new NextRequest(url, init)` is a public API.

describe("parseJsonBody", () => {
  it("parses a valid JSON body", async () => {
    const req = new NextRequest("https://example.com/api/test", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "content-type": "application/json" },
    });
    const body = await parseJsonBody(req);
    expect(body).toEqual({ a: 1 });
  });

  it("returns null on empty body", async () => {
    const req = new NextRequest("https://example.com/api/test", {
      method: "POST",
    });
    const body = await parseJsonBody(req);
    expect(body).toBeNull();
  });

  it("returns null on invalid JSON", async () => {
    const req = new NextRequest("https://example.com/api/test", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const body = await parseJsonBody(req);
    expect(body).toBeNull();
  });
});

describe("getQuery", () => {
  it("returns query params as a record", () => {
    const req = new NextRequest("https://example.com/api/test?foo=bar&baz=qux");
    const q = getQuery(req);
    expect(q.foo).toBe("bar");
    expect(q.baz).toBe("qux");
  });

  it("returns an empty record for a URL with no query", () => {
    const req = new NextRequest("https://example.com/api/test");
    const q = getQuery(req);
    expect(Object.keys(q).length).toBe(0);
  });
});

afterAll(() => { mock.restore(); });
