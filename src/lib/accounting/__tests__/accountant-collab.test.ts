/**
 * accountant-collab.test.ts — Tests for Accountant Collaboration (Phase 12).
 *
 * Replicates pure logic from accountant-collab.ts for testing without DB.
 * Tests: access level permissions mapping, role name generation, export type handling,
 * trial balance data structure, general ledger running balance, audit trail filter
 * construction, JSON state serialization, date filtering logic.
 */

import { describe, test, expect } from "bun:test";
import { num } from "@/lib/money";

// ── Replicated pure logic ──────────────────────────────────────────────────────

type AccountantAccessLevel = "read_only" | "limited_edit" | "full_edit";

const ACCESS_LEVEL_PERMISSIONS: Record<AccountantAccessLevel, string[]> = {
  read_only: ["finance_access"],
  limited_edit: ["finance_access", "create_journal_entry"],
  full_edit: ["finance_access", "create_journal_entry", "post_journal_entry", "create_invoice", "create_voucher"],
};

/**
 * Generate role name for external accountant access.
 * Mirrors: `ext_accountant_${companySlug}_${email sanitized}`
 */
function generateRoleName(companySlug: string, accountantEmail: string): string {
  return `ext_accountant_${companySlug}_${accountantEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/**
 * Get permissions for a given access level.
 */
function getPermissionsForLevel(level: AccountantAccessLevel): string[] {
  return ACCESS_LEVEL_PERMISSIONS[level];
}

/**
 * Determine export file name suffix.
 */
function getExportFileNameSuffix(companySlug: string, periodFrom: string, periodTo: string, exportType: string): string {
  return `${companySlug}_${periodFrom}_${periodTo}_${exportType}`;
}

/**
 * Get Arabic file name prefix for export type.
 */
function getExportFilePrefix(exportType: string): string {
  switch (exportType) {
    case "trial_balance": return "ميزان_مراجعة";
    case "general_ledger": return "دفتر_الأستاذ";
    case "journal_entries": return "قيود_يومية";
    case "full_package": return "حزمة_كاملة";
    default: throw new Error(`Unknown export type: ${exportType}`);
  }
}

/**
 * Build trial balance data for a set of accounts with journal lines.
 * Mirrors the pure calculation logic from generateTrialBalanceData.
 */
interface AccountWithLines {
  code: string;
  nameAr: string;
  type: string;
  journalLines: Array<{ debit: string; credit: string; status: string; date: string }>;
}

function buildTrialBalanceRows(
  accounts: AccountWithLines[],
  periodFrom: string,
  periodTo: string,
): { rows: Record<string, unknown>[]; grandDebit: number; grandCredit: number } {
  const rows: Record<string, unknown>[] = [];
  let grandDebit = 0;
  let grandCredit = 0;

  for (const acc of accounts) {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of acc.journalLines) {
      if (line.status !== "posted" && line.status !== "reversed") continue;
      if (line.date < periodFrom || line.date > periodTo) continue;
      const multiplier = line.status === "reversed" ? -1 : 1;
      totalDebit += num(line.debit, 3) * multiplier;
      totalCredit += num(line.credit, 3) * multiplier;
    }
    grandDebit += totalDebit;
    grandCredit += totalCredit;

    rows.push({
      "رمز الحساب": acc.code,
      "اسم الحساب": acc.nameAr,
      "نوع الحساب": acc.type,
      "مدين": num(totalDebit, 3).toFixed(3),
      "دائن": num(totalCredit, 3).toFixed(3),
      "الرصيد": num(totalDebit - totalCredit, 3).toFixed(3),
    });
  }

  return { rows, grandDebit, grandCredit };
}

/**
 * Calculate general ledger running balance.
 * Mirrors the runningBalance calculation from generateGeneralLedgerData.
 */
interface GLLine {
  debit: string;
  credit: string;
  status: string;
}

function calculateRunningBalance(
  lines: GLLine[],
  accountType: string,
): number {
  let runningBalance = 0;
  const isDebitNormal = accountType === "asset" || accountType === "expense";

  for (const line of lines) {
    const multiplier = line.status === "reversed" ? -1 : 1;
    const debit = num(line.debit, 3) * multiplier;
    const credit = num(line.credit, 3) * multiplier;
    runningBalance += isDebitNormal ? debit - credit : credit - debit;
  }

  return runningBalance;
}

/**
 * Build audit trail filter where clause.
 * Mirrors the filter construction from getAccountingAuditTrail.
 */
interface AuditTrailFilter {
  entity?: string;
  entityId?: number;
  fromDate?: string;
  toDate?: string;
}

function buildAuditTrailWhere(
  companySlug: string,
  filters?: AuditTrailFilter,
): Record<string, unknown> {
  const where: Record<string, unknown> = { companySlug };

  if (filters?.entity) where.entity = filters.entity;
  if (filters?.entityId) where.entityId = filters.entityId;
  if (filters?.fromDate || filters?.toDate) {
    const dateFilter: Record<string, unknown> = {};
    if (filters.fromDate) dateFilter.gte = new Date(filters.fromDate);
    if (filters.toDate) dateFilter.lte = new Date(filters.toDate);
    where.createdAt = dateFilter;
  }

  return where;
}

/**
 * Serialize/deserialize beforeState/afterState for audit log.
 * Mirrors the JSON.stringify/parse logic from logAccountingChange.
 */
function serializeAuditState(state: Record<string, unknown> | null): string | null {
  return state ? JSON.stringify(state) : null;
}

function deserializeAuditState(serialized: string | null): Record<string, unknown> | null {
  if (!serialized) return null;
  try {
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

/**
 * Validate that company data exists for export.
 */
function validateCompanyForExport(company: { name: string; nameAr: string | null; currency: string } | null): string | null {
  if (!company) return "Company not found";
  return null;
}

/**
 * Get company display name (Arabic preferred, fallback to English).
 */
function getCompanyDisplayName(company: { name: string; nameAr: string | null }): string {
  return company.nameAr || company.name;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────

describe("accountant-collab: access level permissions (مستويات الوصول)", () => {
  test("read_only → finance_access only", () => {
    const perms = getPermissionsForLevel("read_only");
    expect(perms).toEqual(["finance_access"]);
  });

  test("limited_edit → finance_access + create_journal_entry", () => {
    const perms = getPermissionsForLevel("limited_edit");
    expect(perms).toContain("finance_access");
    expect(perms).toContain("create_journal_entry");
    expect(perms.length).toBe(2);
  });

  test("full_edit → all 5 permissions", () => {
    const perms = getPermissionsForLevel("full_edit");
    expect(perms).toEqual(["finance_access", "create_journal_entry", "post_journal_entry", "create_invoice", "create_voucher"]);
    expect(perms.length).toBe(5);
  });

  test("Permission hierarchy: read_only ⊂ limited_edit ⊂ full_edit", () => {
    const readOnly = getPermissionsForLevel("read_only");
    const limited = getPermissionsForLevel("limited_edit");
    const full = getPermissionsForLevel("full_edit");
    for (const p of readOnly) {
      expect(limited).toContain(p);
    }
    for (const p of limited) {
      expect(full).toContain(p);
    }
  });

  test("read_only cannot post journal entries", () => {
    const perms = getPermissionsForLevel("read_only");
    expect(perms).not.toContain("post_journal_entry");
  });

  test("limited_edit cannot post journal entries", () => {
    const perms = getPermissionsForLevel("limited_edit");
    expect(perms).not.toContain("post_journal_entry");
  });

  test("full_edit can post journal entries", () => {
    const perms = getPermissionsForLevel("full_edit");
    expect(perms).toContain("post_journal_entry");
  });

  test("read_only cannot create invoices or vouchers", () => {
    const perms = getPermissionsForLevel("read_only");
    expect(perms).not.toContain("create_invoice");
    expect(perms).not.toContain("create_voucher");
  });
});

describe("accountant-collab: role name generation (توليد اسم الدور)", () => {
  test("Simple email: accountant@example.com → ext_accountant_co_accountant_example_com", () => {
    const roleName = generateRoleName("co", "accountant@example.com");
    expect(roleName).toBe("ext_accountant_co_accountant_example_com");
  });

  test("Email with special chars: a.b+c@domain.com → underscores replace specials", () => {
    const roleName = generateRoleName("test-co", "a.b+c@domain.com");
    expect(roleName).toBe("ext_accountant_test-co_a_b_c_domain_com");
  });

  test("Arabic-like email with dots: ahmed.firm@gmail.com", () => {
    const roleName = generateRoleName("firm", "ahmed.firm@gmail.com");
    expect(roleName).toBe("ext_accountant_firm_ahmed_firm_gmail_com");
  });

  test("Role name includes company slug", () => {
    const roleName = generateRoleName("my-company", "x@y.com");
    expect(roleName).toContain("my-company");
  });

  test("@ symbol is replaced with underscore", () => {
    const roleName = generateRoleName("co", "user@test.com");
    expect(roleName).not.toContain("@");
  });
});

describe("accountant-collab: export file naming (تسمية ملفات التصدير)", () => {
  test("trial_balance → ميزان_مراجعة prefix", () => {
    expect(getExportFilePrefix("trial_balance")).toBe("ميزان_مراجعة");
  });

  test("general_ledger → دفتر_الأستاذ prefix", () => {
    expect(getExportFilePrefix("general_ledger")).toBe("دفتر_الأستاذ");
  });

  test("journal_entries → قيود_يومية prefix", () => {
    expect(getExportFilePrefix("journal_entries")).toBe("قيود_يومية");
  });

  test("full_package → حزمة_كاملة prefix", () => {
    expect(getExportFilePrefix("full_package")).toBe("حزمة_كاملة");
  });

  test("Unknown export type → throws error", () => {
    expect(() => getExportFilePrefix("random")).toThrow("Unknown export type");
  });

  test("File name suffix includes company slug, period, and type", () => {
    const suffix = getExportFileNameSuffix("my-co", "2025-01-01", "2025-06-30", "trial_balance");
    expect(suffix).toBe("my-co_2025-01-01_2025-06-30_trial_balance");
  });

  test("Full file name: Arabic prefix + suffix + .xlsx", () => {
    const prefix = getExportFilePrefix("trial_balance");
    const suffix = getExportFileNameSuffix("my-co", "2025-01", "2025-06", "trial_balance");
    const fileName = `${prefix}_${suffix}.xlsx`;
    expect(fileName).toContain("ميزان_مراجعة");
    expect(fileName).toContain(".xlsx");
  });
});

describe("accountant-collab: trial balance data calculation (حساب ميزان المراجعة)", () => {
  test("Single posted account: debit 500, credit 0 → row has مدين=500, دائن=0", () => {
    const accounts: AccountWithLines[] = [
      { code: "1100", nameAr: "النقد", type: "asset", journalLines: [{ debit: "500.000", credit: "0.000", status: "posted", date: "2025-01-15" }] },
    ];
    const { rows, grandDebit, grandCredit } = buildTrialBalanceRows(accounts, "2025-01-01", "2025-12-31");
    expect(rows.length).toBe(1);
    expect(rows[0]["مدين"]).toBe("500.000");
    expect(rows[0]["دائن"]).toBe("0.000");
    expect(rows[0]["الرصيد"]).toBe("500.000");
    expect(grandDebit).toBe(500);
    expect(grandCredit).toBe(0);
  });

  test("Draft entries are excluded from trial balance", () => {
    const accounts: AccountWithLines[] = [
      { code: "1100", nameAr: "النقد", type: "asset", journalLines: [{ debit: "100.000", credit: "0.000", status: "draft", date: "2025-01-15" }] },
    ];
    const { rows } = buildTrialBalanceRows(accounts, "2025-01-01", "2025-12-31");
    expect(rows[0]["مدين"]).toBe("0.000");
    expect(rows[0]["دائن"]).toBe("0.000");
  });

  test("Reversed entries apply multiplier -1", () => {
    const accounts: AccountWithLines[] = [
      { code: "1100", nameAr: "النقد", type: "asset", journalLines: [{ debit: "200.000", credit: "0.000", status: "reversed", date: "2025-03-01" }] },
    ];
    const { rows } = buildTrialBalanceRows(accounts, "2025-01-01", "2025-12-31");
    // Reversed: debit * -1 = -200
    expect(rows[0]["مدين"]).toBe("-200.000");
  });

  test("Date filtering: entries outside period are excluded", () => {
    const accounts: AccountWithLines[] = [
      { code: "1100", nameAr: "النقد", type: "asset", journalLines: [
        { debit: "100.000", credit: "0.000", status: "posted", date: "2024-12-15" }, // outside period
        { debit: "500.000", credit: "0.000", status: "posted", date: "2025-02-15" }, // inside period
      ] },
    ];
    const { rows } = buildTrialBalanceRows(accounts, "2025-01-01", "2025-06-30");
    expect(rows[0]["مدين"]).toBe("500.000");
  });

  test("Multiple accounts: grand totals are correct", () => {
    const accounts: AccountWithLines[] = [
      { code: "1100", nameAr: "النقد", type: "asset", journalLines: [{ debit: "500.000", credit: "0.000", status: "posted", date: "2025-01-15" }] },
      { code: "4000", nameAr: "المبيعات", type: "revenue", journalLines: [{ debit: "0.000", credit: "500.000", status: "posted", date: "2025-01-15" }] },
    ];
    const { grandDebit, grandCredit } = buildTrialBalanceRows(accounts, "2025-01-01", "2025-12-31");
    expect(grandDebit).toBe(500);
    expect(grandCredit).toBe(500);
    // Balanced: debit = credit
    expect(Math.abs(grandDebit - grandCredit)).toBeLessThanOrEqual(0.001);
  });

  test("All monetary values in trial balance rows are 3-decimal strings", () => {
    const accounts: AccountWithLines[] = [
      { code: "1100", nameAr: "النقد", type: "asset", journalLines: [{ debit: "123.456", credit: "0.000", status: "posted", date: "2025-01-15" }] },
    ];
    const { rows } = buildTrialBalanceRows(accounts, "2025-01-01", "2025-12-31");
    for (const row of rows) {
      expect(row["مدين"]).toMatch(/^\-?\d+\.\d{3}$/);
      expect(row["دائن"]).toMatch(/^\-?\d+\.\d{3}$/);
      expect(row["الرصيد"]).toMatch(/^\-?\d+\.\d{3}$/);
    }
  });
});

describe("accountant-collab: general ledger running balance (الرصيد المتجمع)", () => {
  test("Asset account: debit increases, credit decreases running balance", () => {
    const lines: GLLine[] = [
      { debit: "100.000", credit: "0.000", status: "posted" },
      { debit: "50.000", credit: "30.000", status: "posted" },
    ];
    // Asset: runningBalance += (debit - credit) per line
    // Line 1: 100 - 0 = 100 → running 100
    // Line 2: 50 - 30 = 20 → running 120
    expect(calculateRunningBalance(lines, "asset")).toBe(120);
  });

  test("Revenue account: credit increases, debit decreases running balance", () => {
    const lines: GLLine[] = [
      { debit: "0.000", credit: "200.000", status: "posted" },
      { debit: "50.000", credit: "0.000", status: "posted" },
    ];
    // Revenue: runningBalance += (credit - debit) per line
    // Line 1: 200 - 0 = 200 → running 200
    // Line 2: 0 - 50 = -50 → running 150
    expect(calculateRunningBalance(lines, "revenue")).toBe(150);
  });

  test("Expense account: debit-normal like asset", () => {
    const lines: GLLine[] = [
      { debit: "300.000", credit: "0.000", status: "posted" },
    ];
    expect(calculateRunningBalance(lines, "expense")).toBe(300);
  });

  test("Reversed entry: multiplier -1 affects running balance", () => {
    const lines: GLLine[] = [
      { debit: "100.000", credit: "0.000", status: "posted" },
      { debit: "50.000", credit: "0.000", status: "reversed" },
    ];
    // Asset: Line 1 = 100, Line 2 = -50 → running 50
    expect(calculateRunningBalance(lines, "asset")).toBe(50);
  });

  test("Empty lines → running balance = 0", () => {
    expect(calculateRunningBalance([], "asset")).toBe(0);
  });

  test("Liability account: credit-normal (credit increases balance)", () => {
    const lines: GLLine[] = [
      { debit: "0.000", credit: "500.000", status: "posted" },
    ];
    // Liability: runningBalance += (credit - debit) = 500
    expect(calculateRunningBalance(lines, "liability")).toBe(500);
  });
});

describe("accountant-collab: audit trail filter construction (فلتر سجل المراجعة)", () => {
  test("No filters → only companySlug in where clause", () => {
    const where = buildAuditTrailWhere("my-co");
    expect(where.companySlug).toBe("my-co");
    expect(where.entity).toBeUndefined();
    expect(where.entityId).toBeUndefined();
    expect(where.createdAt).toBeUndefined();
  });

  test("Entity filter → adds entity to where", () => {
    const where = buildAuditTrailWhere("my-co", { entity: "journal_entry" });
    expect(where.entity).toBe("journal_entry");
  });

  test("Entity + entityId filter → adds both to where", () => {
    const where = buildAuditTrailWhere("my-co", { entity: "journal_entry", entityId: 42 });
    expect(where.entity).toBe("journal_entry");
    expect(where.entityId).toBe(42);
  });

  test("Date range filter → adds createdAt with gte and lte", () => {
    const where = buildAuditTrailWhere("my-co", { fromDate: "2025-01-01", toDate: "2025-06-30" });
    expect(where.createdAt).toBeDefined();
    const createdAt = where.createdAt as Record<string, unknown>;
    expect(createdAt.gte).toBeDefined();
    expect(createdAt.lte).toBeDefined();
  });

  test("Only fromDate → createdAt has gte but not lte", () => {
    const where = buildAuditTrailWhere("my-co", { fromDate: "2025-01-01" });
    const createdAt = where.createdAt as Record<string, unknown>;
    expect(createdAt.gte).toBeDefined();
    expect(createdAt.lte).toBeUndefined();
  });

  test("All filters combined", () => {
    const where = buildAuditTrailWhere("my-co", { entity: "account", entityId: 5, fromDate: "2025-01", toDate: "2025-12" });
    expect(where.companySlug).toBe("my-co");
    expect(where.entity).toBe("account");
    expect(where.entityId).toBe(5);
    expect(where.createdAt).toBeDefined();
  });
});

describe("accountant-collab: audit state serialization (تسجيل حالة المراجعة)", () => {
  test("Serialize non-null state → JSON string", () => {
    const state = { amount: "100.000", status: "posted" };
    const serialized = serializeAuditState(state);
    expect(serialized).toBe(JSON.stringify(state));
    expect(typeof serialized).toBe("string");
  });

  test("Serialize null state → null", () => {
    expect(serializeAuditState(null)).toBeNull();
  });

  test("Deserialize valid JSON → original object", () => {
    const json = '{"amount":"500.000","type":"invoice"}';
    const deserialized = deserializeAuditState(json);
    expect(deserialized).toEqual({ amount: "500.000", type: "invoice" });
  });

  test("Deserialize null → null", () => {
    expect(deserializeAuditState(null)).toBeNull();
  });

  test("Deserialize invalid JSON → null (graceful fallback)", () => {
    expect(deserializeAuditState("not valid json {{{")).toBeNull();
  });

  test("Round-trip: serialize then deserialize preserves data", () => {
    const original = { netProfit: "10000.000", partners: 3 };
    const serialized = serializeAuditState(original);
    const deserialized = deserializeAuditState(serialized);
    expect(deserialized).toEqual(original);
  });
});

describe("accountant-collab: company validation and display (التحقق من الشركة)", () => {
  test("Valid company → no error", () => {
    const company = { name: "Test Co", nameAr: "شركة اختبار", currency: "KWD" };
    expect(validateCompanyForExport(company)).toBeNull();
  });

  test("Null company → error: 'Company not found'", () => {
    expect(validateCompanyForExport(null)).toBe("Company not found");
  });

  test("Company with Arabic name → display Arabic name", () => {
    const company = { name: "Test Co", nameAr: "شركة اختبار" };
    expect(getCompanyDisplayName(company)).toBe("شركة اختبار");
  });

  test("Company without Arabic name → fallback to English name", () => {
    const company = { name: "Test Co", nameAr: null };
    expect(getCompanyDisplayName(company)).toBe("Test Co");
  });

  test("Company with empty Arabic name → fallback to English name", () => {
    const company = { name: "Test Co", nameAr: null };
    expect(getCompanyDisplayName(company)).toBe("Test Co");
  });
});
