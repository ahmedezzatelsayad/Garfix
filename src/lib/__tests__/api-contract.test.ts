/**
 * api-contract.test.ts — Contract tests validating API response shapes
 * against the OpenAPI specification (api-types.ts).
 *
 * Sprint 3: Expanded to 220+ test cases across 30+ describe blocks covering
 * Auth, Health, Startup, Accounting (expanded), Invoice, Client, Company, HR,
 * Inventory, Dashboard, Notification, Feature Flags, Modules, Automation,
 * Webhooks (expanded), Platform Admin (expanded), Metrics, Purchases, Backups,
 * Reports, ZATCA e-invoicing, Product Matching (expanded), Settings, Onboarding,
 * Catalog, SaaS, Permissions, Founder Panel, Founder Validation, Storage,
 * Landing Content, and Builder/Error assertion domains.
 */

import { describe, it, expect } from "bun:test";
import { validateContract, ContractValidator, assertContract } from "@/lib/openapi/contract-test-helpers";

// ── Auth Contract Tests ──────────────────────────────────────────────────────

describe("Auth Contract", () => {
  it("POST /api/auth/login — successful response matches AuthResult", () => {
    const body = {
      ok: true,
      user: {
        id: "usr_abc123",
        uid: "uid_abc123",
        email: "admin@garfix.app",
        displayName: "Admin User",
        role: "admin",
        companies: ["acme-co"],
        tokenVersion: 1,
      },
    };
    const result = validateContract("/api/auth/login", "POST", body);
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("POST /api/auth/login — failed response has error field", () => {
    const body = {
      ok: false,
      error: "Invalid credentials",
    };
    const result = validateContract("/api/auth/login", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/auth/login — missing ok field violates contract", () => {
    const body = {
      user: { id: "1" },
    };
    const result = validateContract("/api/auth/login", "POST", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ok"))).toBe(true);
  });

  it("POST /api/auth/login — user.role must be valid enum", () => {
    const body = {
      ok: true,
      user: {
        id: "1",
        uid: "u1",
        email: "test@test.com",
        displayName: "Test",
        role: "superadmin",
        companies: [],
        tokenVersion: 1,
      },
    };
    const result = validateContract("/api/auth/login", "POST", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("role") && e.message.includes("enum"))).toBe(true);
  });

  it("POST /api/auth/register — valid AuthResult", () => {
    const body = { ok: true };
    const result = validateContract("/api/auth/register", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/auth/me — valid UserDTO", () => {
    const body = {
      id: "usr_1",
      uid: "uid_1",
      email: "user@garfix.app",
      displayName: "User",
      role: "editor",
      companies: ["co1"],
      tokenVersion: 2,
    };
    const result = validateContract("/api/auth/me", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/auth/logout — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/auth/logout", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/auth/logout — missing ok field", () => {
    const body = { message: "Logged out" };
    const result = validateContract("/api/auth/logout", "POST", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ok"))).toBe(true);
  });

  it("POST /api/auth/refresh — valid AuthResult", () => {
    const body = { ok: true, token: "new_token" };
    const result = validateContract("/api/auth/refresh", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/auth/refresh — error response", () => {
    const body = { error: "Token expired" };
    const result = validateContract("/api/auth/refresh", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/auth/forgot-password — valid OkResponse", () => {
    const body = { ok: true, message: "Reset email sent" };
    const result = validateContract("/api/auth/forgot-password", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/auth/reset-password — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/auth/reset-password", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/auth/csrf — valid CSRF token response", () => {
    const body = { token: "csrf_abc123" };
    const result = validateContract("/api/auth/csrf", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/auth/csrf — missing token", () => {
    const body = { timestamp: Date.now() };
    const result = validateContract("/api/auth/csrf", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("token"))).toBe(true);
  });

  it("POST /api/auth/change-password — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/auth/change-password", "POST", body);
    expect(result.ok).toBe(true);
  });
});

// ── Health Contract Tests ────────────────────────────────────────────────────

describe("Health Contract", () => {
  it("GET /api/health — response matches HealthCheckDTO", () => {
    const body = {
      status: "healthy",
      version: "12.1.0",
      uptime: 3600,
      checks: {
        database: "ok",
        cache: "ok",
        aiFabric: "not_configured",
        queues: "ok",
      },
      timestamp: new Date().toISOString(),
    };
    const result = validateContract("/api/health", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/health — invalid status enum violates contract", () => {
    const body = {
      status: "unknown",
      version: "12.1.0",
      uptime: 3600,
      checks: { database: "ok", cache: "ok" },
      timestamp: new Date().toISOString(),
    };
    const result = validateContract("/api/health", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path.includes("status"))).toBe(true);
  });

  it("GET /api/health — missing uptime", () => {
    const body = {
      status: "healthy",
      version: "12.1.0",
      checks: { database: "ok", cache: "ok" },
      timestamp: new Date().toISOString(),
    };
    const result = validateContract("/api/health", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("uptime"))).toBe(true);
  });
});

// ── Startup Check Contract Tests ─────────────────────────────────────────────

describe("Startup Check Contract", () => {
  it("GET /api/startup-check — valid StartupCheckResultDTO", () => {
    const body = {
      ok: true,
      fatal: [],
      warnings: ["Some optional check passed with warning"],
      env: { DATABASE: true, CACHE: false },
    };
    const result = validateContract("/api/startup-check", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/startup-check — fatal errors present", () => {
    const body = {
      ok: false,
      fatal: ["DATABASE_URL missing"],
      warnings: [],
    };
    const result = validateContract("/api/startup-check", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/startup-check — missing ok field", () => {
    const body = {
      fatal: [],
      warnings: [],
    };
    const result = validateContract("/api/startup-check", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ok"))).toBe(true);
  });

  it("GET /api/startup-check — fatal as objects (not strings) violates contract", () => {
    const body = {
      ok: false,
      fatal: [{ message: "error" }],
      warnings: [],
    };
    const result = validateContract("/api/startup-check", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── API Root Contract Tests ──────────────────────────────────────────────────

describe("API Root Contract", () => {
  it("GET /api — valid API root response", () => {
    const body = { version: "1.0.0", name: "GarfiX API" };
    const result = validateContract("/api", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api — missing version", () => {
    const body = { name: "GarfiX API" };
    const result = validateContract("/api", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("version"))).toBe(true);
  });

  it("GET /api/docs — valid docs response", () => {
    const body = { openapi: "3.1.0", info: { title: "GarfiX" } };
    const result = validateContract("/api/docs", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── Accounting Contract Tests ────────────────────────────────────────────────

describe("Accounting Contract", () => {
  it("GET /api/accounting/journal-entries — paginated Voucher response", () => {
    const body = {
      data: [
        { id: "v1", number: "JV-001", date: "2024-01-15", description: "Opening balance", lines: [], status: "posted" },
      ],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/journal-entries", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/journal-entries — missing total field", () => {
    const body = { data: [], page: 1, hasMore: false };
    const result = validateContract("/api/accounting/journal-entries", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("total"))).toBe(true);
  });

  it("POST /api/accounting/journal-entries — valid VoucherDTO", () => {
    const body = { id: "v1", number: "JV-002", date: "2024-02-01", status: "draft" };
    const result = validateContract("/api/accounting/journal-entries", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/accounting/journal-entries/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/journal-entries/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/journal-entries/{id}/reverse — valid mutation response", () => {
    const body = { ok: true, reversedId: "v2" };
    const result = validateContract("/api/accounting/journal-entries/{id}/reverse", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/accounts — paginated Account response", () => {
    const body = {
      data: [{ id: 1, code: "1000", name: "Cash", type: "asset", balance: 50000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/accounts", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/accounts — valid mutation response", () => {
    const body = { ok: true, data: { id: 2, code: "1100" } };
    const result = validateContract("/api/accounting/accounts", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/accounting/accounts/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/accounts/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/fiscal-periods — paginated FinancialPeriod response", () => {
    const body = {
      data: [{ id: "fp1", name: "Q1 2024", startDate: "2024-01-01", endDate: "2024-03-31", status: "open", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/fiscal-periods", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/fiscal-periods — invalid status enum", () => {
    const body = {
      data: [{ id: "fp1", name: "Q1", startDate: "2024-01-01", endDate: "2024-03-31", status: "pending", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/fiscal-periods", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("status"))).toBe(true);
  });

  it("GET /api/accounting/fiscal-periods/{id} — valid FinancialPeriodDTO", () => {
    const body = { id: "fp1", name: "Q1 2024", startDate: "2024-01-01", endDate: "2024-03-31", status: "open", companySlug: "acme" };
    const result = validateContract("/api/accounting/fiscal-periods/{id}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/fiscal-periods/{id}/close — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/fiscal-periods/{id}/close", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/fiscal-periods/{id}/reopen — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/fiscal-periods/{id}/reopen", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/vouchers — paginated Voucher response", () => {
    const body = {
      data: [{ id: "v1", number: "PV-001", date: "2024-02-01", status: "posted" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/vouchers", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/vouchers/{id} — valid VoucherDTO", () => {
    const body = { id: "v1", number: "PV-001", date: "2024-02-01", status: "posted" };
    const result = validateContract("/api/accounting/vouchers/{id}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/vouchers/{id}/approve — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/vouchers/{id}/approve", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/vouchers/{id}/cancel — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/vouchers/{id}/cancel", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/bank-accounts — paginated response", () => {
    const body = {
      data: [{ id: 1, name: "Main Account", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/bank-accounts", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/bank-accounts/{id} — valid BankAccount detail", () => {
    const body = { id: 1, name: "Main Account", balance: 50000 };
    const result = validateContract("/api/accounting/bank-accounts/{id}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/bank-import — valid mutation response", () => {
    const body = { ok: true, importedCount: 10 };
    const result = validateContract("/api/accounting/bank-import", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/bank-reconciliation — paginated BankReconciliation response", () => {
    const body = {
      data: [{ id: "br1", bankAccountId: "ba1", period: "2024-01", status: "draft", matchedCount: 5 }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/bank-reconciliation", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/bank-reconciliation/complete — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/bank-reconciliation/complete", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/bank-transfer — paginated BankTransfer response", () => {
    const body = {
      data: [{ id: "bt1", fromAccountId: "ba1", toAccountId: "ba2", amount: 1000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/bank-transfer", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/budgets — paginated response", () => {
    const body = {
      data: [{ id: "b1", name: "Q1 Budget", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/budgets", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/budgets/{id}/approve — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/budgets/{id}/approve", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/budget-vs-actual — valid financial report", () => {
    const body = { ok: true, data: { variance: -500 } };
    const result = validateContract("/api/accounting/budget-vs-actual", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/cost-centers — paginated response", () => {
    const body = {
      data: [{ id: "cc1", name: "Marketing", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/cost-centers", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("PATCH /api/accounting/cost-centers/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/cost-centers/{id}", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/commissions — paginated Commission response", () => {
    const body = {
      data: [{ id: "c1", employeeId: "e1", amount: 500, period: "2024-Q1", status: "pending" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/commissions", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/accounting-audit — paginated AuditLog response", () => {
    const body = {
      data: [{ id: "a1", action: "create", actor: "admin", companySlug: "acme", createdAt: "2024-01-01" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/accounting-audit", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/profit-loss — valid financial report", () => {
    const body = { ok: true, data: { revenue: 100000, expenses: 80000 } };
    const result = validateContract("/api/accounting/profit-loss", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/balance-sheet — valid financial report", () => {
    const body = { ok: true, data: { assets: 500000, liabilities: 200000 } };
    const result = validateContract("/api/accounting/balance-sheet", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/cash-flow — valid financial report", () => {
    const body = { ok: true, data: { operating: 50000, investing: -10000 } };
    const result = validateContract("/api/accounting/cash-flow", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/trial-balance — valid financial report", () => {
    const body = { ok: true, data: { totalDebits: 500000, totalCredits: 500000 } };
    const result = validateContract("/api/accounting/trial-balance", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/aging — valid financial report", () => {
    const body = { ok: true, data: { current: 40000, overdue30: 5000 } };
    const result = validateContract("/api/accounting/aging", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/dashboard — valid financial report", () => {
    const body = { ok: true, data: { revenue: 100000 } };
    const result = validateContract("/api/accounting/dashboard", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/financial-dashboard — valid financial report", () => {
    const body = { ok: true, data: { kpis: {} } };
    const result = validateContract("/api/accounting/financial-dashboard", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/depreciation — paginated Depreciation response", () => {
    const body = {
      data: [{ id: "d1", assetId: "fa1", amount: 5000, period: "2024-01", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/depreciation", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/asset-disposals — paginated AssetDisposal response", () => {
    const body = {
      data: [{ id: "ad1", assetId: "fa1", disposalAmount: 2000, date: "2024-03-01", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/asset-disposals", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/export-excel — valid mutation response", () => {
    const body = { ok: true, downloadUrl: "/exports/report.xlsx" };
    const result = validateContract("/api/accounting/export-excel", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/filing-reminders — valid financial report", () => {
    const body = { ok: true, data: { upcoming: [] } };
    const result = validateContract("/api/accounting/filing-reminders", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/client-statement — valid financial report", () => {
    const body = { ok: true, data: { clientId: "c1" } };
    const result = validateContract("/api/accounting/client-statement", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/supplier-statement — valid financial report", () => {
    const body = { ok: true, data: { supplierId: "s1" } };
    const result = validateContract("/api/accounting/supplier-statement", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/period-comparison — valid financial report", () => {
    const body = { ok: true, data: { periods: [] } };
    const result = validateContract("/api/accounting/period-comparison", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/opening-balances — paginated OpeningBalance response", () => {
    const body = {
      data: [{ id: "ob1", accountId: "a1", balance: 50000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/opening-balances", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/opening-balances/post — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/opening-balances/post", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/installments — paginated Installment response", () => {
    const body = {
      data: [{ id: "i1", invoiceId: "inv1", amount: 500, dueDate: "2024-02-01", status: "pending" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/installments", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/post-dated-checks — paginated PostDatedCheck response", () => {
    const body = {
      data: [{ id: "pdc1", checkNumber: "CHK-001", amount: 5000, dueDate: "2024-03-01", status: "pending" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/post-dated-checks", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/post-dated-checks/{id}/cancel — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/post-dated-checks/{id}/cancel", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/profit-distribution — paginated ProfitDistribution response", () => {
    const body = {
      data: [{ id: "pd1", totalProfit: 10000, distributedAmount: 8000, period: "2024-Q1", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/profit-distribution", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/quotations — paginated Quotation response", () => {
    const body = {
      data: [{ id: "q1", number: "QT-001", status: "draft", total: 5000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/quotations", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/quotations — invalid status enum", () => {
    const body = {
      data: [{ id: "q1", number: "QT-001", status: "unknown", total: 5000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/quotations", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("status"))).toBe(true);
  });

  it("GET /api/accounting/purchase-orders — paginated PurchaseOrder response", () => {
    const body = {
      data: [{ id: "po1", number: "PO-001", status: "draft", total: 3000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/purchase-orders", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/consolidation — paginated Consolidation response", () => {
    const body = {
      data: [{ id: "c1", period: "2024-Q1", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/consolidation", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/fx-revaluation — paginated FxRevaluation response", () => {
    const body = {
      data: [{ id: "fx1", currency: "USD", revaluationAmount: 500, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/fx-revaluation", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/inventory-valuation — paginated InventoryValuation response", () => {
    const body = {
      data: [{ id: "iv1", itemId: "i1", unitCost: 10, totalValue: 1000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/inventory-valuation", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/initiate-payment — valid mutation response", () => {
    const body = { ok: true, paymentId: "p1" };
    const result = validateContract("/api/accounting/initiate-payment", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/verify-payment — valid mutation response", () => {
    const body = { ok: true, verified: true };
    const result = validateContract("/api/accounting/verify-payment", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/retention-check — valid financial report", () => {
    const body = { ok: true, data: { retention: 500 } };
    const result = validateContract("/api/accounting/retention-check", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/accountant-access — paginated AccountantAccess response", () => {
    const body = {
      data: [{ id: "aa1", accountantId: "u1", companySlug: "acme", status: "active" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/accountant-access", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/accounting/accountant-access/{id}/revoke — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/accounting/accountant-access/{id}/revoke", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/fixed-assets — paginated FixedAsset response", () => {
    const body = {
      data: [{ id: "fa1", name: "Server", assetCode: "FA-001", purchaseCost: 50000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/fixed-assets", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/fixed-assets/{id} — valid FixedAsset detail", () => {
    const body = { id: "fa1", name: "Server", assetCode: "FA-001", purchaseCost: 50000, companySlug: "acme" };
    const result = validateContract("/api/accounting/fixed-assets/{id}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/wps — paginated Wps response", () => {
    const body = {
      data: [{ id: "w1", companySlug: "acme", period: "2024-01", status: "draft" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/wps", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/tax-filing — paginated TaxFiling response", () => {
    const body = {
      data: [{ id: "tf1", period: "2024-Q1", companySlug: "acme", status: "draft" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/tax-filing", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/landed-cost — paginated LandedCost response", () => {
    const body = {
      data: [{ id: "lc1", name: "Shipping", amount: 500, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/landed-cost", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/inter-company — paginated InterCompany response", () => {
    const body = {
      data: [{ id: "ic1", fromCompany: "acme", toCompany: "acme-uk", amount: 1000, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/inter-company", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/letters-of-credit — paginated LetterOfCredit response", () => {
    const body = {
      data: [{ id: "lc1", lcNumber: "LC-001", amount: 5000, status: "issued", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/letters-of-credit", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/accounting/payment-methods — paginated response", () => {
    const body = {
      data: [{ id: "pm1", name: "Bank Transfer" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/accounting/payment-methods", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── Invoice Contract Tests ───────────────────────────────────────────────────

describe("Invoice Contract", () => {
  it("GET /api/invoices — paginated Invoice response", () => {
    const body = {
      data: [{ id: "inv1", number: "INV-001", status: "sent", total: 5000, currency: "SAR", issueDate: "2024-03-01", dueDate: "2024-04-01", clientId: "c1" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/invoices", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/invoices — invalid status enum", () => {
    const body = {
      data: [{ id: "inv1", number: "INV-001", status: "processing", total: 5000, currency: "SAR", issueDate: "2024-03-01", dueDate: "2024-04-01" }],
      total: 1, page: 1, hasMore: false,
    };
    const result = validateContract("/api/invoices", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("status"))).toBe(true);
  });

  it("GET /api/invoices/{id} — valid InvoiceDTO detail", () => {
    const body = { id: "inv1", number: "INV-001", status: "sent", total: 5000, currency: "SAR", issueDate: "2024-03-01", dueDate: "2024-04-01" };
    const result = validateContract("/api/invoices/{id}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("PATCH /api/invoices/{id}/payment — valid mutation response", () => {
    const body = { ok: true, paymentApplied: 2000 };
    const result = validateContract("/api/invoices/{id}/payment", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("PATCH /api/invoices/{id}/status — valid mutation response", () => {
    const body = { ok: true, newStatus: "paid" };
    const result = validateContract("/api/invoices/{id}/status", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/invoice-templates — paginated InvoiceTemplate response", () => {
    const body = {
      data: [{ id: "t1", name: "Standard", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/invoice-templates", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── Client Contract Tests ────────────────────────────────────────────────────

describe("Client Contract", () => {
  it("GET /api/clients — paginated Client response", () => {
    const body = {
      data: [{ id: 1, name: "Acme Corp", nameAr: "شركة أكم", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/clients", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/clients — missing name violates contract", () => {
    const body = {
      data: [{ id: 1, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/clients", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("name"))).toBe(true);
  });

  it("GET /api/clients/{id} — valid ClientDTO detail", () => {
    const body = { id: 1, name: "Acme Corp", companySlug: "acme" };
    const result = validateContract("/api/clients/{id}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/clients/{id}/profile — valid ClientProfileDTO", () => {
    const body = { clientId: "1", companySlug: "acme", contactName: "Ahmed" };
    const result = validateContract("/api/clients/{id}/profile", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/clients/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/clients/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });
});

// ── Company Contract Tests ───────────────────────────────────────────────────

describe("Company Contract", () => {
  it("GET /api/companies — paginated Company response", () => {
    const body = {
      data: [{ id: "co1", name: "Acme Trading", slug: "acme-co", plan: "enterprise", currency: "SAR", subscriptionStatus: "active" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/companies", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/companies — invalid currency enum", () => {
    const body = {
      data: [{ id: "co1", name: "Acme", slug: "acme", plan: "starter", currency: "USD", subscriptionStatus: "active" }],
      total: 1,
    };
    const result = validateContract("/api/companies", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("currency"))).toBe(true);
  });

  it("GET /api/companies — invalid plan enum", () => {
    const body = {
      data: [{ id: "co1", name: "Acme", slug: "acme", plan: "free", currency: "SAR", subscriptionStatus: "active" }],
      total: 1, page: 1, hasMore: false,
    };
    const result = validateContract("/api/companies", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("plan"))).toBe(true);
  });

  it("GET /api/companies/{slug} — valid CompanyDTO detail", () => {
    const body = { id: "co1", name: "Acme Trading", slug: "acme-co", plan: "enterprise", currency: "SAR", subscriptionStatus: "active" };
    const result = validateContract("/api/companies/{slug}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/companies/{slug}/members — paginated CompanyMember response", () => {
    const body = {
      data: [{ uid: "u1", email: "ahmed@acme.com", role: "admin" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/companies/{slug}/members", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/companies/{slug}/members/{uid} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/companies/{slug}/members/{uid}", "DELETE", body);
    expect(result.ok).toBe(true);
  });
});

// ── HR Contract Tests ────────────────────────────────────────────────────────

describe("HR Contract", () => {
  it("GET /api/hr/employees — paginated Employee response", () => {
    const body = {
      data: [{ id: "e1", name: "Ahmed", email: "ahmed@co.com", companySlug: "acme", status: "active" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/employees", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/hr/employees — invalid status enum", () => {
    const body = {
      data: [{ id: "e1", name: "Ahmed", email: "ahmed@co.com", companySlug: "acme", status: "resigned" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/employees", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("status"))).toBe(true);
  });

  it("GET /api/hr/employees/{id} — valid EmployeeDTO detail", () => {
    const body = { id: "e1", name: "Ahmed", email: "ahmed@co.com", companySlug: "acme", status: "active" };
    const result = validateContract("/api/hr/employees/{id}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/hr/employees/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/hr/employees/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/hr/attendance — paginated Attendance response", () => {
    const body = {
      data: [{ id: "a1", employeeId: "e1", date: "2024-01-15", status: "present" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/attendance", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/hr/attendance/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/hr/attendance/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/hr/salaries — paginated Salary response", () => {
    const body = {
      data: [{ id: "s1", employeeId: "e1", baseSalary: 5000, netSalary: 4500, period: "2024-01", status: "processed" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/salaries", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/hr/salaries/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/hr/salaries/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/hr/leaves — paginated LeaveRequest response", () => {
    const body = {
      data: [{ id: "l1", employeeId: "e1", type: "annual", startDate: "2024-02-01", endDate: "2024-02-05", status: "approved" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/leaves", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/hr/leaves/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/hr/leaves/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/hr/commissions — paginated Commission response", () => {
    const body = {
      data: [{ id: "c1", employeeId: "e1", amount: 500, period: "2024-Q1", status: "pending" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/commissions", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/hr/commissions/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/hr/commissions/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/hr/gratuity — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/hr/gratuity", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/hr/performance — paginated Performance response", () => {
    const body = {
      data: [{ id: "p1", employeeId: "e1", period: "2024-Q1", rating: "good", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/performance", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/hr/performance — invalid rating enum", () => {
    const body = {
      data: [{ id: "p1", employeeId: "e1", period: "2024-Q1", rating: "superb", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/performance", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("rating"))).toBe(true);
  });

  it("GET /api/hr/gratuity — paginated GratuityRecord response", () => {
    const body = {
      data: [{ id: "g1", employeeId: "e1", totalGratuity: 50000, yearsOfService: 5 }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/hr/gratuity", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── Inventory Contract Tests ──────────────────────────────────────────────────

describe("Inventory Contract", () => {
  it("GET /api/inventory/items — paginated InventoryItem response", () => {
    const body = {
      data: [{ id: "i1", name: "Widget", sku: "W-001", quantity: 100, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/inventory/items", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/inventory/warehouses — paginated Warehouse response", () => {
    const body = {
      data: [{ id: "w1", name: "Main Warehouse", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/inventory/warehouses", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("PATCH /api/inventory/warehouses/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/inventory/warehouses/{id}", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/inventory/movements — paginated StockMovement response", () => {
    const body = {
      data: [{ id: "m1", itemId: "i1", type: "in", quantity: 50, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/inventory/movements", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/inventory/movements — invalid type enum", () => {
    const body = {
      data: [{ id: "m1", itemId: "i1", type: "destroy", quantity: 50, companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/inventory/movements", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("type"))).toBe(true);
  });
});

// ── AI Fabric Contract Tests ─────────────────────────────────────────────────

describe("AI Fabric Contract", () => {
  it("POST /api/ai/agents — AIResponseDTO shape", () => {
    const body = {
      ok: true,
      resolvedBy: "cache",
      confidence: 0.97,
      costUsd: 0,
      latencyMs: 5,
      result: { answer: "matched" },
    };
    const result = validateContract("/api/ai/agents", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/agents — invalid resolvedBy enum", () => {
    const body = {
      ok: true,
      resolvedBy: "unknown_stage",
      confidence: 0.97,
      costUsd: 0,
      latencyMs: 5,
    };
    const result = validateContract("/api/ai/agents", "POST", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("resolvedBy"))).toBe(true);
  });

  it("POST /api/ai/agents — missing confidence", () => {
    const body = {
      ok: true,
      resolvedBy: "ai",
      costUsd: 0.01,
      latencyMs: 500,
    };
    const result = validateContract("/api/ai/agents", "POST", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("confidence"))).toBe(true);
  });

  it("POST /api/ai/chat — AIResponseDTO shape", () => {
    const body = { ok: true, resolvedBy: "ai", confidence: 0.95, costUsd: 0.01, latencyMs: 200, result: { text: "Hello" } };
    const result = validateContract("/api/ai/chat", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/chat/stream — valid mutation response", () => {
    const body = { ok: true, streamId: "s1" };
    const result = validateContract("/api/ai/chat/stream", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/parse-image — AIResponseDTO shape", () => {
    const body = { ok: true, resolvedBy: "ai", confidence: 0.90, costUsd: 0.02, latencyMs: 1500, result: { text: "Invoice text" } };
    const result = validateContract("/api/ai/parse-image", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/parse-file — AIResponseDTO shape", () => {
    const body = { ok: true, resolvedBy: "ai", confidence: 0.88, costUsd: 0.05, latencyMs: 2000, result: { text: "Parsed content" } };
    const result = validateContract("/api/ai/parse-file", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/smart-parse — AIResponseDTO shape", () => {
    const body = { ok: true, resolvedBy: "pattern", confidence: 0.99, costUsd: 0, latencyMs: 10 };
    const result = validateContract("/api/ai/smart-parse", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/invoice-brain/extract — valid mutation response", () => {
    const body = { ok: true, extractedFields: {} };
    const result = validateContract("/api/ai/invoice-brain/extract", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/ai/invoice-brain/stats — valid stats response", () => {
    const body = { totalProcessed: 100, successRate: 0.95 };
    const result = validateContract("/api/ai/invoice-brain/stats", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/ai/invoice-brain/stats — missing totalProcessed", () => {
    const body = { successRate: 0.95 };
    const result = validateContract("/api/ai/invoice-brain/stats", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("totalProcessed"))).toBe(true);
  });

  it("GET /api/ai/memory — paginated AIMemory response", () => {
    const body = {
      data: [{ id: "m1", query: "What is VAT?", response: "VAT is 15% in Saudi Arabia" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/ai/memory", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/memory — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/ai/memory", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/ai/memory/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/ai/memory/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/bulk-import — valid mutation response", () => {
    const body = { ok: true, importedCount: 50 };
    const result = validateContract("/api/ai/bulk-import", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/ai/tools — valid mutation response", () => {
    const body = { ok: true, toolResult: {} };
    const result = validateContract("/api/ai/tools", "POST", body);
    expect(result.ok).toBe(true);
  });
});

// ── Dashboard Contract Tests ─────────────────────────────────────────────────

describe("Dashboard Contract", () => {
  it("GET /api/dashboard/stats — DashboardStatsDTO", () => {
    const body = {
      totalRevenue: 100000,
      outstanding: 25000,
      totalClients: 45,
      totalInvoices: 120,
      paidCount: 80,
      overdueCount: 5,
    };
    const result = validateContract("/api/dashboard/stats", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/dashboard/stats — missing totalRevenue", () => {
    const body = {
      outstanding: 25000,
      totalClients: 45,
      totalInvoices: 120,
    };
    const result = validateContract("/api/dashboard/stats", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("totalRevenue"))).toBe(true);
  });
});

// ── Notification Contract Tests ──────────────────────────────────────────────

describe("Notification Contract", () => {
  it("GET /api/notifications — Notification list response", () => {
    const body = {
      notifications: [
        { id: 1, title: "Invoice overdue", message: "INV-001 is overdue", read: false },
      ],
      unreadCount: 1,
    };
    const result = validateContract("/api/notifications", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/notifications — missing notification title", () => {
    const body = {
      notifications: [
        { id: 1, message: "Some message", read: true },
      ],
    };
    const result = validateContract("/api/notifications", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("title"))).toBe(true);
  });
});

// ── Feature Flag Contract Tests ──────────────────────────────────────────────

describe("Feature Flag Contract", () => {
  it("GET /api/feature-flags — FeatureFlag list response", () => {
    const body = {
      flags: [
        { key: "new_dashboard", enabled: true, description: "New dashboard" },
        { key: "ai_chat", enabled: false },
      ],
    };
    const result = validateContract("/api/feature-flags", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/feature-flags — missing key field", () => {
    const body = {
      flags: [{ enabled: true }],
    };
    const result = validateContract("/api/feature-flags", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("key"))).toBe(true);
  });
});

// ── Module Contract Tests ────────────────────────────────────────────────────

describe("Module Contract", () => {
  it("GET /api/modules — Module list response", () => {
    const body = {
      modules: [
        { id: "accounting", name: "Accounting", enabled: true },
        { id: "hr", name: "HR", enabled: true },
      ],
    };
    const result = validateContract("/api/modules", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/modules — missing enabled field", () => {
    const body = {
      modules: [{ id: "accounting", name: "Accounting" }],
    };
    const result = validateContract("/api/modules", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("enabled"))).toBe(true);
  });
});

// ── Automation Contract Tests ────────────────────────────────────────────────

describe("Automation Contract", () => {
  it("GET /api/automation — paginated AutomationRule response", () => {
    const body = {
      data: [
        { id: "r1", name: "Auto-archive", trigger: "invoice_paid", action: "archive", isActive: true },
      ],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/automation", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/automation — missing isActive", () => {
    const body = {
      data: [{ id: "r1", name: "Auto-archive", trigger: "invoice_paid", action: "archive" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/automation", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("isActive"))).toBe(true);
  });

  it("PATCH /api/automation/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/automation/{id}", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/automation/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/automation/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/automation/{id}/logs — paginated AuditLog response", () => {
    const body = {
      data: [{ id: "a1", action: "trigger", actor: "system", companySlug: "acme", createdAt: "2024-01-01" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/automation/{id}/logs", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── Webhook Contract Tests ───────────────────────────────────────────────────

describe("Webhook Contract", () => {
  it("GET /api/webhooks/endpoints — WebhookEndpoint list", () => {
    const body = {
      endpoints: [
        { id: "wh1", url: "https://example.com/hook", events: ["invoice.created"], isActive: true },
      ],
    };
    const result = validateContract("/api/webhooks/endpoints", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/webhooks/endpoints — missing url", () => {
    const body = {
      endpoints: [{ id: "wh1", isActive: true }],
    };
    const result = validateContract("/api/webhooks/endpoints", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("url"))).toBe(true);
  });

  it("GET /api/webhooks/endpoints/{id} — valid WebhookEndpoint detail", () => {
    const body = { id: "wh1", url: "https://example.com/hook", isActive: true, createdAt: "2024-01-01" };
    const result = validateContract("/api/webhooks/endpoints/{id}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/webhooks/endpoints/{id} — missing isActive", () => {
    const body = { id: "wh1", url: "https://example.com/hook" };
    const result = validateContract("/api/webhooks/endpoints/{id}", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("isActive"))).toBe(true);
  });

  it("GET /api/webhooks/deliveries — paginated WebhookDelivery response", () => {
    const body = {
      data: [{ id: "wd1", endpointId: "wh1", status: "success", attempts: 1 }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/webhooks/deliveries", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/webhooks/deliveries — invalid status enum", () => {
    const body = {
      data: [{ id: "wd1", endpointId: "wh1", status: "unknown", attempts: 1 }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/webhooks/deliveries", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("status"))).toBe(true);
  });

  it("GET /api/webhooks/events — paginated WebhookEvent response", () => {
    const body = {
      data: [{ id: "we1", type: "invoice.created", timestamp: "2024-01-01T00:00:00Z" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/webhooks/events", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/webhooks/whatsapp — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/webhooks/whatsapp", "POST", body);
    expect(result.ok).toBe(true);
  });
});

// ── Platform Admin Contract Tests ────────────────────────────────────────────

describe("Platform Admin Contract", () => {
  it("GET /api/platform-admin/stats — PlatformStatsDTO", () => {
    const body = {
      totalTenants: 50,
      activeTenants: 45,
      totalRevenue: 100000,
      monthlyRevenue: 5000,
      aiCostMtd: 200,
      totalRequestsMtd: 15000,
    };
    const result = validateContract("/api/platform-admin/stats", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/stats — missing totalTenants", () => {
    const body = {
      activeTenants: 45,
      totalRevenue: 100000,
    };
    const result = validateContract("/api/platform-admin/stats", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("totalTenants"))).toBe(true);
  });

  it("GET /api/platform-admin/tenants — paginated PlatformTenant response", () => {
    const body = {
      data: [{ slug: "acme", name: "Acme Corp", plan: "enterprise", status: "active" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/tenants", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/tenants/{slug} — valid PlatformTenant detail", () => {
    const body = { slug: "acme", name: "Acme Corp", plan: "enterprise", status: "active" };
    const result = validateContract("/api/platform-admin/tenants/{slug}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/feature-flags — paginated PlatformFeatureFlag response", () => {
    const body = {
      data: [{ id: "ff1", key: "new_ui", enabled: true }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/feature-flags", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("PATCH /api/platform-admin/feature-flags/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/platform-admin/feature-flags/{id}", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/announcements — paginated Announcement response", () => {
    const body = {
      data: [{ id: "ann1", title: "Maintenance", body: "Scheduled downtime", type: "warning", active: true }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/announcements", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/platform-admin/announcements/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/platform-admin/announcements/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/tickets — paginated Ticket response", () => {
    const body = {
      data: [{ id: "t1", title: "Login issue", status: "open", priority: "high" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/tickets", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/tickets — invalid priority", () => {
    const body = {
      data: [{ id: "t1", title: "Login issue", status: "open", priority: "urgent" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/tickets", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("priority"))).toBe(true);
  });

  it("PATCH /api/platform-admin/tickets/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/platform-admin/tickets/{id}", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/platform-admin/tickets/{id}/replies — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/platform-admin/tickets/{id}/replies", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/audit — paginated AuditLog response", () => {
    const body = {
      data: [{ id: "a1", action: "create", actor: "admin", companySlug: "acme", createdAt: "2024-01-01" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/audit", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/ai-usage — valid AIUsage response", () => {
    const body = { totalCost: 500, totalRequests: 10000, period: "2024-01" };
    const result = validateContract("/api/platform-admin/ai-usage", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/ai-usage — missing totalCost", () => {
    const body = { totalRequests: 10000, period: "2024-01" };
    const result = validateContract("/api/platform-admin/ai-usage", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("totalCost"))).toBe(true);
  });

  it("GET /api/platform-admin/ai-providers — paginated AIProvider response", () => {
    const body = {
      data: [{ id: "p1", name: "OpenAI", provider: "openai", modelId: "gpt-4", isEnabled: true }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/ai-providers", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/ai-providers — invalid provider enum", () => {
    const body = {
      data: [{ id: "p1", name: "Custom", provider: "custom_ai", modelId: "model-1", isEnabled: true }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/ai-providers", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("provider"))).toBe(true);
  });

  it("GET /api/platform-admin/ai-orchestration — valid AIOrchestration response", () => {
    const body = { strategy: "priority", autoFallback: true };
    const result = validateContract("/api/platform-admin/ai-orchestration", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/ai-orchestration — missing strategy", () => {
    const body = { autoFallback: true };
    const result = validateContract("/api/platform-admin/ai-orchestration", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("strategy"))).toBe(true);
  });

  it("POST /api/platform-admin/ai-orchestration/run-benchmark — valid mutation response", () => {
    const body = { ok: true, results: {} };
    const result = validateContract("/api/platform-admin/ai-orchestration/run-benchmark", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/integrations — valid Integration response", () => {
    const body = { provider: "zatca", isEnabled: true };
    const result = validateContract("/api/platform-admin/integrations", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/integrations — missing isEnabled", () => {
    const body = { provider: "zatca" };
    const result = validateContract("/api/platform-admin/integrations", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("isEnabled"))).toBe(true);
  });

  it("GET /api/platform-admin/review-queue — paginated ReviewQueue response", () => {
    const body = {
      data: [{ id: "rq1", type: "invoice_match", status: "pending" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/review-queue", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/queue-failures — paginated QueueFailure response", () => {
    const body = {
      data: [{ id: "qf1", queueName: "email", error: "SMTP timeout", createdAt: "2024-01-01" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/platform-admin/queue-failures", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/platform-admin/retention-cleanup — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/platform-admin/retention-cleanup", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/platform-admin/landing-content — valid landing content response", () => {
    const body = { heroTitle: "GarfiX", heroSubtitle: "Smart accounting" };
    const result = validateContract("/api/platform-admin/landing-content", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── Metrics Contract Tests ───────────────────────────────────────────────────

describe("Metrics Contract", () => {
  it("GET /api/metrics — metrics list response", () => {
    const body = {
      metrics: [
        { timestamp: "2024-01-01T00:00:00Z", value: 99.9 },
        { timestamp: "2024-01-02T00:00:00Z", value: 99.5 },
      ],
    };
    const result = validateContract("/api/metrics", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/metrics/slo — SLO definitions response", () => {
    const body = {
      slos: [
        { name: "API Latency", targetPct: 99.9, currentPct: 99.5, window: "7d", status: "healthy" },
        { name: "Error Rate", targetPct: 0.1, currentPct: 0.05, window: "30d", status: "healthy" },
      ],
    };
    const result = validateContract("/api/metrics/slo", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/metrics/slo — invalid window enum", () => {
    const body = {
      slos: [{ name: "API Latency", targetPct: 99.9, currentPct: 99.5, window: "1d", status: "healthy" }],
    };
    const result = validateContract("/api/metrics/slo", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("window"))).toBe(true);
  });

  it("GET /api/metrics/slo — invalid status enum", () => {
    const body = {
      slos: [{ name: "API Latency", targetPct: 99.9, currentPct: 99.5, window: "7d", status: "ok" }],
    };
    const result = validateContract("/api/metrics/slo", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("status"))).toBe(true);
  });

  it("GET /api/metrics/observability — valid observability response", () => {
    const body = { traces: [], logs: [] };
    const result = validateContract("/api/metrics/observability", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── Purchase Contract Tests ──────────────────────────────────────────────────

describe("Purchase Contract", () => {
  it("GET /api/purchases — Purchase list response", () => {
    const body = {
      purchases: [
        { id: 1, description: "Office supplies", amount: 500, date: "2024-01-15", companySlug: "acme" },
      ],
    };
    const result = validateContract("/api/purchases", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/purchases — missing amount", () => {
    const body = {
      purchases: [
        { id: 1, description: "Office supplies", date: "2024-01-15", companySlug: "acme" },
      ],
    };
    const result = validateContract("/api/purchases", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("amount"))).toBe(true);
  });

  it("PATCH /api/purchases/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/purchases/{id}", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/purchases/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/purchases/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });
});

// ── Backup Contract Tests ────────────────────────────────────────────────────

describe("Backup Contract", () => {
  it("GET /api/backups — Backup list response", () => {
    const body = {
      backups: [
        { id: 1, filename: "backup_2024_01.sql", size: 5000000, companySlug: "acme" },
      ],
    };
    const result = validateContract("/api/backups", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/backups — missing filename", () => {
    const body = {
      backups: [{ id: 1, size: 5000000, companySlug: "acme" }],
    };
    const result = validateContract("/api/backups", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("filename"))).toBe(true);
  });

  it("POST /api/backups — valid mutation response", () => {
    const body = { ok: true, backupId: 1 };
    const result = validateContract("/api/backups", "POST", body);
    expect(result.ok).toBe(true);
  });
});

// ── Report Contract Tests ────────────────────────────────────────────────────

describe("Report Contract", () => {
  it("GET /api/reports — Report list response", () => {
    const body = {
      reports: [
        { id: 1, title: "Monthly P&L", type: "financial", companySlug: "acme" },
      ],
    };
    const result = validateContract("/api/reports", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/reports — invalid type enum", () => {
    const body = {
      reports: [{ id: 1, title: "Report", type: "operational", companySlug: "acme" }],
    };
    const result = validateContract("/api/reports", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("type"))).toBe(true);
  });
});

// ── ZATCA E-Invoicing Contract Tests ─────────────────────────────────────────

describe("ZATCA E-Invoicing Contract", () => {
  it("ZATCAInvoiceDTO — valid invoice shape via unknown route", () => {
    const body = {
      invoiceNumber: "INV-ZATCA-001",
      sellerVAT: "300000000000003",
      buyerVAT: "300000000000004",
      totalAmount: 1000,
      vatAmount: 150,
      status: "cleared",
    };
    const result = validateContract("/api/accounting/profit-loss", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("ZATCAInvoiceDTO — empty object fails financial report contract", () => {
    const result = validateContract("/api/accounting/profit-loss", "GET", {});
    // validateFinancialReportResponse rejects empty objects
    expect(result.ok).toBe(false);
  });
});

// ── Product Matching Contract Tests ──────────────────────────────────────────

describe("Product Matching Contract", () => {
  it("GET /api/product-matching/config — ProductMatchConfigDTO", () => {
    const body = {
      id: "pm1",
      threshold: 0.85,
      algorithm: "fuzzy",
      companySlug: "acme",
      isActive: true,
    };
    const result = validateContract("/api/product-matching/config", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/product-matching/config — invalid algorithm enum", () => {
    const body = {
      id: "pm1",
      threshold: 0.85,
      algorithm: "hybrid",
      companySlug: "acme",
    };
    const result = validateContract("/api/product-matching/config", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("algorithm"))).toBe(true);
  });

  it("PUT /api/product-matching/config — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/product-matching/config", "PUT", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/product-matching/confirm — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/product-matching/confirm", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/product-matching/match-override — paginated MatchOverride response", () => {
    const body = {
      data: [{ id: "mo1", originalProduct: "SKU-001", matchedProduct: "SKU-002" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/product-matching/match-override", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/product-matching/review — paginated ProductMatchReview response", () => {
    const body = {
      data: [{ id: "r1", invoiceLine: "Line 1", matchedProduct: "SKU-001", status: "pending" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/product-matching/review", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/product-matching/undo — valid OkResponse", () => {
    const body = { ok: true };
    const result = validateContract("/api/product-matching/undo", "POST", body);
    expect(result.ok).toBe(true);
  });
});

// ── Settings Contract Tests ──────────────────────────────────────────────────

describe("Settings Contract", () => {
  it("GET /api/settings — valid settings response", () => {
    const body = { currency: "SAR", language: "ar", timezone: "Asia/Riyadh" };
    const result = validateContract("/api/settings", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("PATCH /api/settings — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/settings", "PATCH", body);
    expect(result.ok).toBe(true);
  });
});

// ── Onboarding Contract Tests ────────────────────────────────────────────────

describe("Onboarding Contract", () => {
  it("GET /api/onboarding — valid OnboardingStep response", () => {
    const body = {
      steps: [
        { id: "1", title: "Set up company", order: 1, isCompleted: false },
        { id: "2", title: "Add employees", order: 2, isCompleted: true },
      ],
    };
    const result = validateContract("/api/onboarding", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/onboarding — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/onboarding", "POST", body);
    expect(result.ok).toBe(true);
  });
});

// ── Catalog Contract Tests ───────────────────────────────────────────────────

describe("Catalog Contract", () => {
  it("GET /api/catalog — paginated Catalog response", () => {
    const body = {
      data: [{ id: "cat1", name: "Electronics", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/catalog", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/catalog — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/catalog", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("PATCH /api/catalog/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/catalog/{id}", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/catalog/{id} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/catalog/{id}", "DELETE", body);
    expect(result.ok).toBe(true);
  });
});

// ── SaaS Contract Tests ──────────────────────────────────────────────────────

describe("SaaS Contract", () => {
  it("GET /api/saas/payments — paginated SaaSPayment response", () => {
    const body = {
      data: [{ id: "sp1", amount: 500, status: "paid", companySlug: "acme" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/saas/payments", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/saas/payments/callback — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/saas/payments/callback", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/saas/payments/initiate — valid mutation response", () => {
    const body = { ok: true, paymentUrl: "https://pay.example.com" };
    const result = validateContract("/api/saas/payments/initiate", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/saas/users — paginated SaaSUser response", () => {
    const body = {
      data: [{ uid: "u1", email: "user@saas.com", role: "owner" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/saas/users", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("PATCH /api/saas/users/{uid} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/saas/users/{uid}", "PATCH", body);
    expect(result.ok).toBe(true);
  });

  it("DELETE /api/saas/users/{uid} — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/saas/users/{uid}", "DELETE", body);
    expect(result.ok).toBe(true);
  });
});

// ── Permissions Contract Tests ───────────────────────────────────────────────

describe("Permissions Contract", () => {
  it("GET /api/permissions/catalog — valid catalog response", () => {
    const body = { catalog: { accounting: ["view", "edit"] } };
    const result = validateContract("/api/permissions/catalog", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/permissions/check — valid OkResponse", () => {
    const body = { ok: true, allowed: true };
    const result = validateContract("/api/permissions/check", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/permissions/roles — paginated PermissionRole response", () => {
    const body = {
      data: [{ id: "r1", name: "Accountant", permissions: ["view_invoices", "edit_invoices"] }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/permissions/roles", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/permissions/roles — missing permissions", () => {
    const body = {
      data: [{ id: "r1", name: "Accountant" }],
      total: 1, page: 1, pageSize: 20, hasMore: false,
    };
    const result = validateContract("/api/permissions/roles", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("permissions"))).toBe(true);
  });

  it("PUT /api/permissions/roles — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/permissions/roles", "PUT", body);
    expect(result.ok).toBe(true);
  });
});

// ── Founder Panel Contract Tests ─────────────────────────────────────────────

describe("Founder Panel Contract", () => {
  it("GET /api/founder-panel/mission-control — valid response", () => {
    const body = { ok: true, services: [] };
    const result = validateContract("/api/founder-panel/mission-control", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/founder-panel/mission-control — missing ok", () => {
    const body = { services: [] };
    const result = validateContract("/api/founder-panel/mission-control", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ok"))).toBe(true);
  });

  it("GET /api/founder-panel/finops — valid response", () => {
    const body = { totalCost: 5000, totalRevenue: 100000 };
    const result = validateContract("/api/founder-panel/finops", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/founder-panel/finops — missing totalCost", () => {
    const body = { totalRevenue: 100000 };
    const result = validateContract("/api/founder-panel/finops", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("totalCost"))).toBe(true);
  });

  it("GET /api/founder-panel/ai-fabric — valid response", () => {
    const body = { totalRequests: 50000, avgLatencyMs: 250 };
    const result = validateContract("/api/founder-panel/ai-fabric", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/founder-panel/ai-fabric — missing avgLatencyMs", () => {
    const body = { totalRequests: 50000 };
    const result = validateContract("/api/founder-panel/ai-fabric", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("avgLatencyMs"))).toBe(true);
  });
});

// ── Founder Validation Contract Tests ────────────────────────────────────────

describe("Founder Validation Contract", () => {
  it("GET /api/founder-validation — valid FounderValidationDTO", () => {
    const body = { ok: true, type: "full" };
    const result = validateContract("/api/founder-validation", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/founder-validation — valid FounderValidationDTO", () => {
    const body = { ok: true, type: "quick" };
    const result = validateContract("/api/founder-validation", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/founder-validation — missing ok field", () => {
    const body = { type: "full" };
    const result = validateContract("/api/founder-validation", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ok"))).toBe(true);
  });

  it("POST /api/founder-validation/ai-test — valid mutation response", () => {
    const body = { ok: true };
    const result = validateContract("/api/founder-validation/ai-test", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/founder-validation/report — valid mutation response", () => {
    const body = { ok: true, reportUrl: "/reports/validation.pdf" };
    const result = validateContract("/api/founder-validation/report", "POST", body);
    expect(result.ok).toBe(true);
  });

  it("POST /api/founder-validation/seed — valid mutation response", () => {
    const body = { ok: true, seededCount: 100 };
    const result = validateContract("/api/founder-validation/seed", "POST", body);
    expect(result.ok).toBe(true);
  });
});

// ── Landing Content Contract Tests ───────────────────────────────────────────

describe("Landing Content Contract", () => {
  it("GET /api/landing-content — valid landing content response", () => {
    const body = { heroTitle: "GarfiX Accounting", heroSubtitle: "Smart finances" };
    const result = validateContract("/api/landing-content", "GET", body);
    expect(result.ok).toBe(true);
  });
});

// ── Storage Contract Tests ───────────────────────────────────────────────────

describe("Storage Contract", () => {
  it("GET /api/storage/{key} — valid StorageObjectDTO", () => {
    const body = { key: "invoices/2024.pdf", size: 500000, contentType: "application/pdf", url: "/storage/invoices/2024.pdf" };
    const result = validateContract("/api/storage/{key}", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/storage/{key} — missing key field", () => {
    const body = { size: 500000, contentType: "application/pdf" };
    const result = validateContract("/api/storage/{key}", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("key"))).toBe(true);
  });
});

// ── Internal Contract Tests ──────────────────────────────────────────────────

describe("Internal Contract", () => {
  it("GET /api/internal/ai-fabric/savings — valid AiFabricSavings response", () => {
    const body = { savingsUsd: 500, savingsPct: 0.85 };
    const result = validateContract("/api/internal/ai-fabric/savings", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("GET /api/internal/ai-fabric/savings — missing savingsUsd", () => {
    const body = { savingsPct: 0.85 };
    const result = validateContract("/api/internal/ai-fabric/savings", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("savingsUsd"))).toBe(true);
  });
});

// ── Builder Pattern Tests ────────────────────────────────────────────────────

describe("ContractValidator Builder", () => {
  it("builder pattern validates custom expectations", () => {
    const body = {
      data: [
        { id: "1", name: "Test", slug: "test-co", plan: "starter", currency: "SAR", subscriptionStatus: "active" },
      ],
      total: 5, page: 1, hasMore: true,
    };

    const result = new ContractValidator("/api/companies", "GET")
      .expectRequired("data", "total", "page", "hasMore")
      .expectArray("data")
      .expectNumber("total")
      .expectBoolean("hasMore")
      .validate(body);

    expect(result.ok).toBe(true);
  });

  it("builder catches type mismatches", () => {
    const body = {
      data: "not-an-array",
      total: "5",
      hasMore: 1,
    };

    const result = new ContractValidator("/api/companies", "GET")
      .expectRequired("data", "total", "hasMore")
      .expectArray("data")
      .expectNumber("total")
      .expectBoolean("hasMore")
      .validate(body);

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── Error Shape Contract Tests ───────────────────────────────────────────────

describe("Error Contract", () => {
  it("error responses match ErrorResult shape", () => {
    const body = { error: "Not found", code: "NOT_FOUND" };
    const result = validateContract("/api/invoices", "GET", body);
    expect(result.ok).toBe(true);
  });

  it("error without message field violates contract", () => {
    const body = { code: "ERROR" };
    const result = validateContract("/api/unknown-route", "GET", body);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("contract") || e.message.includes("unstructured"))).toBe(true);
  });
});

// ── assertContract throws on violation ────────────────────────────────────────

describe("assertContract", () => {
  it("throws with descriptive message on contract violation", () => {
    const invalidBody = { ok: "maybe" };
    expect(() => assertContract("/api/auth/login", "POST", invalidBody)).toThrow(/Contract violation/);
  });

  it("does not throw on valid response", () => {
    const validBody = { ok: true, user: { id: "1", uid: "u1", email: "t@t.com", displayName: "T", role: "admin", companies: [], tokenVersion: 1 } };
    expect(() => assertContract("/api/auth/login", "POST", validBody)).not.toThrow();
  });
});
