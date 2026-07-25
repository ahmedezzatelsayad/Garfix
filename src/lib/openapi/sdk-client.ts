/**
 * sdk-client.ts — AUTO-GENERATED typed SDK client from OpenAPI spec.
 *
 * ⚠️ DO NOT EDIT MANUALLY — regenerate with: bun scripts/generate-openapi-spec.ts
 *
 * This SDK client wraps the apiGet/apiPost/etc helpers with typed
 * request/response pairs derived from api-types.ts.
 *
 * Usage:
 *   import { sdk } from "@/lib/openapi/sdk-client";
 *   const invoice = await sdk.invoices.getById(1, { companySlug: "acme" });
 *
 * Generated: 2026-07-25T01:03:55.739Z
 */

import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "@/hooks/api-client";
import type { ApiResponse, ApiError, PaginationParams } from "./api-types";

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

// ─── Path Builder Helpers ────────────────────────────────────────────────

/** Build a URL path, replacing {param} placeholders with actual values. */
function buildPath(template: string, params?: Record<string, string | number>): string {
  let path = template;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`{${key}}`, String(value));
    }
  }
  return sdkConfig.baseUrl + path;
}

/** Build a query string from PaginationParams. */
function buildQuery(params?: PaginationParams): string {
  if (!params) return "";
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return qs ? "?" + qs : "";
}

// ─── Invoices SDK ────────────────────────────────────────────────────────

export const invoices = {
  /** GET /api/invoices */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/invoices") + buildQuery(params));
  },

  /** POST /api/invoices */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/invoices"), body);
  },

  /** GET /api/invoices/{id} */
  getById: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/invoices/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/invoices/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/invoices/{id}", { id: id }), body);
  },

  /** DELETE /api/invoices/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/invoices/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/invoices/{id}/payment */
  update_payment: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/invoices/{id}/payment", { id: id }), body);
  },

  /** PATCH /api/invoices/{id}/status */
  update_status: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/invoices/{id}/status", { id: id }), body);
  },

};

// ─── Clients SDK ────────────────────────────────────────────────────────

export const clients = {
  /** GET /api/clients */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/clients") + buildQuery(params));
  },

  /** POST /api/clients */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/clients"), body);
  },

  /** GET /api/clients/{id} */
  getById: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/clients/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/clients/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/clients/{id}", { id: id }), body);
  },

  /** DELETE /api/clients/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/clients/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/clients/{id}/profile */
  getById_profile: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/clients/{id}/profile", { id: id }) + buildQuery(params));
  },

};

// ─── Settings SDK ────────────────────────────────────────────────────────

export const settings = {
  /** GET /api/settings */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/settings") + buildQuery(params));
  },

  /** PATCH /api/settings */
  patch: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/settings"), body);
  },

};

// ─── Reports SDK ────────────────────────────────────────────────────────

export const reports = {
  /** GET /api/reports */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/reports") + buildQuery(params));
  },

};

// ─── Webhooks SDK ────────────────────────────────────────────────────────

export const webhooks = {
  /** GET /api/webhooks/endpoints */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/webhooks/endpoints") + buildQuery(params));
  },

  /** POST /api/webhooks/endpoints */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/webhooks/endpoints"), body);
  },

  /** GET /api/webhooks/endpoints/{id} */
  getById: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/webhooks/endpoints/{id}", { id: id }) + buildQuery(params));
  },

  /** PUT /api/webhooks/endpoints/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPut<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/webhooks/endpoints/{id}", { id: id }), body);
  },

  /** DELETE /api/webhooks/endpoints/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/webhooks/endpoints/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/webhooks/deliveries */
  get_deliveries: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/webhooks/deliveries") + buildQuery(params));
  },

  /** POST /api/webhooks/deliveries */
  post_deliveries: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/webhooks/deliveries"), body);
  },

  /** GET /api/webhooks/events */
  get_events: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/webhooks/events") + buildQuery(params));
  },

  /** POST /api/webhooks/events */
  post_events: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/webhooks/events"), body);
  },

  /** GET /api/webhooks/whatsapp */
  get_whatsapp: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/webhooks/whatsapp") + buildQuery(params));
  },

  /** POST /api/webhooks/whatsapp */
  post_whatsapp: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/webhooks/whatsapp"), body);
  },

};

// ─── Catalog SDK ────────────────────────────────────────────────────────

export const catalog = {
  /** GET /api/catalog */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/catalog") + buildQuery(params));
  },

  /** POST /api/catalog */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/catalog"), body);
  },

  /** PATCH /api/catalog/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/catalog/{id}", { id: id }), body);
  },

  /** DELETE /api/catalog/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/catalog/{id}", { id: id }) + buildQuery(params));
  },

};

// ─── Storage SDK ────────────────────────────────────────────────────────

export const storage = {
  /** GET /api/storage/{key} */
  getById: async (key: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/storage/{key}", { key: key }) + buildQuery(params));
  },

};

// ─── Notifications SDK ────────────────────────────────────────────────────────

export const notifications = {
  /** GET /api/notifications */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/notifications") + buildQuery(params));
  },

  /** POST /api/notifications */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/notifications"), body);
  },

};

