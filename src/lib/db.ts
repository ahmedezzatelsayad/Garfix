import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// SEC-004 FIX: Only log queries in development, never in production
const isDev = process.env.NODE_ENV !== 'production';

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

// EA-008 FIX: Enable WAL mode for SQLite to allow concurrent reads during writes.
// Without WAL, SQLite uses exclusive locks that block all readers during writes,
// causing SQLITE_BUSY errors under any real load with Prisma's multi-connection model.
// WAL mode allows readers and one writer to operate concurrently.
// This PRAGMA is a no-op on PostgreSQL (ignored silently), so it's safe to run
// regardless of the database provider.
async function configureSqlite(): Promise<void> {
  try {
    await db.$executeRawUnsafe('PRAGMA journal_mode=WAL');
    await db.$executeRawUnsafe('PRAGMA synchronous=NORMAL');
    await db.$executeRawUnsafe('PRAGMA busy_timeout=5000');
    await db.$executeRawUnsafe('PRAGMA foreign_keys=ON');
    if (isDev) {
      console.log('[db] SQLite PRAGMA configured: WAL mode, synchronous=NORMAL, busy_timeout=5000, foreign_keys=ON');
    }
  } catch (err) {
    // This will fail on PostgreSQL — that's expected, just log and continue
    if (isDev) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[db] PRAGMA configuration skipped (likely PostgreSQL): ${msg}`);
    }
  }
}

// Configure SQLite on first connection
configureSqlite().catch((err) => {
  console.error('[db] Failed to configure SQLite PRAGMA:', err);
});

if (isDev) globalForPrisma.prisma = db
