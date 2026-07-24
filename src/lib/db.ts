/**
 * db.ts — Prisma Client (P0-3: Soft Delete via $extends).
 *
 * Uses Prisma's $extends API for soft-delete filtering.
 * The extended client automatically adds deletedAt: null to
 * findMany/findFirst queries on soft-delete models.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined
}

const isDev = process.env.NODE_ENV !== 'production';

const poolSize = isDev
  ? 5
  : (parseInt(process.env.DATABASE_POOL_SIZE || '20', 10) || 20);

// P0-3: Models that support soft-delete
const SOFT_DELETE_MODELS = new Set([
  'Company', 'Client', 'Invoice', 'PurchaseInvoice',
  'JournalEntry', 'EInvoice', 'Employee',
]);

// Create base client
const basePrisma = new PrismaClient({
  log: isDev ? ['query', 'warn', 'error'] : ['warn', 'error'],
  datasourceUrl: process.env.DATABASE_URL
    ? appendPoolParams(process.env.DATABASE_URL, poolSize)
    : undefined,
});

// P0-3: Extend with soft-delete filtering
// Uses $extends with result-level override for findMany/findFirst
const extendedPrisma = basePrisma.$extends({
  name: 'softDelete',
  result: {
    // We don't modify results — we filter inputs
  },
  query: {
    $allModels: {
      async findMany({ args, query, model }) {
        if (SOFT_DELETE_MODELS.has(model) && !args?.where?.deletedAt) {
          args = { ...args, where: { ...args?.where, deletedAt: null } };
        }
        return query(args);
      },
      async findFirst({ args, query, model }) {
        if (SOFT_DELETE_MODELS.has(model) && !args?.where?.deletedAt) {
          args = { ...args, where: { ...args?.where, deletedAt: null } };
        }
        return query(args);
      },
    },
  },
});

// Export as `db` — type as any to avoid TS extension type issues
export const db: any = globalForPrisma.prisma ?? extendedPrisma;

function appendPoolParams(url: string, poolSize: number): string {
  if (url.includes('connection_limit=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${poolSize}&pool_timeout=30`;
}

let _dbInitialized = false;

export async function initDb(): Promise<void> {
  if (_dbInitialized) return;
  _dbInitialized = true;
}

if (isDev) globalForPrisma.prisma = db;