// ─── Feature-flags SDK ────────────────────────────────────────────────────────

export const feature-flags = {
  /** GET /api/feature-flags */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/feature-flags") + buildQuery(params));
  },

};

// ─── Platform-admin SDK ────────────────────────────────────────────────────────

export const platform-admin = {
  /** POST /api/platform-admin/retention-cleanup */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/retention-cleanup"), body);
  },

  /** GET /api/platform-admin/queue-failures */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/queue-failures") + buildQuery(params));
  },

  /** GET /api/platform-admin/feature-flags */
  get_feature-flags: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/feature-flags") + buildQuery(params));
  },

  /** POST /api/platform-admin/feature-flags */
  post_feature-flags: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/feature-flags"), body);
  },

  /** PATCH /api/platform-admin/feature-flags/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/feature-flags/{id}", { id: id }), body);
  },

  /** DELETE /api/platform-admin/feature-flags/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/feature-flags/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/platform-admin/review-queue */
  get_review-queue: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/review-queue") + buildQuery(params));
  },

  /** GET /api/platform-admin/ai-orchestration */
  get_ai-orchestration: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/ai-orchestration") + buildQuery(params));
  },

  /** PATCH /api/platform-admin/ai-orchestration */
  patch: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/ai-orchestration"), body);
  },

  /** POST /api/platform-admin/ai-orchestration/run-benchmark */
  post_run-benchmark: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/ai-orchestration/run-benchmark"), body);
  },

  /** GET /api/platform-admin/integrations */
  get_integrations: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/integrations") + buildQuery(params));
  },

  /** PATCH /api/platform-admin/integrations */
  patch_integrations: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/integrations"), body);
  },

  /** GET /api/platform-admin/announcements */
  get_announcements: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/announcements") + buildQuery(params));
  },

  /** POST /api/platform-admin/announcements */
  post_announcements: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/announcements"), body);
  },

  /** PATCH /api/platform-admin/announcements/{id} */
  update_announcements: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/announcements/{id}", { id: id }), body);
  },

  /** DELETE /api/platform-admin/announcements/{id} */
  remove_announcements: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/announcements/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/platform-admin/ai-providers */
  get_ai-providers: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/ai-providers") + buildQuery(params));
  },

  /** PATCH /api/platform-admin/ai-providers */
  patch_ai-providers: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/ai-providers"), body);
  },

  /** GET /api/platform-admin/landing-content */
  get_landing-content: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/landing-content") + buildQuery(params));
  },

  /** PATCH /api/platform-admin/landing-content */
  patch_landing-content: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/landing-content"), body);
  },

  /** GET /api/platform-admin/tenants */
  get_tenants: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/tenants") + buildQuery(params));
  },

  /** GET /api/platform-admin/tenants/{slug} */
  getById: async (slug: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/tenants/{slug}", { slug: slug }) + buildQuery(params));
  },

  /** PATCH /api/platform-admin/tenants/{slug} */
  update_tenants: async (slug: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/tenants/{slug}", { slug: slug }), body);
  },

  /** DELETE /api/platform-admin/tenants/{slug} */
  remove_tenants: async (slug: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/tenants/{slug}", { slug: slug }) + buildQuery(params));
  },

  /** GET /api/platform-admin/audit */
  get_audit: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/audit") + buildQuery(params));
  },

  /** GET /api/platform-admin/stats */
  stats: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/stats") + buildQuery(params));
  },

  /** GET /api/platform-admin/tickets */
  get_tickets: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/tickets") + buildQuery(params));
  },

  /** POST /api/platform-admin/tickets */
  post_tickets: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/tickets"), body);
  },

  /** PATCH /api/platform-admin/tickets/{id} */
  update_tickets: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/tickets/{id}", { id: id }), body);
  },

  /** POST /api/platform-admin/tickets/{id}/replies */
  post_replies: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/platform-admin/tickets/{id}/replies", { id: id }), body);
  },

  /** GET /api/platform-admin/ai-usage */
  get_ai-usage: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/platform-admin/ai-usage") + buildQuery(params));
  },

};

// ─── Health SDK ────────────────────────────────────────────────────────

export const health = {
  /** GET /api */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api") + buildQuery(params));
  },

  /** GET /api/health/circuit-breakers */
  get_circuit-breakers: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/health/circuit-breakers") + buildQuery(params));
  },

  /** POST /api/health/circuit-breakers */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/health/circuit-breakers"), body);
  },

  /** GET /api/health */
  get_health: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/health") + buildQuery(params));
  },

  /** GET /api/health/audit-trail */
  get_audit-trail: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/health/audit-trail") + buildQuery(params));
  },

};

// ─── Modules SDK ────────────────────────────────────────────────────────

export const modules = {
  /** GET /api/modules */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/modules") + buildQuery(params));
  },

};

// ─── Dashboard SDK ────────────────────────────────────────────────────────

export const dashboard = {
  /** GET /api/dashboard/stats */
  stats: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/dashboard/stats") + buildQuery(params));
  },

};

// ─── Automation SDK ────────────────────────────────────────────────────────

