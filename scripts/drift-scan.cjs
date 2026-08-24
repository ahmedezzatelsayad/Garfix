// Drift scan v2 — properly accounts for both @@map and default-named models
// Identifies:
//   - orphan DB tables (in DB but no model in schema) — DROP candidates
//   - missing DB tables (in schema but not in DB) — needs migration
//   - models lacking @@map directive (PascalCase tables — naming convention drift)
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  // 1) Read actual tables from PostgreSQL
  const res = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const dbTables = res.map((r) => r.tablename);
  const userDbTables = dbTables.filter((t) => !t.startsWith('_'));

  // 2) Read schema — for each model, derive its expected table name:
  //    - if @@map("foo") present, table name = "foo"
  //    - else default table name = model name (PascalCase)
  const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  const models = [];
  let m;
  while ((m = modelRegex.exec(schema)) !== null) {
    const modelName = m[1];
    const body = m[2];
    const mapMatch = body.match(/@@map\("([A-Za-z0-9_]+)"\)/);
    const tableName = mapMatch ? mapMatch[1] : modelName;
    models.push({ modelName, tableName, hasMapDirective: !!mapMatch });
  }
  const schemaTables = models.map((x) => x.tableName);
  const schemaSet = new Set(schemaTables);
  const dbSet = new Set(userDbTables);

  const onlyInDb = userDbTables.filter((t) => !schemaSet.has(t));
  const onlyInSchema = schemaTables.filter((t) => !dbSet.has(t));
  const modelsWithoutMap = models.filter((x) => !x.hasMapDirective);

  console.log('═'.repeat(72));
  console.log('GARFIX SCHEMA DRIFT SCAN v2');
  console.log('═'.repeat(72));
  console.log(`Schema models:            ${models.length}`);
  console.log(`Schema expected tables:   ${schemaTables.length}`);
  console.log(`DB user tables:          ${userDbTables.length} (excluding _prisma_migrations/_rls_audit)`);
  console.log();

  console.log('━'.repeat(72));
  console.log('▶ ORPHAN TABLES — in DB but no model in schema (DROP candidates)');
  console.log('━'.repeat(72));
  console.log(`Count: ${onlyInDb.length}`);
  if (onlyInDb.length === 0) {
    console.log('  (none — schema is in sync)');
  } else {
    onlyInDb.forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t}`));
  }
  console.log();

  console.log('━'.repeat(72));
  console.log('▶ MISSING TABLES — model in schema but no DB table (needs migration)');
  console.log('━'.repeat(72));
  console.log(`Count: ${onlyInSchema.length}`);
  if (onlyInSchema.length === 0) {
    console.log('  (none — schema is in sync)');
  } else {
    onlyInSchema.forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t}`));
  }
  console.log();

  console.log('━'.repeat(72));
  console.log('▶ MODELS WITHOUT @@map (PascalCase tables — naming convention drift)');
  console.log('━'.repeat(72));
  console.log(`Count: ${modelsWithoutMap.length}`);
  modelsWithoutMap.forEach((x, i) => console.log(`  ${String(i + 1).padStart(2)}. ${x.modelName.padEnd(28)} → table "${x.tableName}"`));
  console.log();

  // 4) Row counts for orphan tables (to inform the drop/restore decision)
  if (onlyInDb.length > 0) {
    console.log('━'.repeat(72));
    console.log('▶ ORPHAN TABLE ROW COUNTS (to inform drop vs restore decision)');
    console.log('━'.repeat(72));
    for (const table of onlyInDb) {
      try {
        const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`);
        const n = Array.isArray(r) ? r[0].n : r.n;
        const verdict = n > 0 ? 'has data — investigate before dropping' : 'EMPTY — safe to drop';
        console.log(`  ${table.padEnd(32)} rows: ${String(n).padStart(8)}  ${verdict}`);
      } catch (e) {
        console.log(`  ${table.padEnd(32)} row count FAILED: ${e.message}`);
      }
    }
  }

  console.log();
  console.log('═'.repeat(72));
  console.log('VERDICT');
  console.log('═'.repeat(72));
  if (onlyInDb.length === 0 && onlyInSchema.length === 0) {
    console.log('✓ Schema is in sync with DB — no drift detected.');
  } else {
    console.log(`✗ Drift detected: ${onlyInDb.length} orphan table(s), ${onlyInSchema.length} missing table(s).`);
  }
  if (modelsWithoutMap.length > 0) {
    console.log(`! Naming convention drift: ${modelsWithoutMap.length} models lack @@map directive (PascalCase tables).`);
    console.log('  Recommendation: add @@map("snake_case") to each for consistency with the 100 mapped models.');
  }
}

main()
  .catch((e) => {
    console.error('Drift scan FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
