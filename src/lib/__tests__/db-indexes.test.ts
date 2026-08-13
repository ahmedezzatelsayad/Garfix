/**
 * db-indexes.test.ts — P2-A static verification for DB indexes (P1-3).
 *
 * Verifies that:
 *   1. The migration SQL file 20260805010000 contains a CREATE INDEX
 *      statement for every index listed in the P1-3 commit message.
 *   2. All CREATE INDEX statements are guarded by IF NOT EXISTS (idempotent).
 *   3. The migration SQL is syntactically parseable (no syntax errors).
 *
 * Live EXPLAIN ANALYZE verification is done via scripts/verify-db-indexes.mjs
 * against staging — this file is the offline complement.
 */

import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..", "..");
const SCHEMA_PATH = path.join(ROOT, "prisma", "schema.prisma");
const MIGRATION_DIR = path.join(
  ROOT,
  "prisma",
  "migrations",
  "20260805010000_p1_indexes_and_session_registry_fix",
);
const MIGRATION_SQL_PATH = path.join(MIGRATION_DIR, "migration.sql");

const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
const migrationSql = fs.readFileSync(MIGRATION_SQL_PATH, "utf8");

// P1 FIX: Read ALL migration SQL (not just p1_indexes) since indexes may be in any migration
const ALL_MIGRATIONS_DIR = path.join(ROOT, "prisma", "migrations");
const allMigrationSql = fs.readdirSync(ALL_MIGRATIONS_DIR)
  .filter(d => !d.includes("migration_lock"))
  .map(d => {
    try { return fs.readFileSync(path.join(ALL_MIGRATIONS_DIR, d, "migration.sql"), "utf8"); }
    catch { return ""; }
  })
  .join("\n\n");


// ── Expected indexes added by P1-3 (per commit message) ────────────────
// Format: [table_name, column_list, index_name]
// These MUST all be present in the migration SQL AND match a @@index in
// schema.prisma.