export const automation = {
  /** GET /api/automation */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/automation") + buildQuery(params));
  },

  /** POST /api/automation */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/automation"), body);
  },

  /** GET /api/automation/{id}/logs */
  getById: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/automation/{id}/logs", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/automation/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/automation/{id}", { id: id }), body);
  },

  /** DELETE /api/automation/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/automation/{id}", { id: id }) + buildQuery(params));
  },

};

// ─── Purchases SDK ────────────────────────────────────────────────────────

export const purchases = {
  /** GET /api/purchases */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/purchases") + buildQuery(params));
  },

  /** POST /api/purchases */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/purchases"), body);
  },

  /** PATCH /api/purchases/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/purchases/{id}", { id: id }), body);
  },

  /** DELETE /api/purchases/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/purchases/{id}", { id: id }) + buildQuery(params));
  },

};

// ─── Onboarding SDK ────────────────────────────────────────────────────────

export const onboarding = {
  /** GET /api/onboarding */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/onboarding") + buildQuery(params));
  },

  /** POST /api/onboarding */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/onboarding"), body);
  },

};

// ─── Accounting SDK ────────────────────────────────────────────────────────

export const accounting = {
  /** GET /api/accounting/inventory-valuation */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/inventory-valuation") + buildQuery(params));
  },

  /** POST /api/accounting/inventory-valuation */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/inventory-valuation"), body);
  },

  /** GET /api/accounting/bank-reconciliation */
  get_bank-reconciliation: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/bank-reconciliation") + buildQuery(params));
  },

  /** POST /api/accounting/bank-reconciliation */
  post_bank-reconciliation: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/bank-reconciliation"), body);
  },

  /** POST /api/accounting/bank-reconciliation/complete */
  post_complete: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/bank-reconciliation/complete"), body);
  },

  /** GET /api/accounting/bank-reconciliation/{id} */
  getById: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/bank-reconciliation/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/bank-reconciliation/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/bank-reconciliation/{id}", { id: id }), body);
  },

  /** POST /api/accounting/bank-reconciliation/{id}/match */
  post_match: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/bank-reconciliation/{id}/match", { id: id }), body);
  },

  /** GET /api/accounting/balance-sheet */
  get_balance-sheet: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/balance-sheet") + buildQuery(params));
  },

  /** GET /api/accounting/cash-flow */
  get_cash-flow: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/cash-flow") + buildQuery(params));
  },

  /** GET /api/accounting/accountant-access */
  get_accountant-access: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/accountant-access") + buildQuery(params));
  },

  /** POST /api/accounting/accountant-access */
  post_accountant-access: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/accountant-access"), body);
  },

  /** DELETE /api/accounting/accountant-access */
  delete: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/accountant-access") + buildQuery(params));
  },

  /** POST /api/accounting/accountant-access/{id}/revoke */
  post_revoke: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/accountant-access/{id}/revoke", { id: id }), body);
  },

  /** GET /api/accounting/budget-vs-actual */
  get_budget-vs-actual: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/budget-vs-actual") + buildQuery(params));
  },

  /** GET /api/accounting/supplier-statement */
  get_supplier-statement: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/supplier-statement") + buildQuery(params));
  },

  /** GET /api/accounting/commissions */
  get_commissions: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/commissions") + buildQuery(params));
  },

  /** POST /api/accounting/commissions */
  post_commissions: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/commissions"), body);
  },

  /** POST /api/accounting/commissions/{id}/post-as-journal-entry */
  post_post-as-journal-entry: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/commissions/{id}/post-as-journal-entry", { id: id }), body);
  },

  /** GET /api/accounting/trial-balance */
  get_trial-balance: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/trial-balance") + buildQuery(params));
  },

  /** GET /api/accounting/letters-of-credit */
  get_letters-of-credit: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/letters-of-credit") + buildQuery(params));
  },

  /** POST /api/accounting/letters-of-credit */
  post_letters-of-credit: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/letters-of-credit"), body);
  },

  /** GET /api/accounting/letters-of-credit/{id} */
  getById_letters-of-credit: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/letters-of-credit/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/letters-of-credit/{id} */
  update_letters-of-credit: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/letters-of-credit/{id}", { id: id }), body);
  },

  /** GET /api/accounting/quotations */
  get_quotations: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/quotations") + buildQuery(params));
  },

  /** POST /api/accounting/quotations */
  post_quotations: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/quotations"), body);
  },

  /** PATCH /api/accounting/quotations */
  patch: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/quotations"), body);
  },

  /** GET /api/accounting/quotations/{id} */
  getById_quotations: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/quotations/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/quotations/{id} */
  update_quotations: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/quotations/{id}", { id: id }), body);
  },

  /** DELETE /api/accounting/quotations/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/quotations/{id}", { id: id }) + buildQuery(params));
  },

  /** POST /api/accounting/quotations/{id}/convert-to-invoice */
  post_convert-to-invoice: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/quotations/{id}/convert-to-invoice", { id: id }), body);
  },

  /** GET /api/accounting/dashboard */
  dashboard: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/dashboard") + buildQuery(params));
  },

  /** GET /api/accounting/accounting-audit */
  get_accounting-audit: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/accounting-audit") + buildQuery(params));
  },

  /** GET /api/accounting/wps */
  get_wps: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/wps") + buildQuery(params));
  },

  /** POST /api/accounting/wps */
  post_wps: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/wps"), body);
  },

  /** POST /api/accounting/wps/{id}/submit */
  post_submit: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/wps/{id}/submit", { id: id }), body);
  },

  /** GET /api/accounting/wps/{id} */
  getById_wps: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/wps/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/wps/{id} */
  update_wps: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/wps/{id}", { id: id }), body);
  },

  /** GET /api/accounting/wps/{id}/download */
  getById_download: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/wps/{id}/download", { id: id }) + buildQuery(params));
  },

  /** POST /api/accounting/verify-payment */
  post_verify-payment: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/verify-payment"), body);
  },

  /** GET /api/accounting/installments */
  get_installments: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/installments") + buildQuery(params));
  },

  /** POST /api/accounting/installments */
  post_installments: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/installments"), body);
  },

  /** GET /api/accounting/consolidation */
  get_consolidation: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/consolidation") + buildQuery(params));
  },

  /** POST /api/accounting/consolidation */
  post_consolidation: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/consolidation"), body);
  },

  /** GET /api/accounting/purchase-orders */
  get_purchase-orders: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/purchase-orders") + buildQuery(params));
  },

  /** POST /api/accounting/purchase-orders */
  post_purchase-orders: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/purchase-orders"), body);
  },

  /** GET /api/accounting/purchase-orders/{id} */
  getById_purchase-orders: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/purchase-orders/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/purchase-orders/{id} */
  update_purchase-orders: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/purchase-orders/{id}", { id: id }), body);
  },

  /** GET /api/accounting/cost-centers */
  get_cost-centers: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/cost-centers") + buildQuery(params));
  },

  /** POST /api/accounting/cost-centers */
  post_cost-centers: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/cost-centers"), body);
  },

  /** PATCH /api/accounting/cost-centers/{id} */
  update_cost-centers: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/cost-centers/{id}", { id: id }), body);
  },

  /** DELETE /api/accounting/cost-centers/{id} */
  remove_cost-centers: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/cost-centers/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/accounting/vouchers */
  get_vouchers: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/vouchers") + buildQuery(params));
  },

  /** POST /api/accounting/vouchers */
  post_vouchers: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/vouchers"), body);
  },

  /** POST /api/accounting/vouchers/{id}/cancel */
  post_cancel: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/vouchers/{id}/cancel", { id: id }), body);
  },

  /** GET /api/accounting/vouchers/{id} */
  getById_vouchers: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/vouchers/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/vouchers/{id} */
  update_vouchers: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/vouchers/{id}", { id: id }), body);
  },

  /** POST /api/accounting/vouchers/{id}/approve */
  post_approve: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/vouchers/{id}/approve", { id: id }), body);
  },

  /** GET /api/accounting/profit-distribution */
  get_profit-distribution: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/profit-distribution") + buildQuery(params));
  },

  /** POST /api/accounting/profit-distribution */
  post_profit-distribution: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/profit-distribution"), body);
  },

  /** POST /api/accounting/profit-distribution/{id}/post-as-journal-entry */
  post_post-as-journal-entry: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/profit-distribution/{id}/post-as-journal-entry", { id: id }), body);
  },

  /** GET /api/accounting/fx-revaluation */
  get_fx-revaluation: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/fx-revaluation") + buildQuery(params));
  },

  /** POST /api/accounting/fx-revaluation */
  post_fx-revaluation: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fx-revaluation"), body);
  },

  /** GET /api/accounting/fx-revaluation/{id} */
  getById_fx-revaluation: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/fx-revaluation/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/fx-revaluation/{id} */
  update_fx-revaluation: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fx-revaluation/{id}", { id: id }), body);
  },

  /** GET /api/accounting/export-excel */
  get_export-excel: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/export-excel") + buildQuery(params));
  },

  /** GET /api/accounting/filing-reminders */
  get_filing-reminders: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/filing-reminders") + buildQuery(params));
  },

  /** POST /api/accounting/initiate-payment */
  post_initiate-payment: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/initiate-payment"), body);
  },

  /** GET /api/accounting/accounts */
  get_accounts: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/accounts") + buildQuery(params));
  },

  /** POST /api/accounting/accounts */
  post_accounts: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/accounts"), body);
  },

  /** DELETE /api/accounting/accounts/{id} */
  remove_accounts: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/accounts/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/accounting/post-dated-checks */
  get_post-dated-checks: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/post-dated-checks") + buildQuery(params));
  },

  /** POST /api/accounting/post-dated-checks */
  post_post-dated-checks: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/post-dated-checks"), body);
  },

  /** POST /api/accounting/post-dated-checks/{id}/cancel */
  post_cancel: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/post-dated-checks/{id}/cancel", { id: id }), body);
  },

  /** GET /api/accounting/post-dated-checks/{id} */
  getById_post-dated-checks: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/post-dated-checks/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/post-dated-checks/{id} */
  update_post-dated-checks: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/post-dated-checks/{id}", { id: id }), body);
  },

  /** POST /api/accounting/post-dated-checks/{id}/deposit */
  post_deposit: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/post-dated-checks/{id}/deposit", { id: id }), body);
  },

  /** GET /api/accounting/asset-disposals */
  get_asset-disposals: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/asset-disposals") + buildQuery(params));
  },

  /** GET /api/accounting/aging */
  get_aging: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/aging") + buildQuery(params));
  },

  /** GET /api/accounting/payroll */
  get_payroll: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/payroll") + buildQuery(params));
  },

  /** POST /api/accounting/payroll */
  post_payroll: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/payroll"), body);
  },

  /** GET /api/accounting/payment-methods */
  get_payment-methods: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/payment-methods") + buildQuery(params));
  },

  /** GET /api/accounting/profit-loss */
  get_profit-loss: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/profit-loss") + buildQuery(params));
  },

  /** GET /api/accounting/client-statement */
  get_client-statement: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/client-statement") + buildQuery(params));
  },

  /** GET /api/accounting/bank-transfer */
  get_bank-transfer: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/bank-transfer") + buildQuery(params));
  },

  /** POST /api/accounting/bank-transfer */
  post_bank-transfer: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/bank-transfer"), body);
  },

  /** GET /api/accounting/journal-entries */
  get_journal-entries: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/journal-entries") + buildQuery(params));
  },

  /** POST /api/accounting/journal-entries */
  post_journal-entries: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/journal-entries"), body);
  },

  /** DELETE /api/accounting/journal-entries/{id} */
  remove_journal-entries: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/journal-entries/{id}", { id: id }) + buildQuery(params));
  },

  /** POST /api/accounting/journal-entries/{id}/reverse */
  post_reverse: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/journal-entries/{id}/reverse", { id: id }), body);
  },

  /** GET /api/accounting/inter-company */
  get_inter-company: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/inter-company") + buildQuery(params));
  },

  /** POST /api/accounting/inter-company */
  post_inter-company: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/inter-company"), body);
  },

  /** GET /api/accounting/inter-company/{id} */
  getById_inter-company: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/inter-company/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/inter-company/{id} */
  update_inter-company: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/inter-company/{id}", { id: id }), body);
  },

  /** POST /api/accounting/inter-company/{id}/settle */
  post_settle: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/inter-company/{id}/settle", { id: id }), body);
  },

  /** GET /api/accounting/landed-cost */
  get_landed-cost: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/landed-cost") + buildQuery(params));
  },

  /** POST /api/accounting/landed-cost */
  post_landed-cost: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/landed-cost"), body);
  },

  /** GET /api/accounting/landed-cost/{id} */
  getById_landed-cost: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/landed-cost/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/landed-cost/{id} */
  update_landed-cost: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/landed-cost/{id}", { id: id }), body);
  },

  /** DELETE /api/accounting/landed-cost/{id} */
  remove_landed-cost: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/landed-cost/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/accounting/financial-dashboard */
  get_financial-dashboard: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/financial-dashboard") + buildQuery(params));
  },

  /** GET /api/accounting/fixed-assets */
  get_fixed-assets: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/fixed-assets") + buildQuery(params));
  },

  /** POST /api/accounting/fixed-assets */
  post_fixed-assets: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fixed-assets"), body);
  },

  /** GET /api/accounting/fixed-assets/{id} */
  getById_fixed-assets: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/fixed-assets/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/fixed-assets/{id} */
  update_fixed-assets: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fixed-assets/{id}", { id: id }), body);
  },

  /** POST /api/accounting/bank-import */
  post_bank-import: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/bank-import"), body);
  },

  /** GET /api/accounting/tax-filing */
  get_tax-filing: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/tax-filing") + buildQuery(params));
  },

  /** POST /api/accounting/tax-filing */
  post_tax-filing: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/tax-filing"), body);
  },

  /** GET /api/accounting/tax-filing/{id} */
  getById_tax-filing: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/tax-filing/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/tax-filing/{id} */
  update_tax-filing: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/tax-filing/{id}", { id: id }), body);
  },

  /** GET /api/accounting/budgets */
  get_budgets: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/budgets") + buildQuery(params));
  },

  /** POST /api/accounting/budgets */
  post_budgets: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/budgets"), body);
  },

  /** PATCH /api/accounting/budgets */
  patch_budgets: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/budgets"), body);
  },

  /** POST /api/accounting/budgets/{id}/approve */
  post_approve: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/budgets/{id}/approve", { id: id }), body);
  },

  /** POST /api/accounting/budgets/{id}/revise */
  post_revise: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/budgets/{id}/revise", { id: id }), body);
  },

  /** GET /api/accounting/bank-accounts */
  get_bank-accounts: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/bank-accounts") + buildQuery(params));
  },

  /** POST /api/accounting/bank-accounts */
  post_bank-accounts: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/bank-accounts"), body);
  },

  /** GET /api/accounting/bank-accounts/{id} */
  getById_bank-accounts: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/bank-accounts/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/bank-accounts/{id} */
  update_bank-accounts: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/bank-accounts/{id}", { id: id }), body);
  },

  /** DELETE /api/accounting/bank-accounts/{id} */
  remove_bank-accounts: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/bank-accounts/{id}", { id: id }) + buildQuery(params));
  },

  /** POST /api/accounting/opening-balances/post */
  post_post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/opening-balances/post"), body);
  },

  /** GET /api/accounting/opening-balances */
  get_opening-balances: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/opening-balances") + buildQuery(params));
  },

  /** POST /api/accounting/opening-balances */
  post_opening-balances: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/opening-balances"), body);
  },

  /** GET /api/accounting/period-comparison */
  get_period-comparison: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/period-comparison") + buildQuery(params));
  },

  /** GET /api/accounting/fiscal-periods */
  get_fiscal-periods: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/fiscal-periods") + buildQuery(params));
  },

  /** POST /api/accounting/fiscal-periods */
  post_fiscal-periods: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fiscal-periods"), body);
  },

  /** PATCH /api/accounting/fiscal-periods */
  patch_fiscal-periods: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fiscal-periods"), body);
  },

  /** GET /api/accounting/fiscal-periods/{id} */
  getById_fiscal-periods: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/fiscal-periods/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/accounting/fiscal-periods/{id} */
  update_fiscal-periods: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fiscal-periods/{id}", { id: id }), body);
  },

  /** DELETE /api/accounting/fiscal-periods/{id} */
  remove_fiscal-periods: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/fiscal-periods/{id}", { id: id }) + buildQuery(params));
  },

  /** POST /api/accounting/fiscal-periods/{id}/close */
  post_close: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fiscal-periods/{id}/close", { id: id }), body);
  },

  /** POST /api/accounting/fiscal-periods/{id}/reopen */
  post_reopen: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/fiscal-periods/{id}/reopen", { id: id }), body);
  },

  /** GET /api/accounting/retention-check */
  get_retention-check: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/retention-check") + buildQuery(params));
  },

  /** GET /api/accounting/depreciation */
  get_depreciation: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/accounting/depreciation") + buildQuery(params));
  },

  /** POST /api/accounting/depreciation */
  post_depreciation: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/accounting/depreciation"), body);
  },

};

