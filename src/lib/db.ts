import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// SEC-004 FIX: Only log queries in development, never in production
const isDev = process.env.NODE_ENV !== 'production';

// Connection pool sizing for PostgreSQL (ignored by SQLite).
// Default Prisma pool = 10 connections, which exhausts quickly under load.
// In production: use DATABASE_POOL_SIZE env var (default 20 for a single instance).
// Formula guidance: pool_size = (CPU cores × 2) + effective_spindle_count
const poolSize = isDev
  ? 5  // Dev: smaller pool to reduce SQLite contention
  : (parseInt(process.env.DATABASE_POOL_SIZE || '20', 10) || 20);

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['query', 'warn', 'error'] : ['warn', 'error'],
    datasourceUrl: process.env.DATABASE_URL
      ? appendPoolParams(process.env.DATABASE_URL, poolSize)
      : undefined,
  })

/**
 * Append connection pool parameters to a PostgreSQL URL.
 * Returns the URL unchanged for SQLite (file: prefix).
 */
function appendPoolParams(url: string, poolSize: number): string {
  // SQLite URLs — don't add pool params
  if (url.startsWith('file:')) return url;
  // Already has pool params — don't double-add
  if (url.includes('connection_limit=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${poolSize}&pool_timeout=30`;
}

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
