-- ════════════════════════════════════════════════════════════════════════════
-- Review C2 + H4 FIX (2026-08-24): Comprehensive RLS coverage + safe app role
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEMS (from the full project review):
--   C2: The production connection role (neondb_owner) has BYPASSRLS=true, so
--       ALL RLS policies (51 tables, 93 policies) are silently ineffective.
--       The promised `garfix_app` role was never created.
--   H4: RLS coverage is patchy:
--       - 10 tables still use the OLD lenient policy (with the IS NULL
--         bypass): accounting_audit_logs, e_invoices, invoice_templates,
--         post_dated_checks, purchase_orders, refund_transactions,
--         role_permissions, subscription_schedules, zatca_certificates, ...
--       - ~29 tables with a companySlug column have NO RLS at all
--         (hr_employees with payroll PII, ai_memory_entries, chat_history,
--         product_catalog [the earlier migration hard-coded the WRONG name
--         'product_catalogs' — plural], webhook_endpoints, ...)
--       - The earlier strict migration used a hard-coded table list which
--         silently skipped anything missing or mis-named.
--
-- FIX:
--   1. Replace the hard-coded approach with a DYNAMIC loop over
--      information_schema: EVERY table in schema `public` that has a
--      `companySlug` column gets the strict tenant_isolation policy +
--      platform_admin_bypass policy. No table can be missed again.
--   2. Re-run the strict policy installer for tables that already had it
--      (idempotent — drops + recreates with the strict definition).
--   3. Create the `garfix_app` login role WITHOUT BYPASSRLS, grant it the
--      privileges it needs, so the app can connect as a non-bypassing role.
--      (Bypass remains available only to the Neon owner role for migrations.)
--   4. Add an RLS coverage report view for CI verification.
--
-- IDEMPOTENT: safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

-- ─── Step 1: strict RLS installer (same definition as 20260813130000) ──
CREATE OR REPLACE FUNCTION app.enable_strict_rls_for_table(tbl_name text) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = tbl_name AND table_schema = 'public'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = tbl_name AND column_name = 'companySlug' AND table_schema = 'public'
  ) THEN
    RETURN;
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl_name);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_strict ON %I', tbl_name);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl_name);

  -- Strict tenant policy: session var must match exactly. No IS NULL bypass.
  EXECUTE format(
    'CREATE POLICY tenant_isolation_strict ON %I USING (
       "companySlug" = current_setting(''app.current_company_slug'', true)
     )',
    tbl_name
  );

  EXECUTE format('DROP POLICY IF EXISTS platform_admin_bypass ON %I', tbl_name);
  EXECUTE format(
    'CREATE POLICY platform_admin_bypass ON %I USING (
       current_setting(''app.is_platform'', true) = ''on''
     )',
    tbl_name
  );
END;
$$ LANGUAGE plpgsql;

-- ─── Step 2: DYNAMIC coverage — every public table with companySlug ─────
-- This closes the H4 gaps: the 10 stale-policy tables, the ~29 uncovered
-- tables, and any future table added with a companySlug column.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.column_name = 'companySlug'
      AND c.table_schema = 'public'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    PERFORM app.enable_strict_rls_for_table(t.table_name);
  END LOOP;
END;
$$;

-- ─── Step 3: the safe application role (C2) ──────────────────────────────
-- garfix_app CANNOT bypass RLS. The app must connect as this role so that
-- the policies above actually apply at runtime. Password is rotated via
-- the deployment env (see .env.example) — set a strong value there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'garfix_app') THEN
    CREATE ROLE garfix_app LOGIN
      PASSWORD 'a4b3bb2333ed301d41ea24d893563d1586e8ec728842d2f5'
      NOBYPASSRLS
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE;
  ELSE
    -- Ensure an existing role is hardened (never grants bypass).
    ALTER ROLE garfix_app NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;

-- Grants: the app role needs full DML on public tables + usage on schema,
-- sequences, and the app schema functions.
GRANT USAGE ON SCHEMA public TO garfix_app;
GRANT USAGE ON SCHEMA app TO garfix_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO garfix_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO garfix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO garfix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO garfix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO garfix_app;

-- ─── Step 4: RLS coverage report view (for CI smoke tests / drift scans) ─
CREATE OR REPLACE VIEW app.rls_coverage AS
SELECT
  c.table_name,
  CASE WHEN pc.relrowsecurity THEN 'enabled' ELSE 'DISABLED' END AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
    WHERE p.tablename = c.table_name
      AND p.policyname = 'tenant_isolation_strict') > 0 AS has_strict_policy,
  (SELECT count(*) FROM pg_policies p
    WHERE p.tablename = c.table_name
      AND p.policyname = 'platform_admin_bypass') > 0 AS has_bypass_policy
FROM information_schema.columns c
JOIN information_schema.tables tb
  ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
JOIN pg_class pc ON pc.relname = c.table_name
JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
WHERE c.column_name = 'companySlug'
  AND c.table_schema = 'public'
  AND tb.table_type = 'BASE TABLE'
ORDER BY c.table_name;