// ─── Companies SDK ────────────────────────────────────────────────────────

export const companies = {
  /** GET /api/companies */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/companies") + buildQuery(params));
  },

  /** POST /api/companies */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/companies"), body);
  },

  /** PATCH /api/companies/{slug}/members/{uid} */
  update: async (slug: string | number, uid: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/companies/{slug}/members/{uid}", { slug: slug, uid: uid }), body);
  },

  /** DELETE /api/companies/{slug}/members/{uid} */
  remove: async (slug: string | number, uid: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/companies/{slug}/members/{uid}", { slug: slug, uid: uid }) + buildQuery(params));
  },

  /** GET /api/companies/{slug}/members */
  getById: async (slug: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/companies/{slug}/members", { slug: slug }) + buildQuery(params));
  },

  /** POST /api/companies/{slug}/members */
  post_members: async (slug: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/companies/{slug}/members", { slug: slug }), body);
  },

  /** GET /api/companies/{slug} */
  getById_companies: async (slug: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/companies/{slug}", { slug: slug }) + buildQuery(params));
  },

  /** PATCH /api/companies/{slug} */
  update_companies: async (slug: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/companies/{slug}", { slug: slug }), body);
  },

  /** DELETE /api/companies/{slug} */
  remove_companies: async (slug: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/companies/{slug}", { slug: slug }) + buildQuery(params));
  },

};

