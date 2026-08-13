/**
 * founder-panel.ts — React Query hooks for founder panel dashboards.
 *
 * Provides useMissionControl (with refetchInterval for real-time polling),
 * useFinOps, and useAIFabric hooks. All hooks use the centralized
 * `queryKeys` factory and the typed `apiGet` helper for consistent requests.
 */
"use client";

import { useQuery } from "@tanstack/react-query";
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
  [key: string]: any;
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
  [key: string]: any;
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
  [key: string]: any;
}

// APIs return data directly (not wrapped in { data: ... })

// ─── useMissionControl ─────────────────────────────────────────────────────

/**
 * Fetch Mission Control data with auto-refresh (refetchInterval).
 *
 * This replaces raw fetch + setInterval polling in the mission-control page.
 * refetchInterval: 10s matches the original POLLING_INTERVAL_MS.
 */
export function useMissionControl() {
  return useQuery<MissionControlData, ApiError>({
    queryKey: queryKeys.founderPanel.missionControl(),
    queryFn: () => apiGet<MissionControlData>("/api/founder-panel/mission-control"),
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
  return useQuery<FinOpsData, ApiError>({
    queryKey: queryKeys.founderPanel.finops(),
    queryFn: () => apiGet<FinOpsData>("/api/founder-panel/finops"),
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
  return useQuery<AIFabricData, ApiError>({
    queryKey: queryKeys.founderPanel.aiFabric(),
    queryFn: () => apiGet<AIFabricData>("/api/founder-panel/ai-fabric"),
    staleTime: 30_000,
  });
}

// ─── useEInvoicingDashboard ────────────────────────────────────────────────

/**
 * Fetch founder-panel e-invoicing dashboard data.
 *
 * Returns aggregate stats (companies configured/pending by country),
 * per-company status list, and recent inbound webhook receipts.
 */
export interface EInvoicingCompanyStatus {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  country: string;
  countryName: string;
  authority: string;
  integrationType: string | null;
  isConfigured: boolean;
  lastUpdatedAt: string | null;
  vatNumber: string | null;
  emoji: string | null;
  plan: string;
  subscriptionStatus: string;
}

export interface EInvoicingReceipt {
  id: string;
  companySlug: string;
  invoiceId: number | null;
  authority: string;
  eventType: string;
  externalUuid: string | null;
  status: string;
  rejectionReason: string | null;
  signatureValid: boolean | null;
  receivedAt: string;
}

export interface EInvoicingDashboardData {
  ok: boolean;
  stats: {
    totalCompanies: number;
    configured: number;
    pending: number;
    unsupported: number;
    receiptsLast7d: number;
  };
  byCountry: Record<string, { total: number; configured: number; pending: number }>;
  perCompany: EInvoicingCompanyStatus[];
  recentReceipts: EInvoicingReceipt[];
  availableIntegrations: { type: string; name: string }[];
}

export function useEInvoicingDashboard() {
  return useQuery<EInvoicingDashboardData, ApiError>({
    queryKey: queryKeys.founderPanel.eInvoicing(),
    queryFn: () => apiGet<EInvoicingDashboardData>("/api/founder-panel/e-invoicing"),
    staleTime: 30_000,
  });
}

// ─── useEInvoicingCompanyTimeline ─────────────────────────────────────────

export interface EInvoicingCompanyTimelineReceipt {
  id: string;
  invoiceId: number | null;
  authority: string;
  eventType: string;
  externalUuid: string | null;
  status: string;
  rawPayload: string;
  signatureValid: boolean | null;
  rejectionReason: string | null;
  receivedAt: string;
}

export interface EInvoicingCompanyInvoiceGroup {
  invoiceId: number | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceTotal: number | null;
  issueDate: string | null;
  eventCount: number;
}

export interface EInvoicingCompanyTimelineData {
  ok: boolean;
  company: EInvoicingCompanyStatus;
  stats: {
    total: number;
    accepted: number;
    rejected: number;
    pending: number;
    last7d: number;
  };
  receipts: EInvoicingCompanyTimelineReceipt[];
  pagination: { hasMore: boolean; nextCursor: string | null; limit: number };
  invoiceGroups: EInvoicingCompanyInvoiceGroup[];
}

export function useEInvoicingCompanyTimeline(slug: string | null) {
  return useQuery<EInvoicingCompanyTimelineData, ApiError>({
    queryKey: [...queryKeys.founderPanel.eInvoicing(), "company", slug],
    queryFn: () => apiGet<EInvoicingCompanyTimelineData>(`/api/founder-panel/e-invoicing/${encodeURIComponent(slug || "")}`), // FIX #27 (MEDIUM): encode slug
    enabled: !!slug,
    staleTime: 15_000,
  });
}

// ─── useEInvoicingStats ────────────────────────────────────────────────────

export interface EInvoicingStatsData {
  ok: boolean;
  last24h: {
    total: number;
    accepted: number;
    rejected: number;
    pending: number;
    invalidSignatures: number;
    acceptedRate: number;
  };
  byCountry: Array<{
    authority: string;
    label: string;
    count: number;
    accepted: number;
    rejected: number;
  }>;
  byHour: Array<{ hour: string; count: number; accepted: number; rejected: number }>;
  topCompanies: Array<{
    companySlug: string;
    companyName: string;
    emoji: string;
    country: string;
    receiptCount: number;
  }>;
  allTime: {
    totalReceipts: number;
    companiesWithReceipts: number;
  };
  generatedAt: string;
}

export function useEInvoicingStats() {
  return useQuery<EInvoicingStatsData, ApiError>({
    queryKey: [...queryKeys.founderPanel.eInvoicing(), "stats"],
    queryFn: () => apiGet<EInvoicingStatsData>("/api/founder-panel/e-invoicing/stats"),
    staleTime: 60_000, // 1 minute — stats don't need real-time
  });
}
