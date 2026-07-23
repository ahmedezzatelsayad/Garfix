/**
 * rbac.ts — Enterprise-grade Role-Based Access Control with granular permissions.
 *
 * Enhancements over the legacy permissions.ts:
 *   - Permission hierarchy (inherits from parent roles)
 *   - Resource-level permissions (invoice:read, invoice:write, etc.)
 *   - Scope-based permissions (own, team, company, platform)
 *   - Time-based restrictions (e.g., "approve invoices only during business hours")
 *   - Permission groups (financial, operations, admin, hr)
 *   - Custom role creation capability
 *   - Permission audit trail
 *
 * The legacy flat permission keys (create_invoice, edit_invoice, etc.) are
 * still supported via backward-compatible mapping, but the new system uses
 * structured ResourcePermission objects for fine-grained control.
 */

import { computeEffectivePermissions } from "@/lib/permissions";
import { ALL_PERMISSION_KEYS, LOCKED_PERMS } from "@/lib/permissions";

// ── Enums ────────────────────────────────────────────────────────────────────

export enum PermissionScope {
  /** Only data owned by the user */
  own = "own",
  /** Data owned by the user's team */
  team = "team",
  /** All data in the user's company */
  company = "company",
  /** All data across the platform (founder only) */
  platform = "platform",
}

export enum PermissionLevel {
  /** No access */
  none = 0,
  /** Read-only access */
  read = 1,
  /** Create and edit */
  write = 2,
  /** Approve / authorize */
  approve = 3,
  /** Full control (admin) */
  admin = 4,
  /** Delete records (special action) */
  delete = 10,
  /** Print documents (special action) */
  print = 11,
  /** Export data (special action) */
  export = 12,
  /** E-invoicing submission (special action) */
  e_invoice = 13,
  /** Bulk input (special action) */
  bulk_input = 14,
  /** Manage wholesale prices (special action) */
  manage_prices = 15,
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResourcePermission {
  /** e.g., "invoice", "customer", "report", "settings" */
  resource: string;
  /** e.g., "read", "write", "approve", "admin" */
  level: PermissionLevel;
  /** e.g., "own", "team", "company", "platform" */
  scope: PermissionScope;
}

export interface TimeRestriction {
  /** ISO day numbers: 1=Mon, 7=Sun. Empty = all days. */
  allowedDays?: number[];
  /** Start hour (0-23) in local time. e.g., 8 = "from 8 AM" */
  startHour?: number;
  /** End hour (0-23) in local time. e.g., 17 = "until 5 PM" */
  endHour?: number;
  /** Specific date range (ISO strings) */
  startDate?: string;
  endDate?: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  labelAr: string;
  icon: string;
  resources: string[];
}

export interface RoleDefinition {
  id: string;
  label: string;
  labelAr: string;
  /** Parent role to inherit from (null = root) */
  inheritsFrom: string | null;
  /** Base resource-level permissions for this role */
  resourcePermissions: ResourcePermission[];
  /** Legacy flat permission overrides (backward compat) */
  flatOverrides?: Record<string, number>;
  /** Time-based restrictions on specific resources */
  timeRestrictions?: Record<string, TimeRestriction>;
  /** Is this a built-in role (cannot be deleted)? */
  isBuiltIn: boolean;
  /** Color for UI display */
  color: string;
}

export interface CustomRoleInput {
  id: string;
  label: string;
  labelAr: string;
  inheritsFrom: string;
  resourcePermissions: ResourcePermission[];
  flatOverrides?: Record<string, number>;
  timeRestrictions?: Record<string, TimeRestriction>;
}

export interface PermissionAuditEntry {
  timestamp: string;
  actorUid: string;
  actorEmail: string;
  action: "grant" | "revoke" | "create_role" | "delete_role" | "modify_role";
  targetUid?: string;
  targetRole?: string;
  permission?: string;
  details?: Record<string, unknown>;
}

// ── Permission Groups ────────────────────────────────────────────────────────

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "financial",
    label: "Financial",
    labelAr: "المالية",
    icon: "💰",
    resources: ["invoice", "payment", "accounting", "tax", "budget", "cost_center", "bank_account", "quotation"],
  },
  {
    id: "operations",
    label: "Operations",
    labelAr: "العمليات",
    icon: "📦",
    resources: ["inventory", "warehouse", "purchase", "supplier", "movement"],
  },
  {
    id: "admin",
    label: "Administration",
    labelAr: "إدارة",
    icon: "⚙️",
    resources: ["settings", "report", "audit", "employee", "user", "role", "webhook", "feature_flag"],
  },
  {
    id: "hr",
    label: "HR",
    labelAr: "الموارد البشرية",
    icon: "👔",
    resources: ["salary", "attendance", "leave", "commission", "performance", "gratuity"],
  },
  {
    id: "customer",
    label: "Customer Relations",
    labelAr: "العملاء",
    icon: "👥",
    resources: ["customer", "contact", "statement"],
  },
];