// ─── Inventory SDK ────────────────────────────────────────────────────────

export const inventory = {
  /** GET /api/inventory/items */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/inventory/items") + buildQuery(params));
  },

  /** POST /api/inventory/items */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/inventory/items"), body);
  },

  /** GET /api/inventory/movements */
  get_movements: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/inventory/movements") + buildQuery(params));
  },

  /** GET /api/inventory/warehouses */
  get_warehouses: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/inventory/warehouses") + buildQuery(params));
  },

  /** POST /api/inventory/warehouses */
  post_warehouses: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/inventory/warehouses"), body);
  },

  /** PATCH /api/inventory/warehouses/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/inventory/warehouses/{id}", { id: id }), body);
  },

  /** DELETE /api/inventory/warehouses/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/inventory/warehouses/{id}", { id: id }) + buildQuery(params));
  },

};

// ─── Auth SDK ────────────────────────────────────────────────────────

export const auth = {
  /** POST /api/auth/logout */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/auth/logout"), body);
  },

  /** POST /api/auth/change-password */
  post_change-password: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/auth/change-password"), body);
  },

  /** GET /api/auth/csrf */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/auth/csrf") + buildQuery(params));
  },

  /** POST /api/auth/login */
  post_login: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/auth/login"), body);
  },

  /** POST /api/auth/reset-password */
  post_reset-password: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/auth/reset-password"), body);
  },

  /** POST /api/auth/forgot-password */
  post_forgot-password: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/auth/forgot-password"), body);
  },

  /** GET /api/auth/me */
  get_me: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/auth/me") + buildQuery(params));
  },

  /** POST /api/auth/register */
  post_register: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/auth/register"), body);
  },

  /** POST /api/auth/refresh */
  post_refresh: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/auth/refresh"), body);
  },

};

