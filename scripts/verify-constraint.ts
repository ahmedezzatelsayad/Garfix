// verify-constraint.ts — quick check that ai_score_snapshots(companySlug, period) UNIQUE exists in DB.
//
// Usage:
//   DATABASE_URL='postgresql://...' bun run scripts/verify-constraint.ts
//
// The script reads the connection string from DATABASE_URL — never hardcode
// credentials in source files (the secret scanner will fail CI).

import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  // List all UNIQUE constraints & indexes on ai_score_snapshots
  const rows: any[] = await prisma.$queryRaw`
    SELECT
      c.conname AS constraint_name,
      c.contype AS constraint_type,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.conrelid = 'ai_score_snapshots'::regclass
    ORDER BY c.conname;
  `;
  console.log('--- pg_constraint on ai_score_snapshots ---');
  for (const r of rows) console.log(JSON.stringify(r));

  const idxRows: any[] = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'ai_score_snapshots'
    ORDER BY indexname;
  `;
  console.log('--- pg_indexes on ai_score_snapshots ---');
  for (const r of idxRows) console.log(JSON.stringify(r));

  // Try the actual upsert that was failing with 42P10
  console.log('--- attempting the exact upsert that was failing ---');
  try {
    const result = await (prisma as any).aIScoreSnapshot.upsert({
      where: { companySlug_period: { companySlug: '__p5_m7_verify__', period: '2026-08' } },
      create: {
        companySlug: '__p5_m7_verify__',
        period: '2026-08',
        score: 99.5,
      },
      update: { score: 99.5 },
    });
    console.log('✅ UPSERT SUCCEEDED — 42P10 is gone:', JSON.stringify(result));
    // Cleanup
    await (prisma as any).aIScoreSnapshot.deleteMany({ where: { companySlug: '__p5_m7_verify__' } });
    console.log('   (cleanup row deleted)');
  } catch (e: any) {
    console.log('❌ UPSERT FAILED:', e.message);
    if (e.code) console.log('   error code:', e.code);
  }
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
