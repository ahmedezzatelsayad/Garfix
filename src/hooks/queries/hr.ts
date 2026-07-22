/**
 * hr.ts — React Query hooks for HR (Human Resources) CRUD operations.
 *
 * Provides typed query and mutation hooks for all HR sub-domains:
 * employees, attendance, salaries, commissions, leave requests,
 * performance reviews, and gratuity calculations. All hooks use the
 * centralized `queryKeys` factory for granular cache invalidation and
 * the typed `apiGet`/`apiPost`/`apiPatch`/`apiDelete` helpers for
 * consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of an employee record returned by the API. */
export interface Employee {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  salary?: number;
  startDate?: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of an attendance record returned by the API. */
export interface Attendance {
  id: number;
  employeeId: number;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a salary record returned by the API. */
export interface Salary {
  id: number;
  employeeId: number;
  month: string;
  baseSalary: number;
  deductions: number;
  netSalary: number;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a commission record returned by the API. */
export interface Commission {
  id: number;
  employeeId: number;
  amount: number;
  description?: string;
  date: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a leave request record returned by the API. */
export interface LeaveRequest {
  id: number;
  employeeId: number;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a performance review record returned by the API. */
export interface Performance {
  id: number;
  employeeId: number;
  period: string;
  rating: number;
  notes?: string;
  companySlug: string;
  [key: string]: unknown;
}

// ─── Payload Types ──────────────────────────────────────────────────────────

/** Payload for creating a new employee. */
export interface CreateEmployeePayload {
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  salary?: number;
  startDate?: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing employee. */
export interface UpdateEmployeePayload {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  salary?: number;
  startDate?: string;
  [key: string]: unknown;
}

/** Payload for creating a new attendance record. */
export interface CreateAttendancePayload {
  employeeId: number;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing attendance record. */
export interface UpdateAttendancePayload {
  id: number;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  [key: string]: unknown;
}

/** Payload for creating a new salary record. */
export interface CreateSalaryPayload {
  employeeId: number;
  month: string;
  baseSalary: number;
  deductions: number;
  netSalary: number;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing salary record. */
export interface UpdateSalaryPayload {
  id: number;
  month?: string;
  baseSalary?: number;
  deductions?: number;
  netSalary?: number;
  [key: string]: unknown;
}

/** Payload for creating a new commission record. */
export interface CreateCommissionPayload {
  employeeId: number;
  amount: number;
  description?: string;
  date: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing commission record. */
export interface UpdateCommissionPayload {
  id: number;
  amount?: number;
  description?: string;
  date?: string;
  [key: string]: unknown;
}

/** Payload for creating a new leave request. */
export interface CreateLeavePayload {
  employeeId: number;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing leave request. */
export interface UpdateLeavePayload {
  id: number;
  type?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  [key: string]: unknown;
}

/** Payload for creating a new performance review. */
export interface CreatePerformancePayload {
  employeeId: number;
  period: string;
  rating: number;
  notes?: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing performance review. */
export interface UpdatePerformancePayload {
  id: number;
  period?: string;
  rating?: number;
  notes?: string;
  [key: string]: unknown;
}

/** Payload for calculating gratuity. */
export interface GratuityPayload {
  employeeId: number;
  companySlug: string;
  [key: string]: unknown;
}

/** Response shape for gratuity calculation. */
export interface GratuityResponse {
  gratuity: number;
  employeeId: number;
  [key: string]: unknown;
}

// ─── Response Types ─────────────────────────────────────────────────────────

/** Response shape for the employee list endpoint. */
interface EmployeeListResponse {
  employees: Employee[];
}

/** Response shape for a single employee endpoint. */
interface EmployeeResponse {
  employee: Employee;
}

/** Response shape for the attendance list endpoint. */
interface AttendanceListResponse {
  attendance: Attendance[];
}

/** Response shape for a single attendance record endpoint. */
interface AttendanceResponse {
  attendance: Attendance;
}

/** Response shape for the salary list endpoint. */
interface SalaryListResponse {
  salaries: Salary[];
}

/** Response shape for a single salary record endpoint. */
interface SalaryResponse {
  salary: Salary;
}

/** Response shape for the commission list endpoint. */
interface CommissionListResponse {
  commissions: Commission[];
}

/** Response shape for a single commission record endpoint. */
interface CommissionResponse {
  commission: Commission;
}

/** Response shape for the leave request list endpoint. */
interface LeaveListResponse {
  leaves: LeaveRequest[];
}

/** Response shape for a single leave request endpoint. */
interface LeaveResponse {
  leave: LeaveRequest;
}

/** Response shape for the performance review list endpoint. */
interface PerformanceListResponse {
  performance: Performance[];
}

/** Response shape for a single performance review endpoint. */
interface PerformanceResponse {
  performance: Performance;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the list of employees for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose employees to fetch.
 */
export function useEmployees(companySlug: string) {
  return useQuery<EmployeeListResponse, ApiError>({
    queryKey: queryKeys.hr.employees(companySlug),
    queryFn: () =>
      apiGet<EmployeeListResponse>(
        `/api/hr/employees?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new employee.
 *
 * On success all employee queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation<EmployeeResponse, ApiError, CreateEmployeePayload>({
    mutationFn: (payload) =>
      apiPost<CreateEmployeePayload, EmployeeResponse>(
        "/api/hr/employees",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hr.employees(variables.companySlug),
      });
    },
  });
}

/**
 * Update an existing employee.
 *
 * On success all employee queries for the relevant company are
 * invalidated, ensuring all views reflect the updated data.
 */
export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation<EmployeeResponse, ApiError, UpdateEmployeePayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, EmployeeResponse>(
        `/api/hr/employees/${id}`,
        body,
      );
    },
    onSuccess: () => {
      // Invalidate all employee queries across all companies since
      // the update payload may not contain companySlug
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hr.employees(""),
        exact: false,
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "employees"
          );
        },
      });
    },
  });
}

/**
 * Delete a single employee.
 *
 * On success all employee queries are invalidated to ensure the
 * deleted entry no longer appears in any list.
 *
 * @param variables - The ID of the employee to delete.
 */
export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/hr/employees/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "employees"
          );
        },
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the list of attendance records for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose attendance records to fetch.
 */
export function useAttendance(companySlug: string) {
  return useQuery<AttendanceListResponse, ApiError>({
    queryKey: queryKeys.hr.attendance(companySlug),
    queryFn: () =>
      apiGet<AttendanceListResponse>(
        `/api/hr/attendance?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new attendance record.
 *
 * On success all attendance queries for the relevant company are
 * invalidated so every mounted list view refetches with the new entry.
 */
export function useCreateAttendance() {
  const queryClient = useQueryClient();

  return useMutation<AttendanceResponse, ApiError, CreateAttendancePayload>({
    mutationFn: (payload) =>
      apiPost<CreateAttendancePayload, AttendanceResponse>(
        "/api/hr/attendance",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hr.attendance(variables.companySlug),
      });
    },
  });
}

/**
 * Update an existing attendance record.
 *
 * On success all attendance queries are invalidated, ensuring all
 * views reflect the updated data.
 */
export function useUpdateAttendance() {
  const queryClient = useQueryClient();

  return useMutation<AttendanceResponse, ApiError, UpdateAttendancePayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, AttendanceResponse>(
        `/api/hr/attendance/${id}`,
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "attendance"
          );
        },
      });
    },
  });
}

/**
 * Delete a single attendance record.
 *
 * On success all attendance queries are invalidated to ensure the
 * deleted entry no longer appears in any list.
 *
 * @param variables - The ID of the attendance record to delete.
 */
export function useDeleteAttendance() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/hr/attendance/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "attendance"
          );
        },
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SALARY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the list of salary records for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose salary records to fetch.
 */
export function useSalaries(companySlug: string) {
  return useQuery<SalaryListResponse, ApiError>({
    queryKey: queryKeys.hr.salaries(companySlug),
    queryFn: () =>
      apiGet<SalaryListResponse>(
        `/api/hr/salaries?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new salary record.
 *
 * On success all salary queries for the relevant company are
 * invalidated so every mounted list view refetches with the new entry.
 */
export function useCreateSalary() {
  const queryClient = useQueryClient();

  return useMutation<SalaryResponse, ApiError, CreateSalaryPayload>({
    mutationFn: (payload) =>
      apiPost<CreateSalaryPayload, SalaryResponse>(
        "/api/hr/salaries",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hr.salaries(variables.companySlug),
      });
    },
  });
}

/**
 * Update an existing salary record.
 *
 * On success all salary queries are invalidated, ensuring all
 * views reflect the updated data.
 */
export function useUpdateSalary() {
  const queryClient = useQueryClient();

  return useMutation<SalaryResponse, ApiError, UpdateSalaryPayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, SalaryResponse>(
        `/api/hr/salaries/${id}`,
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "salaries"
          );
        },
      });
    },
  });
}

/**
 * Delete a single salary record.
 *
 * On success all salary queries are invalidated to ensure the
 * deleted entry no longer appears in any list.
 *
 * @param variables - The ID of the salary record to delete.
 */
export function useDeleteSalary() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/hr/salaries/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "salaries"
          );
        },
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the list of commission records for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose commission records to fetch.
 */
export function useCommissions(companySlug: string) {
  return useQuery<CommissionListResponse, ApiError>({
    queryKey: queryKeys.hr.commissions(companySlug),
    queryFn: () =>
      apiGet<CommissionListResponse>(
        `/api/hr/commissions?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new commission record.
 *
 * On success all commission queries for the relevant company are
 * invalidated so every mounted list view refetches with the new entry.
 */
export function useCreateCommission() {
  const queryClient = useQueryClient();

  return useMutation<CommissionResponse, ApiError, CreateCommissionPayload>({
    mutationFn: (payload) =>
      apiPost<CreateCommissionPayload, CommissionResponse>(
        "/api/hr/commissions",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hr.commissions(variables.companySlug),
      });
    },
  });
}

/**
 * Update an existing commission record.
 *
 * On success all commission queries are invalidated, ensuring all
 * views reflect the updated data.
 */
export function useUpdateCommission() {
  const queryClient = useQueryClient();

  return useMutation<CommissionResponse, ApiError, UpdateCommissionPayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, CommissionResponse>(
        `/api/hr/commissions/${id}`,
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "commissions"
          );
        },
      });
    },
  });
}

/**
 * Delete a single commission record.
 *
 * On success all commission queries are invalidated to ensure the
 * deleted entry no longer appears in any list.
 *
 * @param variables - The ID of the commission record to delete.
 */
export function useDeleteCommission() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/hr/commissions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "commissions"
          );
        },
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAVE REQUEST HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the list of leave requests for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose leave requests to fetch.
 */
