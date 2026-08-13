-- ═══════════════════════════════════════════════════════════════════════════
-- DB-10 FIX (Audit v2 · Phase 2)
-- Journal entry immutability trigger for posted entries
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- Posted journal entries have no DB-level immutability protection. A direct
-- `UPDATE` or `DELETE` against the `journal_entries` table (e.g. via psql, a
-- rogue migration, or a Prisma call that bypasses the application layer)
-- silently destroys the audit trail. Application-layer guards are
-- insufficient because the whole point of an immutable ledger is that even
-- a privileged DB user cannot mutate a posted entry without raising.
--
-- Fix
-- ---
-- Two trigger functions + BEFORE UPDATE / BEFORE DELETE row-level triggers
-- on `journal_entries`:
--   * `prevent_posted_je_mutation()` — raises unless the only change is a
--     `posted → reversed` status transition (which is the legitimate path
--     for reversal entries). Any other UPDATE to a posted row raises.
--   * `prevent_posted_je_deletion()` — raises on DELETE of any row whose
--     `status = 'posted'`. Non-posted rows (draft / reversed) remain
--     deletable so the application can clean up aborted drafts.
--
-- Notes
-- -----
-- * Uses `CREATE OR REPLACE FUNCTION` so the migration is re-runnable.
-- * Uses plain `CREATE TRIGGER` (not `CREATE OR REPLACE TRIGGER`) for
--   Postgres compatibility — guarded by `DROP TRIGGER IF EXISTS` so the
--   migration is idempotent.
-- * Errors raised by triggers propagate to the calling transaction,
--   forcing a rollback. This is the desired fail-closed behavior.
-- ═══════════════════════════════════════════════════════════════════════════

-- DB-10 FIX: Prevent UPDATE/DELETE on posted journal entries
CREATE OR REPLACE FUNCTION prevent_posted_je_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'posted' AND NEW.status != 'posted' THEN
    -- Allow status change from 'posted' to 'reversed' (for reversal entries)
    IF NEW.status = 'reversed' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Cannot modify posted journal entry (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entries_immutable ON journal_entries;
CREATE TRIGGER journal_entries_immutable
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_je_mutation();

-- Also prevent DELETE on posted entries
CREATE OR REPLACE FUNCTION prevent_posted_je_deletion()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Cannot delete posted journal entry (id=%)', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entries_no_delete ON journal_entries;
CREATE TRIGGER journal_entries_no_delete
  BEFORE DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_je_deletion();
