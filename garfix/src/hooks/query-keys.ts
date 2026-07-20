/**
 * query-keys — Centralized query key factory for TanStack React Query.
 *
 * Using a single source of truth for query keys ensures:
 *  - Consistent cache invalidation across mutations
 *  - Type-safe key generation
 *  - Easy refetch targeting by granularity
 *
 * Pattern: [domain, ...identifiers] — matches React Query's recommended structure.
 */

export const queryKeys = {
  // ─── Auth ──────────────────────────────────────────────────────────────
  auth: {
    all: ["auth"] as const,
    me: () => [...queryKeys.auth.all, "me"] as const,
  },

  // ─── Clients ───────────────────────────────────────────────────────────
  clients: {
    all: ["clients"] as const,
    lists: () => [...queryKeys.clients.all, "list"] as const,
    list: (filters: { companySlug: string; search?: string }) =>
      [...queryKeys.clients.lists(), filters] as const,
    details: () => [...queryKeys.clients.all, "detail"] as const,
    detail: (id: number) => [...queryKeys.clients.details(), id] as const,
    profile: (id: number) =>
      [...queryKeys.clients.all, "profile", id] as const,
  },

  // ─── Invoices ──────────────────────────────────────────────────────────
  invoices: {
    all: ["invoices"] as const,
    lists: () => [...queryKeys.invoices.all, "list"] as const,
    list: (filters: { companySlug: string; search?: string }) =>
      [...queryKeys.invoices.lists(), filters] as const,
    details: () => [...queryKeys.invoices.all, "detail"] as const,
    detail: (id: number) => [...queryKeys.invoices.details(), id] as const,
  },

  // ─── Companies ─────────────────────────────────────────────────────────
  companies: {
    all: ["companies"] as const,
    lists: () => [...queryKeys.companies.all, "list"] as const,
    detail: (slug: string) =>
      [...queryKeys.companies.all, "detail", slug] as const,
    members: (slug: string) =>
      [...queryKeys.companies.all, "members", slug] as const,
  },

  // ─── Settings ──────────────────────────────────────────────────────────
  settings: {
    all: ["settings"] as const,
    company: (slug: string) =>
      [...queryKeys.settings.all, "company", slug] as const,
  },

  // ─── Invoice Templates ────────────────────────────────────────────────
  invoiceTemplates: {
    all: ["invoice-templates"] as const,
    lists: () => [...queryKeys.invoiceTemplates.all, "list"] as const,
    list: (companySlug: string) =>
      [...queryKeys.invoiceTemplates.lists(), companySlug] as const,
    settings: (companySlug: string) =>
      [...queryKeys.invoiceTemplates.all, "settings", companySlug] as const,
  },

  // ─── HR ────────────────────────────────────────────────────────────────
  hr: {
    all: ["hr"] as const,
    employees: (companySlug: string) =>
      [...queryKeys.hr.all, "employees", companySlug] as const,
    attendance: (companySlug: string) =>
      [...queryKeys.hr.all, "attendance", companySlug] as const,
    salaries: (companySlug: string) =>
      [...queryKeys.hr.all, "salaries", companySlug] as const,
    commissions: (companySlug: string) =>
      [...queryKeys.hr.all, "commissions", companySlug] as const,
    leaves: (companySlug: string) =>
      [...queryKeys.hr.all, "leaves", companySlug] as const,
    performance: (companySlug: string) =>
      [...queryKeys.hr.all, "performance", companySlug] as const,
  },

  // ─── Accounting ───────────────────────────────────────────────────────
  accounting: {
    all: ["accounting"] as const,
    accounts: (companySlug: string) =>
      [...queryKeys.accounting.all, "accounts", companySlug] as const,
    journalEntries: (companySlug: string) =>
      [...queryKeys.accounting.all, "journal-entries", companySlug] as const,
    profitLoss: (companySlug: string) =>
      [...queryKeys.accounting.all, "profit-loss", companySlug] as const,
    balanceSheet: (companySlug: string) =>
      [...queryKeys.accounting.all, "balance-sheet", companySlug] as const,
    cashFlow: (companySlug: string) =>
      [...queryKeys.accounting.all, "cash-flow", companySlug] as const,
    trialBalance: (companySlug: string) =>
      [...queryKeys.accounting.all, "trial-balance", companySlug] as const,
  },

  // ─── Inventory ────────────────────────────────────────────────────────
  inventory: {
    all: ["inventory"] as const,
    items: (companySlug: string) =>
      [...queryKeys.inventory.all, "items", companySlug] as const,
    movements: (companySlug: string) =>
      [...queryKeys.inventory.all, "movements", companySlug] as const,
    warehouses: (companySlug: string) =>
      [...queryKeys.inventory.all, "warehouses", companySlug] as const,
  },

  // ─── Catalog ──────────────────────────────────────────────────────────
  catalog: {
    all: ["catalog"] as const,
    list: (companySlug: string) =>
      [...queryKeys.catalog.all, "list", companySlug] as const,
  },

  // ─── Automation ───────────────────────────────────────────────────────
  automation: {
    all: ["automation"] as const,
    list: (companySlug: string) =>
      [...queryKeys.automation.all, "list", companySlug] as const,
    detail: (id: number) =>
      [...queryKeys.automation.all, "detail", id] as const,
    logs: (id: number) =>
      [...queryKeys.automation.all, "logs", id] as const,
  },

  // ─── AI ───────────────────────────────────────────────────────────────
  ai: {
    all: ["ai"] as const,
    agents: (companySlug: string) =>
      [...queryKeys.ai.all, "agents", companySlug] as const,
    memory: (companySlug: string) =>
      [...queryKeys.ai.all, "memory", companySlug] as const,
    invoiceBrainStats: (companySlug: string) =>
      [...queryKeys.ai.all, "invoice-brain-stats", companySlug] as const,
  },

  // ─── Dashboard ────────────────────────────────────────────────────────
  dashboard: {
    all: ["dashboard"] as const,
    stats: (companySlug: string) =>
      [...queryKeys.dashboard.all, "stats", companySlug] as const,
  },

  // ─── Notifications ────────────────────────────────────────────────────
  notifications: {
    all: ["notifications"] as const,
    list: (companySlug: string) =>
      [...queryKeys.notifications.all, "list", companySlug] as const,
  },

  // ─── Purchases ────────────────────────────────────────────────────────
  purchases: {
    all: ["purchases"] as const,
    list: (companySlug: string) =>
      [...queryKeys.purchases.all, "list", companySlug] as const,
    detail: (id: number) =>
      [...queryKeys.purchases.all, "detail", id] as const,
  },

  // ─── Reports ──────────────────────────────────────────────────────────
  reports: {
    all: ["reports"] as const,
    list: (companySlug: string) =>
      [...queryKeys.reports.all, "list", companySlug] as const,
  },

  // ─── Backups ──────────────────────────────────────────────────────────
  backups: {
    all: ["backups"] as const,
    list: (companySlug: string) =>
      [...queryKeys.backups.all, "list", companySlug] as const,
  },

  // ─── Platform Admin ───────────────────────────────────────────────────
  platformAdmin: {
    all: ["platform-admin"] as const,
    tenants: () => [...queryKeys.platformAdmin.all, "tenants"] as const,
    tenantDetail: (slug: string) =>
      [...queryKeys.platformAdmin.all, "tenants", slug] as const,
    audit: () => [...queryKeys.platformAdmin.all, "audit"] as const,
    stats: () => [...queryKeys.platformAdmin.all, "stats"] as const,
    aiProviders: () =>
      [...queryKeys.platformAdmin.all, "ai-providers"] as const,
    aiUsage: () => [...queryKeys.platformAdmin.all, "ai-usage"] as const,
    aiOrchestration: () =>
      [...queryKeys.platformAdmin.all, "ai-orchestration"] as const,
    featureFlags: () =>
      [...queryKeys.platformAdmin.all, "feature-flags"] as const,
    announcements: () =>
      [...queryKeys.platformAdmin.all, "announcements"] as const,
    integrations: () =>
      [...queryKeys.platformAdmin.all, "integrations"] as const,
    reviewQueue: () =>
      [...queryKeys.platformAdmin.all, "review-queue"] as const,
    queueFailures: () =>
      [...queryKeys.platformAdmin.all, "queue-failures"] as const,
    tickets: () => [...queryKeys.platformAdmin.all, "tickets"] as const,
    ticketDetail: (id: number) =>
      [...queryKeys.platformAdmin.all, "tickets", id] as const,
  },

  // ─── SaaS ─────────────────────────────────────────────────────────────
  saas: {
    all: ["saas"] as const,
    users: () => [...queryKeys.saas.all, "users"] as const,
    payments: () => [...queryKeys.saas.all, "payments"] as const,
  },

  // ─── Audit ────────────────────────────────────────────────────────────
  audit: {
    all: ["audit"] as const,
    list: (companySlug: string) =>
      [...queryKeys.audit.all, "list", companySlug] as const,
  },

  // ─── Feature Flags ────────────────────────────────────────────────────
  featureFlags: {
    all: ["feature-flags"] as const,
    list: () => [...queryKeys.featureFlags.all, "list"] as const,
  },

  // ─── Modules ──────────────────────────────────────────────────────────
  modules: {
    all: ["modules"] as const,
    list: () => [...queryKeys.modules.all, "list"] as const,
  },

  // ─── Product Matching ─────────────────────────────────────────────────
  productMatching: {
    all: ["product-matching"] as const,
    review: (companySlug: string) =>
      [...queryKeys.productMatching.all, "review", companySlug] as const,
    config: (companySlug: string) =>
      [...queryKeys.productMatching.all, "config", companySlug] as const,
  },
} as const;
