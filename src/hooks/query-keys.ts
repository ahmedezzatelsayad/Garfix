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
    /** Cursor-based pagination key — includes cursor for infinite scroll */
    cursor: (filters: { companySlug: string; search?: string; status?: string }) =>
      [...queryKeys.invoices.all, "cursor", filters] as const,
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
    gratuity: (companySlug: string) =>
      [...queryKeys.hr.all, "gratuity", companySlug] as const,
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
    // ── Sprint 2: Accounting sub-domain keys ──
    fiscalPeriods: (companySlug: string) =>
      [...queryKeys.accounting.all, "fiscal-periods", companySlug] as const,
    bankAccounts: (companySlug: string) =>
      [...queryKeys.accounting.all, "bank-accounts", companySlug] as const,
    bankTransfers: (companySlug: string) =>
      [...queryKeys.accounting.all, "bank-transfers", companySlug] as const,
    bankReconciliation: (companySlug: string) =>
      [...queryKeys.accounting.all, "bank-reconciliation", companySlug] as const,
    aging: (companySlug: string) =>
      [...queryKeys.accounting.all, "aging", companySlug] as const,
    postDatedChecks: (companySlug: string) =>
      [...queryKeys.accounting.all, "post-dated-checks", companySlug] as const,
    installments: (companySlug: string) =>
      [...queryKeys.accounting.all, "installments", companySlug] as const,
    budgets: (companySlug: string) =>
      [...queryKeys.accounting.all, "budgets", companySlug] as const,
    costCenters: (companySlug: string) =>
      [...queryKeys.accounting.all, "cost-centers", companySlug] as const,
    payroll: (companySlug: string) =>
      [...queryKeys.accounting.all, "payroll", companySlug] as const,
    wps: (companySlug: string) =>
      [...queryKeys.accounting.all, "wps", companySlug] as const,
    taxFiling: (companySlug: string) =>
      [...queryKeys.accounting.all, "tax-filing", companySlug] as const,
    vouchers: (companySlug: string) =>
      [...queryKeys.accounting.all, "vouchers", companySlug] as const,
    quotations: (companySlug: string) =>
      [...queryKeys.accounting.all, "quotations", companySlug] as const,
    purchaseOrders: (companySlug: string) =>
      [...queryKeys.accounting.all, "purchase-orders", companySlug] as const,
    fixedAssets: (companySlug: string) =>
      [...queryKeys.accounting.all, "fixed-assets", companySlug] as const,
    depreciation: (companySlug: string) =>
      [...queryKeys.accounting.all, "depreciation", companySlug] as const,
    inventoryValuation: (companySlug: string) =>
      [...queryKeys.accounting.all, "inventory-valuation", companySlug] as const,
    landedCost: (companySlug: string) =>
      [...queryKeys.accounting.all, "landed-cost", companySlug] as const,
    accountantAccess: (companySlug: string) =>
      [...queryKeys.accounting.all, "accountant-access", companySlug] as const,
    interCompany: (companySlug: string) =>
      [...queryKeys.accounting.all, "inter-company", companySlug] as const,
    lettersOfCredit: (companySlug: string) =>
      [...queryKeys.accounting.all, "letters-of-credit", companySlug] as const,
    fxRevaluation: (companySlug: string) =>
      [...queryKeys.accounting.all, "fx-revaluation", companySlug] as const,
    paymentMethods: (companySlug: string) =>
      [...queryKeys.accounting.all, "payment-methods", companySlug] as const,
    openingBalances: (companySlug: string) =>
      [...queryKeys.accounting.all, "opening-balances", companySlug] as const,
    consolidation: (companySlug: string) =>
      [...queryKeys.accounting.all, "consolidation", companySlug] as const,
    accountingAudit: (companySlug: string) =>
      [...queryKeys.accounting.all, "accounting-audit", companySlug] as const,
    filingReminders: (companySlug: string) =>
      [...queryKeys.accounting.all, "filing-reminders", companySlug] as const,
    commissions: (companySlug: string) =>
      [...queryKeys.accounting.all, "commissions", companySlug] as const,
    profitDistribution: (companySlug: string) =>
      [...queryKeys.accounting.all, "profit-distribution", companySlug] as const,
    clientStatement: (companySlug: string) =>
      [...queryKeys.accounting.all, "client-statement", companySlug] as const,
    supplierStatement: (companySlug: string) =>
      [...queryKeys.accounting.all, "supplier-statement", companySlug] as const,
    budgetVsActual: (companySlug: string) =>
      [...queryKeys.accounting.all, "budget-vs-actual", companySlug] as const,
    periodComparison: (companySlug: string) =>
      [...queryKeys.accounting.all, "period-comparison", companySlug] as const,
    exportExcel: (companySlug: string) =>
      [...queryKeys.accounting.all, "export-excel", companySlug] as const,
    financialDashboard: (companySlug: string) =>
      [...queryKeys.accounting.all, "financial-dashboard", companySlug] as const,
    initiatePayment: (companySlug: string) =>
      [...queryKeys.accounting.all, "initiate-payment", companySlug] as const,
    verifyPayment: (companySlug: string) =>
      [...queryKeys.accounting.all, "verify-payment", companySlug] as const,
    retentionCheck: (companySlug: string) =>
      [...queryKeys.accounting.all, "retention-check", companySlug] as const,
    assetDisposals: (companySlug: string) =>
      [...queryKeys.accounting.all, "asset-disposals", companySlug] as const,
    bankImport: (companySlug: string) =>
      [...queryKeys.accounting.all, "bank-import", companySlug] as const,
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
    detail: (id: string) =>
      [...queryKeys.catalog.all, "detail", id] as const,
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

  // ── Sprint 2: Founder Panel ─────────────────────────────────────────────
  founderPanel: {
    all: ["founder-panel"] as const,
    missionControl: () =>
      [...queryKeys.founderPanel.all, "mission-control"] as const,
    finops: () =>
      [...queryKeys.founderPanel.all, "finops"] as const,
    aiFabric: () =>
      [...queryKeys.founderPanel.all, "ai-fabric"] as const,
  },

  // ── Sprint 2: Webhooks ──────────────────────────────────────────────────
  webhooks: {
    all: ["webhooks"] as const,
    endpoints: () =>
      [...queryKeys.webhooks.all, "endpoints"] as const,
    endpointDetail: (id: string) =>
      [...queryKeys.webhooks.all, "endpoint-detail", id] as const,
    deliveries: () =>
      [...queryKeys.webhooks.all, "deliveries"] as const,
    events: () =>
      [...queryKeys.webhooks.all, "events"] as const,
  },
} as const;
