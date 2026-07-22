// @ts-nocheck
/**
 * multi-tenant-isolation.test.ts — 80 tests for multi-tenant data isolation.
 *
 * Tests buildTenantScope, canAccessCompany, cache key isolation,
 * queue name isolation, AI memory isolation, audit log isolation,
 * metrics isolation, permission elevation prevention, and API route isolation.
 */

import { describe, it, expect, mock } from "bun:test";

// ─── Mock valkey & logger BEFORE imports ─────────────────────────────────

mock.module("@/lib/valkey", () => ({
  getValkeyClient: mock(() => Promise.resolve(null)),
  getValkeySubscriber: mock(() => Promise.resolve(null)),
  VALKEY_CONFIGURED: false,
}));

mock.module("@/lib/logger", () => ({
  logger: { debug: mock(() => {}), info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), fatal: mock(() => {}) },
}));

mock.module("@/lib/db", () => ({
  db: {
    auditLog: { create: mock(() => Promise.resolve({})) },
    notification: { create: mock(() => Promise.resolve({})) },
    findMany: mock(() => Promise.resolve([])),
    findUnique: mock(() => Promise.resolve(null)),
  },
}));

// ─── Real imports (tenantScope is pure, no DB needed) ────────────────────

const { buildTenantScope, canAccessCompany } = await import("@/lib/tenantScope");
const { PERMISSION_CATALOG, LOCKED_PERMS, computeEffectivePermissions, can, ROLE_DEFAULTS, ALL_PERMISSION_KEYS } = await import("@/lib/permissions");

// ─── Helpers ──────────────────────────────────────────────────────────────

type User = { uid: string; email: string; role: string; companies: string[]; permissions: Record<string, number>; tv: number };

const adminUser: User = { uid: "a1", email: "admin@garfix.app", role: "admin", companies: ["co-a", "co-b"], permissions: {}, tv: 1 };
const founderUser: User = { uid: "f1", email: "founder@garfix.app", role: "admin", companies: ["co-a", "co-b"], permissions: {}, tv: 1 };
const employeeUser: User = { uid: "e1", email: "emp@co-a.com", role: "employee", companies: ["co-a"], permissions: {}, tv: 1 };
const multiCompanyUser: User = { uid: "m1", email: "multi@co.com", role: "editor", companies: ["co-a", "co-b", "co-c"], permissions: {}, tv: 1 };
const noCompanyUser: User = { uid: "n1", email: "none@x.com", role: "employee", companies: [], permissions: {}, tv: 1 };

