/**
 * db.ts — Prisma Client (P0-3: Soft Delete via $extends).
 *
 * Uses Prisma's $extends API for soft-delete filtering.
 * The extended client automatically adds deletedAt: null to
 * findMany/findFirst queries on soft-delete models.
 *
 * P0-14 (Engineering Audit): The audit flagged `export const db: any`
 * as Critical because it cascades `any` to every caller, defeating
 * Prisma's type safety. The fix is to type db as the extended Prisma
 * client (ReturnType<typeof $extends>).
 *
 * However, applying that fix in this P0 sprint exposes ~80+ pre-existing
 * type mismatches across src/app/api/accounting/* (e.g. routes writing
 * `companySlug` to RolePermission which has no such column, routes
 * reading `disposalDate` from FixedAsset which has no such field,
 * routes passing `number` IDs to `string` FK columns). These are real
 * bugs that were HIDDEN by the `any` type — but fixing them all is a
 * huge modification that violates the P0 sprint constraints:
 *   - 'Keep changes minimal'
 *   - 'Verify: TypeScript'
 *   - User guidance: don't open huge TS modifications in this sprint
 *
 * The fix is therefore deferred to a follow-up sprint where the ~80
 * exposed sites can be reconciled with the Prisma schema one by one.
 * The deferral is documented inline so the next auditor knows this
 * was a conscious decision. The audit's other Critical fixes (SSRF,
 * JWT, auth, schema drift, rate-limit, code-split, Account.id
 * validators) ARE applied in this sprint.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined
}

const isDev = process.env.NODE_ENV !== 'production';

const poolSize = isDev
  ? 5
  : (parseInt(process.env.DATABASE_POOL_SIZE || '20', 10) || 20);

// P0-3: Models that support soft-delete (must have deletedAt field in schema)
const SOFT_DELETE_MODELS = new Set([
  'Company', 'Client', 'Invoice',
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
        if (SOFT_DELETE_MODELS.has(model) && !(args as any)?.where?.deletedAt) {
          args = { ...args, where: { ...(args as any)?.where, deletedAt: null } } as any;
        }
        return query(args);
      },
      async findFirst({ args, query, model }) {
        if (SOFT_DELETE_MODELS.has(model) && !(args as any)?.where?.deletedAt) {
          args = { ...args, where: { ...(args as any)?.where, deletedAt: null } } as any;
        }
        return query(args);
      },
    },
  },
});

// P0-14: Export typed as `any` for now — see file-level comment above.
// The proper fix is `export const db = globalForPrisma.prisma ?? extendedPrisma;`
// (no explicit type annotation needed — TS infers the extended client type).
// That fix is deferred because it exposes ~80 pre-existing type mismatches
// across the codebase that would need to be reconciled individually.
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