// ─── Backups SDK ────────────────────────────────────────────────────────

export const backups = {
  /** GET /api/backups */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/backups") + buildQuery(params));
  },

  /** POST /api/backups */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/backups"), body);
  },

};

// ─── Landing-content SDK ────────────────────────────────────────────────────────

export const landing-content = {
  /** GET /api/landing-content */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/landing-content") + buildQuery(params));
  },

};

// ─── Metrics SDK ────────────────────────────────────────────────────────

export const metrics = {
  /** GET /api/metrics */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/metrics") + buildQuery(params));
  },

};

// ─── Audit SDK ────────────────────────────────────────────────────────

export const audit = {
  /** GET /api/audit */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/audit") + buildQuery(params));
  },

};

// ─── Ai SDK ────────────────────────────────────────────────────────

export const ai = {
  /** POST /api/ai/smart-parse */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/smart-parse"), body);
  },

  /** POST /api/ai/parse-image */
  post_parse-image: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/parse-image"), body);
  },

  /** POST /api/ai/invoice-brain/extract */
  post_extract: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/invoice-brain/extract"), body);
  },

  /** GET /api/ai/invoice-brain/stats */
  stats: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/ai/invoice-brain/stats") + buildQuery(params));
  },

  /** POST /api/ai/parse-file */
  post_parse-file: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/parse-file"), body);
  },

  /** POST /api/ai/agents */
  post_agents: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/agents"), body);
  },

  /** GET /api/ai/agents */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/ai/agents") + buildQuery(params));
  },

  /** POST /api/ai/bulk-import */
  post_bulk-import: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/bulk-import"), body);
  },

  /** POST /api/ai/tools */
  post_tools: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/tools"), body);
  },

  /** GET /api/ai/memory */
  get_memory: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/ai/memory") + buildQuery(params));
  },

  /** POST /api/ai/memory */
  post_memory: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/memory"), body);
  },

  /** DELETE /api/ai/memory/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/ai/memory/{id}", { id: id }) + buildQuery(params));
  },

  /** POST /api/ai/chat */
  post_chat: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/chat"), body);
  },

  /** GET /api/ai/chat */
  get_chat: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/ai/chat") + buildQuery(params));
  },

  /** POST /api/ai/chat/stream */
  post_stream: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/ai/chat/stream"), body);
  },

};

