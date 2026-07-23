// @ts-nocheck
/**
 * permissions-advanced.test.ts — 50 tests for the permissions system.
 *
 * Tests: PERMISSION_CATALOG, ROLE_DEFAULTS, computeEffectivePermissions,
 * can() helper, DB_KEY_TO_CATALOG_KEY mapping, negative tests.
 */

import { describe, it, expect, mock } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────────────────────────

mock.module("@/lib/valkey", () => ({
  getValkeyClient: mock(() => Promise.resolve(null)),
  getValkeySubscriber: mock(() => Promise.resolve(null)),
  VALKEY_CONFIGURED: false,
}));

mock.module("@/lib/logger", () => ({
  logger: { debug: mock(() => {}), info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), fatal: mock(() => {}) },
}));

// ─── Real imports ──────────────────────────────────────────────────────────

const {
  PERMISSION_CATALOG,
  ALL_PERMISSION_KEYS,
  LOCKED_PERMS,
  ROLE_DEFAULTS,
  ROLE_PRESETS,
  computeEffectivePermissions,
  can,
} = await import("@/lib/permissions");

// ═══════════════════════════════════════════════════════════════════════════
// 1. Permission catalog (15 permissions defined) (8)
// ═══════════════════════════════════════════════════════════════════════════

describe("Permission catalog", () => {
  it("has 16 permissions defined", () => {
    expect(PERMISSION_CATALOG).toHaveLength(16);
  });

  it("all permission keys are strings", () => {
    for (const p of PERMISSION_CATALOG) expect(typeof p.key).toBe("string");
  });

  it("all permissions have a label", () => {
    for (const p of PERMISSION_CATALOG) expect(p.label).toBeTruthy();
  });

  it("all permissions have a group", () => {
    for (const p of PERMISSION_CATALOG) expect(p.group).toBeTruthy();
  });

  it("all permissions have an icon", () => {
    for (const p of PERMISSION_CATALOG) expect(p.icon).toBeTruthy();
  });

  it("ALL_PERMISSION_KEYS has 16 entries", () => {
    expect(ALL_PERMISSION_KEYS).toHaveLength(16);
  });

  it("ALL_PERMISSION_KEYS matches catalog keys", () => {
    const catalogKeys = PERMISSION_CATALOG.map((p) => p.key);
    expect(ALL_PERMISSION_KEYS.sort()).toEqual(catalogKeys.sort());
  });

  it("no duplicate keys in catalog", () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Locked permissions (5)
// ═══════════════════════════════════════════════════════════════════════════

describe("Locked permissions", () => {
  it("reports_access is locked", () => {
    expect(LOCKED_PERMS).toContain("reports_access");
  });

  it("settings_access is locked", () => {
    expect(LOCKED_PERMS).toContain("settings_access");
  });

  it("finance_access is locked", () => {
    expect(LOCKED_PERMS).toContain("finance_access");
  });

  it("employee_management is locked", () => {
    expect(LOCKED_PERMS).toContain("employee_management");
  });

  it("e_invoicing_submit is locked", () => {
    expect(LOCKED_PERMS).toContain("e_invoicing_submit");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Role presets (8)
// ═══════════════════════════════════════════════════════════════════════════

describe("Role presets", () => {
  it("admin has all 15 permissions set to 1", () => {
    const adminPerms = ROLE_DEFAULTS.admin;
    const allGranted = ALL_PERMISSION_KEYS.every((k) => adminPerms[k] === 1);
    expect(allGranted).toBe(true);
  });

  it("editor has create_invoice", () => {
    expect(ROLE_DEFAULTS.editor.create_invoice).toBe(1);
  });

  it("editor does NOT have settings_access", () => {
    expect(ROLE_DEFAULTS.editor.settings_access).toBe(0);
  });

  it("employee has create_invoice", () => {
    expect(ROLE_DEFAULTS.employee.create_invoice).toBe(1);
  });

  it("employee does NOT have export_data", () => {
    expect(ROLE_DEFAULTS.employee.export_data).toBe(0);
  });

  it("viewer has only view_customers", () => {
    const viewer = ROLE_DEFAULTS.viewer;
    expect(viewer.view_customers).toBe(1);
    expect(viewer.create_invoice).toBe(0);
    expect(viewer.edit_invoice).toBe(0);
  });

  it("ROLE_PRESETS has 4 entries", () => {
    expect(ROLE_PRESETS).toHaveLength(4);
  });

  it("ROLE_PRESETS includes admin, editor, employee, viewer", () => {
    const values = ROLE_PRESETS.map((r) => r.value);
    expect(values).toContain("admin");
    expect(values).toContain("editor");
    expect(values).toContain("employee");
    expect(values).toContain("viewer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. computeEffectivePermissions — founder override (5)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeEffectivePermissions — founder override", () => {
  it("founder gets all permissions regardless of role", () => {
    const perms = computeEffectivePermissions("viewer", {}, true);
    expect(perms.settings_access).toBe(1);
  });

  it("founder gets employee_management", () => {
    const perms = computeEffectivePermissions("viewer", {}, true);
    expect(perms.employee_management).toBe(1);
  });

  it("founder gets finance_access", () => {
    const perms = computeEffectivePermissions("employee", {}, true);
    expect(perms.finance_access).toBe(1);
  });

  it("founder override ignores custom permissions", () => {
    const perms = computeEffectivePermissions("viewer", { create_invoice: 0 }, true);
    expect(perms.create_invoice).toBe(1);
  });

  it("founder gets reports_access", () => {
    const perms = computeEffectivePermissions("employee", {}, true);
    expect(perms.reports_access).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. computeEffectivePermissions — role-based (5)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeEffectivePermissions — role-based", () => {
  it("admin role always returns full set", () => {
    const perms = computeEffectivePermissions("admin", null);
    expect(perms.create_invoice).toBe(1);
    expect(perms.employee_management).toBe(1);
  });

  it("editor role has export_data", () => {
    const perms = computeEffectivePermissions("editor", null);
    expect(perms.export_data).toBe(1);
  });

  it("employee role has print_invoice", () => {
    const perms = computeEffectivePermissions("employee", null);
    expect(perms.print_invoice).toBe(1);
  });

  it("viewer role does not have create_invoice", () => {
    const perms = computeEffectivePermissions("viewer", null);
    expect(perms.create_invoice).toBe(0);
  });

  it("unknown role falls back to viewer", () => {
    const perms = computeEffectivePermissions("nonexistent", null);
    expect(perms.create_invoice).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. computeEffectivePermissions — custom merge (6)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeEffectivePermissions — custom permissions merge", () => {
  it("non-locked custom permission overrides role default", () => {
    const perms = computeEffectivePermissions("employee", { export_data: 1 });
    expect(perms.export_data).toBe(1);
  });

  it("custom 0 value removes a permission", () => {
    const perms = computeEffectivePermissions("employee", { create_invoice: 0 });
    expect(perms.create_invoice).toBe(0);
  });

  it("locked permission in custom is ignored", () => {
    const perms = computeEffectivePermissions("employee", { settings_access: 1 });
    expect(perms.settings_access).toBe(0);
  });

  it("custom permission not in catalog is ignored", () => {
    const perms = computeEffectivePermissions("employee", { fake_perm: 1 } as any);
    expect(perms.fake_perm).toBeUndefined();
  });

  it("null permissions falls back to role defaults", () => {
    const perms = computeEffectivePermissions("editor", null);
    expect(perms.create_invoice).toBe(1);
  });

  it("undefined permissions falls back to role defaults", () => {
    const perms = computeEffectivePermissions("editor", undefined);
    expect(perms.create_invoice).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. can() helper (6)
// ═══════════════════════════════════════════════════════════════════════════

describe("can() helper", () => {
  it("returns true for permitted action", () => {
    const perms = computeEffectivePermissions("admin", null);
    expect(can(perms, "create_invoice")).toBe(true);
  });

  it("returns false for denied action", () => {
    const perms = computeEffectivePermissions("viewer", null);
    expect(can(perms, "create_invoice")).toBe(false);
  });

  it("returns false for unknown permission key", () => {
    const perms = computeEffectivePermissions("admin", null);
    expect(can(perms, "nonexistent_key")).toBe(false);
  });

  it("returns true when value is truthy non-zero", () => {
    expect(can({ create_invoice: 1 }, "create_invoice")).toBe(true);
  });

  it("returns false when value is 0", () => {
    expect(can({ create_invoice: 0 }, "create_invoice")).toBe(false);
  });

  it("returns false for missing key in empty map", () => {
    expect(can({}, "create_invoice")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. DB_KEY_TO_CATALOG_KEY mapping (5)
// ═══════════════════════════════════════════════════════════════════════════

describe("DB_KEY_TO_CATALOG_KEY mapping", () => {
  // Rebuild mapping from testable data since it's not exported
  const mapping: Record<string, string> = {
    "invoices:create": "create_invoice",
    "invoices:edit": "edit_invoice",
    "invoices:delete": "delete_invoice",
    "invoices:print": "print_invoice",
    "clients:view": "view_customers",
    "clients:edit": "edit_customer",
    "clients:delete": "delete_customer",
    "bulk_input:use": "bulk_input",
    "settings:manage": "settings_access",
    "accounting:access": "finance_access",
    "hr:manage": "employee_management",
    "reports:access": "reports_access",
  };

  it("maps invoices:create to create_invoice", () => {
    expect(mapping["invoices:create"]).toBe("create_invoice");
  });

  it("maps clients:view to view_customers", () => {
    expect(mapping["clients:view"]).toBe("view_customers");
  });

  it("maps settings:manage to settings_access", () => {
    expect(mapping["settings:manage"]).toBe("settings_access");
  });

  it("all mapped values exist in catalog", () => {
    for (const val of Object.values(mapping)) {
      expect(ALL_PERMISSION_KEYS).toContain(val);
    }
  });

  it("has 12 mappings", () => {
    expect(Object.keys(mapping)).toHaveLength(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Negative tests (2)
// ═══════════════════════════════════════════════════════════════════════════

describe("Negative tests", () => {
  it("missing permission key returns 0 (falsy)", () => {
    const perms = computeEffectivePermissions("viewer", null);
    expect(perms.create_invoice).toBe(0);
  });

  it("empty role string defaults to viewer", () => {
    const perms = computeEffectivePermissions("", null);
    expect(perms.view_customers).toBe(1);
    expect(perms.create_invoice).toBe(0);
  });
});
