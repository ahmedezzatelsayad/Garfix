/**
 * Column-level drift scan: compares every model's SCALAR field names
 * (accounting for @map, ignoring relation fields) against actual DB columns.
 * Complements scripts/drift-scan.cjs (which checks TABLE names only) by
 * catching column-level drift — e.g. a migration that hand-wrote snake_case
 * columns while schema.prisma expects camelCase (the company_ai_configs
 * incident fixed in migration 20260824130000).
 *
 * Usage:
 *   DATABASE_URL=<owner-or-app url> node scripts/column_drift_scan.cjs
 * Exit code 0 when no drift; prints offending models otherwise.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function parseSchema() {
  const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const models = {};
  const modelNames = new Set();
  let current = null;
  const lines = schema.split('\n');
  for (const rawLine of lines) {
    const m = rawLine.trim().match(/^model\s+(\w+)\s*\{/);
    if (m) modelNames.add(m[1]);
  }
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const mModel = line.match(/^model\s+(\w+)\s*\{/);
    if (mModel) { current = mModel[1]; models[current] = { table: null, fields: {} }; continue; }
    if (current && line.startsWith('@@map("')) {
      models[current].table = line.match(/@@map\("([^"]+)"\)/)[1];
      continue;
    }
    if (line === '}') { current = null; continue; }
    if (!current) continue;
    const mField = line.match(/^(\w+)\s+([\w\[\]?]+)(.*)$/);
    if (!mField) continue;
    const fieldName = mField[1];
    const fieldType = mField[2].replace(/[\[\]?]/g, '');
    if (fieldName.startsWith('//') || fieldName.startsWith('@')) continue;
    if (modelNames.has(fieldType)) continue; // relation field
    const rest = mField[3] || '';
    const mMap = rest.match(/@map\("([^"]+)"\)/);
    models[current].fields[fieldName] = mMap ? mMap[1] : fieldName;
  }
  return models;
}

async function main() {
  const models = parseSchema();
  const cols = await prisma.$queryRawUnsafe(
    `SELECT c.table_name, c.column_name FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema='public' AND t.table_type='BASE TABLE'`
  );
  const dbTables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
  const dbTableSet = new Set(dbTables.map(t => t.tablename));
  const colsByTable = {};
  for (const row of cols) {
    if (!colsByTable[row.table_name]) colsByTable[row.table_name] = new Set();
    colsByTable[row.table_name].add(row.column_name);
  }

  const drifts = [];
  for (const [modelName, info] of Object.entries(models)) {
    const tableName = info.table || modelName;
    if (!dbTableSet.has(tableName)) continue; // table-level drift handled by drift-scan.cjs
    const dbCols = colsByTable[tableName] || new Set();
    const missing = [];
    for (const [field, col] of Object.entries(info.fields)) {
      if (!dbCols.has(col)) missing.push(`${field}→${col}`);
    }
    if (missing.length > 0) drifts.push({ model: modelName, table: tableName, missing });
  }

  if (drifts.length === 0) {
    console.log(`✓ Column drift: none (${Object.keys(models).length} models checked)`);
  } else {
    console.log(`✗ Column drift in ${drifts.length}/${Object.keys(models).length} models:`);
    for (const d of drifts) {
      console.log(`\n■ ${d.model} (${d.table}) — ${d.missing.length} schema columns missing in DB:`);
      console.log('   ' + d.missing.join(', '));
    }
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