// ─── Startup-check SDK ────────────────────────────────────────────────────────

export const startup-check = {
  /** GET /api/startup-check */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/startup-check") + buildQuery(params));
  },

};

// ─── Founder-panel SDK ────────────────────────────────────────────────────────

export const founder-panel = {
  /** GET /api/founder-panel/ai-fabric */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/founder-panel/ai-fabric") + buildQuery(params));
  },

  /** GET /api/founder-panel/mission-control */
  get_mission-control: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/founder-panel/mission-control") + buildQuery(params));
  },

  /** GET /api/founder-panel/finops */
  get_finops: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/founder-panel/finops") + buildQuery(params));
  },

};

// ─── Founder-validation SDK ────────────────────────────────────────────────────────

export const founder-validation = {
  /** GET /api/founder-validation */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/founder-validation") + buildQuery(params));
  },

  /** POST /api/founder-validation */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/founder-validation"), body);
  },

  /** POST /api/founder-validation/ai-test */
  post_ai-test: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/founder-validation/ai-test"), body);
  },

  /** POST /api/founder-validation/report */
  report: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/founder-validation/report"), body);
  },

  /** POST /api/founder-validation/seed */
  post_seed: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/founder-validation/seed"), body);
  },

};

// ─── Saas SDK ────────────────────────────────────────────────────────

export const saas = {
  /** PATCH /api/saas/users/{uid} */
  update: async (uid: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/saas/users/{uid}", { uid: uid }), body);
  },

  /** DELETE /api/saas/users/{uid} */
  remove: async (uid: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/saas/users/{uid}", { uid: uid }) + buildQuery(params));
  },

  /** GET /api/saas/users */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/saas/users") + buildQuery(params));
  },

  /** POST /api/saas/users */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/saas/users"), body);
  },

  /** GET /api/saas/payments */
  get_payments: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/saas/payments") + buildQuery(params));
  },

  /** POST /api/saas/payments/initiate */
  post_initiate: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/saas/payments/initiate"), body);
  },

  /** GET /api/saas/payments/callback */
  get_callback: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/saas/payments/callback") + buildQuery(params));
  },

};

// ─── Hr SDK ────────────────────────────────────────────────────────

