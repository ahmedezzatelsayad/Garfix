// @ts-nocheck
/**
 * audit-advanced.test.ts — 30 tests for the audit module and tamper audit.
 *
 * Tests: logAudit (correct fields, null entityId, null details, DB error),
 * logAdminAction (correct fields, optional fields, DB error), and
 * tamperAudit integration (appendToChain, verifyChain).
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAuditLogCreate = mock(() => Promise.resolve({ id: "audit-1" }));
const mockAdminAuditLogCreate = mock(() => Promise.resolve({ id: "admin-audit-1" }));
const mockTamperCreate = mock(() => Promise.resolve({ id: "chain-1" }));
const mockTamperFindFirst = mock(() => Promise.resolve(null));
const mockTamperFindMany = mock(() => Promise.resolve([]));
const mockTamperUpdate = mock(() => Promise.resolve({}));
const mockTamperUpdateMany = mock(() => Promise.resolve({ count: 0 }));

mock.module("@/lib/db", () => ({
  db: {
    auditLog: {
      create: mockAuditLogCreate,
    },
    adminAuditLog: {
      create: mockAdminAuditLogCreate,
    },
    tamperEvidenceChain: {
      create: mockTamperCreate,
      findFirst: mockTamperFindFirst,
      findMany: mockTamperFindMany,
      update: mockTamperUpdate,
      updateMany: mockTamperUpdateMany,
    },
  },
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

// Import after mocks
const { logAudit, logAdminAction } = await import("@/lib/audit");
const { appendToChain, verifyChain, getChainStats } = await import("@/lib/tamperAudit");

// ─── logAudit ───────────────────────────────────────────────────────────────

describe("logAudit", () => {
  beforeEach(() => {
    mockAuditLogCreate.mockClear();
  });

  it("creates entry with correct fields", async () => {
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-1",
      action: "CREATE_INVOICE",
      entity: "Invoice",
      entityId: "inv-123",
      companySlug: "my-co",
      details: { amount: 100 },
    });
    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.userEmail).toBe("user@test.com");
    expect(call.data.userUid).toBe("uid-1");
    expect(call.data.action).toBe("CREATE_INVOICE");
    expect(call.data.entity).toBe("Invoice");
    expect(call.data.entityId).toBe("inv-123");
    expect(call.data.companySlug).toBe("my-co");
    expect(call.data.details).toBe(JSON.stringify({ amount: 100 }));
  });

  it("handles null entityId (converts to null)", async () => {
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-2",
      action: "VIEW_DASHBOARD",
      entity: "Dashboard",
      entityId: null,
    });
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.entityId).toBeNull();
  });

  it("handles undefined entityId (converts to null)", async () => {
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-3",
      action: "VIEW",
      entity: "Page",
    });
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.entityId).toBeNull();
  });

  it("handles numeric entityId (converts to string)", async () => {
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-4",
      action: "UPDATE",
      entity: "Product",
      entityId: 42,
    });
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.entityId).toBe("42");
  });

  it("handles null details (stored as null)", async () => {
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-5",
      action: "LOGIN",
      entity: "Session",
      details: null,
    });
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.details).toBeNull();
  });

  it("handles undefined details (stored as null)", async () => {
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-6",
      action: "LOGOUT",
      entity: "Session",
    });
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.details).toBeNull();
  });

  it("stringifies details object", async () => {
    const details = { key: "value", nested: { a: 1 } };
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-7",
      action: "TEST",
      entity: "Test",
      details,
    });
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(typeof call.data.details).toBe("string");
    expect(JSON.parse(call.data.details)).toEqual(details);
  });

  it("defaults companySlug to null when undefined", async () => {
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-8",
      action: "TEST",
      entity: "Test",
    });
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.companySlug).toBeNull();
  });

  it("does not throw on DB error", async () => {
    mockAuditLogCreate.mockRejectedValueOnce(new Error("DB down"));
    let threw = false;
    try {
      await logAudit({
        userEmail: "user@test.com",
        userUid: "uid-err",
        action: "FAIL_TEST",
        entity: "Test",
      });
    } catch { threw = true; }
    expect(threw).toBe(false);
  });

  it("stringifies complex details", async () => {
    const details = { items: [1, 2, 3], flag: true, value: null };
    await logAudit({
      userEmail: "user@test.com",
      userUid: "uid-complex",
      action: "COMPLEX",
      entity: "Test",
      details,
    });
    const call = mockAuditLogCreate.mock.calls[0][0] as any;
    expect(JSON.parse(call.data.details)).toEqual(details);
  });
});

// ─── logAdminAction ─────────────────────────────────────────────────────────

describe("logAdminAction", () => {
  beforeEach(() => {
    mockAdminAuditLogCreate.mockClear();
  });

  it("creates entry with all required fields", async () => {
    await logAdminAction({
      adminEmail: "admin@test.com",
      action: "DELETE_USER",
      targetType: "User",
      targetId: "uid-del",
      changes: { status: "deleted" },
      ipAddress: "10.0.0.1",
      userAgent: "Mozilla/5.0",
    });
    expect(mockAdminAuditLogCreate).toHaveBeenCalledTimes(1);
    const call = mockAdminAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.adminEmail).toBe("admin@test.com");
    expect(call.data.action).toBe("DELETE_USER");
    expect(call.data.targetType).toBe("User");
    expect(call.data.targetId).toBe("uid-del");
    expect(call.data.changes).toBe(JSON.stringify({ status: "deleted" }));
    expect(call.data.ipAddress).toBe("10.0.0.1");
    expect(call.data.userAgent).toBe("Mozilla/5.0");
  });

  it("handles optional fields being omitted", async () => {
    await logAdminAction({
      adminEmail: "admin@test.com",
      action: "VIEW_LOGS",
    });
    const call = mockAdminAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.targetType).toBeNull();
    expect(call.data.targetId).toBeNull();
    expect(call.data.changes).toBeNull();
    expect(call.data.ipAddress).toBeNull();
    expect(call.data.userAgent).toBeNull();
  });

  it("handles null optional fields", async () => {
    await logAdminAction({
      adminEmail: "admin@test.com",
      action: "VIEW",
      targetType: null,
      targetId: null,
      changes: null,
      ipAddress: null,
      userAgent: null,
    });
    const call = mockAdminAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.targetType).toBeNull();
    expect(call.data.changes).toBeNull();
  });

  it("stringifies changes when provided", async () => {
    await logAdminAction({
      adminEmail: "admin@test.com",
      action: "UPDATE_ROLE",
      changes: { oldRole: "editor", newRole: "admin" },
    });
    const call = mockAdminAuditLogCreate.mock.calls[0][0] as any;
    expect(call.data.changes).toBe(JSON.stringify({ oldRole: "editor", newRole: "admin" }));
  });

  it("does not throw on DB error", async () => {
    mockAdminAuditLogCreate.mockRejectedValueOnce(new Error("DB down"));
    let threw = false;
    try {
      await logAdminAction({
        adminEmail: "admin@test.com",
        action: "FAIL_TEST",
      });
    } catch { threw = true; }
    expect(threw).toBe(false);
  });

  it("handles empty changes object", async () => {
    await logAdminAction({
      adminEmail: "admin@test.com",
      action: "NOOP",
      changes: {},
    });
    const call = mockAdminAuditLogCreate.mock.calls[0][0] as any;
    // Empty object is truthy, so it gets stringified
    expect(call.data.changes).toBe("{}");
  });
});

// ─── tamperAudit: appendToChain ─────────────────────────────────────────────

describe("tamperAudit — appendToChain", () => {
  beforeEach(() => {
    mockTamperCreate.mockClear();
    mockTamperFindFirst.mockClear();
  });

  it("creates genesis entry when chain is empty", async () => {
    mockTamperFindFirst.mockResolvedValueOnce(null);
    await appendToChain({
      entryId: "entry-1",
      content: {
        userEmail: "user@test.com",
        action: "TEST",
        entity: "Test",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
    });
    expect(mockTamperCreate).toHaveBeenCalledTimes(1);
    const call = mockTamperCreate.mock.calls[0][0] as any;
    expect(call.data.prevHash).toBe("GENESIS");
    expect(call.data.chainOrder).toBe(0);
    expect(call.data.entryId).toBe("entry-1");
  });

  it("links to previous entry when chain exists", async () => {
    mockTamperFindFirst.mockResolvedValueOnce({
      contentHash: "prev-hash-abc123",
      chainOrder: 5,
    });
    await appendToChain({
      entryId: "entry-2",
      content: {
        userEmail: "user@test.com",
        action: "TEST2",
        entity: "Test",
        createdAt: new Date("2024-01-01T01:00:00Z"),
      },
      companySlug: "co-a",
    });
    const call = mockTamperCreate.mock.calls[0][0] as any;
    expect(call.data.prevHash).toBe("prev-hash-abc123");
    expect(call.data.chainOrder).toBe(6);
    expect(call.data.companySlug).toBe("co-a");
  });

  it("does not throw on DB error (best-effort)", async () => {
    mockTamperFindFirst.mockRejectedValueOnce(new Error("DB down"));
    let threw = false;
    try {
      await appendToChain({
        entryId: "entry-fail",
        content: {
          userEmail: "u@t.com",
          action: "FAIL",
          entity: "Test",
          createdAt: new Date(),
        },
      });
    } catch { threw = true; }
    expect(threw).toBe(false);
  });

  it("defaults companySlug to null", async () => {
    mockTamperFindFirst.mockResolvedValueOnce(null);
    await appendToChain({
      entryId: "entry-noslug",
      content: {
        userEmail: "u@t.com",
        action: "TEST",
        entity: "Test",
        createdAt: new Date(),
      },
    });
    const call = mockTamperCreate.mock.calls[0][0] as any;
    expect(call.data.companySlug).toBeNull();
  });
});

// ─── tamperAudit: verifyChain ───────────────────────────────────────────────

describe("tamperAudit — verifyChain", () => {
  beforeEach(() => {
    mockTamperFindMany.mockClear();
    mockTamperUpdate.mockClear();
    mockTamperUpdateMany.mockClear();
  });

  it("returns valid for empty chain", async () => {
    mockTamperFindMany.mockResolvedValueOnce([]);
    const result = await verifyChain();
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
  });

  it("returns valid for single genesis entry", async () => {
    mockTamperFindMany.mockResolvedValueOnce([
      { id: "c1", entryId: "e1", contentHash: "hash-1", prevHash: "GENESIS", chainOrder: 0 },
    ]);
    const result = await verifyChain();
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(1);
  });

  it("returns valid for properly linked chain", async () => {
    mockTamperFindMany.mockResolvedValueOnce([
      { id: "c1", entryId: "e1", contentHash: "hash-1", prevHash: "GENESIS", chainOrder: 0 },
      { id: "c2", entryId: "e2", contentHash: "hash-2", prevHash: "hash-1", chainOrder: 1 },
    ]);
    const result = await verifyChain();
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(2);
  });

  it("detects broken chain (prevHash mismatch)", async () => {
    mockTamperFindMany.mockResolvedValueOnce([
      { id: "c1", entryId: "e1", contentHash: "hash-1", prevHash: "GENESIS", chainOrder: 0 },
      { id: "c2", entryId: "e2", contentHash: "hash-2", prevHash: "TAMPERED", chainOrder: 1 },
    ]);
    const result = await verifyChain();
    expect(result.valid).toBe(false);
    expect(result.breakAt).toBeDefined();
    expect(result.breakAt!.entryId).toBe("e2");
    expect(result.breakAt!.reason).toContain("prevHash mismatch");
  });

  it("marks entries as verified on valid chain", async () => {
    mockTamperFindMany.mockResolvedValueOnce([
      { id: "c1", entryId: "e1", contentHash: "hash-1", prevHash: "GENESIS", chainOrder: 0 },
    ]);
    await verifyChain();
    expect(mockTamperUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("updates tampered entry on invalid chain", async () => {
    mockTamperFindMany.mockResolvedValueOnce([
      { id: "c1", entryId: "e1", contentHash: "hash-1", prevHash: "GENESIS", chainOrder: 0 },
      { id: "c2", entryId: "e2", contentHash: "hash-2", prevHash: "WRONG", chainOrder: 1 },
    ]);
    await verifyChain();
    expect(mockTamperUpdate).toHaveBeenCalledTimes(1);
  });

  it("filters by companySlug when provided", async () => {
    mockTamperFindMany.mockResolvedValueOnce([]);
    await verifyChain("co-a");
    const call = mockTamperFindMany.mock.calls[0][0] as any;
    expect(call.where.companySlug).toBe("co-a");
  });

  it("no filter when no companySlug", async () => {
    mockTamperFindMany.mockResolvedValueOnce([]);
    await verifyChain();
    const call = mockTamperFindMany.mock.calls[0][0] as any;
    expect(call.where).toEqual({});
  });
});

// ─── tamperAudit: getChainStats ─────────────────────────────────────────────

describe("tamperAudit — getChainStats", () => {
  it("returns correct stats structure", async () => {
    const { db } = await import("@/lib/db");
    (db as any).tamperEvidenceChain.count = mock(async (args?: any) => {
      if (!args) return 10;
      if (args.where?.isValid === true && args.where?.verifiedAt?.not?.null) return 7;
      if (args.where?.isValid === false) return 1;
      return 10;
    });
    const stats = await getChainStats();
    expect(stats).toHaveProperty("totalEntries");
    expect(stats).toHaveProperty("verifiedCount");
    expect(stats).toHaveProperty("unverifiedCount");
    expect(stats).toHaveProperty("tamperedCount");
  });
});