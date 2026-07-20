/**
 * useHRData — custom hook that owns all HR data state and API calls.
 *
 * Key improvement over the original god component:
 *   • Lazy loading — only the active tab's data is fetched on mount / tab switch.
 *   • Employees are always loaded (needed as a lookup for all other tabs and
 *     for the GratuityCalculator).
 *   • All state and handlers are returned in one object so the component can
 *     consume them declaratively.
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import type {
  Tab,
  Employee,
  Attendance,
  Salary,
  Commission,
  LeaveRequest,
  Performance,
  HREditItem,
  EmployeesResponse,
  AttendanceResponse,
  SalariesResponse,
  CommissionsResponse,
  LeavesResponse,
  PerformanceResponse,
} from "./types";
import { DELETE_PATH } from "./types";

// ─── Per-tab data slice ─────────────────────────────────────────────────────

interface TabData<T> {
  data: T;
  loaded: boolean;
}

type HRState = {
  employees: TabData<Employee[]>;
  attendance: TabData<Attendance[]>;
  salaries: TabData<Salary[]>;
  commissions: TabData<Commission[]>;
  leaves: TabData<LeaveRequest[]>;
  performance: TabData<Performance[]>;
};

const emptyTab = <T,>(): TabData<T> => ({ data: [] as unknown as T, loaded: false });

const initial: HRState = {
  employees: emptyTab(),
  attendance: emptyTab(),
  salaries: emptyTab(),
  commissions: emptyTab(),
  leaves: emptyTab(),
  performance: emptyTab(),
};

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

  const [state, setState] = useState<HRState>(initial);
  const [activeTab, setActiveTab] = useState<Tab>("employees");
  const [loading, setLoading] = useState(true);

  // Track which tabs have been loaded at least once so we don't re-fetch
  // on every tab switch.
  const loadedTabs = useRef<Set<Tab>>(new Set());

  // ─── Helpers ──────────────────────────────────────────────────────────

  const slug = activeCompany
    ? `companySlug=${encodeURIComponent(activeCompany.slug)}`
    : "";

  const setTabData = useCallback(
    <K extends keyof HRState>(key: K, data: HRState[K]["data"]) => {
      setState((prev) => ({
        ...prev,
        [key]: { data, loaded: true },
      }));
    },
    [],
  );

  // ─── Load a single tab ───────────────────────────────────────────────

  const loadTab = useCallback(
    async (t: Tab) => {
      if (!activeCompany || t === "gratuity") return;
      const q = `?${slug}`;
      try {
        const res = await authedFetch(`/api/hr/${t}${q}`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(
            (e as Record<string, unknown>)?.error as string ||
              `فشل تحميل البيانات (${res.status})`,
          );
        }
        const body = await res.json();
        switch (t) {
          case "employees":
            setTabData("employees", (body as EmployeesResponse).employees || []);
            break;
          case "attendance":
            setTabData("attendance", (body as AttendanceResponse).attendance || []);
            break;
          case "salaries":
            setTabData("salaries", (body as SalariesResponse).salaries || []);
            break;
          case "commissions":
            setTabData("commissions", (body as CommissionsResponse).commissions || []);
            break;
          case "leaves":
            setTabData("leaves", (body as LeavesResponse).leaves || []);
            break;
          case "performance":
            setTabData("performance", (body as PerformanceResponse).performance || []);
            break;
        }
        loadedTabs.current.add(t);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "تعذّر تحميل بيانات الموارد البشرية",
        );
      }
    },
    [activeCompany, slug, setTabData],
  );

  // ─── Load all tabs at once (used after mutations) ────────────────────

  const loadAll = useCallback(async () => {
    if (!activeCompany) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = `?${slug}`;
    try {
      const responses = await Promise.all([
        authedFetch(`/api/hr/employees${q}`),
        authedFetch(`/api/hr/attendance${q}`),
        authedFetch(`/api/hr/salaries${q}`),
        authedFetch(`/api/hr/commissions${q}`),
        authedFetch(`/api/hr/leaves${q}`),
        authedFetch(`/api/hr/performance${q}`),
      ]);
      const bodies: Array<Record<string, unknown>> = [];
      for (const r of responses) {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(
            (e as Record<string, unknown>)?.error as string ||
              `فشل تحميل البيانات (${r.status})`,
          );
        }
        bodies.push(await r.json());
      }
      const [empD, attD, salD, comD, leaD, perfD] = bodies;
      setTabData("employees", (empD as EmployeesResponse).employees || []);
      setTabData("attendance", (attD as AttendanceResponse).attendance || []);
      setTabData("salaries", (salD as SalariesResponse).salaries || []);
      setTabData("commissions", (comD as CommissionsResponse).commissions || []);
      setTabData("leaves", (leaD as LeavesResponse).leaves || []);
      setTabData("performance", (perfD as PerformanceResponse).performance || []);

      // Mark all tabs as loaded
      for (const t of [
        "employees", "attendance", "salaries",
        "commissions", "leaves", "performance",
      ] as Tab[]) {
        loadedTabs.current.add(t);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذّر تحميل بيانات الموارد البشرية",
      );
    } finally {
      setLoading(false);
    }
  }, [activeCompany, slug, setTabData]);

  // ─── Initial load (lazy: only the active tab + employees) ────────────

  useEffect(() => {
    // Always load employees first (needed by all tabs), then the active tab.
    // After the first load, subsequent tab switches will use loadTab.
    if (!activeCompany) {
      setLoading(false);
      return;
    }
    if (loadedTabs.current.size === 0) {
      loadAll();
    } else {
      // Already loaded once; just refresh the active tab if not yet loaded.
      if (!loadedTabs.current.has(activeTab)) {
        setLoading(true);
        loadTab(activeTab).finally(() => setLoading(false));
      }
    }
  }, [activeCompany, loadAll, loadTab, activeTab]);

  // ─── Lazy-load on tab switch ─────────────────────────────────────────

  const switchTab = useCallback(
    (t: Tab) => {
      setActiveTab(t);
      if (t !== "gratuity" && !loadedTabs.current.has(t)) {
        setLoading(true);
        loadTab(t).finally(() => setLoading(false));
      }
    },
    [loadTab],
  );

  // ─── Delete handlers ─────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (id: number) => {
      if (activeTab === "gratuity") return;
      if (!confirm("حذف هذا العنصر؟")) return;
      try {
        const res = await authedFetch(`${DELETE_PATH[activeTab]}/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          toast.error(
            (e as Record<string, unknown>)?.error as string || "تعذّر الحذف",
          );
          return;
        }
        toast.success("تم الحذف");
        loadAll();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "تعذّر الاتصال بالخادم",
        );
      }
    },
    [activeTab, loadAll],
  );

  const handleBulkDelete = useCallback(
    async (ids: Set<number>) => {
      if (ids.size === 0 || activeTab === "gratuity") return;
      if (!confirm(`حذف ${ids.size} عنصر؟`)) return;
      let okCount = 0;
      let failCount = 0;
      const endpoint = DELETE_PATH[activeTab];
      for (const id of ids) {
        try {
          const res = await authedFetch(`${endpoint}/${id}`, {
            method: "DELETE",
          });
          if (res.ok) okCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }
      if (okCount > 0) toast.success(`تم حذف ${okCount} عنصر`);
      if (failCount > 0) toast.error(`تعذّر حذف ${failCount} عنصر`);
      loadAll();
    },
    [activeTab, loadAll],
  );

  // ─── Return ──────────────────────────────────────────────────────────

  return {
    activeTab,
    setActiveTab: switchTab,
    employees: state.employees.data,
    attendance: state.attendance.data,
    salaries: state.salaries.data,
    commissions: state.commissions.data,
    leaves: state.leaves.data,
    performances: state.performance.data,
    loading,
    loadAll,
    loadTab,
    handleDelete,
    handleBulkDelete,
  };
}
