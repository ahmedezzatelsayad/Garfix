-- ═══════════════════════════════════════════════════════════════════════════
-- P7: app_users — drop redundant `id` column, promote `uid` to primary key
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- The init migration created `app_users` with TWO unique identifiers:
--   "id"  TEXT NOT NULL PRIMARY KEY
--   "uid" TEXT NOT NULL (with UNIQUE constraint)
--
-- But schema.prisma declares AppUser with ONLY `uid` as @id:
--   model AppUser {
--     uid String @id @default(cuid())
--     ...
--   }
--
-- Prisma client INSERTs send `uid` (from cuid default) but NOT `id`. The DB
-- rejects with "Null constraint violation on the fields: (id)".
--
-- Strategy
-- --------
-- Drop the `id` column from `app_users` entirely. The schema only uses `uid`
-- as the primary key, and all FK references (audit_logs.userUid,
-- chat_history.userUid, MFASecret.userUid, SessionRegistry.userUid,
-- email_verifications.userId, company_memberships.userUid) point to `uid`.
-- Only order_deliveries.driverId → app_users.id exists, but that table isn't
-- used by E2E. After P5 dropped all FK constraints, no constraint depends
-- on app_users.id, so we can safely drop it.
--
-- Then promote `uid` to be the primary key.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Drop the primary key constraint on `id`
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'app_users' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE "app_users" DROP CONSTRAINT "app_users_pkey";
  END IF;
END $$;

-- Drop the `id` column (no longer needed — schema uses `uid`)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'id'
  ) THEN
    ALTER TABLE "app_users" DROP COLUMN "id";
  END IF;
END $$;

-- Promote `uid` to be the primary key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'app_users' AND constraint_type = 'PRIMARY KEY'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'uid'
  ) THEN
    ALTER TABLE "app_users" ADD PRIMARY KEY ("uid");
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of P7 migration.
-- ═══════════════════════════════════════════════════════════════════════════
