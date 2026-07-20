/**
 * permissions.ts — Single source of truth for the permission model.
 * Ported from v10 lib/permissions.ts.
 *
 * Model:
 *   - PERMISSION_CATALOG: every known permission key with UI metadata. `locked`
 *     keys are admin/founder-only and cannot be granted per-user.
 *   - ROLE_DEFAULTS: baseline grants per role.
 *   - computeEffectivePermissions: role baseline + per-user overrides for
 *     non-locked keys only. admin & founder always get the full admin set.
 */

export interface PermissionMeta {
  key: string;
  label: string;
  icon: string;
  group: string;
  locked: boolean;
}

export const PERMISSION_CATALOG: PermissionMeta[] = [
  { key: "create_invoice", label: "إنشاء فواتير", icon: "➕", group: "فواتير", locked: false },
  { key: "print_invoice", label: "طباعة الفواتير", icon: "🖨️", group: "فواتير", locked: false },
  { key: "edit_invoice", label: "تعديل الفواتير", icon: "✏️", group: "فواتير", locked: false },
  { key: "delete_invoice", label: "حذف الفواتير", icon: "🗑️", group: "فواتير", locked: false },
  { key: "view_customers", label: "عرض العملاء", icon: "👥", group: "عملاء", locked: false },
  { key: "edit_customer", label: "تعديل العملاء", icon: "✏️", group: "عملاء", locked: false },
  { key: "delete_customer", label: "حذف العملاء", icon: "🗑️", group: "عملاء", locked: false },
  { key: "edit_inventory", label: "تعديل المخزون والكميات", icon: "📦", group: "مخزون", locked: false },
  { key: "manage_wholesale_prices", label: "إدارة أسعار الجملة والتكلفة", icon: "🏷️", group: "مخزون", locked: false },
  { key: "bulk_input", label: "الإدخال المجمع", icon: "📥", group: "أخرى", locked: false },
  { key: "export_data", label: "تصدير البيانات", icon: "⬇️", group: "أخرى", locked: false },
  { key: "reports_access", label: "الوصول للتقارير", icon: "📊", group: "إدارة", locked: true },
  { key: "settings_access", label: "الإعدادات", icon: "⚙️", group: "إدارة", locked: true },
  { key: "finance_access", label: "الوصول المالي", icon: "💰", group: "إدارة", locked: true },
  { key: "employee_management", label: "إدارة الموظفين", icon: "👔", group: "إدارة", locked: true },
  { key: "e_invoicing_submit", label: "الفاتورة الإلكترونية", icon: "🧾", group: "إدارة", locked: true },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.map((p) => p.key);

export const LOCKED_PERMS: string[] = PERMISSION_CATALOG.filter((p) => p.locked).map((p) => p.key);

const DB_KEY_TO_CATALOG_KEY: Record<string, string> = {
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

function fullSet(value: number): Record<string, number> {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, value]));
}

export const ROLE_DEFAULTS: Record<string, Record<string, number>> = {
  admin: { ...fullSet(1), e_invoicing_submit: 1 },
  editor: {
    create_invoice: 1,
    print_invoice: 1,
    view_customers: 1,
    bulk_input: 1,
    edit_invoice: 1,
    delete_invoice: 1,
    edit_customer: 1,
    delete_customer: 1,
    export_data: 1,
    reports_access: 0,
    settings_access: 0,
    finance_access: 0,
    employee_management: 0,
    e_invoicing_submit: 1,
  },
  employee: {
    create_invoice: 1,
    print_invoice: 1,
    view_customers: 1,
    bulk_input: 1,
    edit_invoice: 1,
    delete_invoice: 1,
    edit_customer: 1,
    delete_customer: 1,
    export_data: 0,
    reports_access: 0,
    settings_access: 0,
    finance_access: 0,
    employee_management: 0,
    e_invoicing_submit: 0,
  },
  viewer: {
    create_invoice: 0,
    print_invoice: 0,
    view_customers: 1,
    bulk_input: 0,
    edit_invoice: 0,
    delete_invoice: 0,
    edit_customer: 0,
    delete_customer: 0,
    export_data: 0,
    reports_access: 0,
    settings_access: 0,
    finance_access: 0,
    employee_management: 0,
    e_invoicing_submit: 0,
  },
};

export const ROLE_PRESETS: Array<{ value: string; label: string; desc: string; color: string }> = [
  { value: "viewer", label: "عرض فقط 👁️", desc: "يشوف الفواتير والعملاء فقط", color: "#b45309" },
  {
    value: "employee",
    label: "موظف طلبات 👤",
    desc: "صلاحيات مخصصة قابلة للتعديل",
    color: "#7c3aed",
  },
  { value: "editor", label: "وصول كامل ✏️", desc: "إنشاء وتعديل وحذف وتصدير", color: "#15803d" },
  { value: "admin",
    label: "مدير 👑",
    desc: "كل الصلاحيات بما فيها الإعدادات والتقارير",
    color: "#dc2626" },
];

/**
 * Compute a user's effective permission map.
 * admin & founder → full admin set.
 * Others → role baseline + per-user overrides (non-locked only).
 */
export function computeEffectivePermissions(
  role: string,
  permissions: Record<string, number> | null | undefined,
  isFounder = false,
): Record<string, number> {
  if (isFounder || role === "admin") return { ...ROLE_DEFAULTS.admin };

  const base = { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer) };

  if (permissions && typeof permissions === "object") {
    for (const key of Object.keys(permissions)) {
      if (!LOCKED_PERMS.includes(key) && key in base) {
        base[key] = permissions[key] ? 1 : 0;
      }
    }
  }
  return base;
}

/** Check a single permission against an effective map. */
export function can(perms: Record<string, number>, key: string): boolean {
  return !!perms[key];
}