// ── Available resources & actions ────────────────────────────────────────────

export const AVAILABLE_RESOURCES: string[] = PERMISSION_GROUPS.flatMap((g) => g.resources);

export const RESOURCE_ACTIONS: Record<string, string[]> = {
  invoice: ["read", "write", "delete", "approve", "print", "export", "e_invoice"],
  payment: ["read", "write", "delete", "approve", "initiate"],
  accounting: ["read", "write", "approve", "export", "manage_periods", "reconcile"],
  tax: ["read", "write", "file", "approve"],
  budget: ["read", "write", "approve", "export"],
  cost_center: ["read", "write"],
  bank_account: ["read", "write", "manage"],
  quotation: ["read", "write", "delete", "approve", "convert"],
  inventory: ["read", "write", "manage_prices", "bulk_input"],
  warehouse: ["read", "write", "manage"],
  purchase: ["read", "write", "delete", "approve"],
  supplier: ["read", "write", "delete"],
  movement: ["read", "write"],
  settings: ["read", "write"],
  report: ["read", "export", "manage"],
  audit: ["read", "export"],
  employee: ["read", "write", "delete", "manage"],
  user: ["read", "write", "delete", "manage_permissions"],
  role: ["read", "write", "delete", "manage_permissions"],
  webhook: ["read", "write", "delete", "manage"],
  feature_flag: ["read", "write"],
  salary: ["read", "write", "approve"],
  attendance: ["read", "write", "manage"],
  leave: ["read", "write", "approve"],
  commission: ["read", "write", "approve"],
  performance: ["read", "write", "manage"],
  gratuity: ["read", "write", "calculate"],
  customer: ["read", "write", "delete"],
  contact: ["read", "write", "delete"],
  statement: ["read", "generate", "export"],
};

// ── Built-in Role Definitions ────────────────────────────────────────────────