export function useLeaves(companySlug: string) {
  return useQuery<LeaveListResponse, ApiError>({
    queryKey: queryKeys.hr.leaves(companySlug),
    queryFn: () =>
      apiGet<LeaveListResponse>(
        `/api/hr/leaves?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new leave request.
 *
 * On success all leave queries for the relevant company are
 * invalidated so every mounted list view refetches with the new entry.
 */
export function useCreateLeave() {
  const queryClient = useQueryClient();

  return useMutation<LeaveResponse, ApiError, CreateLeavePayload>({
    mutationFn: (payload) =>
      apiPost<CreateLeavePayload, LeaveResponse>(
        "/api/hr/leaves",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hr.leaves(variables.companySlug),
      });
    },
  });
}

/**
 * Update an existing leave request.
 *
 * On success all leave queries are invalidated, ensuring all
 * views reflect the updated data.
 */
export function useUpdateLeave() {
  const queryClient = useQueryClient();

  return useMutation<LeaveResponse, ApiError, UpdateLeavePayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, LeaveResponse>(
        `/api/hr/leaves/${id}`,
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "leaves"
          );
        },
      });
    },
  });
}

/**
 * Delete a single leave request.
 *
 * On success all leave queries are invalidated to ensure the
 * deleted entry no longer appears in any list.
 *
 * @param variables - The ID of the leave request to delete.
 */
export function useDeleteLeave() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/hr/leaves/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "leaves"
          );
        },
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE REVIEW HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the list of performance reviews for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose performance reviews to fetch.
 */
export function usePerformanceReviews(companySlug: string) {
  return useQuery<PerformanceListResponse, ApiError>({
    queryKey: queryKeys.hr.performance(companySlug),
    queryFn: () =>
      apiGet<PerformanceListResponse>(
        `/api/hr/performance?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new performance review.
 *
 * On success all performance queries for the relevant company are
 * invalidated so every mounted list view refetches with the new entry.
 */
export function useCreatePerformance() {
  const queryClient = useQueryClient();

  return useMutation<PerformanceResponse, ApiError, CreatePerformancePayload>({
    mutationFn: (payload) =>
      apiPost<CreatePerformancePayload, PerformanceResponse>(
        "/api/hr/performance",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hr.performance(variables.companySlug),
      });
    },
  });
}

/**
 * Update an existing performance review.
 *
 * On success all performance queries are invalidated, ensuring all
 * views reflect the updated data.
 */
export function useUpdatePerformance() {
  const queryClient = useQueryClient();

  return useMutation<PerformanceResponse, ApiError, UpdatePerformancePayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, PerformanceResponse>(
        `/api/hr/performance/${id}`,
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "performance"
          );
        },
      });
    },
  });
}

/**
 * Delete a single performance review.
 *
 * On success all performance queries are invalidated to ensure the
 * deleted entry no longer appears in any list.
 *
 * @param variables - The ID of the performance review to delete.
 */
export function useDeletePerformance() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/hr/performance/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "hr" &&
            key[1] === "performance"
          );
        },
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GRATUITY HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate gratuity for an employee.
 *
 * Sends the employee and company details to the gratuity endpoint
 * and returns the calculated gratuity amount. This is a mutation
 * rather than a query because gratuity is computed on demand.
 *
 * On success all employee queries for the relevant company are
 * invalidated since gratuity calculations may affect salary data.
 */
export function useGratuity() {
  const queryClient = useQueryClient();

  return useMutation<GratuityResponse, ApiError, GratuityPayload>({
    mutationFn: (payload) =>
      apiPost<GratuityPayload, GratuityResponse>(
        "/api/hr/gratuity",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.hr.employees(variables.companySlug),
      });
    },
  });
}
