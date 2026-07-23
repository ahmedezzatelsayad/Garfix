// @ts-nocheck
/**
 * invoices-crud.test.ts — Tests for the invoice REST route handlers.
 *
 * Covers:
 *   POST   /api/invoices            (create)
 *   GET    /api/invoices            (list)
 *   GET    /api/invoices/[id]       (single)
 *   PATCH  /api/invoices/[id]       (update with optimistic lock)
 *   DELETE /api/invoices/[id]       (soft delete)
 *
 * Strategy:
 *  - Mock @/lib/auth, @/lib/middleware, @/lib/audit, @/lib/usageMeter via
 *    mock.module — these modules are only imported by the invoice route
 *    handlers (no other test file imports them), so the mocks don't leak.
 *  - Do NOT mock @/lib/inventorySync or @/lib/db via mock.module. Bun's
 *    mock.module is global across test files by default; mocking those
 *    modules would leak into collision-recovery-audit.test.ts (which needs
 *    the real syncInventoryOnSale) and productMatcher.test.ts (which needs
 *    the real matchProduct via its own @/lib/db mock). Instead, we
 *    monkey-patch the shared `db` object's properties (invoice, auditLog,
 *    company, $transaction, featureFlag, platformSetting) in beforeAll and
 *    restore them in afterAll.
 *  - The real syncInventoryOnSale is exercised on the POST happy path via
 *    db.$transaction, which passes a rich fake `tx` that supports the sync
 *    function's full call surface (warehouse, productAlias, productCatalog,
 *    inventoryItem, stockMovement, productMatchAudit).
 *  - Each test sets the mutable state (authUser, existingInvoice, etc.) it
 *    needs, then constructs a fake `NextRequest` via `new NextRequest(url,
 *    { method, body, headers })` and invokes the exported handler directly.
 *  - For dynamic [id] routes we pass `{ params: Promise.resolve({ id }) }`
 *    because the route signature is
 *    `(req: NextRequest, { params }: { params: Promise<{ id: string }> })`.
 *
 * The mocks intentionally replicate the behavior of the real auth/tenant
 * helpers (assertCompanyAccess uses user.companies.includes(slug), admins
 * bypass, etc.) so the security-critical assertions (cross-tenant 403)
 * exercise the same logic the production code relies on.
 */