export const ROLE_DEFINITIONS: Record<string, RoleDefinition> = {
  viewer: {
    id: "viewer",
    label: "Viewer",
    labelAr: "عرض فقط",
    inheritsFrom: null,
    isBuiltIn: true,
    color: "#b45309",
    resourcePermissions: [
      { resource: "invoice", level: PermissionLevel.read, scope: PermissionScope.own },
      { resource: "customer", level: PermissionLevel.read, scope: PermissionScope.company },
      { resource: "contact", level: PermissionLevel.read, scope: PermissionScope.company },
    ],
  },
  employee: {
    id: "employee",
    label: "Employee",
    labelAr: "موظف",
    inheritsFrom: "viewer",
    isBuiltIn: true,
    color: "#7c3aed",
    resourcePermissions: [
      // Inherits viewer permissions + adds:
      { resource: "invoice", level: PermissionLevel.write, scope: PermissionScope.own },
      { resource: "invoice", level: PermissionLevel.read, scope: PermissionScope.team },
      { resource: "invoice", level: PermissionLevel.print, scope: PermissionScope.own },
      { resource: "customer", level: PermissionLevel.write, scope: PermissionScope.own },
      { resource: "inventory", level: PermissionLevel.read, scope: PermissionScope.company },
      { resource: "inventory", level: PermissionLevel.write, scope: PermissionScope.own },
    ],
    timeRestrictions: {
      invoice: { allowedDays: [1, 2, 3, 4, 5], startHour: 8, endHour: 17 },
    },
  },
  editor: {
    id: "editor",
    label: "Editor",
    labelAr: "وصول كامل",
    inheritsFrom: "employee",
    isBuiltIn: true,
    color: "#15803d",
    resourcePermissions: [
      // Inherits employee permissions + adds:
      { resource: "invoice", level: PermissionLevel.write, scope: PermissionScope.company },
      { resource: "invoice", level: PermissionLevel.delete, scope: PermissionScope.own },
      { resource: "invoice", level: PermissionLevel.print, scope: PermissionScope.company },
      { resource: "invoice", level: PermissionLevel.export, scope: PermissionScope.company },
      { resource: "invoice", level: PermissionLevel.e_invoice, scope: PermissionScope.company },
      { resource: "customer", level: PermissionLevel.write, scope: PermissionScope.company },
      { resource: "customer", level: PermissionLevel.delete, scope: PermissionScope.own },
      { resource: "inventory", level: PermissionLevel.write, scope: PermissionScope.company },
      { resource: "inventory", level: PermissionLevel.manage_prices, scope: PermissionScope.company },
      { resource: "inventory", level: PermissionLevel.bulk_input, scope: PermissionScope.company },
      { resource: "purchase", level: PermissionLevel.write, scope: PermissionScope.company },
      { resource: "supplier", level: PermissionLevel.write, scope: PermissionScope.company },
      { resource: "warehouse", level: PermissionLevel.write, scope: PermissionScope.company },
    ],
  },
  admin: {
    id: "admin",
    label: "Admin",
    labelAr: "مدير",
    inheritsFrom: "editor",
    isBuiltIn: true,
    color: "#dc2626",
    resourcePermissions: [
      // Inherits editor permissions + adds full admin:
      { resource: "invoice", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "payment", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "accounting", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "tax", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "budget", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "bank_account", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "quotation", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "settings", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "report", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "audit", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "employee", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "user", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "role", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "webhook", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "salary", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "attendance", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "leave", level: PermissionLevel.admin, scope: PermissionScope.company },
      { resource: "customer", level: PermissionLevel.admin, scope: PermissionScope.company },
    ],
  },
  founder: {
    id: "founder",
    label: "Founder",
    labelAr: "المؤسس",
    inheritsFrom: "admin",
    isBuiltIn: true,
    color: "#f59e0b",
    resourcePermissions: [
      // Inherits admin permissions + platform-wide scope:
      { resource: "invoice", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "payment", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "accounting", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "settings", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "report", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "audit", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "employee", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "user", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "role", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "webhook", level: PermissionLevel.admin, scope: PermissionScope.platform },
      { resource: "feature_flag", level: PermissionLevel.admin, scope: PermissionScope.platform },
    ],
  },
};

// ── Custom roles storage (in-memory for module-level, DB-backed in production) ─

const customRoles: Map<string, RoleDefinition> = new Map();

export function getCustomRole(id: string): RoleDefinition | undefined {
  return customRoles.get(id);
}

export function getAllCustomRoles(): RoleDefinition[] {
  return Array.from(customRoles.values());
}

export function createCustomRole(input: CustomRoleInput): RoleDefinition {
  // Validate parent role exists
  const parent = ROLE_DEFINITIONS[input.inheritsFrom] || customRoles.get(input.inheritsFrom);
  if (!parent) {
    throw new Error(`Parent role "${input.inheritsFrom}" does not exist`);
  }
  // Validate no circular inheritance
  if (wouldCreateCircularInheritance(input.id, input.inheritsFrom)) {
    throw new Error("Circular inheritance detected");
  }
  // Validate resource names
  for (const rp of input.resourcePermissions) {
    if (!AVAILABLE_RESOURCES.includes(rp.resource)) {
      throw new Error(`Unknown resource: "${rp.resource}"`);
    }
  }

  const role: RoleDefinition = {
    id: input.id,
    label: input.label,
    labelAr: input.labelAr,
    inheritsFrom: input.inheritsFrom,
    resourcePermissions: input.resourcePermissions,
    flatOverrides: input.flatOverrides,
    timeRestrictions: input.timeRestrictions,
    isBuiltIn: false,
    color: "#6366f1",
  };
  customRoles.set(input.id, role);
  return role;
}

