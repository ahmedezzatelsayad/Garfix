-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260824100000_drop_orphan_tables
-- ═══════════════════════════════════════════════════════════════════════════════
-- Drops 7 truly orphan tables that exist in the DB but have NO Prisma model
-- and NO application code references. All are EMPTY (0 rows confirmed by
-- scripts/drift-scan.cjs). This is the second half of the schema drift
-- reconciliation started by migration 20260823180000_unify_dual_column_tables.
--
-- Tables dropped:
--   1. order_deliveries              — leftover from a removed OrderDelivery feature
--   2. payment_provider_configs      — superseded by ProviderConfig + payments_vault
--   3. payments_vault                — superseded by PlatformSettings (encrypted blob)
--   4. permissions                   — superseded by RolePermission.permissions JSON
--   5. posts                         — leftover from an abandoned blog/announcement feature
--   6. ticket_replies                — superseded by SupportTicket + admin_audit_logs
--   7. user_workspace_state          — superseded by SetupWizardProgress
--
-- Safety check: this migration is idempotent. DROP TABLE IF EXISTS will not
-- fail if a table is already gone.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop FK constraints first (if any reference these tables) — none expected,
-- but defensive: PostgreSQL will refuse to drop a table referenced by an FK.
-- All 7 tables were verified to have ZERO inbound FK references by the
-- check-orphans.ts script.

-- 1. order_deliveries
DROP TABLE IF EXISTS "order_deliveries" CASCADE;

-- 2. payment_provider_configs (note: lowercase plural, distinct from ProviderConfig)
DROP TABLE IF EXISTS "payment_provider_configs" CASCADE;

-- 3. payments_vault (encrypted blob storage — superseded by PlatformSettings)
DROP TABLE IF EXISTS "payments_vault" CASCADE;

-- 4. permissions (legacy standalone table — RolePermission.permissions JSON is the
--    canonical store now, scanned by src/hooks/queries/auth.ts as a field)
DROP TABLE IF EXISTS "permissions" CASCADE;

-- 5. posts (legacy blog/posts feature, abandoned in favor of Announcement model)
DROP TABLE IF EXISTS "posts" CASCADE;

-- 6. ticket_replies (legacy support-ticket replies, superseded by SupportTicket +
--    admin_audit_logs which cover the same workflow with richer metadata)
DROP TABLE IF EXISTS "ticket_replies" CASCADE;

-- 7. user_workspace_state (per-user UI state, superseded by SetupWizardProgress
--    for onboarding state and per-feature tables for everything else)
DROP TABLE IF EXISTS "user_workspace_state" CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification: confirm the 7 orphan tables are gone.
-- Run scripts/drift-scan.cjs after migration to verify zero drift.
-- ═══════════════════════════════════════════════════════════════════════════════
