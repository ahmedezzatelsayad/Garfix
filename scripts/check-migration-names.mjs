#!/usr/bin/env node
// DB-15 FIX (Audit v2 · Phase 4): Migration naming convention lint
// Validates that all migration directories match YYYYMMDDHHMMSS_snake_case
import { readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const PATTERN = /^\d{14}_[a-z][a-z0-9_]*$/;

const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
const dirs = entries.filter(d => d.isDirectory()).map(d => d.name);

const invalid = dirs.filter(name => !PATTERN.test(name) && name !== "migration_lock.toml");

if (invalid.length > 0) {
  console.error("❌ Invalid migration directory names:");
  invalid.forEach(name => console.error(`  ${name}`));
  console.error("\nExpected format: YYYYMMDDHHMMSS_snake_case");
  process.exit(1);
}

console.log(`✓ All ${dirs.length} migration names valid`);