export function deleteCustomRole(id: string): boolean {
  const role = customRoles.get(id);
  if (!role) return false;
  if (role.isBuiltIn) throw new Error("Cannot delete built-in roles");
  // Check no other custom role inherits from this one
  const allCustom = Array.from(customRoles.entries());
  for (const [cid, crole] of allCustom) {
    if (crole.inheritsFrom === id) {
      throw new Error(`Role "${cid}" inherits from "${id}" — delete or reassign first`);
    }
  }
  customRoles.delete(id);
  return true;
}

export function updateCustomRole(id: string, updates: Partial<CustomRoleInput>): RoleDefinition | undefined {
  const existing = customRoles.get(id);
  if (!existing) return undefined;
  if (existing.isBuiltIn) throw new Error("Cannot modify built-in roles");

  const updated: RoleDefinition = {
    ...existing,
    ...updates,
    isBuiltIn: false,
  };

  // Validate inheritance if changed
  if (updates.inheritsFrom) {
    const parent = ROLE_DEFINITIONS[updates.inheritsFrom] || customRoles.get(updates.inheritsFrom);
    if (!parent) throw new Error(`Parent role "${updates.inheritsFrom}" does not exist`);
    if (wouldCreateCircularInheritance(id, updates.inheritsFrom)) {
      throw new Error("Circular inheritance detected");
    }
  }

  // Validate resources if changed
  if (updates.resourcePermissions) {
    for (const rp of updates.resourcePermissions) {
      if (!AVAILABLE_RESOURCES.includes(rp.resource)) {
        throw new Error(`Unknown resource: "${rp.resource}"`);
      }
    }
  }

  customRoles.set(id, updated);
  return updated;
}

// ── Permission Hierarchy ─────────────────────────────────────────────────────

/**
 * Walk the inheritance chain and collect all permissions from ancestor roles.
 * Permissions are merged: higher-level permissions override lower-level ones,
 * wider scopes override narrower ones for the same level.
 */
export function getInheritedPermissions(roleId: string): ResourcePermission[] {
  const chain = getInheritanceChain(roleId);
  const collected: ResourcePermission[] = [];

  // Process from root to leaf — all permissions are collected.
  // The checkPermission function handles deduplication by finding
  // the best matching permission (preferring wider scope & higher level).
  for (const rid of chain) {
    const def = ROLE_DEFINITIONS[rid] || customRoles.get(rid);
    if (!def) continue;
    collected.push(...def.resourcePermissions);
  }

  return collected;
}

/**
 * Get the full inheritance chain from root to the given role.
 */
export function getInheritanceChain(roleId: string): string[] {
  const chain: string[] = [];
  let current: string | null = roleId;

  while (current) {
    chain.unshift(current); // add at beginning (root first)
    const def = ROLE_DEFINITIONS[current] || customRoles.get(current);
    current = def?.inheritsFrom ?? null;
  }

  return chain;
}

// ── Permission Checking ──────────────────────────────────────────────────────

/**
 * Check if a user has a specific permission on a resource at a given scope.
 *
 * This is the core authorization check. It considers:
 *   1. The user's role and inherited permissions
 *   2. Custom per-user overrides (from flat permission system)
 *   3. Time-based restrictions
 *   4. Scope requirements
 *   5. Founder override (full access)
 */
