/**
 * useHRData — Modern TanStack Query hook for HRView.
 *
 * Replaces the legacy useEffect+fetch approach with:
 *   • TanStack Query for caching, background refetch, and stale management
 *   • Automatic invalidation on mutations (delete/create/update)
 *   • Lazy loading — queries only fire when enabled (company selected)
 *
 * The hook maintains the same interface as the legacy version so HRView
 * requires minimal changes.
 */
"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBrand } from "@/context/BrandContext";
import {
  useEmployees,
  useAttendance,
  useSalaries,
  useCommissions,
  useLeaves,
  usePerformanceReviews,
} from "@/hooks/queries/hr";
import { apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";
import type {
  Tab,
  Employee,
  Attendance,
  Salary,
  Commission,
  LeaveRequest,
  Performance,
} from "./types";
import { DELETE_PATH } from "./types";

// ─── Return type ────────────────────────────────────────────────────────────

export interface UseHRDataReturn {
  // Tab state
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;

  // Data arrays (flat, for direct consumption)
  employees: Employee[];
  attendance: Attendance[];
  salaries: Salary[];
  commissions: Commission[];
  leaves: LeaveRequest[];
  performances: Performance[];

  // Loading
  loading: boolean;

  // API actions
  loadAll: () => Promise<void>;
  loadTab: (t: Tab) => Promise<void>;
  handleDelete: (id: number) => Promise<void>;
  handleBulkDelete: (ids: Set<number>) => Promise<void>;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useHRData(): UseHRDataReturn {
  const { activeCompany } = useBrand();
  const queryClient = useQueryClient();
  const companySlug = activeCompany?.slug || "";

  const [activeTab, setActiveTab] = useState<Tab>("employees");

  // ─── TanStack Query: each tab is an independent query ────────────────

  const employeesQuery = useEmployees(companySlug);
  const attendanceQuery = useAttendance(companySlug);
  const salariesQuery = useSalaries(companySlug);
  const commissionsQuery = useCommissions(companySlug);
  const leavesQuery = useLeaves(companySlug);
  const performanceQuery = usePerformanceReviews(companySlug);

  // Extract data arrays (fall back to empty arrays)
  const employees: Employee[] = employeesQuery.data?.employees ?? [];
  const attendance: Attendance[] = attendanceQuery.data?.attendance ?? [];
  const salaries: Salary[] = salariesQuery.data?.salaries ?? [];
  const commissions: Commission[] = commissionsQuery.data?.commissions ?? [];
  const leaves: LeaveRequest[] = leavesQuery.data?.leaves ?? [];
  const performances: Performance[] = performanceQuery.data?.performance ?? [];

  // Combined loading state: true if ANY active tab query is loading
  const loading =
    employeesQuery.isLoading ||
    attendanceQuery.isLoading ||
    salariesQuery.isLoading ||
    commissionsQuery.isLoading ||
    leavesQuery.isLoading ||
    performanceQuery.isLoading;

  // ─── Load all (invalidate all HR queries) ──────────────────────────────

  const loadAll = useCallback(async () => {
    if (!activeCompany) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.employees(companySlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.attendance(companySlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.salaries(companySlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.commissions(companySlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.leaves(companySlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.performance(companySlug) }),
    ]);
  }, [activeCompany, companySlug, queryClient]);

  // ─── Load single tab (invalidate specific tab query) ─────────────────

  const loadTab = useCallback(async (t: Tab) => {
    if (!activeCompany || t === "gratuity") return;
    const keyMap: Record<string, readonly unknown[]> = {
      employees: queryKeys.hr.employees(companySlug),
      attendance: queryKeys.hr.attendance(companySlug),
      salaries: queryKeys.hr.salaries(companySlug),
      commissions: queryKeys.hr.commissions(companySlug),
      leaves: queryKeys.hr.leaves(companySlug),
      performance: queryKeys.hr.performance(companySlug),
    };
    const key = keyMap[t];
    if (key) {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  }, [activeCompany, companySlug, queryClient]);

  // ─── Delete handlers ─────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: number) => {
    if (activeTab === "gratuity") return;
    if (!confirm("حذف هذا العنصر؟")) return;
    try {
      await apiDelete(`${DELETE_PATH[activeTab]}/${id}`);
      toast.success("تم الحذف");
      // Invalidate the relevant tab query to refetch
      await loadTab(activeTab);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "تعذّر الحذف";
      toast.error(msg);
    }
  }, [activeTab, loadTab]);

  const handleBulkDelete = useCallback(async (ids: Set<number>) => {
    if (ids.size === 0 || activeTab === "gratuity") return;
    if (!confirm(`حذف ${ids.size} عنصر؟`)) return;
    let okCount = 0;
    let failCount = 0;
    const endpoint = DELETE_PATH[activeTab];
    for (const id of ids) {
      try {
        await apiDelete(`${endpoint}/${id}`);
        okCount++;
      } catch {
        failCount++;
      }
    }
    if (okCount > 0) toast.success(`تم حذف ${okCount} عنصر`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} عنصر`);
    // Invalidate the relevant tab query to refetch
    await loadTab(activeTab);
  }, [activeTab, loadTab]);

  // ─── Tab switch ──────────────────────────────────────────────────────

  const switchTab = useCallback((t: Tab) => {
    setActiveTab(t);
  }, []);

  // ─── Return ──────────────────────────────────────────────────────────

  return {
    activeTab,
    setActiveTab: switchTab,
    employees,
    attendance,
    salaries,
    commissions,
    leaves,
    performances,
    loading,
    loadAll,
    loadTab,
    handleDelete,
    handleBulkDelete,
  };
}
