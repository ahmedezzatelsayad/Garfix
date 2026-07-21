import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only log queries in development, never in production
const isDev = process.env.NODE_ENV !== 'production';

// Connection pool sizing for PostgreSQL.
// Default Prisma pool = 10 connections, which exhausts quickly under load.
// In production: use DATABASE_POOL_SIZE env var (default 20 for a single instance).
// Formula guidance: pool_size = (CPU cores × 2) + effective_spindle_count
const poolSize = isDev
  ? 5  // Dev: smaller pool
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
 */
function appendPoolParams(url: string, poolSize: number): string {
  // Already has pool params — don't double-add
  if (url.includes('connection_limit=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${poolSize}&pool_timeout=30`;
}

// ── Runtime initialization ─────────────────────────────────────────────
// Module-level side effects REMOVED — initDb() now requires
// an explicit call from instrumentation.ts / bootstrap.ts at runtime.
// This prevents database queries from firing during `next build`.
let _dbInitialized = false;

/**
 * Initialize database connection settings.
 * Must be called once at application startup (e.g., from instrumentation.ts).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initDb(): Promise<void> {
  if (_dbInitialized) return;
  _dbInitialized = true;
  // PostgreSQL doesn't need PRAGMA configuration — connection pooling
  // is handled by Prisma and the pool params in the URL.
}

if (isDev) globalForPrisma.prisma = db