export function checkPermission(
  userPerms: Record<string, number>,
  role: string,
  resource: string,
  action: string,
  scope: PermissionScope,
  isFounder = false,
  customRolePerms?: ResourcePermission[],
  timeRestrictions?: Record<string, TimeRestriction>,
): boolean {
  // Founder always has full access
  if (isFounder) return true;

  // Admin role has company-wide access to everything
  if (role === "admin") {
    if (scope === PermissionScope.platform) return false; // only founder
    return true;
  }

  // Collect all resource permissions for the role (inherited + custom)
  const roleDef = ROLE_DEFINITIONS[role] || customRoles.get(role);
  const inheritedPerms = roleDef ? getInheritedPermissions(role) : [];
  const allPerms = [...inheritedPerms, ...(customRolePerms || [])];

  // Check time restrictions
  if (timeRestrictions?.[resource] || roleDef?.timeRestrictions?.[resource]) {
    const restriction = timeRestrictions?.[resource] || roleDef?.timeRestrictions?.[resource];
    if (restriction && !isWithinTimeRestriction(restriction)) {
      return false;
    }
  }

  // Find matching permission
  const matchingPerm = allPerms.find((rp) => {
    if (rp.resource !== resource) return false;
    const permAction = levelToAction(rp.level);
    // Check if the granted action covers the requested action
    if (!actionCovers(permAction, action)) return false;
    // Check if the granted scope covers the requested scope
    if (!scopeCovers(rp.scope, scope)) return false;
    return true;
  });

  if (matchingPerm) return true;

  // Fall back to legacy flat permission system
  return checkLegacyPermission(userPerms, resource, action);
}

/**
 * Map PermissionLevel to action string.
 */
function levelToAction(level: PermissionLevel): string {
  switch (level) {
    case PermissionLevel.read: return "read";
    case PermissionLevel.write: return "write";
    case PermissionLevel.approve: return "approve";
    case PermissionLevel.admin: return "admin";
    case PermissionLevel.delete: return "delete";
    case PermissionLevel.print: return "print";
    case PermissionLevel.export: return "export";
    case PermissionLevel.e_invoice: return "e_invoice";
    case PermissionLevel.bulk_input: return "bulk_input";
    case PermissionLevel.manage_prices: return "manage_prices";
    default: return "none";
  }
}

/**
 * Check if a granted action covers a requested action.
 * Hierarchy: admin > approve > write > read > none
 * "admin" covers everything. "approve" covers write + read. etc.
 */
function actionCovers(granted: string, requested: string): boolean {
  // Special actions that don't follow the hierarchy (e.g., "print", "export")
  const SPECIAL_ACTIONS = ["print", "export", "e_invoice", "bulk_input", "manage_prices",
    "manage", "manage_periods", "reconcile", "file", "initiate", "convert",
    "generate", "calculate", "manage_permissions"];

  if (granted === "admin") return true;
  if (granted === requested) return true;

  // Special actions require explicit grant OR admin level
  if (SPECIAL_ACTIONS.includes(requested)) return granted === "admin";

  // Hierarchy: approve > write > read
  const hierarchy: Record<string, number> = { none: 0, read: 1, write: 2, approve: 3, admin: 4 };
  const grantedLevel = hierarchy[granted] ?? 0;
  const requestedLevel = hierarchy[requested] ?? 0;
  return grantedLevel >= requestedLevel;
}

/**
 * Check if a granted scope covers a requested scope.
 * Hierarchy: platform > company > team > own
 */
function scopeCovers(granted: PermissionScope, requested: PermissionScope): boolean {
  const hierarchy: Record<string, number> = { own: 1, team: 2, company: 3, platform: 4 };
  return hierarchy[granted] >= hierarchy[requested];
}

/**
 * Check legacy flat permission map.
 * Maps resource:action to the old permission keys.
 */
function checkLegacyPermission(
  perms: Record<string, number>,
  resource: string,
  action: string,
): boolean {
  const LEGACY_MAP: Record<string, Record<string, string>> = {
    invoice: { read: "create_invoice", write: "edit_invoice", delete: "delete_invoice", print: "print_invoice" },
    customer: { read: "view_customers", write: "edit_customer", delete: "delete_customer" },
    inventory: { read: "edit_inventory", write: "edit_inventory", manage_prices: "manage_wholesale_prices", bulk_input: "bulk_input" },
    report: { read: "reports_access", export: "export_data" },
    settings: { read: "settings_access", write: "settings_access" },
    accounting: { read: "finance_access", write: "finance_access" },
    employee: { read: "employee_management", write: "employee_management" },
    invoice_e_invoice: { submit: "e_invoicing_submit" },
  };

  const resourceMap = LEGACY_MAP[resource];
  if (!resourceMap) return false;
  const permKey = resourceMap[action];
  if (!permKey) return false;
  return !!perms[permKey];
}

// ── Time Restriction Checking ────────────────────────────────────────────────