import { describe, it, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { NextRequest, NextResponse } from "next/server";

// ─── Mutable per-test state ──────────────────────────────────────────────────

let authUser: any = null;
let permissionGranted = true;
let existingInvoice: any = null;
let invoiceById: any = null;
let invoiceList: any[] = [];
let trialOk = true;
let quotaOk = true;
let lastFindManyArgs: any = null;
let lastUpdateArgs: any = null;
// C1 FIX: track updateMany args (used by PATCH /payment /status /invoices/[id])
let lastUpdateManyArgs: any = null;
// C1 FIX: per-test override — when set, the next updateMany call returns
// count=0 (simulating a concurrent edit that bumped the version). Used by
// the atomic-lock regression test to verify the 409 path.
let nextUpdateManyCount: number | null = null;
// H5 FIX: idempotency key mock store (composite key → record)
let idempotencyStore: Map<string, any> = new Map();
let lastIdempotencyUpsertArgs: any = null;

// ─── Mock function handles for db.invoice ────────────────────────────────────
//
// These are created at module scope so beforeEach can clear their call
// history. They read from the mutable state above (existingInvoice,
// invoiceById, etc.) at call time.

const invoiceFindUnique = mock(async (args: any) => {
  if (args.where && args.where.id !== undefined) return invoiceById;
  return existingInvoice;
});
const invoiceFindMany = mock(async (args: any) => {
  lastFindManyArgs = args;
  return invoiceList;
});
const invoiceCreate = mock(async (args: any) => ({ id: 1, version: 0, ...args.data }));
const invoiceUpdate = mock(async (args: any) => {
  lastUpdateArgs = args;
  return { id: args.where?.id ?? 0, ...args.data };
});
const invoiceUpdateMany = mock(async (args: any) => {
  lastUpdateManyArgs = args;
  // If the test forced count=0 (simulating a concurrent edit conflict), honor it.
  if (nextUpdateManyCount !== null) {
    const c = nextUpdateManyCount;
    nextUpdateManyCount = null;
    return { count: c };
  }
  // Simulate the atomic version check: if the where clause includes a version
  // filter that doesn't match the current invoiceById.version, return count=0.
  if (
    args.where &&
    args.where.version !== undefined &&
    invoiceById &&
    args.where.version !== invoiceById.version
  ) {
    return { count: 0 };
  }
  // Simulate the atomic soft-delete check: if the row is soft-deleted, return 0.
  if (invoiceById && invoiceById.deletedAt && args.where && args.where.deletedAt === null) {
    return { count: 0 };
  }
  return { count: 1 };
});
const invoiceCount = mock(async () => 0);

// H5 FIX: IdempotencyKey mock — backed by an in-memory Map keyed on
// `${companySlug}|${endpoint}|${key}`. findUnique + upsert both consult it.
const idempotencyFindUnique = mock(async (args: any) => {
  const w = args.where?.companySlug_endpoint_key;
  if (!w) return null;
  const k = `${w.companySlug}|${w.endpoint}|${w.key}`;
  return idempotencyStore.get(k) ?? null;
});
const idempotencyUpsert = mock(async (args: any) => {
  lastIdempotencyUpsertArgs = args;
  const w = args.where?.companySlug_endpoint_key;
  if (!w) return null;
  const k = `${w.companySlug}|${w.endpoint}|${w.key}`;
  const existing = idempotencyStore.get(k);
  const record = {
    companySlug: w.companySlug,
    endpoint: w.endpoint,
    key: w.key,
    requestHash: args.create?.requestHash ?? existing?.requestHash ?? "",
    responseJson: args.update?.responseJson ?? args.create?.responseJson ?? existing?.responseJson ?? null,
    status: args.update?.status ?? args.create?.status ?? existing?.status ?? 200,
    createdAt: existing?.createdAt ?? new Date(),
  };
  idempotencyStore.set(k, record);
  return record;
});

// ─── Rich fake tx for db.$transaction ─────────────────────────────────────────
//
// The POST happy path wraps syncInventoryOnSale in db.$transaction. The
// callback receives this fake tx. It supports the full call surface of
// syncInventoryOnSale + matchProduct:
//   - warehouse.findFirst → a warehouse
//   - productAlias.findUnique → an alias for "Item A" (so matchProduct returns
//     an exact match and buildResult logs a normal "auto-match" audit entry)
//   - productCatalog.findUnique → the product
//   - inventoryItem.findUnique → an invItem with sufficient qty
//   - inventoryItem.update / stockMovement.create / productMatchAudit.create → no-ops
//
// This makes syncInventoryOnSale return { warnings: [], inventoryUpdated: 1 }
// so the route's response includes reviewQueueWarnings: [].

const RICH_TX = {
  warehouse: { findFirst: async () => ({ id: 1, name: "Main Warehouse", companySlug: "test-co" }) },
  productAlias: {
    findUnique: async () => ({
      alias: "Item A",
      product: { id: 100, name: "Item A", sellingPrice: "1.500", companySlug: "test-co" },
    }),
    findMany: async () => [],
    create: async () => ({}),
  },
  productCatalog: {
    findUnique: async () => ({ id: 100, name: "Item A", sellingPrice: "1.500", companySlug: "test-co" }),
    create: async () => ({}),
  },
  productMatchAudit: { create: async () => ({}) },
  inventoryItem: {
    findUnique: async () => ({ id: 50, quantity: "100.000" }),
    update: async () => ({}),
    create: async () => ({}),
  },
  stockMovement: { create: async () => ({}) },
  // Support appendToChain (called by logAudit after db.auditLog.create):
  // appendToChain wraps findFirst + create in a $transaction, so the fake
  // tx must support tamperEvidenceChain operations.
  tamperEvidenceChain: {
    findFirst: async () => null,
    create: async () => ({ id: "mock-chain" }),
  },
  // Support logAudit's db.auditLog.create inside $transaction (if used)
  auditLog: { create: async () => ({ id: "mock-audit-id", createdAt: new Date() }) },
};

// ─── Register mock.module for non-conflicting modules ────────────────────────
//
// These modules are only imported by the invoice route handlers. No other
// test file imports them, so mocking them via mock.module is safe (the
// mocks don't leak into other test files' code paths).

mock.module("@/lib/auth", () => ({
  resolveAuth: mock(async () =>
    authUser
      ? { ok: true, user: authUser }
      : { ok: false, error: "Unauthorized", status: 401 },
  ),
  assertCompanyAccess: mock((_user: any, slug: string) => {
    if (!slug) return true;
    if (authUser?.role === "admin" || authUser?.email === "founder@garfix.app") return true;
    return Array.isArray(authUser?.companies) && authUser.companies.includes(slug);
  }),
  hasUnrestrictedScope: mock(
    () => authUser?.role === "admin" || authUser?.email === "founder@garfix.app",
  ),
  ACCESS_COOKIE: "inv_token",
  REFRESH_COOKIE: "inv_refresh",
}));

mock.module("@/lib/middleware", () => ({
  requirePermissionForCompany: mock(async (_req: any, _perm: string, slug: string) => {
    if (!authUser) {
      return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    if (!permissionGranted) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    if (
      authUser.role !== "admin" &&
      authUser.email !== "founder@garfix.app" &&
      !(Array.isArray(authUser.companies) && authUser.companies.includes(slug))
    ) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { user: authUser };
  }),
  requirePermission: mock(async () => ({ user: authUser })),
  hasPermission: mock(() => permissionGranted),
}));

// NOTE: We do NOT mock @/lib/audit via mock.module. The audit-advanced
// test file imports the real logAudit/logAdminAction and tests them against
// mock db.auditLog / db.adminAuditLog / db.tamperEvidenceChain. If we mock
// @/lib/audit globally, audit-advanced's tests break (the mock replaces the
// real implementation). Instead, we rely on monkey-patching db.auditLog,
// db.adminAuditLog, db.tamperEvidenceChain, and db.$transaction so that the
// real logAudit/logAdminAction (which the route handlers import) work
// correctly with our mock db. The fire-and-forget appendToChain call inside
// logAudit also works because RICH_TX (the fake tx passed to $transaction)
// includes tamperEvidenceChain operations.

mock.module("@/lib/usageMeter", () => ({
  checkTrialExpiry: mock(async () => ({ ok: trialOk })),
  checkInvoiceQuota: mock(async () => ({ ok: quotaOk })),
  checkUserQuota: mock(async () => ({ ok: true })),
  checkCompanyQuota: mock(async () => ({ ok: true })),
}));

// ─── Mock next/server to protect against cross-test contamination ──────
// auth-advanced.test.ts mocks next/server with a minimal MockNextRequest/
// MockNextResponse that lacks .json(), .nextUrl.searchParams, etc. When
// that test runs in the same Bun process, its mock leaks into our module
// space, breaking the invoice route handlers. Our own mock here provides
// a fully-functional NextRequest/NextResponse built on Bun's native
// Request/Response.
mock.module("next/server", () => {
  class NextRequest extends Request {
    _nextUrl: URL;
    constructor(input: string | Request, init?: RequestInit) {
      super(input as any, init as any);
      this._nextUrl = new URL(typeof input === "string" ? input : input.url);
    }
    get nextUrl() {
      return this._nextUrl;
    }
  }

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

// ─── Import db + route handlers ──────────────────────────────────────────────
//
// We import db so we can monkey-patch its properties. We do NOT use
// mock.module for @/lib/db — that would replace the db export globally and
// break productMatcher.test.ts (whose dbMock supplies the productAlias
// fixture data its tests depend on) or collision-recovery-audit.test.ts
// (which needs the real matchProduct, whose getTenantConfig reads
// db.featureFlag).
//
// Because we import { db } and the route handlers also import { db }, they
// share the same object reference. Monkey-patching db.invoice etc. in
// beforeAll makes the route handlers see our mocks.

import { db } from "@/lib/db";
import { GET as listGET, POST as invoicesPOST } from "@/app/api/invoices/route";
import {
  GET as singleGET,
  PATCH as invoicesPATCH,
  DELETE as invoicesDELETE,
} from "@/app/api/invoices/[id]/route";

// ─── Monkey-patch db properties ───────────────────────────────────────────────
//
// Save originals so we can restore them in afterAll (other test files, e.g.
// productMatcher.test.ts, may rely on the original db properties).

const _orig: Record<string, any> = {};

beforeAll(() => {
  _orig.invoice = (db as any).invoice;
  _orig.auditLog = (db as any).auditLog;
  _orig.company = (db as any).company;
  _orig.featureFlag = (db as any).featureFlag;
  _orig.platformSetting = (db as any).platformSetting;
  _orig.$transaction = (db as any).$transaction;
  _orig.idempotencyKey = (db as any).idempotencyKey;
  _orig.adminAuditLog = (db as any).adminAuditLog;
  _orig.tamperEvidenceChain = (db as any).tamperEvidenceChain;

  (db as any).invoice = {
    findUnique: invoiceFindUnique,
    findMany: invoiceFindMany,
    create: invoiceCreate,
    update: invoiceUpdate,
    updateMany: invoiceUpdateMany,
    count: invoiceCount,
  };
  (db as any).auditLog = { create: mock(async () => ({ id: "mock-audit-id", createdAt: new Date() })) };
  (db as any).company = {
    findUnique: mock(async () => ({
      plan: "trial",
      trialEndsAt: null,
      subscriptionStatus: "active",
    })),
  };
  (db as any).featureFlag = {
    findUnique: async () => ({ key: "product-auto-matching", isActive: true }),
  };
  (db as any).platformSetting = { findMany: async () => [] };
  (db as any).$transaction = async (fn: any) => fn(RICH_TX);
  // H5 FIX: idempotencyKey mock for payment idempotency tests
  (db as any).idempotencyKey = {
    findUnique: idempotencyFindUnique,
    upsert: idempotencyUpsert,
  };
  // Audit support: logAdminAction uses db.adminAuditLog.create
  (db as any).adminAuditLog = { create: mock(async () => ({ id: "mock-admin-audit" })) };
  // Tamper evidence: logAudit calls appendToChain which uses db.tamperEvidenceChain
  // inside $transaction (best-effort, fire-and-forget with .catch())
  (db as any).tamperEvidenceChain = {
    findFirst: async () => null,
    create: async () => ({ id: "mock-chain" }),
    findMany: async () => [],
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
    count: async () => 0,
  };
});

afterAll(() => {
  (db as any).invoice = _orig.invoice;
  (db as any).auditLog = _orig.auditLog;
  (db as any).company = _orig.company;
  (db as any).featureFlag = _orig.featureFlag;
  (db as any).platformSetting = _orig.platformSetting;
  (db as any).$transaction = _orig.$transaction;
  (db as any).idempotencyKey = _orig.idempotencyKey;
  (db as any).adminAuditLog = _orig.adminAuditLog;
  (db as any).tamperEvidenceChain = _orig.tamperEvidenceChain;
});

// ─── Test fixtures ────────────────────────────────────────────────────────────

const ADMIN_USER = {
  uid: "u1",
  email: "founder@garfix.app",
  role: "admin",
  companies: ["test-co"],
  permissions: {},
};

const TENANT_USER = {
  uid: "u2",
  email: "alice@test.com",
  role: "staff",
  companies: ["test-co"],
  permissions: { create_invoice: 1, edit_invoice: 1, delete_invoice: 1 },
};

const VALID_BODY = {
  companySlug: "test-co",
  invoiceNumber: "INV-001",
  clientName: "Alice",
  issueDate: "2024-01-01",
  dueDate: "2024-01-15",
  lineItems: [{ description: "Item A", qty: 2, price: 1.5 }],
};

function makePostRequest(body: any): NextRequest {
  return new NextRequest("https://example.com/api/invoices", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}
function makePatchRequest(id: string, body: any): NextRequest {
  return new NextRequest(`https://example.com/api/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`https://example.com/api/invoices/${id}`, { method: "DELETE" });
}
function makeIdCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function baseInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    companySlug: "test-co",
    invoiceNumber: "INV-1",
    lineItems: JSON.stringify([{ description: "A", qty: 1, price: 2 }]),
    subtotal: "2.000",
    taxRate: "0",
    taxAmount: "0.000",
    total: "2.000",
    shipping: "0.000",
    paid: "0.000",
    discount: "0.000",
    version: 0,
    deletedAt: null,
    // PRE-EXISTING FIX: checkInvoiceRetention() in the DELETE route reads
    // `invoice.createdAt` and calls `new Date(...)` on it. Without this
    // field the route throws "Invalid Date" and the test gets a 500 instead
    // of 200. Add it to the base fixture so all tests have a valid date.
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    issueDate: "2024-01-01",
    dueDate: "2024-01-15",
    ...overrides,
  };
}

// ─── Reset state before each test ─────────────────────────────────────────────

beforeEach(() => {
  authUser = ADMIN_USER;
  permissionGranted = true;
  existingInvoice = null;
  invoiceById = null;
  invoiceList = [];
  trialOk = true;
  quotaOk = true;
  lastFindManyArgs = null;
  lastUpdateArgs = null;
  lastUpdateManyArgs = null;
  nextUpdateManyCount = null;
  lastIdempotencyUpsertArgs = null;
  idempotencyStore = new Map();
  invoiceFindUnique.mockClear();
  invoiceFindMany.mockClear();
  invoiceCreate.mockClear();
  invoiceUpdate.mockClear();
  invoiceUpdateMany.mockClear();
  invoiceCount.mockClear();
  idempotencyFindUnique.mockClear();
  idempotencyUpsert.mockClear();
});

// ─── POST /api/invoices ───────────────────────────────────────────────────────

describe("POST /api/invoices", () => {
  it("1. happy path → 200 with { ok, invoice, reviewQueueWarnings }", async () => {
    const res = await invoicesPOST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.invoice).toBeDefined();
    expect(body.invoice.invoiceNumber).toBe("INV-001");
    expect(body.invoice.companySlug).toBe("test-co");
    expect(Array.isArray(body.reviewQueueWarnings)).toBe(true);
    expect(body.reviewQueueWarnings.length).toBe(0);
  });

  it("2. 403 forbidden — user lacks company access", async () => {
    authUser = {
      uid: "u3",
      email: "stranger@test.com",
      role: "staff",
      companies: [],
      permissions: { create_invoice: 1 },
    };
    const res = await invoicesPOST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("3. 409 duplicate invoice number — same companySlug_invoiceNumber exists", async () => {
    existingInvoice = baseInvoice({
      id: 99,
      invoiceNumber: "INV-001",
      companySlug: "test-co",
    });
    const res = await invoicesPOST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("4. 400 invalid input — missing required fields", async () => {
    const badBody = { companySlug: "test-co" };
    const res = await invoicesPOST(makePostRequest(badBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── GET /api/invoices (list) ─────────────────────────────────────────────────

describe("GET /api/invoices (list)", () => {
  it("5. happy path → 200 with array of invoices + parsed lineItems JSON", async () => {
    invoiceList = [
      baseInvoice({ id: 1, invoiceNumber: "INV-1" }),
      baseInvoice({
        id: 2,
        invoiceNumber: "INV-2",
        lineItems: JSON.stringify([{ description: "B", qty: 3, price: 4 }]),
      }),
    ];
    const res = await listGET(makeGetRequest("https://example.com/api/invoices?companySlug=test-co"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.invoices)).toBe(true);
    expect(body.invoices.length).toBe(2);
    // lineItems should be parsed back into an array, not left as a JSON string.
    expect(Array.isArray(body.invoices[0].lineItems)).toBe(true);
    expect(body.invoices[0].lineItems[0].description).toBe("A");
    expect(body.invoices[1].lineItems[0].qty).toBe(3);
  });

  it("6. filters by status — passes `status` query param into the where clause", async () => {
    invoiceList = [];
    const res = await listGET(
      makeGetRequest("https://example.com/api/invoices?companySlug=test-co&status=paid"),
    );
    expect(res.status).toBe(200);
    expect(lastFindManyArgs).not.toBeNull();
    expect(lastFindManyArgs.where.status).toBe("paid");
    expect(lastFindManyArgs.where.companySlug).toBe("test-co");
  });
});

// ─── GET /api/invoices/[id] ───────────────────────────────────────────────────

describe("GET /api/invoices/[id]", () => {
  it("7. happy path → 200 with single invoice", async () => {
    invoiceById = baseInvoice({ id: 5, invoiceNumber: "INV-5" });
    const res = await singleGET(
      makeGetRequest("https://example.com/api/invoices/5"),
      makeIdCtx("5"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoice).toBeDefined();
    expect(body.invoice.id).toBe(5);
    expect(Array.isArray(body.invoice.lineItems)).toBe(true);
  });

  it("8. 404 not found", async () => {
    invoiceById = null;
    const res = await singleGET(
      makeGetRequest("https://example.com/api/invoices/999"),
      makeIdCtx("999"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("9. 403 cross-tenant — invoice exists but belongs to a different company", async () => {
    authUser = TENANT_USER; // staff with access only to "test-co"
    invoiceById = baseInvoice({ id: 7, companySlug: "other-co" });
    const res = await singleGET(
      makeGetRequest("https://example.com/api/invoices/7"),
      makeIdCtx("7"),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── PATCH /api/invoices/[id] ─────────────────────────────────────────────────

describe("PATCH /api/invoices/[id]", () => {
  it("10. happy path → updates invoice, increments version (PATCH does NOT accept `status` — security: payments go through /payment endpoint)", async () => {
    // SECURITY NOTE: the PATCH /api/invoices/[id] route intentionally strips
    // `status` from its UpdateSchema (see route.ts line 25-31). Status changes
    // must go through PATCH /api/invoices/[id]/status (operational statuses
    // only: draft/sent/overdue/cancelled) or PATCH /api/invoices/[id]/payment
    // (for paid/partial — requires finance_access + updates `paid` amount).
    // The test below verifies the PATCH route accepts `notes` (a field that IS
    // in the schema) and increments the version — and that `status` is NOT
    // propagated to the update payload (defense-in-depth check).
    //
    // C1 FIX: the route now uses `updateMany` with `version: { increment: 1 }`
    // instead of `update` with `version: existing.version + 1`. The mock
    // returns count=1 (success) since expectedVersion matches the current row.
    invoiceById = baseInvoice({ id: 10, version: 3, status: "sent" });
    const res = await invoicesPATCH(
      makePatchRequest("10", { notes: "updated by test", expectedVersion: 3 }),
      makeIdCtx("10"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.invoice).toBeDefined();
    // Version increment is now expressed atomically via Prisma's `{ increment: 1 }`.
    expect(lastUpdateManyArgs).not.toBeNull();
    expect(lastUpdateManyArgs.data.version).toEqual({ increment: 1 });
    expect(lastUpdateManyArgs.data.notes).toBe("updated by test");
    // The where clause must include both the version filter AND the
    // soft-delete filter — that's the atomic optimistic-lock guarantee.
    expect(lastUpdateManyArgs.where.id).toBe(10);
    expect(lastUpdateManyArgs.where.version).toBe(3);
    expect(lastUpdateManyArgs.where.deletedAt).toBeNull();
  });

  it("10b. PATCH strips `status` from body — security: status changes require /status or /payment endpoint", async () => {
    // Verify the security comment in route.ts is actually enforced: even if a
    // caller tries to send `status: "paid"` via the general PATCH endpoint,
    // zod's safeParse drops it (it's not in UpdateSchema) so the update
    // payload does NOT include `status`. The invoice keeps its existing status.
    invoiceById = baseInvoice({ id: 10, version: 3, status: "sent" });
    const res = await invoicesPATCH(
      makePatchRequest("10", { status: "paid", notes: "trying to mark paid", expectedVersion: 3 }),
      makeIdCtx("10"),
    );
    expect(res.status).toBe(200);
    expect(lastUpdateManyArgs).not.toBeNull();
    expect(lastUpdateManyArgs.data.status).toBeUndefined(); // status NOT propagated
    expect(lastUpdateManyArgs.data.notes).toBe("trying to mark paid");
  });

  it("10c. PATCH optimistic-lock conflict — wrong expectedVersion returns 409 (C1 FIX: atomic via updateMany count=0)", async () => {
    // C1 FIX regression test: previously the version check was a non-atomic
    // `if (data.expectedVersion !== existing.version)` comparison that was
    // vulnerable to TOCTOU races. Now the check is atomic — the mock
    // returns count=0 because args.where.version (3) !== invoiceById.version (5).
    invoiceById = baseInvoice({ id: 10, version: 5, status: "sent" });
    const res = await invoicesPATCH(
      makePatchRequest("10", { notes: "stale edit", expectedVersion: 3 }), // client thinks v3, server has v5
      makeIdCtx("10"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("VERSION_CONFLICT");
    // The atomic updateMany was called (with the wrong version filter) and
    // returned count=0 — proving the conflict was detected at the DB layer.
    expect(lastUpdateManyArgs).not.toBeNull();
    expect(lastUpdateManyArgs.where.version).toBe(3);
  });

  it("10d. C1 FIX: concurrent edit detected atomically — updateMany returns count=0 → 409", async () => {
    // Simulate the race: client read v3, between read and write another
    // request bumped the row to v4. The atomic updateMany with where.version=3
    // must return count=0 (the row no longer matches the filter) — the route
    // must return 409. With the OLD non-atomic code, the route would have
    // called invoice.update and silently overwritten the concurrent change.
    invoiceById = baseInvoice({ id: 11, version: 4, status: "sent" }); // server row is now v4
    nextUpdateManyCount = 0; // force count=0 regardless of version filter
    const res = await invoicesPATCH(
      makePatchRequest("11", { notes: "edit based on stale v3", expectedVersion: 3 }),
      makeIdCtx("11"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_CONFLICT");
  });

  it("10e. H4 FIX: PATCH on soft-deleted invoice → 404 (not 200 with silent overwrite)", async () => {
    // The route now checks `existing.deletedAt` up front AND includes
    // `deletedAt: null` in the updateMany where clause as a defense-in-depth
    // against concurrent soft-deletes.
    invoiceById = baseInvoice({ id: 12, version: 1, deletedAt: new Date("2024-01-01") });
    const res = await invoicesPATCH(
      makePatchRequest("12", { notes: "edit after delete", expectedVersion: 1 }),
      makeIdCtx("12"),
    );
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/invoices/[id] ────────────────────────────────────────────────

describe("DELETE /api/invoices/[id]", () => {
  it("11. soft delete → sets deletedAt, returns 200", async () => {
    invoiceById = baseInvoice({ id: 11, deletedAt: null });
    const res = await invoicesDELETE(makeDeleteRequest("11"), makeIdCtx("11"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // The handler should have called invoice.update with a deletedAt Date.
    expect(lastUpdateArgs).not.toBeNull();
    expect(lastUpdateArgs.data.deletedAt).toBeInstanceOf(Date);
  });

  it("11b. delete on already-deleted invoice → 400", async () => {
    invoiceById = baseInvoice({ id: 12, deletedAt: new Date("2024-01-01") });
    const res = await invoicesDELETE(makeDeleteRequest("12"), makeIdCtx("12"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Payment + status transitions ─────────────────────────────────────────────
//
// The general PATCH /api/invoices/[id] route INTENTIONALLY does NOT accept
// `status` (see security comment in route.ts). Status transitions flow through
// two dedicated endpoints:
//   - PATCH /api/invoices/[id]/status   — operational statuses only
//     (draft/sent/overdue/cancelled), requires `edit_invoice`.
//   - PATCH /api/invoices/[id]/payment  — record a payment, computes
//     paid/partial status from the cumulative `paid` amount, requires
//     `finance_access`.
//
// These tests verify the payment-status transition rules: unpaid → partial →
// paid, with the status field derived from the cumulative `paid` amount.

import { PATCH as paymentPATCH } from "@/app/api/invoices/[id]/payment/route";
import { PATCH as statusPATCH } from "@/app/api/invoices/[id]/status/route";

describe("PATCH /api/invoices/[id]/payment", () => {
  it("12. partial payment → status flips to 'partial', paid amount accumulates", async () => {
    invoiceById = baseInvoice({
      id: 20, version: 1, status: "sent", total: "100.000", paid: "0.000",
    });
    const res = await paymentPATCH(
      makePatchRequest("20", { amount: 30, method: "cash", expectedVersion: 1 }),
      makeIdCtx("20"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(lastUpdateManyArgs.data.paid).toBe(30);
    expect(lastUpdateManyArgs.data.status).toBe("partial");
    // C1 FIX: version is now `{ increment: 1 }`, not a literal
    expect(lastUpdateManyArgs.data.version).toEqual({ increment: 1 });
  });

  it("13. full payment (paid >= total) → status flips to 'paid'", async () => {
    invoiceById = baseInvoice({
      id: 21, version: 1, status: "partial", total: "100.000", paid: "60.000",
    });
    // Remaining balance 40; pay 40 → total paid = 100 → status "paid".
    const res = await paymentPATCH(
      makePatchRequest("21", { amount: 40, method: "card", expectedVersion: 1 }),
      makeIdCtx("21"),
    );
    expect(res.status).toBe(200);
    expect(lastUpdateManyArgs.data.paid).toBe(100);
    expect(lastUpdateManyArgs.data.status).toBe("paid");
  });

  it("14. payment on a zero-total invoice → status unchanged (no divide-by-zero trap)", async () => {
    invoiceById = baseInvoice({
      id: 22, version: 1, status: "draft", total: "0.000", paid: "0.000",
    });
    const res = await paymentPATCH(
      makePatchRequest("22", { amount: 0, method: "cash", expectedVersion: 1 }),
      makeIdCtx("22"),
    );
    // amount=0 is now rejected up front (H5 adjacent fix — non-positive amounts
    // could otherwise reduce `paid` on a re-submission). The route returns 400.
    expect(res.status).toBe(400);
  });

  it("14b. H5 FIX: negative amount rejected (defense against `paid` reduction)", async () => {
    invoiceById = baseInvoice({
      id: 23, version: 1, status: "sent", total: "100.000", paid: "50.000",
    });
    const res = await paymentPATCH(
      makePatchRequest("23", { amount: -50, method: "cash", expectedVersion: 1 }),
      makeIdCtx("23"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/greater than zero/);
  });

  it("14c. H4 FIX: payment on soft-deleted invoice → 404 (not silent paid update)", async () => {
    invoiceById = baseInvoice({
      id: 24, version: 1, status: "sent", total: "100.000", paid: "0.000",
      deletedAt: new Date("2024-01-01"),
    });
    const res = await paymentPATCH(
      makePatchRequest("24", { amount: 50, method: "cash", expectedVersion: 1 }),
      makeIdCtx("24"),
    );
    expect(res.status).toBe(404);
  });

  it("14d. C1 FIX: concurrent payment → 409, no payment lost", async () => {
    // Two payments race: client A reads paid=0,v=1; client B reads paid=0,v=1.
    // Client A's updateMany where(v=1) succeeds (count=1, paid=30, v=2).
    // Client B's updateMany where(v=1) fails (count=0, v is now 2) → 409.
    // Client B re-reads, retries with expectedVersion=2 → succeeds (paid=60, v=3).
    // No payment is lost.
    invoiceById = baseInvoice({
      id: 25, version: 2, status: "partial", total: "100.000", paid: "30.000", // after A's write
    });
    nextUpdateManyCount = 0; // simulate B's where(v=1) finding count=0
    const res = await paymentPATCH(
      makePatchRequest("25", { amount: 30, method: "cash", expectedVersion: 1 }),
      makeIdCtx("25"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_CONFLICT");
  });

  it("14e. H5 FIX: idempotent payment — same key replays cached response, no double-charge", async () => {
    // First request: records payment, persists idempotency record.
    invoiceById = baseInvoice({
      id: 26, version: 1, status: "sent", total: "100.000", paid: "0.000",
    });
    const req1 = makePatchRequest("26", {
      amount: 25, method: "card", expectedVersion: 1, idempotencyKey: "abc-123-456",
    });
    const res1 = await paymentPATCH(req1, makeIdCtx("26"));
    expect(res1.status).toBe(200);
    expect(lastUpdateManyArgs).not.toBeNull();
    expect(lastIdempotencyUpsertArgs).not.toBeNull();
    expect(lastIdempotencyUpsertArgs.create.endpoint).toBe("invoice-payment");
    expect(lastIdempotencyUpsertArgs.create.key).toBe("inv-26:abc-123-456");

    // Simulate the DB actually persisting the payment: the next findUnique
    // (whether from this test or from the second replay request) returns the
    // post-update state. We update the fixture in place to mirror what the
    // real DB would return after the updateMany succeeded.
    invoiceById = {
      ...invoiceById,
      version: 2,
      paid: "25.000",
      status: "partial",
    };
    // Re-store the idempotency record with the post-update invoice state, so
    // the cached response reflects paid=25 (not the pre-update paid=0 that
    // was captured before we updated the fixture above).
    // (In production, the route re-fetches the row AFTER the updateMany
    // succeeds, so the cached responseJson always has the post-update state.
    // Our mock findUnique returned the pre-update fixture at the time of the
    // first call, so we re-populate the cache here to mirror production.)
    const cachedKey = "test-co|invoice-payment|inv-26:abc-123-456";
    idempotencyStore.set(cachedKey, {
      companySlug: "test-co",
      endpoint: "invoice-payment",
      key: "inv-26:abc-123-456",
      requestHash: "26:25:card",
      responseJson: JSON.stringify({ ok: true, invoice: invoiceById }),
      status: 200,
      createdAt: new Date(),
    });

    // Second request with the SAME idempotencyKey — must return cached body
    // and NOT call updateMany again.
    const updateManyCallCountBefore = invoiceUpdateMany.mock.calls.length;
    const res2 = await paymentPATCH(
      makePatchRequest("26", {
        amount: 25, method: "card", expectedVersion: 1, idempotencyKey: "abc-123-456",
      }),
      makeIdCtx("26"),
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    // Cached body has the original `invoice` (with paid=25), NOT a second
    // payment that would have made paid=50.
    expect(body2.invoice).toBeDefined();
    expect(body2.invoice.paid).toBe("25.000"); // still 25, not 50
    // And updateMany was NOT called again (idempotent short-circuit).
    expect(invoiceUpdateMany.mock.calls.length).toBe(updateManyCallCountBefore);
  });

  it("14f. H5 FIX: different idempotency keys → independent payments (no false cache hit)", async () => {
    invoiceById = baseInvoice({
      id: 27, version: 1, status: "sent", total: "100.000", paid: "0.000",
    });
    const res1 = await paymentPATCH(
      makePatchRequest("27", { amount: 25, expectedVersion: 1, idempotencyKey: "key-A-12345" }),
      makeIdCtx("27"),
    );
    expect(res1.status).toBe(200);

    // Bump the version so the second request can succeed (atomic lock).
    invoiceById = { ...invoiceById, version: 2, paid: "25.000", status: "partial" };
    const res2 = await paymentPATCH(
      makePatchRequest("27", { amount: 25, expectedVersion: 2, idempotencyKey: "key-B-12345" }),
      makeIdCtx("27"),
    );
    expect(res2.status).toBe(200);
    expect(lastUpdateManyArgs.data.paid).toBe(50); // 25 + 25 = 50
  });
});

describe("PATCH /api/invoices/[id]/status", () => {
  it("15. operational status transition: sent → overdue (allowed)", async () => {
    invoiceById = baseInvoice({ id: 30, version: 1, status: "sent" });
    const res = await statusPATCH(
      makePatchRequest("30", { status: "overdue", expectedVersion: 1 }),
      makeIdCtx("30"),
    );
    expect(res.status).toBe(200);
    expect(lastUpdateManyArgs.data.status).toBe("overdue");
    expect(lastUpdateManyArgs.data.version).toEqual({ increment: 1 });
  });

  it("16. SECURITY: status='paid' rejected on /status endpoint — must go through /payment", async () => {
    // /status route's StatusSchema is z.enum(["draft","sent","overdue","cancelled"])
    // — `paid` and `partial` are intentionally excluded so a non-finance employee
    // can't bypass the payment-recording audit trail.
    invoiceById = baseInvoice({ id: 31, version: 1, status: "sent" });
    const res = await statusPATCH(
      makePatchRequest("31", { status: "paid", expectedVersion: 1 }),
      makeIdCtx("31"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("16b. H4 FIX: status change on soft-deleted invoice → 404", async () => {
    invoiceById = baseInvoice({ id: 32, version: 1, status: "sent", deletedAt: new Date() });
    const res = await statusPATCH(
      makePatchRequest("32", { status: "overdue", expectedVersion: 1 }),
      makeIdCtx("32"),
    );
    expect(res.status).toBe(404);
  });

  it("16c. C1 FIX: concurrent status change → 409 atomic", async () => {
    invoiceById = baseInvoice({ id: 33, version: 5, status: "sent" });
    const res = await statusPATCH(
      makePatchRequest("33", { status: "overdue", expectedVersion: 3 }),
      makeIdCtx("33"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_CONFLICT");
  });
});

// ─── H1 FIX: GET must reject soft-deleted invoices ─────────────────────────

describe("GET /api/invoices/[id] — soft-delete enforcement (H1 FIX)", () => {
  it("17. H1 FIX: GET on soft-deleted invoice → 404 (not silent leak of deleted data)", async () => {
    invoiceById = baseInvoice({ id: 40, deletedAt: new Date("2024-01-01") });
    const res = await singleGET(
      makeGetRequest("https://example.com/api/invoices/40"),
      makeIdCtx("40"),
    );
    expect(res.status).toBe(404);
  });
});
