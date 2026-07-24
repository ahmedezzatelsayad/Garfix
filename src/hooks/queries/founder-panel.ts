/**
 * founder-panel.ts — React Query hooks for founder panel dashboards.
 *
 * Provides useMissionControl (with refetchInterval for real-time polling),
 * useFinOps, and useAIFabric hooks. All hooks use the centralized
 * `queryKeys` factory and the typed `apiGet` helper for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MissionControlData {
  companiesOnline: number;
  totalWorkers: number;
  workerMap: Record<string, number>;
  queueDepths: Record<string, number>;
  totalQueueDepth: number;
  avgLatencyMs: number | null;
  aiCallsPerSec: number;
  callsPerMinute5m: number;
  cascadePcts: Record<string, number>;
  savingsToday: { savedUsd: number; savingsPct: number } | null;
  savingsMonthly: { savedUsd: number; savingsPct: number } | null;
  grossMarginPct: number | null;
  providerHealthCount: number;
  tokenRateLastHour: number | null;
  timestamp: string;
  [key: string]: unknown;
}

interface FinOpsData {
  totalMonthlyRevenue: number;
  activeRuntimeCount: number;
  aiCostMtd: number;
  totalTokensMtd: number;
  totalRequestsMtd: number;
  infraCostMtd: number;
  revenueMtd: number;
  platformSavings: {
    savedUsd: number;
    savingsPct: number;
    totalRequests: number;
    breakdown: { resolvedBy: string; count: number; percentage: number }[];
  } | null;
  platformProfit: {
    revenueUsd: number;
    aiCostUsd: number;
    infraCostUsd: number;
    workerCostUsd: number;
    profitUsd: number;
    companyCount: number;
  } | null;
  invoiceCountMtd: number;
  totalCostMtd: number;
  profitMtd: number;
  profitPct: number;
  costPerCompany: number;
  costPerInvoice: number;
  costPerAiCall: number;
  estAiCostEom: number;
  estInfraEom: number;
  estTotalCostEom: number;
  estProfitEom: number;
  estProfitPctEom: number;
  pnlChartData: unknown[];
  cascadeChartData: unknown[];
  costTrendData: unknown[];
  periodStart: string;
  periodEnd: string;
  daysElapsed: number;
  daysInMonth: number;
  [key: string]: unknown;
}

interface AIFabricData {
  companiesCount: number;
  workersActive: number;
  activeRuntimeCount: number;
  queueDelay: number | null;
  platformSavings: { savedUsd: number; savingsPct: number } | null;
  cascadeBreakdown: Record<string, number>;
  totalCascadeRequests: number;
  grossAiMargin: number;
  totalRevenue: number;
  totalAiCost: number;
  periodStart: string;
  periodEnd: string;
  [key: string]: unknown;
}

interface MissionControlResponse { data: MissionControlData }
interface FinOpsResponse { data: FinOpsData }
interface AIFabricResponse { data: AIFabricData }

// ─── useMissionControl ─────────────────────────────────────────────────────

/**
 * Fetch Mission Control data with auto-refresh (refetchInterval).
 *
 * This replaces raw fetch + setInterval polling in the mission-control page.
 * refetchInterval: 10s matches the original POLLING_INTERVAL_MS.
 */
export function useMissionControl() {
  return useQuery<MissionControlResponse, ApiError>({
    queryKey: queryKeys.founderPanel.missionControl(),
    queryFn: () => apiGet<MissionControlResponse>("/api/founder-panel/mission-control"),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

// ─── useFinOps ─────────────────────────────────────────────────────────────

/**
 * Fetch FinOps dashboard data.
 *
 * Replaces raw fetch in the finops page.
 */
export function useFinOps() {
  return useQuery<FinOpsResponse, ApiError>({
    queryKey: queryKeys.founderPanel.finops(),
    queryFn: () => apiGet<FinOpsResponse>("/api/founder-panel/finops"),
    staleTime: 30_000,
  });
}

// ─── useAIFabric ────────────────────────────────────────────────────────────

/**
 * Fetch AI Fabric founder panel data.
 *
 * Replaces raw fetch in the ai-fabric page.
 */
export function useAIFabric() {
  return useQuery<AIFabricResponse, ApiError>({
    queryKey: queryKeys.founderPanel.aiFabric(),
    queryFn: () => apiGet<AIFabricResponse>("/api/founder-panel/ai-fabric"),
    staleTime: 30_000,
  });
}
