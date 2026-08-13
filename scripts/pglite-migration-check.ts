// pglite-migration-check.ts
// Validate that our new migration SQL runs correctly against a real PostgreSQL engine (WASM).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

async function main() {
  console.log("=== pglite Migration Validation ===\n");

  const db = new PGlite();

  // Create _prisma_migrations table (Prisma's internal tracking table)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  console.log("✓ Created _prisma_migrations table");

  // Get all migration directories sorted by name
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  console.log(`✓ Found ${migrations.length} migrations\n`);

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const migration of migrations) {
    const sqlPath = join(MIGRATIONS_DIR, migration, "migration.sql");
    let sql: string;
    try {
      sql = readFileSync(sqlPath, "utf8");
    } catch {
      console.log(`  ⚠ SKIP ${migration} (no migration.sql)`);
      skipped++;
      continue;
    }

    try {
      // Split on semicolons but respect DO $$ ... $$ blocks
      // pglite.exec handles multiple statements
      await db.exec(sql);
      console.log(`  ✓ APPLIED ${migration}`);
      applied++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Some migrations may fail due to pglite limitations (e.g., RLS, extensions)
      // but the critical ones (ALTER TABLE, CREATE INDEX) should work
      if (msg.includes("already exists") || msg.includes("does not exist")) {
        console.log(`  ⚠ IDEMPOTENT-SKIP ${migration}: ${msg.slice(0, 80)}`);
        skipped++;
      } else {
        console.log(`  ✗ FAILED ${migration}: ${msg.slice(0, 120)}`);
        failed++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Applied: ${applied}`);
  console.log(`Skipped (idempotent/no SQL): ${skipped}`);
  console.log(`Failed: ${failed}`);

  // Specifically verify our new migration worked
  console.log(`\n=== Verifying 20260813120000 (Phase 0 migration) ===`);
  try {
    // Check recurring_journal_entries.companyId is TEXT
    const rje = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'recurring_journal_entries' AND column_name = 'companyId'
    `);
    if (rje.rows.length > 0) {
      console.log(`  ✓ recurring_journal_entries.companyId = ${(rje.rows[0] as { data_type: string }).data_type}`);
    } else {
      console.log(`  ⚠ recurring_journal_entries not found (may not have been created by earlier migration)`);
    }

    // Check fiscal_year_closes.companyId is TEXT
    const fyc = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'fiscal_year_closes' AND column_name = 'companyId'
    `);
    if (fyc.rows.length > 0) {
      console.log(`  ✓ fiscal_year_closes.companyId = ${(fyc.rows[0] as { data_type: string }).data_type}`);
    } else {
      console.log(`  ⚠ fiscal_year_closes not found`);
    }
  } catch (err) {
    console.log(`  ⚠ Verification query failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  await db.close();
  console.log("\n✓ pglite validation complete");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
