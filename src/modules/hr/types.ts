/**
 * HR module — shared types and discriminated unions.
 *
 * Entity types are re-exported from the hook layer so that view
 * components and query hooks always use the same shape.
 */

// ─── Entity interfaces (re-exported from hooks) ─────────────────────────────

export type { Employee, Attendance, Salary, Commission, LeaveRequest, Performance } from "@/hooks/queries/hr";

export interface GratuityRecord {
  id: number;
  employeeId: number;
  amount: number;
}

// ─── Tab type ───────────────────────────────────────────────────────────────

export type Tab =
  | "employees"
  | "attendance"
  | "salaries"
  | "commissions"
  | "leaves"
  | "performance"
  | "gratuity";

// ─── Discriminated union for edit items ─────────────────────────────────────
//
// Instead of `Record<string, unknown>` + `as string` casts, each table row
// that is sent to `handleEdit` is wrapped in an HREditItem. The `_tag`
// discriminant lets the form (or any consumer) narrow the type safely.

import type { Employee, Attendance, Salary, Commission, LeaveRequest, Performance } from "@/hooks/queries/hr";

export type HREditItem =
  | { _tag: "employees"; data: Employee }
  | { _tag: "attendance"; data: Attendance }
  | { _tag: "salaries"; data: Salary }
  | { _tag: "commissions"; data: Commission }
  | { _tag: "leaves"; data: LeaveRequest }
  | { _tag: "performance"; data: Performance };

// ─── Table shared props ─────────────────────────────────────────────────────

export interface TableShared {
  selectedIds: Set<number>;
  toggleRow: (id: number) => void;
  handleDelete: (id: number) => void;
  handleEdit: (item: HREditItem) => void;
  pageItems: Array<{ id: number }>;
  employees: Employee[];
  selectAllChecked: boolean;
  toggleSelectAll: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const PAGE_SIZE = 20;

export const DELETE_PATH: Record<Tab, string> = {
  employees: "/api/hr/employees",
  attendance: "/api/hr/attendance",
  salaries: "/api/hr/salaries",
  commissions: "/api/hr/commissions",
  leaves: "/api/hr/leaves",
  performance: "/api/hr/performance",
  gratuity: "",
};

export const TAB_META: Array<{ key: Tab; label: string }> = [
  { key: "employees", label: "الموظفون" },
  { key: "attendance", label: "الحضور" },
  { key: "salaries", label: "الرواتب" },
  { key: "commissions", label: "العمولات" },
  { key: "leaves", label: "الإجازات" },
  { key: "performance", label: "الأداء" },
  { key: "gratuity", label: "مكافأة نهاية الخدمة" },
];