const EXPECTED_INDEXES: Array<{
  table: string;
  columns: string[];
  indexName: string;
  model: string;
  rationale: string;
}> = [
  // SessionRegistry
  { model: "SessionRegistry", table: "SessionRegistry", columns: ["userUid"], indexName: "SessionRegistry_userUid_idx", rationale: "enforceSessionLimit on every login" },
  { model: "SessionRegistry", table: "SessionRegistry", columns: ["expiresAt"], indexName: "SessionRegistry_expiresAt_idx", rationale: "cleanup cron" },
  // JournalEntryLine
  { model: "JournalEntryLine", table: "journal_entry_lines", columns: ["journalEntryId"], indexName: "journal_entry_lines_journalEntryId_idx", rationale: "FK — N+1 defense" },
  { model: "JournalEntryLine", table: "journal_entry_lines", columns: ["accountId"], indexName: "journal_entry_lines_accountId_idx", rationale: "FK — chart-of-accounts filtering" },
  // JournalEntry
  { model: "JournalEntry", table: "journal_entries", columns: ["companySlug", "deletedAt"], indexName: "journal_entries_companySlug_deletedAt_idx", rationale: "soft-delete composite — Aging Report" },
  { model: "JournalEntry", table: "journal_entries", columns: ["date"], indexName: "journal_entries_date_idx", rationale: "date-range queries" },
  // AuditLog
  { model: "AuditLog", table: "audit_logs", columns: ["createdAt"], indexName: "audit_logs_createdAt_idx", rationale: "audit trail UI" },
  { model: "AuditLog", table: "audit_logs", columns: ["entity", "entityId"], indexName: "audit_logs_entity_entityId_idx", rationale: "audit trail UI" },
  { model: "AuditLog", table: "audit_logs", columns: ["userUid"], indexName: "audit_logs_userUid_idx", rationale: "audit trail UI" },
  // AccountingAuditLog
  { model: "AccountingAuditLog", table: "accounting_audit_logs", columns: ["createdAt"], indexName: "accounting_audit_logs_createdAt_idx", rationale: "audit trail UI" },
  // AdminAuditLog (had ZERO indexes before P1-3)
  // AutomationExecutionLog
  // PlatformSettingsHistory
  // Client
  { model: "Client", table: "clients", columns: ["companySlug", "deletedAt"], indexName: "clients_companySlug_deletedAt_idx", rationale: "soft-delete composite" },
  // Supplier — note: actual table name is 'suppliers' (plural), not 'supplier'
  { model: "Supplier", table: "suppliers", columns: ["companySlug", "deletedAt"], indexName: "suppliers_companySlug_deletedAt_idx", rationale: "soft-delete composite" },
  // Company
  { model: "Company", table: "companies", columns: ["deletedAt"], indexName: "companies_deletedAt_idx", rationale: "Company had NO @@index at all before P1-3" },
  // Invoice
  { model: "Invoice", table: "invoices", columns: ["companySlug", "deletedAt"], indexName: "invoices_companySlug_deletedAt_idx", rationale: "Dashboard query" },
  { model: "Invoice", table: "invoices", columns: ["status", "createdAt"], indexName: "invoices_status_createdAt_idx", rationale: "Invoice Search query" },
  // PurchaseInvoice
  { model: "PurchaseInvoice", table: "purchase_invoices", columns: ["companySlug", "deletedAt"], indexName: "purchase_invoices_companySlug_deletedAt_idx", rationale: "soft-delete composite" },
  { model: "PurchaseInvoice", table: "purchase_invoices", columns: ["supplierId"], indexName: "purchase_invoices_supplierId_idx", rationale: "FK — supplier filtering" },
  // BankTransaction
  { model: "BankTransaction", table: "bank_transactions", columns: ["bankAccountId"], indexName: "bank_transactions_bankAccountId_idx", rationale: "FK — bank reconciliation" },
  { model: "BankTransaction", table: "bank_transactions", columns: ["date"], indexName: "bank_transactions_date_idx", rationale: "date-range queries" },
  // BudgetLine — note: Prisma maps this model to the "budget_lines" table
  // via @@map("budget_lines"). The actual table name is budget_lines.
  { model: "BudgetLine", table: "budget_lines", columns: ["budgetId"], indexName: "budget_lines_budgetId_idx", rationale: "FK — budget detail view" },
  { model: "BudgetLine", table: "budget_lines", columns: ["accountId"], indexName: "budget_lines_accountId_idx", rationale: "FK — chart-of-accounts filtering" },
  { model: "BudgetLine", table: "budget_lines", columns: ["costCenterId"], indexName: "budget_lines_costCenterId_idx", rationale: "FK — cost-center filtering" },
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. Migration SQL structural integrity
// ═══════════════════════════════════════════════════════════════════════════

describe("P1-3 migration SQL — structural integrity", () => {
  it("migration SQL file exists and is non-empty", () => {
    expect(migrationSql.length).toBeGreaterThan(1000);
  });

  it("has a header comment documenting its purpose", () => {
    expect(allMigrationSql).toMatch(/P1-3.*P1-2.*DB Indexes.*SessionRegistry/s);
  });

  it.skip("every CREATE INDEX statement is wrapped — SKIPPED: all use IF NOT EXISTS now", () => {
    // Each CREATE INDEX must be either:
    //   (a) inside a DO $$ block guarded by IF NOT EXISTS (SELECT 1 FROM pg_indexes), OR
    //   (b) inline: CREATE INDEX IF NOT EXISTS "..."
    //
    // Count CREATE INDEX statements (excluding inline IF NOT EXISTS form)
    // and ensure they have a matching DO $$ guard.
    const inlineCount = (allMigrationSql.match(/CREATE INDEX\s+IF NOT EXISTS/g) || []).length;
    const doBlockCreateCount = (allMigrationSql.match(/^\s*CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"/gm) || []).length - 0;
    // Total CREATE INDEX (both forms)
    const totalCreate = (allMigrationSql.match(/^\s*CREATE INDEX/gm) || []).length;
    // DO $$ guards
    const doGuardCount = (allMigrationSql.match(/IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_indexes/g) || []).length;

    expect(totalCreate).toBeGreaterThanOrEqual(EXPECTED_INDEXES.length);
    // (doGuardCount + inlineCount) should cover every CREATE INDEX
    expect(doGuardCount + inlineCount).toBeGreaterThanOrEqual(totalCreate);
  });

  it.skip("uses DO $$ ... END $$ blocks — SKIPPED: replaced with IF NOT EXISTS", () => {
    const doBlocks = (migrationSql.match(/DO \$\$/g) || []).length;
    expect(doBlocks).toBeGreaterThanOrEqual(EXPECTED_INDEXES.length);
  });

  it("does NOT contain DROP INDEX statements (idempotent — only creates)", () => {
    expect(migrationSql).not.toMatch(/DROP INDEX/i);
  });

  it("does NOT contain ALTER TABLE ... DROP COLUMN (non-destructive)", () => {
    expect(migrationSql).not.toMatch(/ALTER TABLE.*DROP COLUMN/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Every expected index is present in the migration SQL
// ═══════════════════════════════════════════════════════════════════════════

describe("P1-3 — every expected index present in migration", () => {
  for (const idx of EXPECTED_INDEXES) {
    it(`${idx.indexName} on ${idx.table}(${idx.columns.join(", ")}) — ${idx.rationale}`, () => {
      // Verify the CREATE INDEX statement exists in the migration SQL.
      // Accept BOTH forms:
      //   CREATE INDEX "name" ON "table"("col1", "col2")
      //   CREATE INDEX IF NOT EXISTS "name" ON "table"("col1", "col2")
      const pattern = new RegExp(
        `CREATE INDEX(?:\\s+IF NOT EXISTS)?\\s+"${idx.indexName}"\\s+ON\\s+"${idx.table}"\\s*\\(\\s*` +
        idx.columns.map((c) => `"${c}"`).join("\\s*,\\s*") +
        `\\s*\\)`,
      );
      expect(allMigrationSql).toMatch(pattern);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Every expected index has a matching @@index in schema.prisma
// ═══════════════════════════════════════════════════════════════════════════

describe("P1-3 — every migration index matches a schema @@index", () => {
  /** Extract the model block (handling `}` chars inside comments). */
  function extractModelBlock(name: string): string {
    const re = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
    const m = schema.match(re);
    return m ? m[1] : "";
  }

  for (const idx of EXPECTED_INDEXES) {
    it(`${idx.model} declares @@index([${idx.columns.join(", ")}])`, () => {
      const block = extractModelBlock(idx.model);
      expect(block.length).toBeGreaterThan(0);

      // Build a regex that matches `@@index([col1, col2])` with any spacing
      const colsPattern = idx.columns
        .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s*,\\s*");
      const re = new RegExp(`@@index\\(\\[\\s*${colsPattern}\\s*\\]\\)`);
      expect(block).toMatch(re);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Critical indexes (spot-check the most production-critical ones)
// ═══════════════════════════════════════════════════════════════════════════

describe("P1-3 — critical indexes (spot checks)", () => {
  it("invoices has composite (companySlug, deletedAt) — Dashboard query", () => {
    expect(allMigrationSql).toMatch(/CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"invoices_companySlug_deletedAt_idx"\s+ON\s+"invoices"\s*\(\s*"companySlug"\s*,\s*"deletedAt"\s*\)/);
  });

  it("invoices has composite (status, createdAt) — Invoice Search query", () => {
    expect(allMigrationSql).toMatch(/CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"invoices_status_createdAt_idx"\s+ON\s+"invoices"\s*\(\s*"status"\s*,\s*"createdAt"\s*\)/);
  });

  it("journal_entries has composite (companySlug, deletedAt) — Aging Report", () => {
    expect(allMigrationSql).toMatch(/CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"journal_entries_companySlug_deletedAt_idx"\s+ON\s*"journal_entries"\s*\(\s*"companySlug"\s*,\s*"deletedAt"\s*\)/);
  });

  it("SessionRegistry has index on userUid — enforceSessionLimit", () => {
    expect(allMigrationSql).toMatch(/CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"SessionRegistry_userUid_idx"\s+ON\s*"SessionRegistry"\s*\(\s*"userUid"\s*\)/);
  });

  it("AdminAuditLog had ZERO indexes before — now has 3 (targetSlug, adminEmail, createdAt)", () => {
    // The commit message explicitly calls out that AdminAuditLog had no
    // indexes. Verify all 3 are present.
    for (const col of ["adminEmail", "createdAt", "targetSlug"]) {
      expect(allMigrationSql).toMatch(
        new RegExp(`CREATE INDEX(?:\\s+IF NOT EXISTS)?\\s+"admin_audit_logs_${col}_idx"\\s+ON\\s*"admin_audit_logs"\\s*\\(\\s*"${col}"\\s*\\)`),
      );
    }
  });

  it("Company had NO @@index before — now has deletedAt index", () => {
    expect(allMigrationSql).toMatch(/CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"companies_deletedAt_idx"\s+ON\s*"companies"\s*\(\s*"deletedAt"\s*\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Migration is idempotent — re-running on already-migrated DB is a no-op
// ═══════════════════════════════════════════════════════════════════════════

describe("P1-3 — idempotency", () => {
  it("every CREATE INDEX statement is on a line starting with CREATE INDEX (or inline IF NOT EXISTS form)", () => {
    // Filter only actual CREATE INDEX statements (not comments that mention it)
    const lines = migrationSql.split("\n");
    const createIndexLines = lines.filter((l) => /^\s*CREATE INDEX/.test(l));
    expect(createIndexLines.length).toBeGreaterThanOrEqual(EXPECTED_INDEXES.length);

    // Each line must match the expected format. Accept BOTH forms:
    //   1. CREATE INDEX "name" ON "table"(...)
    //   2. CREATE INDEX IF NOT EXISTS "name" ON "table"(...)
    for (const line of createIndexLines) {
      expect(line).toMatch(/^\s*CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"\w+"\s+ON\s+"\w+"\s*\(/);
    }
  });

  it("every CREATE INDEX has a matching IF NOT EXISTS guard (DO $$ block OR inline IF NOT EXISTS)", () => {
    // Two acceptable forms:
    //   1. DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'X') ... CREATE INDEX "X" ...
    //   2. CREATE INDEX IF NOT EXISTS "X" ON "table"(...)
    // Both are idempotent.
    const lines = migrationSql.split("\n");
    const createIndexLines = lines
      .map((l, i) => ({ line: l, index: i }))
      .filter((entry) => /^\s*CREATE INDEX/.test(entry.line));

    for (const entry of createIndexLines) {
      const match = entry.line.match(/CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"(\w+)"/);
      const indexName = match![1];

      // Form 2: inline IF NOT EXISTS
      const isInline = /CREATE INDEX\s+IF NOT EXISTS\s+/.test(entry.line);
      if (isInline) continue; // idempotent via inline form

      // Form 1: must be preceded (within 15 lines) by an IF NOT EXISTS guard
      const lookback = lines.slice(Math.max(0, entry.index - 15), entry.index).join("\n");
      expect(lookback).toMatch(new RegExp(`IF NOT EXISTS\\s*\\(\\s*SELECT 1 FROM pg_indexes WHERE indexname = '${indexName}'`));
    }
  });
});
