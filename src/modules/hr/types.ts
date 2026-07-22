/**
 * HR module — shared types and discriminated unions.
 *
 * The `HREditItem` discriminated union replaces the unsafe
 * `Record<string, unknown>` pattern that required 18+ `as string` casts.
 * Each variant carries its tab key (`_tag`) and the full typed data,
 * so consumers can narrow with a switch on `_tag` and get proper types.
 */

// ─── Entity interfaces ─────────────────────────────────────────────────────

export interface Employee {
  id: number;
  name: string;
  nameEn?: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  baseSalary: number;
  currency: string;
  joinDate?: string;
  isActive: boolean;
}

export interface Attendance {
  id: number;
  employeeId: number;
  date: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
}

export interface Salary {
  id: number;
  employeeId: number;
  month: string;
  baseSalary: number;
  allowances: number;
  deductions: number;
  bonus: number;
  netSalary: number;
  isPaid: boolean;
}

export interface Commission {
  id: number;
  employeeId: number;
  date: string;
  type: string;
  description?: string;
  amount: number;
  isPaid: boolean;
}

export interface LeaveRequest {
  id: number;
  employeeId: number;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}

export interface Performance {
  id: number;
  employeeId: number;
  period: string;
  kpiScore?: number;
  overallScore?: number;
  rating?: string;
}

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

export type HREditItem =
  | { _tag: "employees"; data: Employee }
  | { _tag: "attendance"; data: Attendance }
  | { _tag: "salaries"; data: Salary }
  | { _tag: "commissions"; data: Commission }
  | { _tag: "leaves"; data: LeaveRequest }
  | { _tag: "performance"; data: Performance };

// ─── Helper: API response wrappers ──────────────────────────────────────────

export interface EmployeesResponse { employees?: Employee[] }
export interface AttendanceResponse { attendance?: Attendance[] }
export interface SalariesResponse { salaries?: Salary[] }
export interface CommissionsResponse { commissions?: Commission[] }
export interface LeavesResponse { leaves?: LeaveRequest[] }
export interface PerformanceResponse { performance?: Performance[] }

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
