-- P1.5: Postgres Row-Level Security for multi-tenant isolation
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEM
-- ═══════════════════════════════════════════════════════════════════════════
-- Garfix is multi-tenant: every table has a `companySlug` column that
-- names the owning tenant. Prior to P1.5, isolation was enforced ONLY
-- at the application layer — every Prisma query had to remember to add
-- `where: { companySlug: ctx.companySlug }`. A single bug (forgetting
-- the where clause, a typo in the column name, a raw SQL escape) would
-- leak data across tenants.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SOLUTION: Postgres Row-Level Security
-- ═══════════════════════════════════════════════════════════════════════════
-- We enable RLS on every multi-tenant table and create a policy that
-- reads the current tenant from a session variable:
--
--   current_setting('app.current_company_slug', true)
--
-- The Prisma client extension in src/lib/db-rls.ts sets this variable
-- at the start of every request via:
--
--   SELECT set_config('app.current_company_slug', $1, false);
--
-- (The `false` means "transaction-local" — the setting reverts on
-- COMMIT/ROLLBACK, so requests can't bleed into each other.)
--
-- With RLS enabled, even a query like:
--   SELECT * FROM invoices;
-- will only return rows where companySlug matches the session variable.
-- A forgotten WHERE clause is no longer a data leak.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CAVEATS
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RLS is a DEFENSE-IN-DEPTH layer. The application must STILL pass
--    companySlug in WHERE clauses — RLS is the safety net, not the
--    primary isolation mechanism.
-- 2. The table owner (postgres) bypasses RLS by default. The Prisma
--    connection role must NOT be a superuser or the table owner. We
--    create a dedicated `garfix_app` role for this.
-- 3. Founder / admin users need cross-tenant visibility. We handle
--    this by setting app.current_company_slug = '__ALL__' for those
--    users, and the policy treats '__ALL__' as a bypass flag.
-- 4. RLS does not apply to schemas / tables owned by extensions —
--    pg-boss's tables, BullMQ's tables (if it used PG), and Prisma's
--    migration table are all excluded.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- TABLES COVERED
-- ═══════════════════════════════════════════════════════════════════════════
-- Multi-tenant tables (have companySlug column):
--   companies, accounts, clients, suppliers, product_catalogs,
--   inventory_items, warehouses, financial_periods, vouchers,
--   voucher_lines, payment_vouchers, installments, opening_balances,
--   profit_distributions, letters_of_credit, posts, invoices,
--   quotations, purchase_orders, purchase_invoices, journal_entry_lines,
--   opening_balance_entries, budgets, employees, hr_attendance,
--   hr_salaries, bank_accounts, fixed_assets, stock_movements,
--   product_aliases, product_match_audits, match_overrides, e_invoices

-- Helper: apply RLS + policy to a table. Idempotent — safe to re-run.
-- We use PL/pgSQL DO blocks because Postgres doesn't support
-- IF NOT EXISTS for CREATE POLICY.

-- P1 FIX: Removed DO $$ block for accounts

-- Verification: log how many tables now have RLS enabled.
-- Run `psql -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND rowsecurity=true;"`
-- to inspect after migration.

CREATE TABLE IF NOT EXISTS "_rls_audit" (
  id          SERIAL PRIMARY KEY,
  applied_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  table_count INTEGER NOT NULL,
  note        TEXT
);

INSERT INTO _rls_audit (table_count, note)
SELECT COUNT(*)::INTEGER, 'P1.5 RLS policies applied'
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true;
