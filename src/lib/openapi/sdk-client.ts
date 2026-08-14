/**
 * sdk-client.ts — Typed SDK client for Garfix EOS API.
 *
 * Single source of truth for API calls. Wraps apiGet/apiPost/etc with
 * typed request/response pairs derived from api-types.ts.
 *
 * This is a hand-curated SDK covering the primary domains. The auto-generated
 * SDK (sdk-client.generated.ts) covers all 328 operations but may have
 * naming issues. This file provides a clean, maintained API surface.
 *
 * Usage:
 *   import { sdk } from "@/lib/openapi/sdk-client";
 *   const stats = await sdk.dashboard.stats({ companySlug: "acme" });
 *   const invoice = await sdk.invoices.getById(1, { companySlug: "acme" });
 */

import { apiGet, apiPost, apiPatch } from "@/hooks/api-client";
import type { ErrorResult, PaginatedResponse } from "./api-types";

// ─── SDK Types ──────────────────────────────────────────────────────────

type SdkResponse<T> = T | PaginatedResponse<T> | null;
type _SdkError = ErrorResult;
type SdkParams = Record<string, string | number | undefined>;

// ─── SDK Configuration ──────────────────────────────────────────────────

export interface SdkConfig {
  baseUrl: string;
  defaultCompanySlug: string;
}

const DEFAULT_CONFIG: SdkConfig = {
  baseUrl: "/api",
  defaultCompanySlug: "",
};

let sdkConfig: SdkConfig = DEFAULT_CONFIG;

export function configureSdk(config: Partial<SdkConfig>): void {
  sdkConfig = { ...sdkConfig, ...config };
}

// ─── Path Builder ────────────────────────────────────────────────────────

function buildPath(template: string, params?: Record<string, string | number>): string {
  let path = template;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`{${key}}`, String(value));
    }
  }
  return sdkConfig.baseUrl + path;
}

function buildQuery(params?: SdkParams): string {
  if (!params) return "";
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) filtered[k] = String(v);
  }
  const qs = new URLSearchParams(filtered).toString();
  return qs ? "?" + qs : "";
}

// ─── Auth SDK ────────────────────────────────────────────────────────────

export const auth = {
  login: async (body: { email: string; password: string }): Promise<SdkResponse<unknown>> =>
    apiPost<typeof body, SdkResponse<unknown>>(buildPath("/api/auth/login"), body),

  register: async (body: Record<string, unknown>): Promise<SdkResponse<unknown>> =>
    apiPost<Record<string, unknown>, SdkResponse<unknown>>(buildPath("/api/auth/register"), body),

  me: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/auth/me") + buildQuery(params)),

  logout: async (): Promise<SdkResponse<unknown>> =>
    apiPost<void, SdkResponse<unknown>>(buildPath("/api/auth/logout")),

  csrf: async (): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/auth/csrf")),
};

// ─── Invoices SDK ────────────────────────────────────────────────────────

export const invoices = {
  list: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/invoices") + buildQuery(params)),

  getById: async (id: string | number, params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/invoices/{id}", { id }) + buildQuery(params)),

  create: async (body: Record<string, unknown>): Promise<SdkResponse<unknown>> =>
    apiPost<Record<string, unknown>, SdkResponse<unknown>>(buildPath("/api/invoices"), body),

  updateStatus: async (id: string | number, body: Record<string, unknown>): Promise<SdkResponse<unknown>> =>
    apiPatch<Record<string, unknown>, SdkResponse<unknown>>(buildPath("/api/invoices/{id}/status", { id }), body),
};

// ─── Clients SDK ─────────────────────────────────────────────────────────

export const clients = {
  list: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/clients") + buildQuery(params)),

  getById: async (id: string | number, params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/clients/{id}", { id }) + buildQuery(params)),

  create: async (body: Record<string, unknown>): Promise<SdkResponse<unknown>> =>
    apiPost<Record<string, unknown>, SdkResponse<unknown>>(buildPath("/api/clients"), body),
};

// ─── Companies SDK ────────────────────────────────────────────────────────

export const companies = {
  list: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/companies") + buildQuery(params)),

  getBySlug: async (slug: string): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/companies/{slug}", { slug })),

  members: async (slug: string, params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/companies/{slug}/members", { slug }) + buildQuery(params)),
};

// ─── Accounting SDK ──────────────────────────────────────────────────────

export const accounting = {
  accounts: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/accounts") + buildQuery(params)),

  journalEntries: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/journal-entries") + buildQuery(params)),

  fiscalPeriods: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/fiscal-periods") + buildQuery(params)),

  balanceSheet: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/balance-sheet") + buildQuery(params)),

  profitLoss: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/profit-loss") + buildQuery(params)),

  cashFlow: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/cash-flow") + buildQuery(params)),

  trialBalance: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/trial-balance") + buildQuery(params)),

  budgets: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/budgets") + buildQuery(params)),

  bankReconciliation: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/accounting/bank-reconciliation") + buildQuery(params)),
};

// ─── HR SDK ──────────────────────────────────────────────────────────────

export const hr = {
  employees: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/hr/employees") + buildQuery(params)),

  salaries: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/hr/salaries") + buildQuery(params)),

  attendance: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/hr/attendance") + buildQuery(params)),

  leaves: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/hr/leaves") + buildQuery(params)),
};

// ─── Dashboard SDK ────────────────────────────────────────────────────────

export const dashboard = {
  stats: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/dashboard/stats") + buildQuery(params)),
};

// ─── Settings SDK ────────────────────────────────────────────────────────

export const settings = {
  get: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/settings") + buildQuery(params)),

  update: async (body: Record<string, unknown>): Promise<SdkResponse<unknown>> =>
    apiPatch<Record<string, unknown>, SdkResponse<unknown>>(buildPath("/api/settings"), body),
};

// ─── Inventory SDK ──────────────────────────────────────────────────────

export const inventory = {
  items: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/inventory/items") + buildQuery(params)),

  warehouses: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/inventory/warehouses") + buildQuery(params)),
};

// ─── Health SDK ──────────────────────────────────────────────────────────

export const health = {
  check: async (): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/health")),

  circuitBreakers: async (): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/health/circuit-breakers")),

  auditTrail: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/health/audit-trail") + buildQuery(params)),
};

// ─── AI SDK ──────────────────────────────────────────────────────────────

export const ai = {
  chat: async (body: Record<string, unknown>): Promise<SdkResponse<unknown>> =>
    apiPost<Record<string, unknown>, SdkResponse<unknown>>(buildPath("/api/ai/chat"), body),

  agents: async (params?: SdkParams): Promise<SdkResponse<unknown>> =>
    apiGet<SdkResponse<unknown>>(buildPath("/api/ai/agents") + buildQuery(params)),
};

// ─── Aggregate SDK ──────────────────────────────────────────────────────

export const sdk = {
  auth,
  invoices,
  clients,
  companies,
  accounting,
  hr,
  dashboard,
  settings,
  inventory,
  health,
  ai,
};

export type Sdk = typeof sdk;