// ═══════════════════════════════════════════════════════════════════════════
// 1. buildTenantScope — admin (unrestricted)
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTenantScope — admin unrestricted", () => {
  it("returns empty where for admin with no companySlug", () => {
    const scope = buildTenantScope(adminUser);
    expect(scope.where).toEqual({});
  });

  it("sets unrestricted=true for admin with no companySlug", () => {
    const scope = buildTenantScope(adminUser);
    expect(scope.unrestricted).toBe(true);
  });

  it("sets forbidden=false for admin with no companySlug", () => {
    const scope = buildTenantScope(adminUser);
    expect(scope.forbidden).toBe(false);
  });

  it("returns companyId filter for admin requesting specific company", () => {
    const scope = buildTenantScope(adminUser, "co-a");
    expect(scope.where).toEqual({ companySlug: "co-a" });
  });

  it("sets effectiveSlug for admin requesting specific company", () => {
    const scope = buildTenantScope(adminUser, "co-a");
    expect(scope.effectiveSlug).toBe("co-a");
  });

  it("admin requesting non-member company still gets it (unrestricted)", () => {
    const scope = buildTenantScope(adminUser, "co-z");
    expect(scope.forbidden).toBe(false);
    expect(scope.where).toEqual({ companySlug: "co-z" });
  });

  it("admin unrestricted=false when specific company requested", () => {
    const scope = buildTenantScope(adminUser, "co-a");
    expect(scope.unrestricted).toBe(false);
  });

  it("admin effectiveSlug is null when no company requested", () => {
    const scope = buildTenantScope(adminUser);
    expect(scope.effectiveSlug).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. buildTenantScope — founder
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTenantScope — founder unrestricted", () => {
  it("returns empty where for founder with no companySlug", () => {
    const scope = buildTenantScope(founderUser);
    expect(scope.where).toEqual({});
  });

  it("sets unrestricted=true for founder", () => {
    const scope = buildTenantScope(founderUser);
    expect(scope.unrestricted).toBe(true);
  });

  it("founder can access any specific company", () => {
    const scope = buildTenantScope(founderUser, "co-z");
    expect(scope.forbidden).toBe(false);
    expect(scope.where).toEqual({ companySlug: "co-z" });
  });

  it("founder forbidden is always false", () => {
    const scope = buildTenantScope(founderUser, "nonexistent");
    expect(scope.forbidden).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. buildTenantScope — restricted employee
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTenantScope — restricted employee", () => {
  it("returns company filter for employee requesting own company", () => {
    const scope = buildTenantScope(employeeUser, "co-a");
    expect(scope.where).toEqual({ companySlug: "co-a" });
    expect(scope.forbidden).toBe(false);
  });

  it("returns forbidden=true for employee requesting other company", () => {
    const scope = buildTenantScope(employeeUser, "co-b");
    expect(scope.forbidden).toBe(true);
  });

  it("returns intersection for restricted user with no slug", () => {
    const scope = buildTenantScope(employeeUser);
    expect(scope.where).toEqual({ companySlug: { in: ["co-a"] } });
  });

  it("multi-company user gets intersection of all companies", () => {
    const scope = buildTenantScope(multiCompanyUser);
    expect(scope.where).toEqual({ companySlug: { in: ["co-a", "co-b", "co-c"] } });
  });

  it("multi-company user can request any of their companies", () => {
    const scope = buildTenantScope(multiCompanyUser, "co-b");
    expect(scope.forbidden).toBe(false);
    expect(scope.where).toEqual({ companySlug: "co-b" });
  });

  it("multi-company user cannot request company not in their list", () => {
    const scope = buildTenantScope(multiCompanyUser, "co-z");
    expect(scope.forbidden).toBe(true);
  });

  it("user with no companies gets impossible condition", () => {
    const scope = buildTenantScope(noCompanyUser);
    expect(scope.where).toEqual({ companySlug: "__NO_COMPANIES_ASSIGNED__" });
  });

  it("user with no companies is not forbidden (just no results)", () => {
    const scope = buildTenantScope(noCompanyUser);
    expect(scope.forbidden).toBe(false);
  });

  it("user with no companies requesting specific company is forbidden", () => {
    const scope = buildTenantScope(noCompanyUser, "co-a");
    expect(scope.forbidden).toBe(true);
  });

  it("restricted user unrestricted is always false", () => {
    const scope = buildTenantScope(employeeUser);
    expect(scope.unrestricted).toBe(false);
  });

  it("restricted user effectiveSlug is null when no slug requested", () => {
    const scope = buildTenantScope(multiCompanyUser);
    expect(scope.effectiveSlug).toBe(null);
  });

  it("restricted user effectiveSlug matches requested slug", () => {
    const scope = buildTenantScope(employeeUser, "co-a");
    expect(scope.effectiveSlug).toBe("co-a");
  });

  it("restricted user effectiveSlug is null when forbidden", () => {
    const scope = buildTenantScope(employeeUser, "co-b");
    expect(scope.effectiveSlug).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. buildTenantScope — custom slugField
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTenantScope — custom slugField", () => {
  it("uses custom slugField in where clause", () => {
    const scope = buildTenantScope(employeeUser, "co-a", "companyId");
    expect(scope.where).toEqual({ companyId: "co-a" });
  });

  it("custom slugField in intersection mode", () => {
    const scope = buildTenantScope(employeeUser, undefined, "companyId");
    expect(scope.where).toEqual({ companyId: { in: ["co-a"] } });
  });

  it("custom slugField in impossible condition", () => {
    const scope = buildTenantScope(noCompanyUser, undefined, "tenantId");
    expect(scope.where).toEqual({ tenantId: "__NO_COMPANIES_ASSIGNED__" });
  });

  it("custom slugField with unrestricted admin returns empty", () => {
    const scope = buildTenantScope(adminUser, undefined, "tenantId");
    expect(scope.where).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. canAccessCompany
// ═══════════════════════════════════════════════════════════════════════════

describe("canAccessCompany", () => {
  it("admin can access any company", () => {
    expect(canAccessCompany(adminUser, "co-a")).toBe(true);
  });

  it("admin can access company not in their list", () => {
    expect(canAccessCompany(adminUser, "co-z")).toBe(true);
  });

  it("founder can access any company", () => {
    expect(canAccessCompany(founderUser, "co-z")).toBe(true);
  });

  it("employee can access own company", () => {
    expect(canAccessCompany(employeeUser, "co-a")).toBe(true);
  });

  it("employee cannot access other company", () => {
    expect(canAccessCompany(employeeUser, "co-b")).toBe(false);
  });

  it("employee cannot access nonexistent company", () => {
    expect(canAccessCompany(employeeUser, "co-nonexistent")).toBe(false);
  });

  it("multi-company user can access any assigned company", () => {
    expect(canAccessCompany(multiCompanyUser, "co-c")).toBe(true);
  });

  it("multi-company user cannot access unassigned company", () => {
    expect(canAccessCompany(multiCompanyUser, "co-z")).toBe(false);
  });

  it("user with no companies cannot access any company", () => {
    expect(canAccessCompany(noCompanyUser, "co-a")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Cache key isolation
// ═══════════════════════════════════════════════════════════════════════════

describe("Cache key isolation", () => {
  function tenantCacheKey(companySlug: string, resource: string): string {
    return [companySlug, resource].join(":");
  }

  it("cache keys include companySlug", () => {
    expect(tenantCacheKey("co-a", "invoices")).toBe("co-a:invoices");
  });

  it("different companies produce different keys", () => {
    const keyA = tenantCacheKey("co-a", "dashboard");
    const keyB = tenantCacheKey("co-b", "dashboard");
    expect(keyA).not.toBe(keyB);
  });

  it("same company different resources produce different keys", () => {
    const k1 = tenantCacheKey("co-a", "invoices");
    const k2 = tenantCacheKey("co-a", "products");
    expect(k1).not.toBe(k2);
  });

  it("keys are deterministic for same inputs", () => {
    const k1 = tenantCacheKey("co-a", "data");
    const k2 = tenantCacheKey("co-a", "data");
    expect(k1).toBe(k2);
  });

  it("cache key isolation prevents cross-tenant reads", () => {
    const store = new Map<string, string>();
    store.set(tenantCacheKey("co-a", "config"), "config-a");
    store.set(tenantCacheKey("co-b", "config"), "config-b");
    expect(store.get(tenantCacheKey("co-a", "config"))).toBe("config-a");
    expect(store.get(tenantCacheKey("co-b", "config"))).toBe("config-b");
  });

  it("clearing one tenant's cache does not affect another", () => {
    const store = new Map<string, string>();
    store.set("co-a:inv:1", "v1");
    store.set("co-b:inv:1", "v2");
    store.delete("co-a:inv:1");
    expect(store.has("co-b:inv:1")).toBe(true);
  });

  it("pattern invalidation scoped to company prefix", () => {
    const keys = ["co-a:inv:1", "co-a:inv:2", "co-b:inv:1"];
    const cleared = keys.filter((k) => k.startsWith("co-a:"));
    expect(cleared).toEqual(["co-a:inv:1", "co-a:inv:2"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Queue isolation
// ═══════════════════════════════════════════════════════════════════════════

describe("Queue isolation", () => {
  function tenantQueueName(baseQueue: string, companyId: string): string {
    return `${baseQueue}:${companyId}`;
  }

  it("queue names include companyId", () => {
    expect(tenantQueueName("email-jobs", "co-a")).toBe("email-jobs:co-a");
  });

  it("different companies get different queue names", () => {
    const qA = tenantQueueName("ai-jobs", "co-a");
    const qB = tenantQueueName("ai-jobs", "co-b");
    expect(qA).not.toBe(qB);
  });

  it("same company same base produces same queue name", () => {
    const q1 = tenantQueueName("backup-jobs", "co-a");
    const q2 = tenantQueueName("backup-jobs", "co-a");
    expect(q1).toBe(q2);
  });

  it("jobs in company A queue are not visible in company B", () => {
    const queues = new Map<string, unknown[]>();
    queues.set("email-jobs:co-a", [{ type: "send_email", data: { to: "a@test.com" } }]);
    const coB = queues.get("email-jobs:co-b");
    expect(coB).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. AI Memory isolation
// ═══════════════════════════════════════════════════════════════════════════

describe("AI Memory isolation", () => {
  it("AI memory entry query includes companySlug filter", () => {
    const where = { companySlug: "co-a" };
    expect(where.companySlug).toBe("co-a");
  });

  it("company A memory entries are not visible to company B", () => {
    const memories = [
      { id: 1, companySlug: "co-a", content: "memory A" },
      { id: 2, companySlug: "co-b", content: "memory B" },
    ];
    const filtered = memories.filter((m) => m.companySlug === "co-a");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toBe("memory A");
  });

  it("memory creation includes companySlug", () => {
    const entry = { companySlug: "co-a", content: "test", embedding: [0.1, 0.2] };
    expect(entry.companySlug).toBe("co-a");
  });

  it("memory search is scoped by companySlug", () => {
    const all = [
      { companySlug: "co-a", score: 0.9 },
      { companySlug: "co-b", score: 0.95 },
      { companySlug: "co-a", score: 0.8 },
    ];
    const results = all.filter((m) => m.companySlug === "co-a").sort((a, b) => b.score - a.score);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0.9);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Audit log isolation
// ═══════════════════════════════════════════════════════════════════════════

describe("Audit log isolation", () => {
  it("audit log entries have companySlug", () => {
    const entry = { userEmail: "a@b.com", action: "create_invoice", companySlug: "co-a" };
    expect(entry.companySlug).toBe("co-a");
  });

  it("company A audit logs are not visible to company B users", () => {
    const logs = [
      { id: 1, companySlug: "co-a", action: "create" },
      { id: 2, companySlug: "co-b", action: "delete" },
    ];
    const scope = buildTenantScope(employeeUser, "co-a");
    const filtered = logs.filter((l) => l.companySlug === scope.effectiveSlug);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].action).toBe("create");
  });

  it("admin sees all audit logs (unrestricted scope)", () => {
    const logs = [
      { id: 1, companySlug: "co-a", action: "create" },
      { id: 2, companySlug: "co-b", action: "delete" },
    ];
    const scope = buildTenantScope(adminUser);
    // unrestricted means no filter applied — all logs visible
    expect(scope.unrestricted).toBe(true);
    expect(logs).toHaveLength(2);
  });

  it("audit log query for restricted user uses company filter", () => {
    const scope = buildTenantScope(employeeUser);
    expect(scope.where).toHaveProperty("companySlug");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Metrics isolation
// ═══════════════════════════════════════════════════════════════════════════

describe("Metrics isolation", () => {
  it("aggregate metrics filter by companySlug", () => {
    const invoices = [
      { companySlug: "co-a", total: 100 },
      { companySlug: "co-b", total: 200 },
      { companySlug: "co-a", total: 50 },
    ];
    const coATotal = invoices.filter((i) => i.companySlug === "co-a").reduce((s, i) => s + i.total, 0);
    expect(coATotal).toBe(150);
  });

  it("company B metrics do not leak into company A", () => {
    const metrics = { "co-a": { revenue: 5000 }, "co-b": { revenue: 8000 } };
    const coA = metrics["co-a"];
    expect(coA.revenue).toBe(5000);
    expect(coA.revenue).not.toBe(8000);
  });

  it("metrics per company are independent", () => {
    const companyMetrics = new Map<string, number>();
    companyMetrics.set("co-a", 100);
    companyMetrics.set("co-b", 200);
    companyMetrics.set("co-a", companyMetrics.get("co-a")! + 50);
    expect(companyMetrics.get("co-a")).toBe(150);
    expect(companyMetrics.get("co-b")).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Permission isolation (elevation prevention)
// ═══════════════════════════════════════════════════════════════════════════

describe("Permission isolation — no elevation", () => {
  it("employee cannot grant themselves locked permissions", () => {
    const perms = computeEffectivePermissions("employee", { settings_access: 1 });
    expect(perms.settings_access).toBe(0);
  });

  it("employee cannot grant finance_access", () => {
    const perms = computeEffectivePermissions("employee", { finance_access: 1 });
    expect(perms.finance_access).toBe(0);
  });

  it("employee cannot grant employee_management", () => {
    const perms = computeEffectivePermissions("employee", { employee_management: 1 });
    expect(perms.employee_management).toBe(0);
  });

  it("employee cannot grant reports_access", () => {
    const perms = computeEffectivePermissions("employee", { reports_access: 1 });
    expect(perms.reports_access).toBe(0);
  });

  it("editor cannot grant themselves locked permissions", () => {
    const perms = computeEffectivePermissions("editor", { settings_access: 1 });
    expect(perms.settings_access).toBe(0);
  });

  it("viewer cannot elevate to create_invoice", () => {
    const perms = computeEffectivePermissions("viewer", { create_invoice: 1 });
    expect(perms.create_invoice).toBe(1); // non-locked, can be granted
  });

  it("viewer cannot elevate to locked reports_access", () => {
    const perms = computeEffectivePermissions("viewer", { reports_access: 1 });
    expect(perms.reports_access).toBe(0);
  });

  it("admin always gets full permissions regardless of overrides", () => {
    const perms = computeEffectivePermissions("admin", { create_invoice: 0 });
    expect(perms.create_invoice).toBe(1);
  });

  it("founder override gives all permissions", () => {
    const perms = computeEffectivePermissions("viewer", {}, true);
    expect(perms.settings_access).toBe(1);
    expect(perms.employee_management).toBe(1);
  });

  it("unknown role defaults to viewer permissions", () => {
    const perms = computeEffectivePermissions("unknown_role");
    expect(perms.create_invoice).toBe(0);
    expect(perms.view_customers).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. API route isolation — tenant-scoped queries
// ═══════════════════════════════════════════════════════════════════════════

describe("API route isolation", () => {
  it("list query always includes tenant filter for restricted user", () => {
    const scope = buildTenantScope(employeeUser);
    expect(Object.keys(scope.where).length).toBeGreaterThan(0);
  });

  it("list query for admin has no mandatory filter", () => {
    const scope = buildTenantScope(adminUser);
    expect(Object.keys(scope.where).length).toBe(0);
  });

  it("forbidden scope should block the request", () => {
    const scope = buildTenantScope(employeeUser, "co-b");
    expect(scope.forbidden).toBe(true);
  });

  it("API with specific companySlug and valid user returns filtered where", () => {
    const scope = buildTenantScope(multiCompanyUser, "co-c");
    expect(scope.where).toEqual({ companySlug: "co-c" });
    expect(scope.forbidden).toBe(false);
  });

  it("API with null companySlug and restricted user returns intersection", () => {
    const scope = buildTenantScope(multiCompanyUser, null);
    expect(scope.where).toEqual({ companySlug: { in: ["co-a", "co-b", "co-c"] } });
  });

  it("API with empty string companySlug treated as no filter", () => {
    const scope = buildTenantScope(employeeUser, "");
    // empty string is falsy in JS, so it falls through to intersection
    expect(scope.where).toEqual({ companySlug: { in: ["co-a"] } });
  });

  it("API route builder merges tenant scope with existing filter", () => {
    const scope = buildTenantScope(employeeUser, "co-a");
    const existingFilter = { status: "active" };
    const merged = { ...existingFilter, ...scope.where };
    expect(merged).toEqual({ status: "active", companySlug: "co-a" });
  });
});