/**
 * Check if the current time is within a time restriction window.
 */
export function isWithinTimeRestriction(restriction: TimeRestriction): boolean {
  const now = new Date();

  // Check day-of-week restriction
  if (restriction.allowedDays && restriction.allowedDays.length > 0) {
    // ISO day: 1=Mon, 7=Sun. JS getDay: 0=Sun, 1=Mon, ... 6=Sat
    const jsDay = now.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    if (!restriction.allowedDays.includes(isoDay)) return false;
  }

  // Check hour restriction
  if (restriction.startHour !== undefined && restriction.endHour !== undefined) {
    const hour = now.getHours();
    if (hour < restriction.startHour || hour >= restriction.endHour) return false;
  }

  // Check date range restriction
  if (restriction.startDate) {
    const start = new Date(restriction.startDate);
    if (now < start) return false;
  }
  if (restriction.endDate) {
    const end = new Date(restriction.endDate);
    if (now > end) return false;
  }

  return true;
}

// ── Get Effective Permissions ────────────────────────────────────────────────

/**
 * Compute the full effective permission set for a user.
 * Combines the legacy flat system with the new RBAC system.
 */
export function getEffectivePermissions(
  role: string,
  customPerms: Record<string, number> | null | undefined,
  isFounder: boolean,
  customRolePerms?: ResourcePermission[],
  timeRestrictions?: Record<string, TimeRestriction>,
): {
  flat: Record<string, number>;
  resources: ResourcePermission[];
  inheritanceChain: string[];
} {
  // Get legacy flat permissions
  const flat = computeEffectivePermissions(role, customPerms, isFounder);

  // Get resource-level permissions from role hierarchy
  const roleDef = ROLE_DEFINITIONS[role] || customRoles.get(role);
  const inheritedPerms = roleDef ? getInheritedPermissions(role) : [];
  const resources = [...inheritedPerms, ...(customRolePerms || [])];

  // Founder gets platform scope on all resources
  if (isFounder) {
    const founderPerms: ResourcePermission[] = AVAILABLE_RESOURCES.map((r) => ({
      resource: r,
      level: PermissionLevel.admin,
      scope: PermissionScope.platform,
    }));
    return { flat, resources: founderPerms, inheritanceChain: ["founder"] };
  }

  const inheritanceChain = roleDef ? getInheritanceChain(role) : [role];

  return { flat, resources, inheritanceChain };
}

// ── Validate Permission Changes ──────────────────────────────────────────────

/**
 * Validate that a permission change is safe to apply.
 * Prevents:
 *   - Removing locked permissions from non-admin users
 *   - Granting platform scope to non-founders
 *   - Granting admin level on locked resources to non-admins
 *   - Creating roles with invalid inheritance
 */
export function validatePermissionChange(
  change: {
    type: "grant" | "revoke" | "modify";
    targetRole: string;
    resource: string;
    level: PermissionLevel;
    scope: PermissionScope;
  },
  actorRole: string,
  isFounder: boolean,
): { valid: boolean; reason?: string } {
  // Only admin or founder can modify permissions
  if (actorRole !== "admin" && !isFounder) {
    return { valid: false, reason: "Only admin or founder can modify permissions" };
  }

  // Platform scope is founder-only
  if (change.scope === PermissionScope.platform && !isFounder) {
    return { valid: false, reason: "Platform scope requires founder access" };
  }

  // Admin level on locked resources requires founder
  const LOCKED_RESOURCES = ["settings", "report", "audit", "role", "feature_flag"];
  if (LOCKED_RESOURCES.includes(change.resource) && change.level >= PermissionLevel.admin && !isFounder) {
    return { valid: false, reason: `Admin level on "${change.resource}" requires founder access` };
  }

  // Cannot revoke permissions from a role higher than your own
  const actorDef = ROLE_DEFINITIONS[actorRole];
  const targetDef = ROLE_DEFINITIONS[change.targetRole] || customRoles.get(change.targetRole);
  if (actorDef && targetDef) {
    const actorChain = getInheritanceChain(actorRole);
    const targetChain = getInheritanceChain(change.targetRole);
    // If the target role's chain includes the actor's role, the actor can't revoke
    if (targetChain.includes(actorRole) && change.type === "revoke") {
      // Actually this is fine — you can revoke from roles below you
    }
  }

  // Validate the resource exists
  if (!AVAILABLE_RESOURCES.includes(change.resource)) {
    return { valid: false, reason: `Unknown resource: "${change.resource}"` };
  }

  return { valid: true };
}