export const hr = {
  /** GET /api/hr/commissions */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/commissions") + buildQuery(params));
  },

  /** POST /api/hr/commissions */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/commissions"), body);
  },

  /** PATCH /api/hr/commissions/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/commissions/{id}", { id: id }), body);
  },

  /** DELETE /api/hr/commissions/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/commissions/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/hr/attendance */
  get_attendance: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/attendance") + buildQuery(params));
  },

  /** POST /api/hr/attendance */
  post_attendance: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/attendance"), body);
  },

  /** PATCH /api/hr/attendance/{id} */
  update_attendance: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/attendance/{id}", { id: id }), body);
  },

  /** DELETE /api/hr/attendance/{id} */
  remove_attendance: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/attendance/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/hr/salaries */
  get_salaries: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/salaries") + buildQuery(params));
  },

  /** POST /api/hr/salaries */
  post_salaries: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/salaries"), body);
  },

  /** PATCH /api/hr/salaries/{id} */
  update_salaries: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/salaries/{id}", { id: id }), body);
  },

  /** DELETE /api/hr/salaries/{id} */
  remove_salaries: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/salaries/{id}", { id: id }) + buildQuery(params));
  },

  /** POST /api/hr/gratuity */
  post_gratuity: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/gratuity"), body);
  },

  /** GET /api/hr/employees */
  get_employees: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/employees") + buildQuery(params));
  },

  /** POST /api/hr/employees */
  post_employees: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/employees"), body);
  },

  /** GET /api/hr/employees/{id} */
  getById: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/employees/{id}", { id: id }) + buildQuery(params));
  },

  /** PATCH /api/hr/employees/{id} */
  update_employees: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/employees/{id}", { id: id }), body);
  },

  /** DELETE /api/hr/employees/{id} */
  remove_employees: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/employees/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/hr/performance */
  get_performance: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/performance") + buildQuery(params));
  },

  /** POST /api/hr/performance */
  post_performance: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/performance"), body);
  },

  /** PATCH /api/hr/performance/{id} */
  update_performance: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/performance/{id}", { id: id }), body);
  },

  /** DELETE /api/hr/performance/{id} */
  remove_performance: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/performance/{id}", { id: id }) + buildQuery(params));
  },

  /** GET /api/hr/leaves */
  get_leaves: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/leaves") + buildQuery(params));
  },

  /** POST /api/hr/leaves */
  post_leaves: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/leaves"), body);
  },

  /** PATCH /api/hr/leaves/{id} */
  update_leaves: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/hr/leaves/{id}", { id: id }), body);
  },

  /** DELETE /api/hr/leaves/{id} */
  remove_leaves: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/hr/leaves/{id}", { id: id }) + buildQuery(params));
  },

};

// ─── Internal SDK ────────────────────────────────────────────────────────

export const internal = {
  /** GET /api/internal/ai-fabric/savings */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/internal/ai-fabric/savings") + buildQuery(params));
  },

};

// ─── Product-matching SDK ────────────────────────────────────────────────────────

export const product-matching = {
  /** GET /api/product-matching/config */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/product-matching/config") + buildQuery(params));
  },

  /** PUT /api/product-matching/config */
  put: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPut<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/product-matching/config"), body);
  },

  /** GET /api/product-matching/review */
  get_review: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/product-matching/review") + buildQuery(params));
  },

  /** POST /api/product-matching/confirm */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/product-matching/confirm"), body);
  },

  /** POST /api/product-matching/match-override */
  post_match-override: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/product-matching/match-override"), body);
  },

  /** GET /api/product-matching/match-override */
  get_match-override: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/product-matching/match-override") + buildQuery(params));
  },

  /** POST /api/product-matching/undo */
  post_undo: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/product-matching/undo"), body);
  },

};

// ─── Invoice-templates SDK ────────────────────────────────────────────────────────

export const invoice-templates = {
  /** GET /api/invoice-templates */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/invoice-templates") + buildQuery(params));
  },

  /** POST /api/invoice-templates */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/invoice-templates"), body);
  },

  /** PATCH /api/invoice-templates */
  patch: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/invoice-templates"), body);
  },

  /** PATCH /api/invoice-templates/{id} */
  update: async (id: string | number, body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPatch<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/invoice-templates/{id}", { id: id }), body);
  },

  /** DELETE /api/invoice-templates/{id} */
  remove: async (id: string | number, params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/invoice-templates/{id}", { id: id }) + buildQuery(params));
  },

};

// ─── Permissions SDK ────────────────────────────────────────────────────────

export const permissions = {
  /** POST /api/permissions/check */
  post: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/permissions/check"), body);
  },

  /** GET /api/permissions/roles */
  get: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/permissions/roles") + buildQuery(params));
  },

  /** POST /api/permissions/roles */
  post_roles: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPost<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/permissions/roles"), body);
  },

  /** PUT /api/permissions/roles */
  put: async (body: Record<string, unknown>): Promise<ApiResponse<unknown>> => {
    return apiPut<Record<string, unknown>, ApiResponse<unknown>>(buildPath("/api/permissions/roles"), body);
  },

  /** DELETE /api/permissions/roles */
  delete: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/permissions/roles") + buildQuery(params));
  },

  /** GET /api/permissions/catalog */
  get_catalog: async (params?: PaginationParams): Promise<ApiResponse<unknown>> => {
    return apiGet<ApiResponse<unknown>>(buildPath("/api/permissions/catalog") + buildQuery(params));
  },

};

// ─── Aggregate SDK ──────────────────────────────────────────────────────

export const sdk = {
  invoices,
  clients,
  settings,
  reports,
  webhooks,
  catalog,
  storage,
  notifications,
  feature-flags,
  platform-admin,
  health,
  modules,
  dashboard,
  automation,
  purchases,
  onboarding,
  accounting,
  companies,
  inventory,
  auth,
  backups,
  landing-content,
  metrics,
  audit,
  ai,
  startup-check,
  founder-panel,
  founder-validation,
  saas,
  hr,
  internal,
  product-matching,
  invoice-templates,
  permissions,
};

export type Sdk = typeof sdk;