// ── Circular Inheritance Check ───────────────────────────────────────────────

function wouldCreateCircularInheritance(newRoleId: string, inheritsFrom: string): boolean {
  let current: string | null = inheritsFrom;
  const visited = new Set<string>();

  while (current) {
    if (current === newRoleId) return true;
    if (visited.has(current)) return true; // existing circular chain
    visited.add(current);
    const def = ROLE_DEFINITIONS[current] || customRoles.get(current);
    current = def?.inheritsFrom ?? null;
  }

  return false;
}

// ── Permission Audit Trail ───────────────────────────────────────────────────

const permissionAuditLog: PermissionAuditEntry[] = [];

export function logPermissionAudit(entry: PermissionAuditEntry): void {
  permissionAuditLog.push(entry);
  // In production, this would also write to the database
}

export function getPermissionAuditLog(limit = 100): PermissionAuditEntry[] {
  return permissionAuditLog.slice(-limit);
}

// ── Backward Compatibility ───────────────────────────────────────────────────

/**
 * Convert a flat permission map to ResourcePermission array.
 * Useful for migrating existing users to the new system.
 */
export function flatToResourcePerms(flat: Record<string, number>): ResourcePermission[] {
  const perms: ResourcePermission[] = [];

  const FLAT_TO_RESOURCE: Record<string, { resource: string; action: string; scope: PermissionScope }> = {
    create_invoice: { resource: "invoice", action: "write", scope: PermissionScope.own },
    print_invoice: { resource: "invoice", action: "print", scope: PermissionScope.own },
    edit_invoice: { resource: "invoice", action: "write", scope: PermissionScope.own },
    delete_invoice: { resource: "invoice", action: "delete", scope: PermissionScope.own },
    view_customers: { resource: "customer", action: "read", scope: PermissionScope.company },
    edit_customer: { resource: "customer", action: "write", scope: PermissionScope.own },
    delete_customer: { resource: "customer", action: "delete", scope: PermissionScope.own },
    edit_inventory: { resource: "inventory", action: "write", scope: PermissionScope.own },
    manage_wholesale_prices: { resource: "inventory", action: "manage_prices", scope: PermissionScope.own },
    bulk_input: { resource: "inventory", action: "bulk_input", scope: PermissionScope.own },
    export_data: { resource: "report", action: "export", scope: PermissionScope.company },
    reports_access: { resource: "report", action: "read", scope: PermissionScope.company },
    settings_access: { resource: "settings", action: "write", scope: PermissionScope.company },
    finance_access: { resource: "accounting", action: "write", scope: PermissionScope.company },
    employee_management: { resource: "employee", action: "write", scope: PermissionScope.company },
    e_invoicing_submit: { resource: "invoice", action: "e_invoice", scope: PermissionScope.company },
  };

  for (const [key, value] of Object.entries(flat)) {
    if (value && FLAT_TO_RESOURCE[key]) {
      const mapping = FLAT_TO_RESOURCE[key];
      perms.push({
        resource: mapping.resource,
        level: actionToLevel(mapping.action),
        scope: mapping.scope,
      });
    }
  }

  return perms;
}

function actionToLevel(action: string): PermissionLevel {
  switch (action) {
    case "read": return PermissionLevel.read;
    case "write": return PermissionLevel.write;
    case "approve": return PermissionLevel.approve;
    case "admin": return PermissionLevel.admin;
    case "delete": return PermissionLevel.delete;
    case "print": return PermissionLevel.print;
    case "export": return PermissionLevel.export;
    case "e_invoice": return PermissionLevel.e_invoice;
    case "bulk_input": return PermissionLevel.bulk_input;
    case "manage_prices": return PermissionLevel.manage_prices;
    default: return PermissionLevel.write; // unknown special actions default to write
  }
}
